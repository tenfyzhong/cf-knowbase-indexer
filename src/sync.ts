import * as core from "@actions/core";
import type { Config, Env, Source } from "./config.js";
import { CloudflareClient, type SyncState, type VectorItem } from "./cloudflare.js";
import { chunkText, generateVectorId } from "./chunker.js";
import { loadGitDocuments } from "./sources/git.js";
import { loadWebDocuments } from "./sources/web.js";

export interface DocumentItem {
  path: string;
  hash: string;
  content: string;
  title?: string;
}

export interface DiffResult {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
}

export interface SyncResult {
  sourceName: string;
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
  unchangedCount: number;
  totalChunks: number;
}

export function calculateDiff(
  prevState: SyncState,
  currentDocs: Map<string, DocumentItem>
): DiffResult {
  const added: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];
  const deleted: string[] = [];

  for (const [path, doc] of currentDocs.entries()) {
    const prev = prevState[path];
    if (!prev) {
      added.push(path);
    } else if (prev.hash !== doc.hash) {
      modified.push(path);
    } else {
      unchanged.push(path);
    }
  }

  for (const prevPath of Object.keys(prevState)) {
    if (!currentDocs.has(prevPath)) {
      deleted.push(prevPath);
    }
  }

  return { added, modified, deleted, unchanged };
}

export async function syncSource(
  source: Source,
  currentDocs: Map<string, DocumentItem>,
  client: CloudflareClient
): Promise<SyncResult> {
  const prevState = await client.getKVState(source.name);
  const diff = calculateDiff(prevState, currentDocs);

  // 1. Delete outdated vectors for deleted and modified items
  const vectorIdsToDelete: string[] = [];
  for (const deletedPath of diff.deleted) {
    const prevItem = prevState[deletedPath];
    if (prevItem) {
      for (let i = 0; i < prevItem.chunkCount; i++) {
        vectorIdsToDelete.push(generateVectorId(source.name, deletedPath, i));
      }
    }
  }

  for (const modifiedPath of diff.modified) {
    const prevItem = prevState[modifiedPath];
    if (prevItem) {
      for (let i = 0; i < prevItem.chunkCount; i++) {
        vectorIdsToDelete.push(generateVectorId(source.name, modifiedPath, i));
      }
    }
  }

  if (vectorIdsToDelete.length > 0) {
    await client.deleteVectors(vectorIdsToDelete);
  }

  // 2. Prepare chunks for added and modified documents
  const docsToIndex = [...diff.added, ...diff.modified];
  const newChunks: Array<{
    id: string;
    text: string;
    path: string;
    title?: string;
    chunkIndex: number;
  }> = [];

  const nextState: SyncState = {};

  // Copy unchanged state
  for (const unchangedPath of diff.unchanged) {
    nextState[unchangedPath] = prevState[unchangedPath];
  }

  for (const docPath of docsToIndex) {
    const doc = currentDocs.get(docPath);
    if (!doc) continue;

    const chunks = chunkText(doc.content);
    nextState[docPath] = {
      hash: doc.hash,
      chunkCount: chunks.length
    };

    for (const chunk of chunks) {
      const vectorId = generateVectorId(source.name, docPath, chunk.chunkIndex);
      newChunks.push({
        id: vectorId,
        text: chunk.text,
        path: docPath,
        title: doc.title,
        chunkIndex: chunk.chunkIndex
      });
    }
  }

  // 3. Generate embeddings and upsert to Vectorize in batches
  if (newChunks.length > 0) {
    const texts = newChunks.map((c) => c.text);
    const embeddings = await client.generateEmbeddings(texts);

    const vectorsToUpsert: VectorItem[] = newChunks.map((chunk, idx) => ({
      id: chunk.id,
      values: embeddings[idx],
      metadata: {
        text: chunk.text,
        source: source.name,
        path: chunk.path,
        title: chunk.title,
        chunkIndex: chunk.chunkIndex,
        url: source.type === "web" ? chunk.path : undefined
      }
    }));

    await client.upsertVectors(vectorsToUpsert);
  }

  // 4. Save new state to KV
  await client.saveKVState(source.name, nextState);

  return {
    sourceName: source.name,
    addedCount: diff.added.length,
    modifiedCount: diff.modified.length,
    deletedCount: diff.deleted.length,
    unchangedCount: diff.unchanged.length,
    totalChunks: newChunks.length
  };
}

export async function runSync(config: Config, env: Env): Promise<SyncResult[]> {
  const client = new CloudflareClient(env);
  const results: SyncResult[] = [];

  for (const source of config) {
    core.info(`Starting sync for source: ${source.name} (${source.type})`);

    let docs: Map<string, DocumentItem>;
    if (source.type === "git") {
      docs = await loadGitDocuments(source);
    } else {
      docs = await loadWebDocuments(source);
    }

    core.info(`Loaded ${docs.size} documents from ${source.name}`);
    const result = await syncSource(source, docs, client);
    results.push(result);

    core.info(
      `Source ${source.name} synced: +${result.addedCount} ~${result.modifiedCount} -${result.deletedCount} =${result.unchangedCount} (${result.totalChunks} chunks indexed)`
    );
  }

  return results;
}
