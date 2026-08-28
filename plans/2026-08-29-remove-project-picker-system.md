2026-08-29

# Remove the Project Picker System (dead UI + `project:*` IPC + CheckProjectStep)

## Goal

Remove the obsolete project system: the dead project-picker UI cluster (unregistered app types, picker/list components, switcher service, modal state), the vestigial `CheckProjectStep`, and the main-process `project:*` IPC + `ProjectStore` layer — re-rooting the app to a fixed app-data location. Project management has been superseded by the **Workspaces system tab / overlay**; "project" only survives as the internal storage root, which is what this change migrates away from.

## Rationale & verification

Audit performed `2026-08-29` confirmed the picker cluster is fully dead (no live callers):

- `apps/project-picker/` — `projectPickerAppRegistration` **not imported** by `register-app-types.step.ts`
- `apps/project-manager/` — not registered either
- `apps/system-tabs/projects-system-tab.ts` — `ProjectsSystemTabController` **not in** `allSystemTabRegistrations` (only explorer/git/search)
- `components/openp41ge-project-picker.ts` (1723 lines) — no `createElement("openp41ge-project-picker")` anywhere; only the unregistered controller would
- `components/openp41ge-project-list.ts` — consumed only by dead modules
- `services/project-switch-service.ts` — **zero importers**
- `modal-state-service.ts` `showProjects()` — zero callers; grep shows `context.modalState` has **no renderer consumers**

The storage layer, however, is **live** — this is the part that makes the change non-trivial:

- The main process roots git + workspace storage in the project system: `reposDir = projectStore.reposDir(projectName)` → constructs `NodeGitService`/`NodeGitCommitService`/`WorkspaceService` (application.ts:212-223)
- Workspace save/load paths come from `projectStore.workspaceStatePath(projectName)` (`:245-248` save handler, `:262-265` load). **When no `--project` is set, nothing is persisted today.**
- `CheckProjectStep` (`project.current()` → `window.__openp41geProjectName`) feeds `fetch-initial-state` (`projectSelected` branch) **and the live explorer repo reorder** (`worktree-tree.ts:461` → `project.setRepoOrder` / `project.current()`)
- `ProjectStore.gcDrafts()` + draft handling at boot

## Approach

