import type { Env } from "./config.js";

export interface VectorItem {
  id: string;
  values: number[];
  metadata: {
    text: string;
    source: string;
    path: string;
    title?: string;
    chunkIndex: number;
    url?: string;
  };
}

export interface SyncStateItem {
  hash: string;
  chunkCount: number;
  isSecret?: boolean;
}

export interface SyncState {
  lastCommit?: string;
  files: Record<string, SyncStateItem>;
}

export class CloudflareClient {
  private readonly baseUrl = "https://api.cloudflare.com/client/v4";

  constructor(private readonly env: Env) {}

  private get authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.env.apiToken}`
    };
  }

  async getKVState(sourceName: string): Promise<SyncState> {
    const key = `sync_state:${encodeURIComponent(sourceName)}`;
    const url = `${this.baseUrl}/accounts/${this.env.accountId}/storage/kv/namespaces/${this.env.kvNamespaceId}/values/${key}`;

    const res = await fetch(url, {
      method: "GET",
      headers: this.authHeaders
    });

    if (res.status === 404) {
      return { files: {} };
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Failed to get KV state for ${sourceName}: ${res.status} ${errorText}`);
    }

    const data = (await res.json()) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if ("files" in data) {
        const withFiles = data as { lastCommit?: string; files?: Record<string, SyncStateItem> };
        return {
          lastCommit: withFiles.lastCommit,
          files: withFiles.files || {}
        };
      }
      // Legacy format where root object keys were file paths
      return {
        files: data as Record<string, SyncStateItem>
      };
    }

    return { files: {} };
  }

  async saveKVState(sourceName: string, state: SyncState): Promise<void> {
    const key = `sync_state:${encodeURIComponent(sourceName)}`;
    const url = `${this.baseUrl}/accounts/${this.env.accountId}/storage/kv/namespaces/${this.env.kvNamespaceId}/values/${key}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        ...this.authHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(state)
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Failed to save KV state for ${sourceName}: ${res.status} ${errorText}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const batchSize = 25;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const url = `${this.baseUrl}/accounts/${this.env.accountId}/ai/run/${this.env.aiModel}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...this.authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: batch })
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Workers AI embedding failed: ${res.status} ${errorText}`);
      }

      const data = (await res.json()) as {
        success?: boolean;
        result?: { data?: number[][] };
        errors?: Array<{ message: string }>;
      };

      if (!data.result?.data) {
        throw new Error(`Unexpected Workers AI response format: ${JSON.stringify(data)}`);
      }

      allEmbeddings.push(...data.result.data);
    }

    return allEmbeddings;
  }

  async upsertVectors(vectors: VectorItem[]): Promise<void> {
    if (vectors.length === 0) return;

    const batchSize = 200;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      const url = `${this.baseUrl}/accounts/${this.env.accountId}/vectorize/v2/indexes/${this.env.vectorizeIndexName}/upsert`;

      // Cloudflare Vectorize v2 accepts NDJSON format
      const ndjson = batch.map((v) => JSON.stringify(v)).join("\n");

      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...this.authHeaders,
          "Content-Type": "application/x-ndjson"
        },
        body: ndjson
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Vectorize upsert failed: ${res.status} ${errorText}`);
      }
    }
  }

  async deleteVectors(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const batchSize = 500;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const url = `${this.baseUrl}/accounts/${this.env.accountId}/vectorize/v2/indexes/${this.env.vectorizeIndexName}/delete-by-ids`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...this.authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids: batch })
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Vectorize delete failed: ${res.status} ${errorText}`);
      }
    }
  }
}
