# cf-kb-indexer

Automated incremental knowledge base indexer for personal notes, repositories, and websites using Cloudflare Workers AI, Vectorize, and KV.

## Overview

`cf-kb-indexer` runs periodically via GitHub Actions (or locally) to synchronize documents from multiple sources into Cloudflare Vectorize:
- **Private & Public Git Repositories**: Clones Markdown and text files (e.g. Obsidian vaults, documentation).
- **Websites & Blogs**: Recursively crawls web pages and extracts clean content.
- **Incremental Sync**: Tracks document content hashes in Cloudflare KV (`sync_state:<source>`), only embedding and updating added or modified documents while removing deleted documents' vectors from Vectorize.
- **Log Sanitization**: Uses GitHub Actions secret masking (`@actions/core.setSecret`) to prevent leakage of private URLs, tokens, and SSH secrets into action execution logs.

## Architecture

```
[ Git / Web Sources ]
        │
        ▼
 [ Chunking & Hashing ] ──(Diff with Cloudflare KV state)──┐
        │                                                  │
        ▼                                                  ▼
[ Cloudflare Workers AI ]                          [ Cloudflare KV ]
 (Generate Embeddings)                             (Save new sync hashes)
        │
        ▼
[ Cloudflare Vectorize ]
 (Upsert Vectors & Metadata)
```

## Secrets & Configuration

Configure the following GitHub Action Secrets (or `.env` file for local runs):

| Secret Name | Description | Required |
|---|---|---|
| `CONFIG_JSON` | JSON array configuring data sources | Yes |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID | Yes |
| `CLOUDFLARE_API_TOKEN` | API Token with Workers AI, Vectorize, and KV permissions | Yes |
| `CLOUDFLARE_KV_NAMESPACE_ID` | Cloudflare KV Namespace ID for storing sync hashes | Yes |
| `CLOUDFLARE_VECTORIZE_INDEX_NAME` | Name of the Vectorize index | Yes |
| `CLOUDFLARE_AI_MODEL` | Embedding model (Default: `@cf/baai/bge-base-en-v1.5`) | No |
| `SSH_KEY` | Deploy/Private key with read access to private repositories | Optional |

### `CONFIG_JSON` Example

```json
[
  {
    "name": "obsidian-notes",
    "type": "git",
    "url": "git@github.com:tenfyzhong/obsidian-notes.git",
    "branch": "main",
    "include": ["**/*.md", "**/*.txt"],
    "exclude": [".trash/**", "templates/**"]
  },
  {
    "name": "blog",
    "type": "web",
    "url": "https://example.com/blog",
    "maxDepth": 2,
    "urlPattern": "https://example.com/blog/.*"
  }
]
```

## Local Development

```bash
# Install dependencies
pnpm install

# Run unit tests
pnpm test

# Build TypeScript
pnpm build

# Run local indexing with environment variables
CONFIG_JSON='[...]' CLOUDFLARE_ACCOUNT_ID='...' node dist/index.js
```
