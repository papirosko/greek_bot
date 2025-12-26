# Repository Guidelines

## Overview
This repository is currently empty (no source, test, or config files are present). Use this guide as the baseline for new contributions and update it once tooling or structure is added.

## Project Structure & Module Organization
- Expected layout (create as needed):
  - `src/` for application or library code.
  - `tests/` for automated tests.
  - `scripts/` for helper tooling (e.g., `scripts/dev.sh`).
  - `docs/` for project documentation and architecture notes.
- Keep new modules grouped by domain (e.g., `src/auth/`, `src/api/`) rather than by file type.

## Build, Test, and Development Commands
No build or test commands are defined yet. When you add tooling, document exact commands here, for example:
- `npm run dev` - start a local dev server.
- `npm test` - run the test suite.
- `make build` - produce release artifacts.

## Coding Style & Naming Conventions
- Indentation: 2 spaces for JS/TS or JSON, 4 spaces for Python. If you introduce a language, add its rule here.
- Naming: use `kebab-case` for files, `PascalCase` for exported types/classes, and `camelCase` for functions/variables.
- Formatting: if you add a formatter (e.g., Prettier, Black), commit the config and document the command (e.g., `npm run fmt`).

## Testing Guidelines
- Prefer a single test framework per language (e.g., Jest for JS/TS, Pytest for Python).
- Test file naming: `*.test.*` or `test_*.py` (pick one standard and use it consistently).
- Coverage targets are not set yet; add targets and CI gates once tests exist.

## Commit & Pull Request Guidelines
- No commit message convention is established yet. Use clear, imperative messages (e.g., `Add login flow`, `Fix rate limit error`).
- Pull requests should include:
  - A concise description of what changed and why.
  - Any linked issues or context.
  - Screenshots or logs for UI/behavior changes.

## Configuration & Security
- Keep secrets out of the repo. Use `.env` files and document required variables in `docs/config.md`.
- If you add dependencies, prefer pinned versions and document upgrade steps.
