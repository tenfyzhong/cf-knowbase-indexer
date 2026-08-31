# Contributing

Thank you for contributing to `cf-knowbase-indexer`.

## Prerequisites

- Node.js 20 or later
- pnpm 9
- A deployed `cf-knowbase-api` instance for integration testing

## Development Setup

Install the locked dependencies:

```bash
pnpm install --frozen-lockfile
```

## Testing and Building

Run the unit tests and compile the TypeScript sources before submitting a change:

```bash
pnpm test
pnpm build
```

GitHub Actions runs the same test and build checks for every pull request and every push to `main`.

Use the project's test framework for reusable unit tests. For functionality, bug fixes, refactoring, and behavior changes, write a test that fails for the expected reason before implementing the minimal production change that makes it pass.

Do not use production credentials in unit tests or commit credentials to the repository. Keep logs free of source URLs, tokens, and other sensitive configuration.

## Running Locally

After building the project, run an indexing pass with the required configuration:

```bash
CONFIG_JSON='[...]' \
CF_KNOWBASE_API_URL='https://knowbase-api.example.com' \
CF_KNOWBASE_API_TOKEN='...' \
pnpm start
```

Use a dedicated development deployment when testing changes that write vectors or synchronization state.

## Commits and Pull Requests

- Create a dedicated branch from the latest `main`.
- Write commit messages, pull request titles, and pull request descriptions in English.
- Sign off every commit with `git commit -s`.
- Keep documentation synchronized with behavior changes.
- Include tests for behavior changes and describe the verification performed in the pull request.
