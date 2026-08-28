import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateDiff, syncSource, type DocumentItem } from "./sync.js";
import type { CloudflareClient } from "./cloudflare.js";
import type { Source } from "./config.js";

describe("sync diff and engine", () => {
  it("should accurately compute added, modified, deleted and unchanged files", () => {
    const prevState = {
      "doc1.md": { hash: "hash1", chunkCount: 1 },
      "doc2.md": { hash: "hash2_old", chunkCount: 2 },
      "doc3.md": { hash: "hash3", chunkCount: 1 }
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

  it("should orchestrate syncSource workflow correctly", async () => {
    const source: Source = {
      name: "test-src",
      type: "git",
      url: "https://github.com/org/repo.git"
    };

    const mockClient = {
      getKVState: vi.fn().mockResolvedValue({
        "old.md": { hash: "oldhash", chunkCount: 1 },
        "mod.md": { hash: "mod_old", chunkCount: 2 }
      }),
      saveKVState: vi.fn().mockResolvedValue(undefined),
      generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      upsertVectors: vi.fn().mockResolvedValue(undefined),
      deleteVectors: vi.fn().mockResolvedValue(undefined)
    } as unknown as CloudflareClient;

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

    // Embeddings generated for new & modified chunks
    expect(mockClient.generateEmbeddings).toHaveBeenCalled();
    expect(mockClient.upsertVectors).toHaveBeenCalled();
    expect(mockClient.saveKVState).toHaveBeenCalled();
  });
});
