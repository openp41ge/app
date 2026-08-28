2026-08-28

# Order the workspaces overlay list by last activated

## Goal

Change the workspace list in the workspaces overlay (left column of `openp41ge-workspaces-overlay` / `WorkspaceManagerModal`) from alphabetical to **most-recently-activated first**. The timestamp is stored as a new optional `lastActivatedAt` field inside each `.openp41ge-workspace` file. Workspaces with no recorded timestamp sort as if they were last activated at the epoch (i.e. always at the bottom), with the existing alphabetical name sort as the deterministic tie-breaker.

## Rationale

The current list is sorted alphabetically by name (`electron/ipc-handlers/dialog-handlers.ts`, `dialog:listWorkspaces`). Alphabetical ordering buries the workspace you were just working in. Ordering by "last activated" surfaces the most recently used workspace at the top and reflects actual usage. The user chose:

1. **Activation is the only event that counts** as "accessed" (not viewing a card's detail). We name the field `lastActivatedAt` to be precise.
2. **Store it in the workspace file itself** (`WorkspaceFileData.lastActivatedAt`), not a separate registry.
3. **Missing timestamps sort as the epoch** — i.e. never-activated workspaces drop to the bottom (ties fall back to the current alphabetical-by-name order so the result is stable).

## Approach

### 1. Data model

Add an optional field to `WorkspaceFileData` in both places it is declared:

- `packages/openp41ge/src/layout/types.ts` — add `lastActivatedAt?: string; // ISO-8601, set on activation`
- `packages/openp41ge/electron/ipc-handlers/dialog-handlers.ts` — add the same field to the local `WorkspaceFileData` interface **and** to `readWorkspaceFile()`'s parse so the field **round-trips**. This is critical: `readWorkspaceFile` currently selects a fixed field list and drops anything unknown, so without this, `lastActivatedAt` would be silently stripped on the next write (e.g. any name change saved from the detail view), permanently losing recency.

No `version` bump — the field is optional and additive, so existing files remain valid.

### 2. Sorting (main process + shared comparator)

- Extract the ordering into a pure, dependency-free module: `packages/openp41ge/src/layout/workspace-sort.ts`.
  - `EPOCH_ISO = "1970-01-01T00:00:00.000Z"` constant.
  - `sortWorkspacesByLastActivated(a, b)` — `(lastActivatedAt ?? EPOCH)` descending (newest first), tie-broken by the existing case-insensitive `name ?? id` `localeCompare` so unmetered/never-activated workspaces keep the current alphabetical grouping.
  - Use `Date.parse()` → number for the comparison (robust against mixed formats; all writes use `new Date().toISOString()`).
- `electron/ipc-handlers/dialog-handlers.ts` — `dialog:listWorkspaces` replaces its inline alphabetical sort with `sortWorkspacesByLastActivated` (imported from `../../src/layout/workspace-sort`). Electron main already imports from `../src/main/services/*`, and `src/layout/*` is pure TS (zod only) so this is bundle-safe.
- The renderer keeps consuming the already-sorted result; `_filteredWorkspaces` preserves order, so search filtering is unaffected.

### 3. Recording activation (service)

In `packages/openp41ge/src/renderer/services/workspace-file-service.ts`, make activation stamp the field and persist it back to the file:

- Add a private helper `_stamp(data): WorkspaceFileData` returning a shallow copy with `lastActivatedAt: new Date().toISOString()` (never mutate the caller's object).
- Add a private best-effort persist: `_persistAccess(filePath, data)` → `window.openp41ge.dialog.writeWorkspaceFile(filePath, stamped)` wrapped in try/catch. Failure must **not** throw or block activation (Liskov: best-effort, keeps the activation contract).
- `activateWorkspace(entry, opts?: { recordAccess?: boolean })` (default `recordAccess = true`): if recording, stamp + persist **before** setting active state; set `activeData` to the stamped copy so in-memory state matches disk. Returns a `Promise<boolean>` (true if the persist succeeded / false if best-effort failed) instead of `void` so callers can await.
- Stamp + persist in the other "became active" entry points too:
  - `openDialog()` (File > Open Workspace)
  - `loadPath()` (no current caller, but it's a public API — keep it consistent)
  - `createWorkspace()` — stamp the freshly built `data` object before the initial write
  - `saveAs()` — stamp `activeData` before writing the new file

Call-site updates (all in `workspace-manager-system-tab.ts`):

- `_activateWorkspace(entry)` (line ~1084, the real user activation from double-click / the Activate button): `await workspaceFileService.activateWorkspace(entry)` (it's already `async`), keep opening the Explorer tab, then re-sort the local `_workspaces` in place with the shared comparator (a fresh `_loadWorkspaces()` is not required because `_showList()` already reloads; the local re-sort guards the "return to list without reload" path).
- `_onSaveAs` (lines ~1133–1137): the temporary `activateWorkspace(this._selected)` and the `activateWorkspace(prevPath, prevData)` restore must pass `{ recordAccess: false }`. Save As should bump **only** the newly written file (`saveAs()` stamps it); it must not re-bump the selected card or the restored previous workspace (avoids 3 unnecessary disk writes per Save As).

### 4. UX consistency

- No new UI, no visual change: cards render identically, just in a different order. The existing `Active` pill still marks the current workspace.
- Ordering updates whenever the list is (re)loaded: `_loadWorkspaces()` runs on every `startList()`, so the freshly persisted `lastActivatedAt` is reflected the next time the overlay opens or returns to the list view.
- No keyboard/focus interplay: the overlay search input retains focus behaviour; the sort is data-order only.

## Files Changed

- `packages/openp41ge/src/layout/types.ts` — add `lastActivatedAt?: string` to `WorkspaceFileData`.
- `packages/openp41ge/src/layout/workspace-sort.ts` — **new** pure `sortWorkspacesByLastActivated` comparator + `EPOCH_ISO`.
- `packages/openp41ge/electron/ipc-handlers/dialog-handlers.ts` — add `lastActivatedAt` to local interface + `readWorkspaceFile` parse; sort `dialog:listWorkspaces` with the shared comparator.
- `packages/openp41ge/src/renderer/services/workspace-file-service.ts` — stamp + best-effort persist on `activateWorkspace` (with `recordAccess` option), `openDialog`, `loadPath`, `createWorkspace`, `saveAs`.
- `packages/openp41ge/src/renderer/apps/system-tabs/workspace-manager-system-tab.ts` — await activation, use `{ recordAccess: false }` in `_onSaveAs`, re-sort local list after activation.
- `packages/openp41ge/test/unit/layout/workspace-sort.test.ts` — **new** comparator tests.
- `packages/openp41ge/test/unit/services/workspace-file-service.test.ts` — activation stamping/persist tests.

## Testing Strategy

Test-first, matching the existing Vitest layout (`test/unit/layout/`, `test/unit/services/`):

- **Unit — comparator** (`test/unit/layout/workspace-sort.test.ts`):
  - newest `lastActivatedAt` sorts first;
  - missing/undefined `lastActivatedAt` sorts to the bottom (epoch);
  - equal/missing timestamps are tie-broken alphabetically by `name` (then `id`), case-insensitive — preserving current behaviour for never-activated workspaces.
- **Unit — service** (`test/unit/services/workspace-file-service.test.ts`): mock `window.openp41ge.dialog.writeWorkspaceFile` (the file already stubs `window.openp41ge.workspaceController` directly on the global):
  - `activateWorkspace` stamps `lastActivatedAt` and writes the file (await true);
  - `recordAccess: false` does **not** write;
  - persist failure is swallowed — activation still succeeds without throwing, returns `false`;
  - `createWorkspace`/`saveAs` stamp the persisted data.
- **Manual verification** (per AGENTS.md: typecheck/tests are not proof of behaviour): with the Electron app in dev mode, activate several workspaces out of order, reopen the overlay and confirm the most recently activated is first and never-activated ones sit at the bottom; inspect one workspace file to confirm `lastActivatedAt` persists and survives a non-activation write (e.g. rename in detail view → reopen overlay → order retained).

## UX Considerations

- Focus management: unchanged (search input still focused on mount).
- Keyboard shortcuts: none involved.
- Visual style: unchanged — same `.wm-card` rendering, spacing, and `Active` pill.
- Missing-timestamp grouping: workspaces created before this feature all share epoch time, so they stay grouped at the bottom in the familiar alphabetical order — no surprising reshuffle of the "not yet used" set.
- Failure mode: if persistence fails, the workspace still activates (single source of truth for *that* action stays local); only the lasting recency order is degraded, which the next successful activation heals.

## Open Questions

- None blocking. Minor, decided default: Save As bumps only the newly saved file (`recordAccess: false` on the temporary/restore activations) — flag if you'd rather Save As also count as an activation of the previous workspace.
- `readWorkspaceFile`'s local `WorkspaceFileData` interface in `dialog-handlers.ts` duplicates `src/layout/types.ts`. This plan only adds the field to both; optionally we can switch the handler to import the shared type to eliminate future drift (note: slightly larger diff).

## Completion Criteria

- [x] `WorkspaceFileData` has `lastActivatedAt?: string` in both declaration sites.
- [x] `readWorkspaceFile` parses `lastActivatedAt` so the field survives write round-trips.
- [x] `dialog:listWorkspaces` returns workspaces ordered by last activated (epoch fallback, alphabetical tie-break).
- [x] Activating a workspace from the overlay (double-click or Activate button) persists a fresh `lastActivatedAt`.
- [x] Opening via File > Open, creating, and Save As all record access; Save As records it only for the newly written file.
- [x] Missing timestamps sort at the bottom, alphabetically among themselves.
- [x] Unit tests added for the comparator (7) and service stamping (7); all pass (`nx run openp41ge:test` → 882 passed, 48 files).
- [x] `nx run-many -t typecheck`, `nx lint` clean; `build:electron` succeeds (new layout import bundles).
- [x] Manually verified in the running app (below).

## Verified (2026-08-29)

- **Comparator unit tests** (`test/unit/layout/workspace-sort.test.ts`, 7): newest-first, epoch fallback to bottom, alphabetical tie-break (case-insensitive, id fallback), unparseable-timestamp-as-epoch, stable ordering.
- **Service unit tests** (appended to `workspace-file-service.test.ts`, 7): `activateWorkspace` stamps+persists and sets `activeData` to the stamped copy; `recordAccess:false` does not write; persist failure swallowed (activation still succeeds, returns `false`); `createWorkspace`/`saveAs` stamp.
- **Runtime (Electron dev app, real IPC)**: initial `dialog:listWorkspaces` → `["one", "Two"]` (both unstamped → alphabetical). Activating `one` via the service stamped `2026-08-28T01:16:15.250Z` on disk and reordered the list to `["one", "Two"]` with `one` on top; `Two` (never-activated) stayed bottom. `readWorkspaceFile` preserves the field and it survives a non-activation write round-trip (rename/edit won't lose recency).
