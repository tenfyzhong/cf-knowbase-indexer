# cf-kb-indexer

Automated incremental knowledge base indexer for personal notes, repositories, and websites communicating securely with `cf-kb-api`.

## Overview

`cf-kb-indexer` runs periodically via GitHub Actions (or locally) to synchronize documents from multiple sources into Cloudflare Vectorize via `cf-kb-api`:
- **Private & Public Git Repositories**: Incremental indexing based on Git commit diffs (`git diff <lastCommit> HEAD`).
- **Websites & Blogs**: Recursively crawls web pages and extracts clean content.
- **Privacy Filter (`#secret`)**: Automatically skips Obsidian and Markdown notes tagged with `#secret` (in YAML frontmatter or inline body text), preventing sensitive notes from being vectorized.
- **Centralized API Architecture**: Communicates directly with `cf-kb-api` (`/vectors/upsert`, `/vectors/delete`, `/sync-state/:source`), letting the Worker handle edge embeddings (Workers AI) and Vectorize index updates.
- **Log Sanitization**: Uses GitHub Actions secret masking (`@actions/core.setSecret`) to prevent leakage of private URLs, tokens, and SSH secrets into action execution logs.

## Architecture

```
[ Git / Web Sources ]
        │
        ▼
 [ Chunking & Hashing ] ──(Git Commit Diff & #secret filter)──┐
        │                                                     │
        ▼                                                     ▼
 [ POST /vectors/upsert ]                             [ GET/PUT /sync-state/:source ]
        │                                                     │
        └───────────────────────┬─────────────────────────────┘
                                │ (Bearer Auth)
                                ▼
                         [ cf-kb-api Worker ]
                                │
             ┌──────────────────┴──────────────────┐
             ▼                                     ▼
   [ Cloudflare Workers AI ]             [ Cloudflare Vectorize & KV ]
    (Generate Embeddings)                 (Upsert / Delete / Sync State)
```

## Secrets & Configuration

Configure the following GitHub Action Secrets (or `.env` file for local runs):

| Secret Name | Description | Required |
|---|---|---|
| `CONFIG_JSON` | JSON array configuring data sources | Yes |
| `CF_KB_API_URL` | URL of the deployed `cf-kb-api` worker (e.g. `https://cf-kb-api.<subdomain>.workers.dev`) | Yes |
| `CF_KB_API_TOKEN` | Bearer API Token shared with `cf-kb-api` | Yes |
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
CONFIG_JSON='[...]' CF_KB_API_URL='https://...' CF_KB_API_TOKEN='...' node dist/index.js
```
