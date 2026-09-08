# 2026-09-08 — Explorer search/filter & remove the Search sidebar tab

## Goal

Remove the (placeholder) **Search** sidebar tab and give the **Explorer** tab a search/filter box at the top that does two things when a query is present:

1. **Live name-filter** the repo/worktree/file tree nodes (hide non-matching nodes).
2. **Full-text content search** across the Explorer's checked-out repos/worktrees, showing each **match instance as a row in a sublist under the file it belongs to**. Clicking a match row opens the file **at that instance**; clicking the file row opens it at the top as usual.

The filter box has **regex** and **match-case** toggles, both **off by default**, and the existing **settings gear** stays in the 24px bottom bar.

## Rationale

The dedicated Search tab is a placeholder ("Full-text search coming soon") — it never actually returned results, so removing it loses no real functionality. Putting search where the user already browses (Explorer) is more discoverable and removes a redundant sidebar tab. The user confirmed the combined behaviour (tree filter + content match sublists).

## Approach

### Phase 1 — Remove the Search tab entirely

- Delete `src/renderer/apps/system-tabs/search-system-tab.ts`.
- Delete `src/renderer/apps/settings/search-settings-tab.ts`.
- `src/renderer/apps/system-tabs/index.ts`: remove `searchSystemTabRegistration`, its import, and drop it from `allSystemTabRegistrations`.
- `src/renderer/apps/settings/index.ts`: remove `searchSettings` and its import.
- `src/renderer/bootstrap/steps/register-shortcuts.step.ts`: remove the **Cmd+Shift+F → search** shortcut (lines ~185–205).
- Confirm no test references the removed tab (keep-alive test only references the History/commit-search tab; `commit-search-system-tab.test.ts` references `search` only via fixture data, not the removed tab).
- Remove the `search` app-type from anything else that lists it (verified: only the above touchpoints).

### Phase 2 — Content-search IPC (main process)

New, additive channel (keeps `file:search` closed for change):

- `electron/ipc-handlers/file-handlers.ts`: add `ipcMain.handle("file:searchContents", …)`. It walks each provided root path, reads text files (skip binary / > a max size), and matches the query with optional regex + case sensitivity. Returns grouped results:
  ```ts
  interface FileContentMatch {
    lineNumber: number; // 1-based
    column: number; // 1-based
    startIndex: number; // offset within the line
    endIndex: number;
    lineText: string; // the matched line (trimmed snippet)
  }
  interface FileContentSearchResult {
    path: string;
    name: string;
    dir: string;
    matches: FileContentMatch[];
  }
  ```
  Cap total files / matches (e.g. 200 files, 50 matches/file). Pure matching logic extracted into a small `content-search.ts` util so it's unit-testable without fs.
- `electron/preload.cjs`: expose `file.searchContents(query, rootPaths, options)`.
- `src/renderer/global.d.ts`: add `searchContents` to the `file` namespace + the result types.

### Phase 3 — Explorer search model (Dependency Inversion)

New renderer model so the heavy logic is testable and the web component stays thin:

- `src/renderer/models/explorer-search-model.ts`: `IExplorerSearchModel` interface + `IpcExplorerSearchModel` (calls `window.openp41ge.file.searchContents`) and `TestExplorerSearchModel` (in-memory fixtures). Holds the debounced query state, regex/case flags, and exposes `search(query, roots, opts)` returning `FileContentSearchResult[]`.
- The model is injected into the worktree-tree as a publicly-settable property (default `IpcExplorerSearchModel`) so tests can override it.

### Phase 4 — Explorer UI (worktree-tree component)

`src/renderer/components/openp41ge-worktree-tree.ts`:

- Add a filter/search box **above the tree** in `render()`, styled flush/full-width like the commit-search box (26px input, transparent bg, no border, placeholder "Filter repos and files…"), with **regex + match-case** toggles (reuse `REGEX_ICON`/`CASE_ON_ICON` from `git-commit-search/search-icons`), both grey/off by default. Reuse the `makeIconToggle` visual pattern.
- Wire events: input → debounced content search + name filter; **Enter** → immediate; **Escape** → clear.
- **Name filter**: when a query is present, filter the repo/worktree list passed to each `<openp41ge-repo-tree-item>` and pass the filter string down; `openp41ge-repo-tree-item.ts` hides file/dir nodes whose name/path doesn't match (auto-expand matching branches). Preserve expansion state.
- **Content results list**: when the query is non-empty and content results exist, render a section (below the filtered tree) of files → each match instance as a row (line no. + snippet). Empty state: "No matches" when the query matches nothing.
- **Open at instance**: content match rows dispatch `openp41ge:open-file` with `detail: { path, name, line, column }`; the file row keeps the existing `file-open`/`file-preview` (open at top).

