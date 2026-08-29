import * as core from "@actions/core";
import type { Config, Env, Source } from "./config.js";
import { CloudflareClient, type SyncState, type VectorItem } from "./cloudflare.js";
import { chunkText, generateVectorId, hasSecretTag } from "./chunker.js";
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
  skippedSecretCount: number;
}

export interface SyncOptions {
  gitDiff?: DiffResult;
  commit?: string;
}

export function calculateDiff(
  prevState: SyncState,
  currentDocs: Map<string, DocumentItem>
): DiffResult {
  const added: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];
  const deleted: string[] = [];

  const prevFiles = prevState.files || {};

  for (const [path, doc] of currentDocs.entries()) {
    const prev = prevFiles[path];
    if (!prev) {
      added.push(path);
    } else if (prev.hash !== doc.hash) {
      modified.push(path);
    } else {
      unchanged.push(path);
    }
  }

  for (const prevPath of Object.keys(prevFiles)) {
    if (!currentDocs.has(prevPath)) {
      deleted.push(prevPath);
    }
  }

  return { added, modified, deleted, unchanged };
}

export async function syncSource(
  source: Source,
  currentDocs: Map<string, DocumentItem>,
  client: CloudflareClient,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const prevState = await client.getKVState(source.name);
  const prevFiles = prevState.files || {};

  const diff = options.gitDiff ?? calculateDiff(prevState, currentDocs);

  // 1. Delete outdated vectors for deleted and modified items
  const vectorIdsToDelete: string[] = [];
  for (const deletedPath of diff.deleted) {
    const prevItem = prevFiles[deletedPath];
    if (prevItem && prevItem.chunkCount > 0) {
      for (let i = 0; i < prevItem.chunkCount; i++) {
        vectorIdsToDelete.push(generateVectorId(source.name, deletedPath, i));
      }
    }
  }

  for (const modifiedPath of diff.modified) {
    const prevItem = prevFiles[modifiedPath];
    if (prevItem && prevItem.chunkCount > 0) {
      for (let i = 0; i < prevItem.chunkCount; i++) {
        vectorIdsToDelete.push(generateVectorId(source.name, modifiedPath, i));
      }
    }
  }

  if (vectorIdsToDelete.length > 0) {
    await client.deleteVectors(vectorIdsToDelete);
  }

  // 2. Prepare chunks for added and modified documents (filtering out #secret documents)
  const docsToIndex = [...diff.added, ...diff.modified];
  const newChunks: Array<{
    id: string;
    text: string;
    path: string;
    title?: string;
    chunkIndex: number;
  }> = [];

  const nextFiles = { ...prevFiles };

  // Remove deleted from state
  for (const deletedPath of diff.deleted) {
    delete nextFiles[deletedPath];
  }

  let skippedSecretCount = 0;

  for (const docPath of docsToIndex) {
    const doc = currentDocs.get(docPath);
    if (!doc) continue;

    const isSecret = hasSecretTag(doc.content);
    if (isSecret) {
      skippedSecretCount++;
      nextFiles[docPath] = {
        hash: doc.hash,
        chunkCount: 0,
        isSecret: true
      };
      continue;
    }

    const chunks = chunkText(doc.content);
    nextFiles[docPath] = {
      hash: doc.hash,
      chunkCount: chunks.length,
      isSecret: false
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
  const nextState: SyncState = {
    lastCommit: options.commit || prevState.lastCommit,
    files: nextFiles
  };
  await client.saveKVState(source.name, nextState);

  return {
    sourceName: source.name,
    addedCount: diff.added.length,
    modifiedCount: diff.modified.length,
    deletedCount: diff.deleted.length,
    unchangedCount: diff.unchanged.length,
    totalChunks: newChunks.length,
    skippedSecretCount
  };
}

export async function runSync(config: Config, env: Env): Promise<SyncResult[]> {
  const client = new CloudflareClient(env);
  const results: SyncResult[] = [];

  for (const source of config) {
    core.info(`Starting sync for source: ${source.name} (${source.type})`);

    const prevState = await client.getKVState(source.name);

    let docs: Map<string, DocumentItem>;
    let gitDiff: DiffResult | undefined;
    let commit: string | undefined;

    if (source.type === "git") {
      const gitResult = await loadGitDocuments(source, prevState.lastCommit);
      docs = gitResult.docs;
      gitDiff = gitResult.diff;
      commit = gitResult.currentCommit;
      core.info(
        `Git source ${source.name} at commit ${commit}${
          gitDiff ? ` (incremental diff from ${prevState.lastCommit})` : " (full scan)"
        }`
      );
    } else {
      docs = await loadWebDocuments(source);
    }

    core.info(`Loaded ${docs.size} documents from ${source.name}`);
    const result = await syncSource(source, docs, client, { gitDiff, commit });
    results.push(result);

    core.info(
      `Source ${source.name} synced: +${result.addedCount} ~${result.modifiedCount} -${result.deletedCount} =${result.unchangedCount} (${result.totalChunks} chunks indexed, ${result.skippedSecretCount} secrets skipped)`
    );
  }

  return results;
}
