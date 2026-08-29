import { describe, it, expect, vi, beforeEach } from "vitest";
import { CloudflareClient } from "./cloudflare.js";
import type { Env } from "./config.js";

describe("CloudflareClient", () => {
  const env: Env = {
    accountId: "test_acc",
    apiToken: "test_token",
    kvNamespaceId: "test_kv",
    vectorizeIndexName: "test_vectorize",
    aiModel: "@cf/baai/bge-base-en-v1.5"
  };

  let client: CloudflareClient;

  beforeEach(() => {
    client = new CloudflareClient(env);
    vi.restoreAllMocks();
  });

  it("should get KV sync state, returning empty files object on 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 404,
      ok: false
    });

    const state = await client.getKVState("my_source");
    expect(state).toEqual({ files: {} });
  });

  it("should parse valid KV sync state", async () => {
    const mockState = {
      lastCommit: "commit_abc",
      files: {
        "docs/readme.md": { hash: "hash123", chunkCount: 2 }
      }
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => mockState
    });

    const state = await client.getKVState("my_source");
    expect(state).toEqual(mockState);
  });

  it("should save KV sync state", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true
    });
    globalThis.fetch = fetchMock;

    const mockState = {
      lastCommit: "commit_abc",
      files: {
        "docs/readme.md": { hash: "hash123", chunkCount: 2 }
      }
    };

    await client.saveKVState("my_source", mockState);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/test_acc/storage/kv/namespaces/test_kv/values/sync_state:my_source",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer test_token"
        }),
        body: JSON.stringify(mockState)
      })
    );
  });

  it("should generate embeddings via Workers AI REST API in batches", async () => {
    const mockResponse = {
      success: true,
      result: {
        data: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6]
        ]
      }
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => mockResponse
    });

    const embeddings = await client.generateEmbeddings(["chunk 1", "chunk 2"]);
    expect(embeddings).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6]
    ]);
  });

  it("should upsert vectors into Vectorize index", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true, result: { count: 1 } })
    });
    globalThis.fetch = fetchMock;

    const vectors = [
      {
        id: "source:doc.md:0",
        values: [0.1, 0.2, 0.3],
        metadata: {
          text: "sample text",
          source: "source",
          path: "doc.md",
          chunkIndex: 0
        }
      }
    ];

    await client.upsertVectors(vectors);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/test_acc/vectorize/v2/indexes/test_vectorize/upsert",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test_token"
        })
      })
    );
  });

  it("should delete vectors by IDs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true, result: { count: 2 } })
    });
    globalThis.fetch = fetchMock;

    const ids = ["source:doc.md:0", "source:doc.md:1"];
    await client.deleteVectors(ids);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/test_acc/vectorize/v2/indexes/test_vectorize/delete-by-ids",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids })
      })
    );
  });
});
