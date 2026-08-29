import type { Env } from "./config.js";

export interface ChunkItem {
  id: string;
  text: string;
  source: string;
  path: string;
  title?: string;
  chunkIndex: number;
  url?: string;
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

export class KbApiClient {
  constructor(private readonly env: Env) {}

  private get authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.env.apiToken}`
    };
  }

  async getSyncState(sourceName: string): Promise<SyncState> {
    const url = `${this.env.apiUrl}/sync-state/${encodeURIComponent(sourceName)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: this.authHeaders
    });

    if (res.status === 404) {
      return { files: {} };
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Failed to get sync state for ${sourceName}: ${res.status} ${errorText}`);
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
      return { files: data as Record<string, SyncStateItem> };
    }

    return { files: {} };
  }

  async saveSyncState(sourceName: string, state: SyncState): Promise<void> {
    const url = `${this.env.apiUrl}/sync-state/${encodeURIComponent(sourceName)}`;

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
      throw new Error(`Failed to save sync state for ${sourceName}: ${res.status} ${errorText}`);
    }
  }

  async upsertChunks(chunks: ChunkItem[]): Promise<{ count: number }> {
    if (chunks.length === 0) return { count: 0 };

    const batchSize = 100;
    let totalCount = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const url = `${this.env.apiUrl}/vectors/upsert`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...this.authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ items: batch })
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Vector upsert via API failed: ${res.status} ${errorText}`);
      }

      const json = (await res.json()) as { count?: number };
      totalCount += json.count ?? batch.length;
    }

    return { count: totalCount };
  }

  async deleteVectors(ids: string[]): Promise<{ count: number }> {
    if (ids.length === 0) return { count: 0 };

    const batchSize = 500;
    let totalDeleted = 0;

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const url = `${this.env.apiUrl}/vectors/delete`;

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
        throw new Error(`Vector delete via API failed: ${res.status} ${errorText}`);
      }

      const json = (await res.json()) as { count?: number };
      totalDeleted += json.count ?? batch.length;
    }

    return { count: totalDeleted };
  }
}
