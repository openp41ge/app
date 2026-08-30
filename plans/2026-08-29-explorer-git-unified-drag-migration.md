2026-08-29

# Explorer → Git: Unified Repo/Worktree Drag + Commit-Search Sidebar

## Goal

Eliminate the duplicated repo/worktree list in the Git sidebar tab by making the **explorer's** repo and worktree rows draggable to the central grid (dropping opens the git-content pane: full git browser for a repo, branch-scoped git browser for a worktree). The Git sidebar tab is repurposed into a **commit search/query UI** across connected repos — commit message, changed files, and (optionally) additions/deletions content — with hierarchical results (commits → files → changed hunks) that can be single-clicked (unpinned preview, like explorer files) or dragged into the grid for review.

Requirement settled with the user: **one unified bitmap drag system** for repo/worktree rows; the _action_ is decided by drop location (over the explorer = reorder, over the grid = open). This replaces the current native HTML5 `dataTransfer` drag on these rows.

## Rationale / Current State

- The Explorer (`<openp41ge-worktree-tree>`) and the Git sidebar tab (`GitSystemTabController`) render near-identical repo/worktree row lists; only the explorer additionally shows files.
- Both currently drag via **native HTML5** `dataTransfer` with MIME `application/x-openp41ge-repo` / `application/x-openp41ge-worktree`. In the explorer, repo-row drag is used for **reordering repos** (persisted via `saveRepoOrder`). A legacy `FileDropHandler` translates a grid drop into `repo-open-git`.
- **The rest of the app uses the bitmap drag pipeline** (`init-drag-system.ts`): invisible in-DOM ghost + main-process `capturePage` bitmap in the always-on-top `DragGhostManager` window, deferred `drag.start` on first POSITION, `openp41geTargetResolver` → drop target → `grid-open-tab` → `Openp41geTabsEventHandler` → workspace dispatch. Grid tabs, sidebar tabs, and file rows all use it; repo/worktree rows are the last native-HTML5 holdout.
- `Openp41geTabsEventHandler.grid-open-tab` **already handles `tabType: "git-repository"`** with `tabConfig: { repoName, branch }` (repo → titled by repo; worktree → titled by branch, boundary → `splitFileOpen`, center → `actionOpenFile`). The git `GitRepositoryController` already supports worktree-scoped mode (`branchOnly` + `__pendingGitWorktree`). The drop→dispatch leg is therefore mostly built.
- The grid drop target (`openp41ge-tabs`) currently only opens tabs for `data.type === "tab"` and `"file"`; there is no generic "open a tab with arbitrary appType/config" drag type, and `DragSourceData` (discriminated union in `interfaces.ts`) has no such variant (a dead `repo` variant exists but is unwired).
- There is **no commit search** anywhere: `workspaceController` exposes `getCommitLog/getBranches/getDiffStat/getUntrackedFiles` but no message/file/content search over the git history.

## Approach

### Part A — Unified bitmap drag for explorer repo/worktree rows (drop-location actions)

1. **Row markers** — in `openp41ge-repo-tree-item.ts`, add `data-repo-row` (plus `data-repo`) to the repo header (the current `draggable="true"` row) and add `draggable="true"` + `data-worktree-row`/`data-repo`/`data-branch` to each worktree row (currently not draggable). Remove the native `@dragstart` on the repo header — the custom pipeline owns the gesture from now on.

2. **One new drag source** — `services/drag-sources/git-entry-drag-source.ts`, `GitEntryDragSource implements IDragSource`, `type = "open-tab"`:
   - `getDragData()` → `{ type: "open-tab", appType: "git-repository", title, tabConfig: { repoName, branch? } }` (repo row: `branch` absent; worktree row: `branch` = worktree branch).
   - `createGhost()` returns the invisible 1px placeholder (exact `FileDragSource`/`SidebarTabDragSource` pattern) — the visible drag element is the **main-process bitmap ghost**.
   - `onDragStart()` does **not** dim the source row (the bitmap is captured from it at full opacity).
   - `onDragEnd()` removes the ghost and restores native `draggable` (same `_restoreFileRowDraggable` guard).

