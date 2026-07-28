---
name: quality
description: Always run before submitting work. Runs all tooling — dead code detection, type checking, linting, formatting checks, tests, and build verification — across the monorepo.
---

# Code Quality

Run all available tooling in sequence to verify the health of the codebase. Always run from the project root (`/Users/rk/Repository/openp41ge/master`).

## Available Tooling

| Tool                         | Command                     | Scope                                                               |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------- |
| **Dead code detection**      | `nx knip`                   | All packages — finds unused files, exports, dependencies, and types |
| **TypeScript type check**    | `nx run-many -t typecheck`  | All packages                                                        |
| **ESLint**                   | `nx lint`                   | `packages/` — configured in `eslint.config.js`                      |
| **Prettier check**           | `nx format:check`           | All files — config in `.prettierrc`                                 |
| **Unit + integration tests** | `nx run-many -t test`       | All packages via per-package vitest configs                         |
| **E2E tests**                | `nx run-many -t e2e`        | Playwright E2E tests across packages                                |
| **Build**                    | `nx run-many -t build`      | All 17 packages                                                     |
| **Coverage**                 | `npx vitest run --coverage` | All packages                                                        |

## ⚠️ Nx Cache and Root-Level Targets

Root-level targets (`lint`, `format:check`) run from the monorepo root project but Nx only considers the root project's own files for its cache key by default. Changing files under `packages/` won't invalidate the cache.

**Fix:** `nx.json` now has explicit `inputs: ["{workspaceRoot}/packages/**/*"]` on the `lint` target default so any change under `packages/` properly invalidates the cache. If you add new root-level targets, ensure they have similar `inputs` coverage.

## Quick Checks (pre-commit)

```bash
# Type check + lint + dead code (fastest feedback)
nx run-many -t typecheck && nx lint && nx knip && nx run-many -t test
```

## Full Quality Pass

```bash
nx run-many -t typecheck && nx lint && nx format:check && nx run-many -t test && nx run-many -t build
```

## Dead Code Detection (Knip)

Knip scans all packages for unused files, exports, dependencies, and type exports. Configured in `knip.json`.

```bash
# Full scan
nx knip

# Production-only (stricter, excludes test/related code)
nx knip:production
```

Knip currently reports ~35 unused exports — these are a mix of:

- **Truly dead code** left from refactors (e.g. `switchTabInCell` was replaced by `activateTabInCell`)
- **Intentional public API** that's exported for external consumers but not imported internally
- **Schema/type exports** used by downstream consumers

Run `nx knip` after significant refactors to catch orphaned functions and files.

## Logging (`openp41ge-logger`)

All packages use `openp41ge-logger` for structured logging instead of raw `console.*` calls.

```ts
import { createLogger } from "openp41ge-logger";
const log = createLogger("my-module");
log.info("doing thing");
log.error("something broke:", err);
```

Logs are written to:

- The **browser console** (for developer tooling)
- A **global in-memory buffer** viewable via `<openp41ge-log-viewer>` (open "Logs" from the pane picker)

### Levels

| Method           | Console mapping | Use case                                                       |
| ---------------- | --------------- | -------------------------------------------------------------- |
| `log.debug(...)` | `console.debug` | High-frequency events (drag state, shortcuts)                  |
| `log.info(...)`  | `console.info`  | Notable lifecycle events (init, file open, operation dispatch) |
| `log.warn(...)`  | `console.warn`  | Recoverable issues (missing context, fallback paths)           |
| `log.error(...)` | `console.error` | Failures (unknown ops, listener crashes, I/O errors)           |

## Test Coverage

```bash
# All packages with coverage (runs from root vitest config)
npx vitest run --coverage
```
