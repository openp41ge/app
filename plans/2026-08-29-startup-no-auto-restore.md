2026-08-29

# Startup: No Layout Auto-Restore Unless a Workspace Is Provided

## Goal

A normal app launch starts **fresh** (single empty window, no restored tabs/layout). The previous session's layout is only restored when a workspace is **explicitly provided as a startup launch argument** — the future CLI path (e.g. `openp41ge --workspace <path>`) that is not needed/wired today. This stops the app booting into sidebar tabs or windows with no active workspace/context.

## Rationale / Current State

- `openp41ge-application.ts` `_maybeLoadState()` (called at line 102) **unconditionally loads** `~/.openp41ge/workspace.json` into the dispatcher at boot; the initial window is created from its `windows[0]`. This restores Tabs/layout from a previous session — which is how the app relaunched with Explorer/Git tabs open but `activeWorkspaceFilePath = null` ("No workspace" in the title bar).
- Persistence is two-sided: `dispatcher.setSaveHandler(...)` saves after every mutation (keep — this is unrelated to boot restore), and `_maybeLoadState()` loads at boot (gate this).
- Fresh default comes from `createWorkspace("ws1")` — already has one window (`win-ws1-0`), so `createOpenp41geWindow(ws.windows[0].id, true)` stays valid with no load.
- Side effect: the residual second window (`win-1787877387862-43ag`) is no longer recreated from the saved file on future launches.

## Approach

1. **Pure helper** `src/main/services/workspace-launch-arg.ts`:
   - `parseWorkspaceLaunchArg(argv: string[]): string | null` — returns the workspace path if a `--workspace <path>`-style launch arg is present, else `null`. (Exact arg name is a future-CLI contract — kept explicit and isolated so it can be finalised when the CLI feature is planned.)
2. **Gate the boot load** (`electron/openp41ge-application.ts`, `_maybeLoadState()`):
   - Only load `workspace.json` when a workspace was provided at startup (`parseWorkspaceLaunchArg(process.argv)` is non-null).
   - Normal launch → no load → dispatcher keeps the fresh `createWorkspace("ws1")` workspace.
   - The `provided` branch is clearly marked as the future seam (today it is unreachable; when the CLI lands it will load the provided workspace's layout).
3. **No other changes**: save-on-change persistence stays; renderer `FetchInitialStateStep` already fetches whatever main has.

## Files Changed

- `packages/openp41ge/src/main/services/workspace-launch-arg.ts` — new pure parser.
- `packages/openp41ge/electron/openp41ge-application.ts` — gate `_maybeLoadState()` behind the provided-workspace launch arg; import the parser.
- `packages/openp41ge/test/unit/services/workspace-launch-arg.test.ts` — new unit tests.

## Testing Strategy

- **Unit** (`workspace-launch-arg.test.ts`, node env): no `--workspace` → `null`; `--workspace <path>` → path; flag with no value → `null`; value that looks like a flag → `null`; value with spaces → raw value; first occurrence wins.
- **Runtime** (main-process change → dev restart): relaunch with no args → **single empty window**, no tabs, title bar "No workspace", no console errors; existing `workspace.json` not loaded.
- Gates: `nx run openp41ge:typecheck`, `nx lint`, `nx run openp41ge:test`.

## UX Considerations

- Fresh boot = empty workspace (one window, no tabs) — a deliberate clean start; user explicitly chose no layout auto-restore by default.
- No renderer/UI changes; only main-process startup gate.

## Open Questions

- Exact launch-arg contract (name, positional vs `--workspace <path>`, multiple workspaces) — deferred to when the CLI feature is planned; the seam lives in one isolated parser so nothing else changes.

## Completion Criteria

- [ ] `parseWorkspaceLaunchArg` added + unit-tested (all cases above).
- [ ] `_maybeLoadState()` does not load on a normal launch (no startup arg); fresh workspace boot.
- [ ] Save-on-change persistence unchanged.
- [ ] Runtime-verified: relaunch → single empty window, no restored tabs, title "No workspace", clean console.
- [ ] `nx run-many -t typecheck`, `nx lint` clean; `nx run openp41ge:test` passes.
