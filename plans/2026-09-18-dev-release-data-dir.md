2026-09-18

# Dev/Release Data Directory Split — `~/.openp41ge-dev` for dev, `~/.openp41ge` for release

## Goal

Run a **release build** and a **dev build** of openp41ge simultaneously without
them stepping on each other's data. The dev build (run via `electron .`) must
use `~/.openp41ge-dev` as its app-data root; the packaged/released build keeps
using `~/.openp41ge`.

Today the app-data root is scattered across ~6 independent computations, most of
which hardcode `os.homedir()/.openp41ge` — including a module-level store, a
wrong fallback in `ConfigService`, and hardcoded paths in the renderer. We must
centralize resolution into one source of truth and thread it everywhere.

## Discriminator

`app.isPackaged` is the natural dev-vs-release signal and is already used by
`window-manager.ts` for `isDev`:

- **Packaged release** (`app.isPackaged === true`) → `.openp41ge`
- **Dev build** (`app.isPackaged === false`) → `.openp41ge-dev`

Environment overrides keep highest precedence, in order: `OPENP41GE_E2E_DIR` →
`OPENP41GE_DIR` → the packaged-based default. E2E tests set `OPENP41GE_E2E_DIR`
so they are unaffected by the folder-name change (and `OPENP41GE_E2E_TEST` does
not influence the data-dir selection — `isPackaged` alone decides the default).

## Approach

1. **Single resolver** — a pure, main-process module `app-data-dir.ts` producing
   the absolute app-data root and the folder name. No `electron`/`app` import so
   it stays unit-testable in vitest.
2. **Thread the resolved root** into every consumer instead of re-deriving it.
3. **Expose the root to the renderer** via the existing `openp41ge:init`
   message so the renderer stops hardcoding `~/.openp41ge`.

## Changes

### 1. NEW — `packages/openp41ge/src/main/services/app-data-dir.ts`

Pure module (imports only `os`, `path`):

```ts
export const APP_DATA_DIR_PRODUCTION = ".openp41ge";
export const APP_DATA_DIR_DEV = ".openp41ge-dev";

/** Folder name under the home dir, by packaged state. */
export function appDataDirName(isPackaged: boolean): string {
  return isPackaged ? APP_DATA_DIR_PRODUCTION : APP_DATA_DIR_DEV;
}

/** Absolute app-data root: env overrides first, then packaged-based default. */
export function resolveAppDataDir(isPackaged: boolean): string {
  const override =
    process.env.OPENP41GE_E2E_DIR || process.env.OPENP41GE_DIR;
  if (override) return override;
  return path.join(os.homedir(), appDataDirName(isPackaged));
}
```

Used by: `openp41ge-application`, `config-service`, `dialog-handlers`,
`workspace-handlers`, `window-manager`.

### 2. `packages/openp41ge/electron/openp41ge-application.ts`

- `_initPaths()` (line ~201): replace the inline expression with
  `this.openp41geDir = resolveAppDataDir(app.isPackaged);`
- `_initConfig()` (line ~219): pass the root —
  `new ConfigService(this.openp41geDir)` (currently passes nothing, so config
  always lands in `~/.openp41ge` — **this is a bug** and must be fixed).
- `_registerIpcHandlers()` (line ~387/393): pass the root —
  - `registerWorkspaceHandlers(this.workspaceService, this.dispatcher, this.openp41geDir)`
  - `registerDialogHandlers(this.openp41geDir)`

### 3. `packages/openp41ge/src/main/services/config-service.ts`

- Constructor fallback (line ~115): `path.join(os.homedir(), APP_DATA_DIR_PRODUCTION)`
  as a safety default (the app always passes the resolved root now).
- Update the header comment (`~/.openp41ge` → note dev/release).

### 4. `packages/openp41ge/electron/ipc-handlers/dialog-handlers.ts`

- `registerDialogHandlers(openp41geDir: string)`.
- `dialog:saveWorkspaceFile` defaultPath (line ~55) → `path.join(openp41geDir, "workspaces")`.
- `dialog:listWorkspaces` dir (line ~134) → `path.join(openp41geDir, "workspaces")`.
- `resolveTilde` (line ~40) stays as-is: it only rewrites a leading `~`; the
  paths now point into `openp41geDir` either directly (absolute) or through
  `~/<appDataDirName>`.

### 5. `packages/openp41ge/electron/ipc-handlers/workspace-handlers.ts`

- `registerWorkspaceHandlers(workspaceService, dispatcher, openp41geDir)`.
- Module-level `store` (line ~30): create it **inside** the register function
  from `path.join(openp41geDir, "repositories")` (drop the module-level `const`);
  keep the single-store invariant with `NodeGitService.reposDir` (both derive
  from `openp41geDir/repositories`).
- `getWorkspaceDataDir()` (line ~52): `path.join(openp41geDir, "workspaces-data")`.
- `getWorkspaceStats()` references the module-level `store` — pass `store` in
  as a parameter (or define it inside the register closure).
- Update the header/comments that reference `~/.openp41ge`.

### 6. `packages/openp41ge/electron/window-manager.ts`

- Import `appDataDirName` (from `app-data-dir`).
- In the `openp41ge:init` payload (line ~222), add
  `dataDir: resolveAppDataDir(app.isPackaged)` (absolute root) so the renderer
  gets the true root under any env override.
- Temporary default for browser/test dev mode: the renderer falls back to
  `~/.openp41ge` when the field is missing.

### 7. `packages/openp41ge/electron/preload.cjs`

- Store `_dataDir = data.dataDir` in the `openp41ge:init` handler.
- Expose it on the bridge (next to `isDev`), e.g. `dataDir: () => _dataDir`.

### 8. `packages/openp41ge/src/renderer/global.d.ts`

