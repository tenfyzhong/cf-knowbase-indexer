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
  isConfidential?: boolean;
}

export interface SyncState {
  lastCommit?: string;
  files: Record<string, SyncStateItem>;
}

export class KnowbaseApiClient {
  constructor(private readonly env: Env) {}

  private get authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.env.apiToken}`,
      "User-Agent": "CF-Knowbase-Indexer/1.0"
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

    const batchSize = 30;
    let totalCount = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const url = `${this.env.apiUrl}/vectors/upsert`;

      let attempts = 0;
      let lastError = "";

      while (attempts < 5) {
        attempts++;
        try {
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
            lastError = `(${res.status}): ${errorText}`;
            if (res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503) {
              await new Promise((r) => setTimeout(r, attempts * 2000));
              continue;
            }
            throw new Error(`Vector upsert via API failed ${lastError}`);
          }

          const json = (await res.json()) as { count?: number };
          totalCount += json.count ?? batch.length;
          break;
        } catch (err) {
          if (attempts >= 5) {
            throw err instanceof Error ? err : new Error(String(err));
          }
          await new Promise((r) => setTimeout(r, attempts * 2000));
        }
      }

      // Small throttle between batches
      if (i + batchSize < chunks.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
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
        throw new Error(`Vector delete via API failed (${res.status}): ${errorText}`);
      }

      const json = (await res.json()) as { count?: number };
      totalDeleted += json.count ?? batch.length;
    }

    return { count: totalDeleted };
  }
  async clearData(sourceName?: string): Promise<{
    success: boolean;
    deletedVectorsCount: number;
    clearedSources: string[];
  }> {
    const sourceQuery = sourceName
      ? `?source=${encodeURIComponent(sourceName)}`
      : "";
    const url = `${this.env.apiUrl}/vectors/clear${sourceQuery}`;

    const res = await fetch(url, {
      method: "POST",
      headers: this.authHeaders
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Failed to clear knowledge base data (${res.status}): ${errorText}`);
    }

    return (await res.json()) as {
      success: boolean;
      deletedVectorsCount: number;
      clearedSources: string[];
    };
  }

  async clearAllData(): Promise<{
    success: boolean;
    deletedVectorsCount: number;
    clearedSources: string[];
  }> {
    return this.clearData();
  }
}