3. **mousedown wiring** — `init-drag-system.ts`, new `onGitEntryMouseDown` mirroring `onFileMouseDown`: primary button only; `composedPath()` lookup of `[data-repo-row]`/`[data-worktree-row]`; disable native `draggable` for the gesture; `preventDefault`; `_orchestrator.startDrag(...)`; store deferred `_pendingGitEntryDragStart` (label, screen pos, offset, row `offsetWidth/offsetHeight`, **captureRect** framed by `TAB_GHOST_CAPTURE_INSET`). On the first POSITION event, call `window.openp41ge.drag.start(label, screenX, screenY, undefined, undefined, winId, undefined, width, height, offsetX, offsetY, "open-tab", undefined, captureRect, TAB_GHOST_CAPTURE_INSET)` — the same signature/bitmap path as files and sidebar tabs — then `drag.activate()`. Set `_sidebarTabDragSide = null` on mousedown (this is not a sidebar-tab drag), and register the source so `_currentSource.type === "open-tab"` drives target resolution. Add matching hooks to `window.__openp41geTestHooks` (start a git-entry drag, restore its draggable, read its deferred start params) alongside the existing `callUpdateCrossWindowGhost`/`callHandleCrossWindowDrop` hooks.
   - **Main-process dragData** (`electron/ipc-handlers/drag-handlers.ts`): the `openp41ge:drag-start` handler builds the session `dragData` object and only attaches `filePath` for `type === "file"`. Extend it so a `"open-tab"` drag persists `{ appType, title, tabConfig }` in `dragData` (this is what cross-window `drag.getActive().dragData` returns).

4. **Target resolution by drop location** — in `openp41geTargetResolver`, when `_currentSource?.type === "open-tab"`:
   - Cursor over the explorer list (`[data-explorer-drop-zone]` — the `wt-tree-scroll-content` element) → return a new **`ExplorerReorderDropTarget`** (below). Repo rows reorder; worktree rows resolve to `{ success: false }` (no worktree reorder — kept as today).
   - Cursor over `tab-bar` or `tab-grid` → resolve to the existing grid drop targets **exactly as file drags do** (tab-bar maps to the enclosing grid target so boundary/cell logic applies).
   - Anywhere else → `null` (cancelled drop).

5. **Explorer reorder drop target** — `services/drop-targets/explorer-reorder-drop-target.ts`: on drop, compute the insertion index from `clientY` (mirroring the current native logic in `worktree-tree.ts`) and fire a `explorer-reorder-repos` CustomEvent `{ repoName, fromIndex, dropIndex }`; `onHover` draws the existing thin-focus insertion line. The `openp41ge-worktree-tree` component handles the event → splice repos, `saveRepoOrder`, dispatch `project:changed`. The old native `dragenter/dragover/drop` reorder block is removed.

6. **Grid open for the new type** — `openp41ge-tabs` stays generic:
   - `interfaces.ts`: add to `DragSourceData` → `| { type: "open-tab"; appType: string; title?: string; tabConfig?: Record<string, unknown> }`.
   - `targets/grid-drop-target.ts`: handle `data.type === "open-tab"` in **both** `_handleCellDrop` and `_handleBoundaryDrop` by firing `grid-open-tab` with `{ winId, tabType: data.appType, tabConfig: data.tabConfig, targetCol, isBoundary, splitCol, splitLeft, pinned: true }`. `Openp41geTabsEventHandler` already maps `git-repository` → workspace dispatch (no change needed there).

7. **Cross-window** — `electron/ipc-handlers/drag-handlers.ts`: persist the open-tab payload (`appType`, `tabConfig`, `title`) in the session `dragData`. In `init-drag-system._handleCrossWindowDrop`, add an `open-tab` branch mirroring the file branch: set `__pendingGitRepo` (+ `__pendingGitWorktree` when `tabConfig.branch`), resolve grid boundary/center, and dispatch `splitFileOpen` / `actionOpenFile` with `"git-repository"`. `_remoteDragType`/drag-state broadcast carry the new type so other windows can preview.

8. **Retire the duplicate list** — the repo/worktree list (and its native drag) in `git-system-tab.ts` is superseded; the explorer is the single repo/worktree drag surface. `GitSystemTabController` is replaced wholesale by Part B (keep the sidebar **id** `"git"` so persisted windows seamlessly show the new panel — no workspace-state migration needed).

