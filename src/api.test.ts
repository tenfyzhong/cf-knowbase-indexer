import { describe, it, expect, vi, beforeEach } from "vitest";
import { KnowbaseApiClient } from "./api.js";
import type { Env } from "./config.js";

describe("KnowbaseApiClient", () => {
  const env: Env = {
    apiUrl: "https://knowbase-api.tenfy.cn",
    apiToken: "valid_secret_token"
  };

  let client: KnowbaseApiClient;

  beforeEach(() => {
    client = new KnowbaseApiClient(env);
    vi.restoreAllMocks();
  });

  it("should get sync state via GET /sync-state/:source", async () => {
    const mockState = {
      lastCommit: "sha_abc",
      files: {
        "doc.md": { hash: "hash123", chunkCount: 2 }
      }
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockState
    });

    const state = await client.getSyncState("obsidian");
    expect(state).toEqual(mockState);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://knowbase-api.tenfy.cn/sync-state/obsidian",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer valid_secret_token"
        })
      })
    );
  });

  it("should save sync state via PUT /sync-state/:source", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true })
    });
    globalThis.fetch = fetchMock;

    const mockState = {
      lastCommit: "sha_abc",
      files: {
        "doc.md": { hash: "hash123", chunkCount: 2 }
      }
    };

    await client.saveSyncState("obsidian", mockState);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://knowbase-api.tenfy.cn/sync-state/obsidian",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer valid_secret_token"
        }),
        body: JSON.stringify(mockState)
      })
    );
  });

  it("should upsert chunks via POST /vectors/upsert", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, count: 1 })
    });
    globalThis.fetch = fetchMock;

    const chunks = [
      {
        id: "obsidian:doc.md:0",
        text: "Chunk text",
        source: "obsidian",
        path: "doc.md",
        chunkIndex: 0
      }
    ];

    const res = await client.upsertChunks(chunks);
    expect(res.count).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://knowbase-api.tenfy.cn/vectors/upsert",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer valid_secret_token"
        }),
        body: JSON.stringify({ items: chunks })
      })
    );
  });

  it("should delete vectors via POST /vectors/delete", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, count: 2 })
    });
    globalThis.fetch = fetchMock;

    const ids = ["obsidian:doc.md:0", "obsidian:doc.md:1"];
    const res = await client.deleteVectors(ids);
    expect(res.count).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://knowbase-api.tenfy.cn/vectors/delete",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer valid_secret_token"
        }),
        body: JSON.stringify({ ids })
      })
    );
  });
  it("should clear all data via POST /vectors/clear", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        deletedVectorsCount: 50,
        clearedSources: ["obsidian", "blog"]
      })
    });
    globalThis.fetch = fetchMock;

    const res = await client.clearAllData();
    expect(res.success).toBe(true);
    expect(res.deletedVectorsCount).toBe(50);
    expect(res.clearedSources).toEqual(["obsidian", "blog"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://knowbase-api.tenfy.cn/vectors/clear",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer valid_secret_token"
        })
      })
    );
  });
});