- Add `dataDir: () => string;` to the `Window.openp41ge` interface.

### 9. `packages/openp41ge/src/renderer/services/workspace-file-service.ts`

Use the exposed root instead of hardcoded `~/.openp41ge` (lines ~162, ~168,
~171). Build paths as absolute strings:

```ts
const dir = window.openp41ge?.dataDir?.() ?? "~/.openp41ge";
dataDir: `${dir}/workspaces-data/${uuid}`,
const filePath = `${dir}/workspaces/${uuid}.openp41ge-workspace`;
await window.openp41ge.dialog.ensureDir(`${dir}/workspaces-data/${uuid}`);
```

The `dialog.*` handlers already accept absolute paths (`resolveTilde` passes
absolute paths through unchanged) and `listWorkspaces` returns absolute
`filePath`s from the same root, so main and renderer now agree in all cases
(including `OPENP41GE_E2E_DIR` overrides).

> Note on file format: stored `dataDir` becomes absolute instead of `~/`-relative.
> Main resolves both equally; this is consistent with `listWorkspaces`, which
> already returns absolute paths. (Portability of `.openp41ge-workspace` files is
> unchanged on the owning machine.)

## Tests

- **NEW** `test/unit/services/app-data-dir.test.ts`:
  - `appDataDirName(true) === ".openp41ge"`, `appDataDirName(false) === ".openp41ge-dev"`.
  - `resolveAppDataDir` honors `OPENP41GE_E2E_DIR` > `OPENP41GE_DIR` > default;
    default lands under `os.homedir()` with the right folder name.
- **`test/unit/services/workspace-file-service.test.ts`**: the `createWorkspace`
  test mocks `window.openp41ge.dialog`; add an `appDataDir`/`dataDir` mock (or
  rely on the `?? "~/.openp41ge"` fallback). No path-format assertions exist
  there today — verify none are added inadvertently.
- **`test/unit/services/main-config-service.test.ts`**: confirms
  `new ConfigService(tempDir)` still passes root explicitly (unchanged behavior).
- **Integration/E2E**: run with `OPENP41GE_E2E_DIR` set to a temp dir; confirm
  renderer-created workspace files now land under that dir (not `~/.openp41ge`
  or `~/.openp41ge-dev`) for all `dialog:*` / `workspaceData:*` flows.
- Quality gate: `nx run-many -t typecheck`, `nx lint`, `nx run openp41ge:test`.

## Docs / comments (non-functional, update for correctness)

- `packages/openp41ge/README.md` — note logs live under `~/.openp41ge/logs`
  (release) / `~/.openp41ge-dev/logs` (dev run).
- Stale comments in: `log-file-store.ts`, `chat-store-service.ts`,
  `workspace-state-store.ts`, `workspace-service.ts`, `config-service.ts`,
  `workspace-handlers.ts`, `preload.cjs` (log bus comment), `debug-api.ts`.

## Scope

- **In:** centralizing the app-data root; fixing the `ConfigService` default
  bug; threading root through IPC handlers; exposing root to the renderer;
  dev/release folder naming via `app.isPackaged`.
- **Out (parked):** migrating or re-keying existing stored `~/`-relative
  `dataDir` values; an explicit env flag to force dev/release folder choice
  (a dev could add `OPENP41GE_DIR` today for full control).

## Open Questions

1. **Stored `dataDir` format** — switching from `~/`-relative to absolute makes
   on-disk workspace files machine-specific. Acceptable for this feature, or
   should we keep `~/`-relative and expose only the folder **name**? (Lean:
   absolute — single source of truth and consistent with `listWorkspaces`.)
2. **Naming** — `dataDir` vs `appDataDir` on the preload bridge. Pick one and
   keep it consistent across preload/global.d.ts/workspace-file-service.

## Completion Status — IMPLEMENTED

All changes implemented and verified (`nx run-many -t typecheck lint` and the full
vitest suite: 165 files / 2132 tests pass).

- [x] `resolveAppDataDir` is the only place that derives the app-data root;
      all call sites use it or receive the threaded value.
- [x] Dev run (`electron .`, `isPackaged === false`) uses `~/.openp41ge-dev`.
- [x] Packaged release uses `~/.openp41ge`.
- [x] `OPENP41GE_E2E_DIR` / `OPENP41GE_DIR` still win over the default.
- [x] `ConfigService` receives the resolved root (no more silent `~/.openp41ge`).
- [x] `dialog:*` save/list/ensure/write/delete operate inside the current root.
- [x] Renderer `workspace-file-service` creates workspace files under the
      current root (matches `listWorkspaces`).
- [x] `nx run-many -t typecheck`, `nx lint`, `nx run openp41ge:test` pass.

### Implementation notes

- `app-data-dir.ts` exposes `appDataDirName(isPackaged)` and
  `resolveAppDataDir(isPackaged)`; env override precedence is `OPENP41GE_E2E_DIR`
  → `OPENP41GE_DIR` → packaged-based default.
- The renderer gets the **absolute** root via a new `dataDir` field on the
  `openp41ge:init` payload → preload `window.openp41ge.dataDir()` →
  `global.d.ts`. `workspace-file-service` uses `?? "~/.openp41ge"` as a fallback
  for browser/test contexts (main-process handlers resolve `~`).
- `registerWorkspaceHandlers(..., openp41geDir?)` keeps an optional para for
  robustness, but `openp41ge-application` always passes the resolved root; the
  module-level `store` was moved into the register function so it follows the
  root (matching `NodeGitService.reposDir`).
- Open question #1 resolved in favor of **absolute** stored `dataDir` paths —
  consistent with `listWorkspaces` (already absolute) and correct in E2E when
  `OPENP41GE_E2E_DIR` is set.
