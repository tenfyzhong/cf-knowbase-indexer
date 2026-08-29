import { describe, it, expect, vi } from "vitest";
import { calculateDiff, syncSource, type DocumentItem } from "./sync.js";
import type { KbApiClient, SyncState } from "./api.js";
import type { Source } from "./config.js";

describe("sync diff and engine", () => {
  it("should accurately compute added, modified, deleted and unchanged files", () => {
    const prevState: SyncState = {
      files: {
        "doc1.md": { hash: "hash1", chunkCount: 1 },
        "doc2.md": { hash: "hash2_old", chunkCount: 2 },
        "doc3.md": { hash: "hash3", chunkCount: 1 }
      }
    };

    const currentDocs = new Map<string, DocumentItem>([
      ["doc2.md", { path: "doc2.md", hash: "hash2_new", content: "new content" }],
      ["doc3.md", { path: "doc3.md", hash: "hash3", content: "same content" }],
      ["doc4.md", { path: "doc4.md", hash: "hash4", content: "brand new doc" }]
    ]);

    const diff = calculateDiff(prevState, currentDocs);

    expect(diff.added).toEqual(["doc4.md"]);
    expect(diff.modified).toEqual(["doc2.md"]);
    expect(diff.deleted).toEqual(["doc1.md"]);
    expect(diff.unchanged).toEqual(["doc3.md"]);
  });

  it("should orchestrate syncSource workflow correctly via KbApiClient", async () => {
    const source: Source = {
      name: "test-src",
      type: "git",
      url: "https://github.com/org/repo.git"
    };

    const mockClient = {
      getSyncState: vi.fn().mockResolvedValue({
        files: {
          "old.md": { hash: "oldhash", chunkCount: 1 },
          "mod.md": { hash: "mod_old", chunkCount: 2 }
        }
      }),
      saveSyncState: vi.fn().mockResolvedValue(undefined),
      upsertChunks: vi.fn().mockResolvedValue({ count: 2 }),
      deleteVectors: vi.fn().mockResolvedValue({ count: 3 })
    } as unknown as KbApiClient;

    const currentDocs = new Map<string, DocumentItem>([
      ["mod.md", { path: "mod.md", hash: "mod_new", content: "modified content" }],
      ["new.md", { path: "new.md", hash: "new_hash", content: "fresh content" }]
    ]);

    const result = await syncSource(source, currentDocs, mockClient);

    expect(result.addedCount).toBe(1);
    expect(result.modifiedCount).toBe(1);
    expect(result.deletedCount).toBe(1);
    expect(result.unchangedCount).toBe(0);

    // Old vectors from 'old.md' (1 chunk) and 'mod.md' (2 chunks) must be deleted
    expect(mockClient.deleteVectors).toHaveBeenCalledWith([
      "test-src:old.md:0",
      "test-src:mod.md:0",
      "test-src:mod.md:1"
    ]);

    // Upsert chunks via API
    expect(mockClient.upsertChunks).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ path: "mod.md" }),
        expect.objectContaining({ path: "new.md" })
      ])
    );
    expect(mockClient.saveSyncState).toHaveBeenCalled();
  });

  it("should NOT vectorize documents containing #secret tag", async () => {
    const source: Source = {
      name: "obsidian",
      type: "git",
      url: "git@github.com:user/vault.git"
    };

    const mockClient = {
      getSyncState: vi.fn().mockResolvedValue({
        files: {}
      }),
      saveSyncState: vi.fn().mockResolvedValue(undefined),
      upsertChunks: vi.fn().mockResolvedValue({ count: 1 }),
      deleteVectors: vi.fn().mockResolvedValue({ count: 0 })
    } as unknown as KbApiClient;

    const currentDocs = new Map<string, DocumentItem>([
      [
        "secret-note.md",
        {
          path: "secret-note.md",
          hash: "secret_hash",
          content: "---\ntags: [secret]\n---\nConfidential notes."
        }
      ],
      [
        "public-note.md",
        {
          path: "public-note.md",
          hash: "public_hash",
          content: "# Public Guide\n\nPublicly available knowledge."
        }
      ]
    ]);

    const result = await syncSource(source, currentDocs, mockClient);

    expect(result.addedCount).toBe(2);
    expect(result.totalChunks).toBe(1); // Only 1 public chunk vectorized
    expect(result.skippedSecretCount).toBe(1);

    // Verify upsert was called with only public chunk
    expect(mockClient.upsertChunks).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "obsidian:public-note.md:0",
        path: "public-note.md"
      })
    ]);
  });

  it("should delete existing vectors when a document is modified to include #secret tag", async () => {
    const source: Source = {
      name: "obsidian",
      type: "git",
      url: "git@github.com:user/vault.git"
    };

    const mockClient = {
      getSyncState: vi.fn().mockResolvedValue({
        files: {
          "note.md": { hash: "old_hash", chunkCount: 2 }
        }
      }),
      saveSyncState: vi.fn().mockResolvedValue(undefined),
      upsertChunks: vi.fn().mockResolvedValue({ count: 0 }),
      deleteVectors: vi.fn().mockResolvedValue({ count: 2 })
    } as unknown as KbApiClient;

    const currentDocs = new Map<string, DocumentItem>([
      [
        "note.md",
        {
          path: "note.md",
          hash: "new_secret_hash",
          content: "Now this note is #secret and sensitive."
        }
      ]
    ]);

    const result = await syncSource(source, currentDocs, mockClient);

    expect(result.modifiedCount).toBe(1);
    expect(result.totalChunks).toBe(0);
    expect(result.skippedSecretCount).toBe(1);

    // Old 2 vectors must be deleted
    expect(mockClient.deleteVectors).toHaveBeenCalledWith([
      "obsidian:note.md:0",
      "obsidian:note.md:1"
    ]);

    // No new upserts
    expect(mockClient.upsertChunks).not.toHaveBeenCalled();
  });
});