9. **Cleanup of the dead native path** — after this migration the following become obsolete and must be removed/verified dead:
   - The `repo-open-git` event + `FileDropHandler.handleRepoDrop` (and the repo MIME branch in `_isRelevantDrag`) — `repo-open-git` is still listened to by `openp41ge-worktree-tree._repoDropHandler` and dispatched from `file-drop-handler.ts`; decide removal vs keep (if the explorer's own native drags are gone, this path has no producer left).
   - The **unwired `repo` variant** in `openp41ge-tabs/src/interfaces.ts` (`| { type: "repo"; repoName: string }`) and the dead `RepoDragSource` (platform `services/drag-sources/repo-drag-source.ts` + its `expose-test-models.step.ts` export) — replaced by `open-tab`/`GitEntryDragSource`. Confirm nothing else reads `data.type === "repo"` before deleting.

### Part B — Repurpose the Git sidebar tab as a commit search UI

1. **Search capability (main)** — implement on the git commit service (`NodeGitCommitService`) behind `workspace:searchCommits(repoName|null, { query, in: "message" | "files" | "content" | "all", limit?, offset? })`:
   - `message`: `git log --all --grep=<q> -i --date-order --name-status` (match subject/body).
   - `files`: `git log --all --name-status` filtered by file-path match.
   - `content` _(the "maybe" — see Open Questions)_: `git log -G <regex>` / `-S <string>` (pickaxe) + per-file `git show <hash> -- <file>` to emit +/- hunks.
   - Result type `SearchResultCommit = { repoName, hash, message, author, date, files: Array<{ path, additions, deletions, hunks?: string[] }> }` (extend `openp41ge-git/src/types.ts`).

2. **Model layer (Model-Based DI)** — `models/commit-search-model.ts`: `CommitSearchModel` interface with `IpcCommitSearchModel` (delegates to `workspaceController.searchCommits`) and `TestCommitSearchModel` (in-memory fixture array), injected via a public settable property exactly like `RepoService`. This is the seam for exhaustive unit tests with no git/electron.

3. **Sidebar controller** — `apps/system-tabs/commit-search-system-tab.ts` (replaces `GitSystemTabController`; registration id stays `"git"`, label "Git"):
   - **Search header**: autofocus search input (clone-dialog pattern), scope select (`All repos` / specific repo), search-into toggles (`Messages / Files / Content`). Enter/auto-debounced search; Escape clears.
   - **Hierarchical results**: commit rows (repo · short hash · message · author/date) → expandable **files** sub-rows (path · `+adds/−dels` from the commit diff) → expandable **changed-content** sub-rows (`+`/`-` lines) when content search/toggle is on. Collapse state mirrors repo-tree persistence patterns.
   - **Single click = unpinned preview**:
     - commit result → `openp41ge:open-commit` handled by a new `commit-open-handler.ts` (mirrors `FileOpenHandler` preview flow: existing git-repository tab in cell → activate/pin on second click; else replace the cell preview slot; else open `actionOpenFile(winId, "git-repository", title, repoName, col, false)` after setting `__pendingGitRepo`/`__pendingGitWorktree`).
     - file sub-row → `openp41ge:open-file` with `pinned:false` (identical to explorer file single-click → file-editor preview). _(File-at-revision is an open question below.)_
   - **Drag to grid**: commit/file/content rows are `GitEntryDragSource`s — reuses Part A wholesale, so dragging a result into the grid opens the review tab (pinned) at the drop column/boundary.
   - **States**: no repos, empty query, no results, loading (spinner), error — using the git tab's message/footer styling and theme vars. `setVisible` keep-alive (suspend/dirty) copied from `GitSystemTabController`.

## Implementation Reference Seams

Exact integration points an implementer should copy or extend (all verified present in the current tree):

- **Invisible in-DOM ghost + bitmap capture** — copy `FileDragSource` (`src/renderer/services/drag-sources/file-drag-source.ts`) and `SidebarTabDragSource._pendingSidebarDragStart` handling in `init-drag-system.ts`. The deferred-start block on the first POSITION event is the canonical pattern: hide in-DOM ghosts, then `window.openp41ge.drag.start(label, screenX, screenY, …kind…, captureRect, TAB_GHOST_CAPTURE_INSET)` → main process `capturePage` upgrades the DragGhostManager window in place.
- **Ghost capture in main** — `electron/ipc-handlers/drag-handlers.ts` `openp41ge:drag-start`: for files it calls `show(label, …, isFile=true, …)` then async bitmaps the `captureRect`. Reuse `isFile`-style row rendering for `"open-tab"` (same kind treatment as `"file"`), and store the open-tab payload in session `dragData`.
- **Drop → dispatch** — `Openp41geTabsEventHandler._registerListeners` `grid-open-tab` already contains the `_tabType === "git-repository"` branch (sets `__pendingGitRepo`/`__pendingGitWorktree`, titles by `branch || repoName`, dispatches `splitFileOpen` or `actionOpenFile`). Do **not** reimplement this — just ensure our `grid-open-tab` details feed it: `tabType: "git-repository"`, `tabConfig: { repoName, branch? }`.
- **Preview (unpinned) open** — copy `FileOpenHandler` (`src/renderer/services/file-open-handler.ts`) whose 3-step model is: existing tab in cell → activate / pin-on-second-click; else replace cell preview slot (`actionOpenFile(…, pinned=false)`); else open new preview. `commit-open-handler` mirrors this for appType `"git-repository"`.
- **Main git service** — `src/main/interfaces/git-commit-service.ts` declares `IGitCommitService` (add `searchCommits(...)` to the interface); `src/main/services/node-git-commit-service.ts` is the `NodeGitCommitService` impl (child-process `git -C … --git-dir=.git …`, same quoting/timeout pattern) exported via `src/main/index.ts`; `electron/ipc-handlers/git-handlers.ts` wires `workspace:*` handlers. Mirror `getCommitLog`/`getDiffStat` end-to-end.
- **Model DI** — copy `models/ipc-repo-service.ts` + `models/test-models.ts` (TestRepoService exposed on `window.__testModels` by `expose-test-models.step.ts`). New `CommitSearchModel`: `IpcCommitSearchModel` (→ `workspaceController.searchCommits`) + `TestCommitSearchModel`; expose the test impl in `expose-test-models.step.ts`.
- **Sidebar system-tab swap** — `apps/system-tabs/index.ts` `allSystemTabRegistrations` holds `gitSystemTabRegistration` (id `"git"`); swap its `createController` to the new search controller. Existing windows keep showing the tab (state-driven), the "+" sidebar menu label stays "Git".
- **Existing tests to mirror/extend** — `test/unit/services/file-drag-source.test.ts`, `test/unit/services/sidebar-drop-target.test.ts`, `test/integration/system-tabs/git-system-tab.test.ts`, `test/integration/system-tabs/explorer-system-tab.test.ts`. Wire new test hooks under `window.__openp41geTestHooks` (in `init-drag-system.ts`) for synthetic mousedown/POSITION/mouseup sequences.

## Files Changed

**Part A**

- `packages/openp41ge/src/renderer/components/openp41ge-repo-tree-item.ts` — row markers (`data-repo-row`, `data-worktree-row` + repo/branch), worktree rows draggable, remove native `@dragstart`.
- `packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts` — `data-explorer-drop-zone`; `explorer-reorder-repos` handler (reorder + `saveRepoOrder`); remove native reorder drag handlers.
- `packages/openp41ge/src/renderer/services/drag-sources/git-entry-drag-source.ts` — new bitmap drag source.
- `packages/openp41ge/src/renderer/services/init-drag-system.ts` — `onGitEntryMouseDown`, deferred start with captureRect, target-resolver branch, cross-window `open-tab` branch, remote type handling, test hooks.
- `packages/openp41ge/src/renderer/services/drop-targets/explorer-reorder-drop-target.ts` — new.
- `packages/openp41ge-tabs/src/interfaces.ts` — `open-tab` in `DragSourceData` union.
- `packages/openp41ge-tabs/src/targets/grid-drop-target.ts` — open-tab handling in cell + boundary drops.
- `packages/openp41ge/electron/ipc-handlers/drag-handlers.ts` — persist open-tab payload in session dragData.

**Part B**

- `packages/openp41ge/src/main/services/node-git-commit-service.ts` + `packages/openp41ge/src/main/interfaces/git-commit-service.ts` — `searchCommits` impl + interface (`--grep`/`-G`/`-S`/`--name-status`).
- `packages/openp41ge/electron/ipc-handlers/git-handlers.ts` — `workspace:searchCommits` handler; `preload.cjs` + `global.d.ts` — `workspaceController.searchCommits`.
- `packages/openp41ge/src/renderer/services/commit-open-handler.ts` — new preview-open handler for commit results; wire in `register-event-listeners.step.ts` next to the existing `openp41ge:open-file` listener.
- `packages/openp41ge/src/renderer/apps/system-tabs/commit-search-system-tab.ts` — new controller; `apps/system-tabs/index.ts` — swap controller for id `"git"`; `apps/system-tabs/git-system-tab.ts` — deleted (superseded).
- `packages/openp41ge/src/renderer/models/commit-search-model.ts` — interface + Ipc/Test impls; expose `TestCommitSearchModel` in `expose-test-models.step.ts`.
- `packages/openp41ge/src/renderer/bootstrap/steps/expose-test-models.step.ts` — add `GitEntryDragSource` / `TestCommitSearchModel`; drop `RepoDragSource`.
- Cleanup: `openp41ge-tabs/src/interfaces.ts` dead `repo` variant, `services/drag-sources/repo-drag-source.ts`, legacy `repo-open-git`/`FileDropHandler` repo branch.
- `packages/openp41ge-git/src/types.ts` — `SearchResultCommit` result types.

## SOLID Review

- **S** — `openp41ge-worktree-tree.ts` (2222 lines) already mixes rendering, file loading, and repo state. The new reorder handler is a single small method (event → splice + persist); acceptable. The search controller is a new class; search fetching stays behind the `CommitSearchModel` interface (`IpcCommitSearchModel` = IPC only, `TestCommitSearchModel` = data only), keeping controller = coordinate/render only.
- **O** — `GridDropTarget` currently special-cases `tab` and `file`. Growing a third case for `open-tab` is additive but let's go one step further: the open-tab case is _generic_ (`appType` + `tabConfig`), so future "open an X pane" drags (any repo pin, preview links, etc.) need **no new edit here** — new payloads ride the existing `open-tab` shape. `DragSourceData` stays a small closed union; the platform's `tabType` switch is the only place that knows app types, and it already covers `git-repository`.
- **L** — `GitEntryDragSource` must satisfy the exact `IDragSource` contract the orchestrator expects (invisible ghost, row left full-opacity at start, ghost cleanup on end) — substituting it for a tab/file source must not change hover/drop behaviour of the grid targets.
- **I** — `CommitSearchModel` is a narrow read-only interface (one method returning results + count); it does not mix write operations. `DragSourceData` gains only the flat `appType/title/tabConfig` fields needed by every open-tab source.
- **D** — `CommitSearchSystemTabController` depends on the `CommitSearchModel` interface injected via public settable property (production `IpcCommitSearchModel`, tests `TestCommitSearchModel`), not a concrete hard-coded IPC call. The drag source is constructed by the composition root (`init-drag-system`) and handed to the orchestrator — no `new IpcGitService()` style coupling in the component.

## UX Considerations

- **Focus**: search input autofocuses on sidebar open (clone-dialog pattern); Enter searches, Escape clears input (once) then blur; Arrow Up/Down navigate the top-level commit rows. After a single-click preview opens, focus returns to the sidebar (matches explorer file preview refocus loop).
- **Preview vs pinned**: strict VS Code model for commit/file opens — single click = unpinned preview tab in the last-focused column, replaces the preview slot, second click/click-on-open pins. Matches `FileOpenHandler` for explorer files; `commit-open-handler` mirrors it for git-repository tabs.
- **Keyboard**: no conflicts with grid shortcuts (Cmd+N picker, Cmd+P orphan, etc.); search is confined to the sidebar input.
- **Drag feedback**: bitmap ghost = pixel-accurate copy of the source row (same as tabs/files); grid ghost overlay + boundary split preview appear exactly as file drops today; explorer insertion line for reorder.
- **Visual**: reuse theme vars (`--bg-primary`, `--border-color`, `--accent`, `--text-secondary`, `--text-muted`, `--bg-hover`), the git tab's 11px letter-spaced section header, 28/24px row heights, and footer. Hierarchy indent (commit 0 / file ⊂ / content ⊂⊂) mirrors repo → worktree → file nesting.
- **Empty/Error states**: no repos ("No repositories"), query too short, no results ("No matching commits"), loading spinner, load failure message — all non-blocking, per existing sidebar message style.

## Testing Strategy

**Unit (Vitest)**

- `GitEntryDragSource`: `getDragData()` shape for repo vs worktree rows (branch present/absent, appType, title); ghost is the invisible placeholder; no row dimming in `onDragStart`.
- `openp41ge-tabs` grid-drop-target: an `open-tab` source fires `grid-open-tab` with correct `tabType/tabConfig/targetCol` for cell-center and `splitCol/splitLeft` for boundary — parameterised, plus regression that `file`/`tab` still behave.
- `ExplorerReorderDropTarget`: index computation from cursor Y; fires `explorer-reorder-repos` with from/drop index; repo-only (worktree cancels).
- `CommitSearchModel`: `TestCommitSearchModel` fixture → controller maps results into the commits→files→content hierarchy correctly; message/file/content search-into toggles; repo filter.
- `commit-open-handler`: resolve existing git tab → activate/pin; preview-slot replacement; new preview open dispatch args (`"actionOpenFile", …,"git-repository", title, repoName, col, false`).
- Main: `NodeGitCommitService.searchCommits` via the existing `TestGitAdapter` in `openp41ge-git` (message grep, path filter, `-G`/`-S` content modes) — no electron needed. Add to `IGitCommitService` in `src/main/interfaces/git-commit-service.ts` so the test adapter implements the full contract. Existing suites to mirror: `test/unit/services/file-drag-source.test.ts`, `test/unit/services/sidebar-drop-target.test.ts`, `test/integration/system-tabs/git-system-tab.test.ts`.

**Integration**

- `init-drag-system` mousedown→deferred bitmap-start for `[data-repo-row]`/`[data-worktree-row]` (synthetic events, following the existing drag unit tests + `__openp41geTestHooks`): correct captureRect/offset/kind on `drag.start`; native draggable disabled during gesture and restored.
- Same-window drop over grid → `grid-open-tab` git event → dispatch `actionOpenFile`/`splitFileOpen` with `git-repository` + pending repo/branch; drop over explorer → reorder event + `saveRepoOrder`.
- Cross-window: seeded remote drag of an `open-tab` source resolves on the target grid and dispatches git open.

**Manual / E2E**

- `test-cross-window-drag` skill for bitmap ghost + cross-window drop of repo/worktree rows; `debug` skill to launch dev (`OPENP41GE_DEVTOOLS=1`), verify no error-overlay noise, and exercise the commit search UI end-to-end (single-click preview vs drag-to-pin, hierarchy expand, Escape/blur, no empty tab on cancel).

## Implementation Status (2026-08-29 — agent execution)

Part A (unified bitmap drag) is implemented and tested; Part B (commit-search sidebar) is implemented with the plan's conservative defaults and tested. Open-question resolutions recorded here:

- **Q1 File-at-revision** — v1 opens the **working-tree file** (identical to explorer file single-click). `commit-open-handler` dispatches `openp41ge:open-file` with the plain path. File-at-revision left as a future phase.
- **Q2 Result drag** — commit/file rows drag as repo rows (repo-scoped `open-tab`); dropping on the grid opens the **repo-scoped git browser** for the containing repo. Because search crosses all refs there is no single branch to scope to; a branch-scoped variant is a future phase.
- **Q3 Content search** — **deferred to phase 2**. v1 ships `message` + `files` scopes only (`--grep` for message, JS path substring for files, union for `all`). The hierarchy still shows per-file +adds/−dels from `--numstat`; hunk sub-rows and `-G`/`-S` pickaxe remain phase 2. The `Search/into` UI exposes Messages/Files toggles (both on = `all`).
- **Q4 Connected-repos scope** — **all workspace repos** with a per-repo filter select (default "All repos"). The main-process IPC aggregates per-repo results when `repoName` is null.
- **Q5 Worktree row dropped inside the explorer** — **cancels** (returns `{ success: false }`), as today. Worktrees are not reorderable.
- **Testing divergence from plan** — the plan suggested exercising `searchCommits` via `openp41ge-git`'s `TestGitAdapter` by extending the renderer `GitAdapter` interface. That would bloat the renderer git adapter with a search method it doesn't own (I-segregation). Instead `searchCommits` is unit-tested against a **real local git repo** (following `node-git-service.test.ts`), which exercises the actual git command + record parser end-to-end. The `CommitSearchModel` DI seam (Ipc + Test) covers the renderer side.
- **GridDropTarget `open-tab`** — added as the plan's generic "open a pane" case; `GitEntryDragSource` is the first consumer.

## Scope

- **In**: unified bitmap drag for explorer repo/worktree rows (drop-location action), git-content open on grid drop, **removal of the native drag path and dead `repo` drag artifacts**, removal of the duplicate git-sidebar repo list, commit-search repurpose of the Git sidebar tab (message + files search in v1; content/hunk search per Open Question 3).
- **Out**: read-only "file at historical revision" browsing; changing the `GitRepositoryPanel` uikit component; any changes to the existing `Cmd+N`/`Cmd+P` plans.

## Open Questions

1. **File-at-revision**: single-click on a _file_ result currently opens the working-tree file (identical to explorer). Should it instead open the file **at the commit's revision** (via `git show <hash>:<path>`)? That changes `commit-open-handler` and the file-viewer data path — bigger scope; default for v1 is working-tree path.
2. **Drag of a file/content result**: open a plain `file-viewer` tab of the path, or a git-repository review tab scoped to that commit/file? Default v1: file result drags open the branch-scoped git browser of the containing commit (consistent with commit rows); confirm.
3. **Content search** (additions/deletions) was a "maybe" — ship `-G`/`-S` in v1 or phase 2? If phase 2, the hierarchy still shows per-file add/del counts from `getDiffStat`-style data, but hunk sub-rows are deferred.
4. **Connected-repos scope**: search across **all** workspace repos, or only the repos in the active workset (`worksetGetRepoRefs`)? Default: all repos with a per-repo filter select.
5. **Worktree-row drop inside the explorer** cancels (no worktree reorder today) — acceptable? (Kept as `{ success: false }`.)

## Completion Criteria

**Implemented and verified (2026-08-29):** automated tests pass (1021 openp41ge + 48 openp41ge-git + uikit grid-drop-target suite), typecheck/lint/build clean. Runtime smoke-checked in the running dev app: the Git tab mounts the search UI, explorer repo/worktree rows carry `data-repo-row`/`data-worktree-row` + `data-explorer-drop-zone`, `onGitEntryMouseDown` produces the correct `open-tab` deferred start, and no error overlay. The item below marked as **not yet live-verified** requires a dev-app restart (the main process does not hot-reload).

- [x] Repo and worktree rows in the explorer drag with the **same bitmap strategy** as tabs/files.
- [x] Dragging a repo row onto the grid opens the `git-repository` pane (boundary → split, center → open); worktree rows open the branch-scoped browser titled by branch.
- [x] Dragging a repo row within the explorer reorders repos (persisted via `saveRepoOrder`); no native-drag/native-drop code remains for these rows.
- [x] Dead artifacts removed: `repo` variant, `RepoDragSource`, `repo-open-git`/`FileDropHandler` repo branch.
- [x] Git sidebar tab (id `"git"`) shows the commit search UI: autofocus input, repo scope + Messages/Files search-into toggles, hierarchical commits → files rows with +adds/−dels, loading/empty/error states. (Changed-content hunk sub-rows deferred to phase 2.)
- [x] Single-click on a commit result opens an unpinned (preview) git-repository tab; double-click pins; single-click on a file result opens an unpinned file-editor preview (VS Code preview model).
- [x] Dragging a search result row into the grid opens its review tab (pinned).
- [x] Cross-window drop of repo/worktree rows: same-window grid drop, explorer reorder, and the cross-window `open-tab` branch are automated-tested (dispatch `actionOpenFile`/`splitFileOpen` with `git-repository` + pending repo/branch).
- [x] Selectable search-depth limit in the filter box: exclusive 5K/10K/3K/2K/1K icon options (default 5K) wired end-to-end via `CommitSearchOptions.maxCount`. The service honors it by pinning the newest N commits by hash before the git-native `--grep` pass (a plain `--max-count` only caps grep _output_, not walk depth — fixed here so old matches genuinely drop out). Renderer verified live; the main-process path of the running dev instance is live once dev is restarted (main does not hot-reload).
- [x] **Live-verified (2026-08-30, CDP + dev app):** bitmap ghost + drop driven in the
      running app end-to-end. Remote/cross-window ghost overlay passes all 10 diagnostic
      checks (hook-driven `setRemoteDragActive` → ghost renders for cell-center 1-col/`active`
      and left+right boundaries 2-col/`highlighted`, removed on cleanup). Real same-window
      bitmap drags of an explorer **repo row** (pending deferred start → `open-tab`/`git-repository`
      data → grid drop mounts the git-repository pane) and a **worktree row** (`{repoName,
      branch}` branch-scoped data). The one residual is a literal two-BrowserWindow gesture —
      not runnable in a single-window CDP session, and the contextBridge preload is read-only so
      `getActive`/`dispatch` can't be mocked live; the cross-window dispatch args
      (`moveTabBetweenCells`/`splitCrossWindowTab`) remain covered by the automated integration
      suites (`explorer-workspace-repos.test.ts`, `git-entry-drag-system.test.ts`).
- [x] Deferred to phase 2 and recorded above: content (`-G`/`-S`) search + hunk sub-rows, file-at-revision browsing.

---

_Note: the unchecked block that previously duplicated the criteria below it was stale (predates the
2026-08-29 status update) and was removed in the live-verification pass._

---

## 2026-08-30 — Git search-result pane: read-only commit message viewer

### Goal

Replace the `git-commit-search` placeholder pane (opened by dragging a commit-search result row onto the grid) with a real viewer: the **full commit message shown in a `<file-editor>` in read-only mode**. The commit is fetched by hash.

### Approach

- **Read-only mode in `<file-editor>`** (`openp41ge-uikit`): a `setReadOnly(boolean)`/`get isReadOnly()` API. Read-only blocks every edit surface (typing, paste, cut, delete, new-line, Tab, undo/redo), hides the caret, and makes `save()`/`formatDocument()` no-ops — while keeping mouse selection + copy working.
- **Fetch the message** end-to-end: `IGitCommitService.getCommitMessage(repoName, hash)` → `NodeGitCommitService` runs `git log -1 <hash>` with a newline-separated full-body format → new `workspace:getCommitMessage` IPC (git-handlers) → preload + `global.d.ts` → `window.openp41ge.workspaceController.getCommitMessage`.
- **GitCommitSearchController**: mount renders a slim header (repo · short-hash) above a read-only `<file-editor>`; builds an in-memory `PieceTreeTextContentModel` (no disk/IPC) with the full message and calls `loadFile` after the editor's Lit pipeline is ready. The fetched message/meta is snapshot/restored so re-mounts render instantly without a refetch. Fetch returns `null`/throws → inline fallback text.

### Files changed

- `openp41ge-uikit/src/components/file-editor/file-editor.ts` — read-only API + edit/caret gates.
- `openp41ge/src/main/interfaces/git-commit-service.ts`, `main/services/node-git-commit-service.ts` — `getCommitMessage`.
- `openp41ge/electron/ipc-handlers/git-handlers.ts`, `electron/preload.cjs`, `renderer/global.d.ts` — IPC surface.
- `openp41ge/src/renderer/apps/git-commit-search/git-commit-search-controller.ts` — real viewer.

### Testing

- uikit `read-only.test.ts` — caret hidden while focused, typing/paste/delete/newline don't mutate the model, dirty stays false, `save()` false, toggle re-enables edits.
- `node-git-commit-service-get-commit-message.test.ts` — real-git: subject+multiline body round-trip via `%B`; unknown hash → null.
- `git-commit-search-controller.test.ts` — mock bridge `getCommitMessage`; fresh-mount fetch + read-only editor content, restore-with-cached-message renders without fetch, null result → fallback.

### Completion criteria

- [ ] All tests green (uikit + openp41ge), typecheck/lint/build clean.
- [ ] Live (dev restart — main-process IPC change): drag a search result → pane opens with header + read-only editor showing the commit message; typing does nothing, caret absent, text selectable.

---

## 2026-08-30 (2) — Editor: full-width find bar above the status bar; rounded search highlights

The `<file-editor>` find strip moved OUT of the bottom status bar into its own
full-width bar that sits ABOVE the status bar at the bottom of the editor. The
status bar now carries only the find icon (which toggles the bar). Search-match
highlight spans are now rounded (3px) to match the text-selection highlight.

Included in the same pass: the uncommitted in-editor Find work (FindMatchRenderer,
bottom-bar find strip, carried git-search-query highlight onto opened files via
openTabData `search` payload + `actionOpenFile` extraConfig) which the user has
been iterating on and was left uncommitted in the working tree.

---

## 2026-08-30 (3) — Editor: borderless find input; filter content as a stacked bar

The find input lost its border + background so the full-width find bar reads as
the input container. The search-options toggle now opens a THIRD stacked bar
(fe-find-strip) ABOVE the find bar (whole-word / open-tabs / folder), replacing
the floating dropdown.

---

## 2026-08-30 (4) — Editor: filter strip removed; whole-word becomes a search-bar toggle

The stacked filter strip was deleted entirely. The only kept option — Whole word —
is now an icon toggle at the end of the find bar (after regex and case), driven by
`_toggleWholeWord` / `fe-find-whole-word`. The search-options toggle, `_configOpen`
state, ICON_CONFIG and the dropdown were removed. The find bar regained its top
border (it previously dropped it while the strip sat above).