### Phase 5 — Open file at a specific instance

- `src/renderer/interfaces/file-open-handler.ts` + `src/renderer/services/file-open-handler.ts`: read `detail.line` / `detail.column` and carry them on the tab config (extend the existing `search` config object to `{ search, line, column }`).
- `src/renderer/apps/file-viewer/file-editor-controller.ts`: after `_applyConfiguredHighlight()`, if `state.line` is set, call the editor to reveal that line/column.
- `packages/openp41ge-uikit/src/components/file-editor/file-editor.ts`: add `revealLine(lineNumber, column?)` — sets the cursor position to that line/column and triggers `_scrollToRevealCursor()` (reuses the existing cursor + scroll machinery).

### SOLID Review

- **S** — `openp41ge-worktree-tree.ts` (2228 lines) already mixes repo loading, tree rendering, add-repo/add-worktree UI, and settings. Adding search there would compound it. Mitigation: extract the search/filter state + content-search calls into `ExplorerSearchModel` (Phase 3) and keep the component as the view. Flag if the component still exceeds a single responsibility; consider extracting a `SearchFilterBar` sub-component if it grows.
- **S** — `file-editor.ts` (uikit) is large; adding `revealLine` is single-concern (navigation) and small, so acceptable.
- **O** — New `file:searchContents` channel added alongside `file:search` (additive, no switch/if-else on type). Search-tab removal deletes its registration entry rather than adding a type branch. Good.
- **L** — `IExplorerSearchModel.search()` returns `FileContentSearchResult[]` (empty array for no matches) and never throws; `null` only for genuinely-absent results. Match the existing `RepoService`/`FileEntryModel` conventions.
- **I** — Keep `IExplorerSearchModel` small: `search(query, roots, options)` plus the regex/case flags. Don't fold in name-filtering concerns that belong to the view.
- **D** — Worktree-tree must expose the model as a settable public property so tests inject `TestExplorerSearchModel`. Avoid `new IpcExplorerSearchModel()` hard-wired without an escape hatch.

### UX Consistency

- Filter box mirrors the History commit-search box: full-width flush input, regex + match-case toggles right-aligned, both grey (off) by default, `var(--divider,#2a2a2a)` top border to match adjacent borders, 24px bottom bar with the existing settings gear kept.
- **Focus**: typing focuses the filter input; Enter runs immediately; Escape clears the query (and blurs if already empty).
- **Empty states**: no repos → existing "Select a workspace" placeholder; query matches nothing → "No matches" in the content-results section; results load async (spinner/placeholder while searching).
- **Open-at-instance**: opens the file as a normal editor tab with the matched line highlighted/centred (reuse `setSearchHighlight` so the query matches are highlighted, then `revealLine`).

## Files Changed

- `packages/openp41ge/src/renderer/apps/system-tabs/search-system-tab.ts` — **delete**
- `packages/openp41ge/src/renderer/apps/settings/search-settings-tab.ts` — **delete**
- `packages/openp41ge/src/renderer/apps/system-tabs/index.ts` — remove search registration
- `packages/openp41ge/src/renderer/apps/settings/index.ts` — remove search settings
- `packages/openp41ge/src/renderer/bootstrap/steps/register-shortcuts.step.ts` — remove Cmd+Shift+F search shortcut
- `packages/openp41ge/electron/ipc-handlers/file-handlers.ts` — add `file:searchContents` + `content-search.ts` util
- `packages/openp41ge/electron/preload.cjs` — expose `file.searchContents`
- `packages/openp41ge/src/renderer/global.d.ts` — `file.searchContents` + result types
- `packages/openp41ge/src/renderer/models/explorer-search-model.ts` — **new** (`IExplorerSearchModel`, `Ipc*`, `Test*`)
- `packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts` — filter box, name filter, content-results section
- `packages/openp41ge/src/renderer/components/openp41ge-repo-tree-item.ts` — name-filter file/dir nodes
- `packages/openp41ge/src/renderer/interfaces/file-open-handler.ts` + `services/file-open-handler.ts` — carry `line`/`column`
- `packages/openp41ge/src/renderer/apps/file-viewer/file-editor-controller.ts` — reveal configured line
- `packages/openp41ge-uikit/src/components/file-editor/file-editor.ts` — add `revealLine()`
- `packages/openp41ge/src/layout/workspace-file.ts` — strip obsolete (search) system tabs on migrate
- `packages/openp41ge/src/renderer/controllers/registry.ts` — (reused) `getController` for jump-to-existing
- `packages/openp41ge/test/integration/system-tabs/explorer-search.test.ts` — **new**
- `packages/openp41ge/test/unit/services/explorer-filter.test.ts` — **new**