Land as one cohesive change set (Phase 3's removal of the `project` type breaks the live `worktree-tree` consumer, so phases cannot ship independently). Commit in logical order during implementation.

### Phase 1 — Delete the dead renderer picker cluster

- `src/renderer/apps/project-picker/` (index.ts, project-picker-controller.ts, project-detail-controller.ts)
- `src/renderer/apps/project-manager/` (index.ts, project-manager-controller.ts)
- `src/renderer/apps/system-tabs/projects-system-tab.ts`
- `src/renderer/components/openp41ge-project-picker.ts`
- `src/renderer/components/openp41ge-project-list.ts`
- `src/renderer/services/project-switch-service.ts`
- `src/renderer/services/modal-state-service.ts` — dead (zero consumers of `startupContext.modalState`); remove service + `StartupContext.modalState` field/import. If any consumer is found during implementation, keep the service and remove only `showProjects()` + the `"projects"` modal state.

### Phase 2 — Remove `CheckProjectStep` + renderer handoff

- Delete `src/renderer/bootstrap/steps/check-project.step.ts`; drop from `bootstrap/index.ts` export and from the step list in `app.ts` (renumber/reflow comments)
- `fetch-initial-state.step.ts` — remove the `projectSelected` branch; always use `context.initialStatePromise ?? window.openp41ge.workspace.getState()`
- `worktree-tree.ts:455-473` — repo reorder persistence: replace `project.setRepoOrder` / `project.current()` fallback with localStorage-backed `repoOrderCache` (`repo-order-cache.ts` currently in-memory only; add load/save to localStorage so reorder persists across restarts without the IPC)
- Remove `project` block + `__openp41geProjectName` from `global.d.ts`

### Phase 3 — Re-root main process + remove `project:*` IPC

- `src/main/services/project-store.ts` — delete (replaced by fixed app-data path helpers)
- `electron/openp41ge-application.ts`:
  - Repos root → constant `path.join(openp41geDir, "repositories")`; drop `projectName` branching
  - Workspace persistence → constant path `path.join(openp41geDir, "workspace.json")`; save handler + `_maybeLoadState` always run (persistence becomes always-on)
  - Remove `--project` CLI parsing (verified: no script/demo/E2E passes `--project`)
  - Remove `projectStore.gcDrafts()` and draft-handling
  - Remove `registerProjectHandlers(...)` call (`:283-295`) and the `projectStore`/`projectName` fields
  - `recent-projects` — see Open Questions (recommend removing `RecentProjectsModel` + `recent-projects-handlers.ts` too, with the `recentProjects.add(name)` call)
- `electron/preload.cjs` — remove the `project:` block (and `recent` block if recents removed)
- `electron/ipc-handlers/project-handlers.ts` — delete
- `test/unit/services/project-store.test.ts` — delete (or rewrite as app-data-path unit test; see Open Questions)

## SOLID review

- **S** — `openp41ge-application.ts` currently routes `projectName` through service wiring and persistence (a second concern embedded in the boot path). Re-rooting to a fixed app-data location removes that branching and simplifies the class — no SRP violation introduced.
- **D** — `NodeGitService`/`NodeGitCommitService`/`WorkspaceService`/`WorkspaceStateStore` remain constructor-injected exactly as today; only the resolved `reposDir`/state path change. No new hard-coded concrete dependencies.
- **O / L / I** — deletion-only for the removed systems; no interface changes to existing abstractions. No new switch-on-type or widened contracts.

## UX Considerations

- **No visible UI change**: the Workspaces system-tab overlay remains the sole management surface; there is no longer any "project picker" entry point to remove visually.
- **Repo reorder**: persists to localStorage instead of the project file — same observable behaviour within a machine; confirm across-restart persistence in testing.
- **Workspace persistence becomes always-on** (currently only when `--project` is passed). This is a behaviour improvement but a deliberate change — confirmed acceptable (Open Questions).
- Focus/shortcuts: no new surface; nothing to reconcile.

## Files Changed

| File                                                       | Change                                            |
| ---------------------------------------------------------- | ------------------------------------------------- |
| `src/renderer/apps/project-picker/` ×3                     | **Delete**                                        |
| `src/renderer/apps/project-manager/` ×2                    | **Delete**                                        |
| `src/renderer/apps/system-tabs/projects-system-tab.ts`     | **Delete**                                        |
| `src/renderer/components/openp41ge-project-picker.ts`      | **Delete**                                        |
| `src/renderer/components/openp41ge-project-list.ts`        | **Delete**                                        |
| `src/renderer/services/project-switch-service.ts`          | **Delete**                                        |
| `src/renderer/services/modal-state-service.ts`             | **Delete** (or trim to `confirmation` state only) |
| `src/renderer/bootstrap/steps/check-project.step.ts`       | **Delete**                                        |
| `src/renderer/bootstrap/steps/fetch-initial-state.step.ts` | Remove `projectSelected` branch                   |
| `src/renderer/bootstrap/index.ts`, `src/renderer/app.ts`   | Remove CheckProjectStep from pipeline             |
| `src/renderer/components/openp41ge-worktree-tree.ts`       | Repo reorder → localStorage via `repoOrderCache`  |
| `src/renderer/repo-order-cache.ts`                         | Add localStorage load/save                        |
| `src/renderer/bootstrap/startup-context.ts`                | Drop `modalState` if service removed              |
| `src/renderer/global.d.ts`                                 | Remove `project` block + `__openp41geProjectName` |
| `src/main/services/project-store.ts`                       | **Delete**                                        |
| `electron/ipc-handlers/project-handlers.ts`                | **Delete**                                        |
| `electron/ipc-handlers/recent-projects-handlers.ts`        | **Delete** (decision)                             |
| `src/main/services/recent-projects-model.ts`               | **Delete** (decision)                             |
| `electron/preload.cjs`                                     | Remove `project:` (+ `recent`) block              |
| `electron/openp41ge-application.ts`                        | Re-root to fixed paths; drop project wiring       |
| `test/unit/services/project-store.test.ts`                 | Delete / rewrite as app-data test                 |

## Testing Strategy

- **Unit**: delete `project-store.test.ts` (or rewrite as app-data path test). Repo-order persistence: if a test covers `setRepoOrder`, replace with a `repoOrderCache` localStorage round-trip test.
- **Typecheck / lint / dead-code**: `nx run-many -t typecheck`, `nx lint`, `nx knip` — confirm no dangling references to removed symbols (knip should also stop flagging the now-orphan `project-switch-service`).
- **Tests**: `nx run openp41ge:test` — full 883 suite; confirm no test references the removed picker/IPC.
- **Runtime (dev app)**: boot → explorer renders repos; repo drag-reorder persists after app restart; workspace layout persists across restart (new always-on persistence); git tab works; workspaces overlay unaffected. Verify no `project:` IPC errors in console.

## Open Questions (resolved 2026-08-29)

1. **Fixed repos root**: `~/.openp41ge/repositories` — approved.
2. **Always-on workspace persistence** — approved (user believed it was already always-on; it becomes so).
3. **`recent-projects` layer** (`RecentProjectsModel` + `recent-projects-handlers.ts` + preload `recentProjects`) — **remove**; user will add separately if ever wanted again.
4. **`--project <name>` CLI flag** — **remove** (no consumers).
5. **`ProjectStore` class** — **delete outright** (fixed app-data path helpers replace it).

## Completion Criteria

- [x] All Phase 1 dead-cluster files deleted; no dangling imports (typecheck clean; knip shows no new findings beyond its pre-existing red state)
- [x] `CheckProjectStep` removed from pipeline; `fetch-initial-state` has no `projectSelected` branch
- [x] Repo reorder persists via `repoOrderCache` localStorage (`saveRepoOrder`/`applyRepoOrder`)
- [x] Main process boots with fixed repos root + always-on workspace persistence; no `projectName`/draft/`--project` handling
- [x] `project:*` + `recentProjects` IPC removed from handlers + preload + global.d.ts
- [x] `nx run-many -t typecheck` (exit 0), `nx lint` (exit 0) clean
- [x] `nx run openp41ge:test` passes (863 — was 883; −20 from the deleted `project-store.test.ts`)
- [x] Dev-app runtime check: boots with re-rooted main (no `project`/`recentProjects` on the preload, no `__openp41geProjectName`), git/workspace/config IPC healthy, `cmdNewWindow` + `openSystemTab` work, explorer mounts with add-repo row, zero captured errors
- [~] Repo-populated runtime (drag-reorder persistence across restart; workspace layout persistence round-trip) — **not verifiable on this dev machine** (no repos under the new fixed root; previous session state was never persisted pre-migration). Code is typechecked; reorder path uses straightforward localStorage. Verify on first real use.
