# cf-knowbase-indexer

Automated incremental knowledge base indexer for personal notes, repositories, and websites communicating securely with `cf-knowbase-api`.

## Overview

`cf-knowbase-indexer` runs periodically via GitHub Actions (or locally) to synchronize documents from multiple sources into Cloudflare Vectorize via `cf-knowbase-api`:
- **Private & Public Git Repositories**: Incremental indexing based on Git commit diffs (`git diff <lastCommit> HEAD`). Automatically supports token-based authentication for private repositories without needing SSH keys.
- **Websites & Blogs**: Recursively crawls web pages and extracts clean content.
- **Privacy Filter (`#confidential`)**: Automatically skips Obsidian and Markdown notes tagged with `#confidential` (in YAML frontmatter or inline body text), preventing sensitive notes from being vectorized.
- **Centralized API Architecture**: Communicates directly with `cf-knowbase-api` (`/vectors/upsert`, `/vectors/delete`, `/sync-state/:source`), letting the Worker handle edge embeddings (Workers AI) and Vectorize index updates.
- **Log Sanitization**: Uses GitHub Actions secret masking (`@actions/core.setSecret`) to prevent leakage of private URLs, tokens, and credentials into action execution logs.

## Architecture

```
[ Git / Web Sources ]
        │
        ▼
 [ Chunking & Hashing ] ──(Git Commit Diff & #confidential filter)──┐
        │                                                           │
        ▼                                                           ▼
 [ POST /vectors/upsert ]                                   [ GET/PUT /sync-state/:source ]
        │                                                           │
        └───────────────────────────┬───────────────────────────────┘
                                    │ (Bearer Auth)
                                    ▼
                         [ cf-knowbase-api Worker ]
                                    │
             ┌──────────────────────┴──────────────────────┐
             ▼                                             ▼
   [ Cloudflare Workers AI ]                     [ Cloudflare Vectorize & KV ]
    (Generate Embeddings)                         (Upsert / Delete / Sync State)
```

## Secrets & Configuration

Configure the following GitHub Action Secrets (or `.env` file for local runs):

| Secret Name | Description | Required |
|---|---|---|
| `CONFIG_JSON` | JSON array configuring data sources | Yes |
| `CF_KNOWBASE_API_URL` | URL of the deployed `cf-knowbase-api` worker (e.g. `https://knowbase-api.example.com`) | Yes |
| `CF_KNOWBASE_API_TOKEN` | Bearer API Token shared with `cf-knowbase-api` | Yes |
| `GH_PAT` | GitHub Personal Access Token with repo read access for private repositories | Optional |

### `CONFIG_JSON` Example

```json
[
  {
    "name": "personal-notes",
    "type": "git",
    "url": "https://github.com/username/notes.git",
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
CONFIG_JSON='[...]' CF_KNOWBASE_API_URL='https://...' CF_KNOWBASE_API_TOKEN='...' node dist/index.js
```
## Clearing Vectorize & Sync State

To completely reset the knowledge base (e.g. wipe all vectors and reset KV sync states for a fresh sync):
- In GitHub Actions: trigger the **Clear Knowledge Base Data** workflow (`workflow_dispatch`).
- Or locally:
  ```bash
  CF_KNOWBASE_API_URL='https://...' CF_KNOWBASE_API_TOKEN='...' pnpm run clear
  ```

## License

This project is licensed under the [MIT License](LICENSE).