## Testing Strategy

- **Unit** (`packages/openp41ge/test/unit/...`):
  - `content-search-matching.test.ts` for the pure match logic (regex/case, snippet extraction, skips binary/large files, caps).
  - `explorer-search-model.test.ts` for `Ipc`/`Test` model behaviour (debounce, empty query, regex/case propagation, no-match → `[]`).
- **Integration** (`packages/openp41ge/test/integration/system-tabs/`):
  - `explorer-system-tab.test.ts` (new or extended): mounting the Explorer renders the filter box; typing filters tree nodes; content results render file → match rows; open-at-instance dispatches `openp41ge:open-file` with `line`.
  - `file-open-handler` tests: `line`/`column` carried onto the tab config.
- **Regression**: the file-editor `revealLine` is covered in `packages/openp41ge-uikit/test/components/file-editor/` (e.g. `find-bar.test.ts` style), asserting cursor moves and scroll.
- **Quality gate**: `nx run-many -t typecheck test`, `nx lint`, `nx knip`, `nx run-many -t build`, `nx format`.

## Open Questions — resolved

1. **Content-search roots** — implemented as the Explorer's repo/worktree disk paths (`_repos[].path`, worktree `path`), NOT the workspace `scopedFolders` (`_rootPaths()`).
2. **Auto-expand on name match** — implemented: matching repos/worktrees/dirs auto-expand (and auto-load files) when a name filter is active, so hits are visible without manual expand.
3. **File already open** — implemented: a content-match click for a file already open anywhere in the window **jumps** to that tab and reveals the line (`_findFileViewerAnywhere` + `FileEditorController.revealLine` + `activateTabInCell`), rather than opening a duplicate.

## Status — implemented

All phases are implemented and verified:

- **Phases 1–5 done.** Search tab + settings + Cmd+Shift+F removed; `file:searchContents` IPC; `IExplorerSearchModel`; worktree-tree filter box + name filter + content-results section; repo-tree-item name filtering + auto-expand; open-at-instance (new/preview tabs) and jump-to-existing tab.
- **Persisted-workspace cleanup (added).** Because the Search tab lived in each workspace's persisted `systemTabs`/`sharedSidebars`/`windows[].sidebar`, a dead tab would linger after the registration was removed. Added a strip in `migrateWorkspaceFileData` (`packages/openp41ge/src/layout/workspace-file.ts`) that removes system tabs whose `appType` is in `OBSOLETE_SYSTEM_TAB_APPTYPES` (currently `search`), and drops the id from the sidebar lists + active-left/right-tab. Applies on next workspace load/save (the main process needs a restart to pick it up).
- **Tests:** `1285 passed` in `packages/openp41ge` (+ `find-bar` `revealLine` tests in uikit). Lint, format:check, and build are clean. `openp41ge:typecheck` reports only the pre-existing `openp41ge-agent-settings.ts:1644` error; `nx knip` reports only pre-existing findings. Main-process `file:searchContents` and preload `searchContents` verified present.

## Completion Criteria

- [x] Search sidebar tab removed (tab, settings gear, Cmd+Shift+F shortcut); no dangling references; app still typechecks/lints.
- [x] Explorer shows the filter box at the top with regex + match-case toggles off by default; settings gear still in the bottom bar.
- [x] Typing a query live-filters tree nodes by name (repos/worktrees/files/dirs), with matches revealed (auto-expand) and expansion state preserved.
- [x] Content search returns per-file match instances rendered as rows in a sublist under each file.
- [x] Clicking a match row opens the file at that instance (cursor + scroll + highlight), or jumps an already-open tab; clicking the file opens at the top.
- [x] Empty/loading/no-match states render correctly; Escape clears the query.
- [x] New unit + integration tests pass; `nx run-many -t test` typecheck/lint/build clean.
