# Repository Guidelines

## Overview
This repository is currently empty (no source, test, or config files are present). Use this guide as the baseline for new contributions and update it once tooling or structure is added.
See `docs/architecture.md` for the current architecture overview.

## Project Structure & Module Organization
- Expected layout (create as needed):
  - `src/` for application or library code.
  - `tests/` for automated tests.
  - `scripts/` for helper tooling (e.g., `scripts/dev.sh`).
  - `docs/` for project documentation and architecture notes.
- Keep new modules grouped by domain (e.g., `src/auth/`, `src/api/`) rather than by file type.

## Build, Test, and Development Commands
Current commands:
- `npm run build` - compile TypeScript.
- `npm test` - run the Jest test suite.
- `npm run lint` - run ESLint.

## Coding Style & Naming Conventions
- Indentation: 2 spaces for JS/TS or JSON, 4 spaces for Python. If you introduce a language, add its rule here.
- Naming: use `kebab-case` for files, `PascalCase` for exported types/classes, and `camelCase` for functions/variables.
- Formatting: if you add a formatter (e.g., Prettier, Black), commit the config and document the command (e.g., `npm run fmt`).
- Prefer immutable DTOs and domain models with `readonly` fields.
- Use `Option`, `Collection`, and `HashSet` instead of `undefined` and raw arrays in domain code.
- Provide `fromJson` factory methods for DTO parsing and `item` getters for serialization.
- Prefer service classes over free functions; use factories and SerDe classes where appropriate.
- Documentation:
  - Add JSDoc to every class and method that lacks it, including parameters and return value.
  - For methods longer than 30 lines, add short comments before each logical block describing intent and expected outcome.
  - Keep comments concise and avoid restating obvious code.

## Testing Guidelines
- Prefer a single test framework per language (e.g., Jest for JS/TS, Pytest for Python).
- Test file naming: `*.test.*` or `test_*.py` (pick one standard and use it consistently).
- Coverage targets are not set yet; add targets and CI gates once tests exist.
- Favor deterministic tests with mocks/stubs (no randomness) and shared helpers for Telegram update creation.

## Commit & Pull Request Guidelines
- No commit message convention is established yet. Use clear, imperative messages (e.g., `Add login flow`, `Fix rate limit error`).
- Pull requests should include:
  - A concise description of what changed and why.
  - Any linked issues or context.
  - Screenshots or logs for UI/behavior changes.

## Configuration & Security
- Keep secrets out of the repo. Use `.env` files and document required variables in `docs/config.md`.
- If you add dependencies, prefer pinned versions and document upgrade steps.
