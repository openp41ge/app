2026-07-26

# Replace Pact Contract Tests with tRPC — COMPLETED

## Summary

Replaced Pact-based consumer-driven contract tests with a lightweight typed-RPC
layer shared between main process and renderer. Integration tests verify handler
logic against in-memory test services.

## What Changed

### New files
- `packages/openp41ge/src/trpc/types.ts` — shared type definitions for all RPC
  procedures (workspace, file, config domains)
- `packages/openp41ge/electron/trpc/index.ts` — main-process IPC handler registry
  (single `ipcMain.handle("rpc:call")` routes by domain.method)
- `packages/openp41ge/electron/trpc/repos-handlers.ts` — repository/worktree
  handler interface + testable service DI
- `packages/openp41ge/electron/trpc/file-handlers.ts` — file handler interface
- `packages/openp41ge/electron/trpc/config-handlers.ts` — config handler interface
- `packages/openp41ge/test/integration/test-services.ts` — in-memory test
  implementations of all service interfaces
- `packages/openp41ge/test/integration/rpc-workspace.test.ts` — 11 integration
  tests for workspace handlers
- `packages/openp41ge/test/integration/rpc-file.test.ts` — 5 integration tests
  for file handlers
- `packages/openp41ge/test/integration/rpc-config.test.ts` — 3 integration tests
  for config handlers

### Deleted files
- `packages/openp41ge/test/contract/` (entire directory — 3 consumer tests,
  1 provider verification, helpers, pact files)
- `packages/openp41ge/vitest.contract.config.ts`
- `packages/openp41ge/src/trpc/router.ts` (superseded by types.ts)

### Modified files
- `packages/openp41ge/project.json` — removed `test:contract` target
- `packages/openp41ge/vitest.integration.config.ts` — updated with proper aliases
- `packages/openp41ge/test/unit/pre-setup.ts` — removed pact Rust stderr filter
- `.github/workflows/prerequisites.yml` — removed contract CI job
- `package.json` — removed `@pact-foundation/pact` and `@pact-foundation/pact-core`
- `pnpm-lock.yaml` — lockfile update

### Test Results
- **Unit tests**: 562 passed (unchanged)
- **Integration tests (new)**: 20 passed (replaces 45 Pact contract tests)
- **Build**: 17/17 packages
- **TypeScript**: No new type errors (28 pre-existing remain)

## Architecture

```
Renderer (Web Components)
  └── window.openp41ge.workspaceController.*  (unchanged API)
        └── preload.cjs → ipcRenderer.invoke("rpc:call", { domain, method, input })
              └── ipcMain.handle("rpc:call")
                    └── handler registry → ReposService | FileService | ConfigService
                          └── Production: delegates to real git/file/config services
                          └── Test: pure in-memory implementations
```

Key design decisions:
- **Not using actual tRPC framework** — the @trpc/server/client packages are
  designed for HTTP transports and bring observable-based link infrastructure
  that adds complexity in Electron IPC context. Instead we use shared TypeScript
  types + a simple handler registry, which gives the same compile-time contract
  enforcement without the framework overhead.
- **Testable via DI** — each service interface has a `set*Service()` function
  that integration tests use to inject TestService implementations.
- **Preload API unchanged** — the `window.openp41ge.*` surface stays the same;
  renderer code doesn't need updates.
- **Single IPC channel** — all typed calls go through `rpc:call` instead of
  20+ individual ipcMain.handle registrations.
