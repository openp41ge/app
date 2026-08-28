# 2026-08-28 — Explorer file drag into central grid (tab-style, cross-window, new-window)

## Goal

Let a user drag a file from the Explorer sidebar into the central grid and place it
in a grid cell with the **same UX as dragging an existing tab**: a drag ghost, a
cell-highlight + boundary-split preview over the grid, and a drop that either opens
the file in an existing/swapped cell or splits a new column. The drag must also work
**outside the source window**:

1. drop in the source window's empty/non-target area → open the file in a **new window** at the drop point;
2. drop over **another existing window's grid** → open the file into that window's grid (with ghost preview there), like cross-window tab drags.

Single-click file opening (current behaviour) must keep working unchanged.

## Rationale

- Clicking a file works today: uikit `<openp41ge-tree>` fires `tree-node-click` →
  `_onFileClick` (`openp41ge-repo-tree-item.ts`) → `openp41ge:open-file` →
  `FileOpenHandler.handleOpenFile` → `actionOpenFile`.
- Today, dragging a file from the explorer rides the **native HTML5 drag**
  (`draggable="true"` on tree file rows, `text/plain` = path), handled ad hoc by
  `<tab-grid>`'s own `_boundOnDrop`/`_showFileDropGhost` and by `init-drag-system.ts`'s
  HTML5 `dragend` → `actionOpenFileInNewWindow`. This gives a basic same-window drop but:
  - no tab-quality split/cell ghost (separate, weaker `isFileDrop` ghost),
  - **no** placement into *another existing window* (no remote ghost, no cross-window cell drop),
  - drop-out-to-new-window only works via native `dropEffect==="none"` — inconsistent with tabs.
- The platform **already contains a complete tab-style custom file pipeline** in
  `services/init-drag-system.ts`: `onFileMouseDown` (mousedown on `[data-file-path]`)
  → `FileDragSource` → `DragOrchestrator` → main-process `drag.start/activate/move/end`
  (BrowserWindow ghost) → cross-window `_handleCrossWindowDrop` (file branch →
  `actionOpenFile`/`splitFileOpen`) and the new-window fallback, guarded by
  `_fileDropHandled` (set by the `grid-open-tab` listener or the cross-window
  `endSession`). `GridDropTarget` (`packages/openp41ge-tabs`) already has `file`
  handling for boundary splits and cell drops.
- **The new-window-on-drop-outside mechanism is real and was deliberately built**
  (commits `8cfe70e`, `6d09898`, `7c5c9a4`, `543faef`, `4e97079`): while the button
  is held the OS mouse-captures the drag to the source window, so its `document
  mouseup` still fires when the cursor is over the desktop or another app. The
  source window's `onMouseUp` then sees `_localFileDragActive &&
  _pendingFileDetachPath` and dispatches
  `actionOpenFileInNewWindow(filePath, fileName, lastScreenX, lastScreenY)`; the main
  `dispatch-handler.ts` applies the layout op (add window + tab) **and** creates the
  Electron BrowserWindow at those screen coords. This path is custom-pipeline-only.
- **The gap:** `onFileMouseDown` is keyed on `[data-file-path]`, which today exists
  **only on `<file-editor>` pane roots** — and those are protected from the handler
  by the editor's own `mousedown → stopPropagation()` on `.fe-root` ("Prevent
  mousedown from bubbling to grid drag handler"). So **nowhere in the app actually
  starts a custom file drag today**; explorer file drags run the weaker native-HTML5
  path and the custom pipeline is effectively dormant.

This change makes the explorer's file rows expose `data-file-path` and routes their
drags through the existing pipeline instead of native HTML5, giving all three
scenarios for free and reusing the exact code tabs use.

## Approach

### 1. uikit `<openp41ge-tree>` — expose file paths on rows

In `packages/openp41ge-uikit/src/components/tree/tree.ts` row template, when a node is
draggable **and** declares a `meta.filePath` string, render `data-file-path` on the
row (alongside the existing `data-node-id`/`draggable`). Add a tiny private helper,
e.g. `_filePathOf(node)` that reads `typeof node.meta?.filePath === "string"`.

- Gate on `node.draggable && meta.filePath` so only **file** rows get the marker:
  in the explorer, `_buildFileTreeNodes` (`openp41ge-repo-tree-item.ts`) sets
  `draggable: true` only on files; directories set `draggable` default (false) though
  they also carry `meta.filePath` — so requiring `draggable` excludes them.
- This is purely additive. Story/demo trees (no `meta.filePath`) are untouched and keep
  native drag (their `tree-drag-start` → `__treeDragFilePath` path in
  `tab-grid.stories.ts` still works).

### 2. `init-drag-system.ts` — make the custom pipeline the sole drag for file rows

- Add a **capture-phase `dragstart`** listener on `document` that calls
  `e.preventDefault()` when a custom file drag is in progress
  (`_currentSource?.type === "file"` **and** the event target is inside a
  `[data-file-path]` element). `_currentSource` is set synchronously in
  `onFileMouseDown`, before any native dragstart can fire (dragstart requires
  movement), so this reliably suppresses the tree's native drag for the same gesture.
  Without this, both the custom pipeline **and** native HTML5 drag run → double
  ghosts / double opens.
- **New window on release outside a target must keep working.** With the custom
  pipeline now active for explorer rows this is preserved end-to-end: mouse capture
  delivers `mouseup` to the source window on desktop release → `onMouseUp` →
  `actionOpenFileInNewWindow` at `_lastScreenPos` → `dispatch-handler.ts` creates the
  Electron window. The existing native-HTML5 `dragstart`/`dragend`
  (`_html5FileDragPath`, `dropEffect==="none"`) handlers are left in place as a
  defensive fallback for any other native `text/plain` drags; they simply no longer
  fire for explorer file rows (which now take the custom path).

### 3. `init-drag-system.ts` — resolver: file dropped on a tab bar targets the grid

`openp41geTargetResolver` currently returns a `tab-bar` target for tab-bar hits.
`TabBarDropTarget.onDrop` rejects non-tab sources (`only tabs …`), so a file dropped
on a cell's tab bar would do nothing. For file sources, resolve a tab-bar hit to the
enclosing `<tab-grid>`'s drop target instead, so `GridDropTarget` computes the column
under the cursor (cell-center/boundary), matching what the native path did
(`_isOverTabBar` branch) and what cross-window file drops already do
(`_handleCrossWindowDrop` resolves via `closest("tab-grid")`).

### 4. `GridDropTarget` (`packages/openp41ge-tabs`) — correct file cell drop

In `_handleCellDrop` the file branch currently fires `grid-open-tab` with
`winId: ""` (relies on `_findWinId()` fallback) and omits `pinned`. Change it to
`winId: this.winId` and add explicit `pinned: true`, consistent with the boundary
branch and with cross-window file drops. Behaviour-neutral today (handler defaults
`pinned ?? true`), but removes a fragile multi-window fallback.

No changes needed elsewhere: `GridDropTarget` boundary drops, cross-window
`_handleCrossWindowDrop`, `actionOpenFileInNewWindow`, the `_fileDropHandled` guard,
the main-process `drag-handlers.ts` session (already stores `dragType: "file"` +
`filePath`), and `FileOpenHandler` are all already correct for this flow.

## Files Changed

- `packages/openp41ge-uikit/src/components/tree/tree.ts`
  Render `data-file-path` on draggable rows that carry `meta.filePath` (+ helper).
- `packages/openp41ge-uikit/test/tree/tree.test.ts`
  New tests: draggable node with `meta.filePath` renders `data-file-path`;
  directory node (draggable false) and file node without `meta.filePath` do not.
- `packages/openp41ge/src/renderer/services/init-drag-system.ts`
  Add capture-phase native-`dragstart` suppression for `[data-file-path]` while a
  custom file drag is active; adjust `openp41geTargetResolver` so file sources over
  a tab bar resolve to the enclosing grid's drop target.
- `packages/openp41ge-tabs/src/targets/grid-drop-target.ts`
  File cell drop: `winId: this.winId`, explicit `pinned: true`.
- `packages/openp41ge-uikit/test/tabs/grid-drop-target.test.ts` (new)
  Focused jsdom unit test: `GridDropTarget.onDrop` with a `FileDragSource` fires
  `grid-open-tab` with correct `winId`/`targetCol` for cell and boundary drops.

## Testing Strategy

- **Test-first** (per AGENTS.md):
  1. uikit tree test asserting `data-file-path` rendering → add attribute → pass.
  2. `GridDropTarget` test asserting the `grid-open-tab` detail shape → fix
     `winId`/`pinned` → pass.
- **Integration / behavioural** (manual, app running):
  - Same-window: drag file onto a cell center → file opens in that cell (ghost +
    cell highlight visible); drag onto a column boundary → new split column.
  - Drop on a cell's tab bar → opens into that column.
  - Drag out over empty sidebar/blank source-window area → `actionOpenFileInNewWindow`
    creates a new window at the drop point.
  - Cross-window (`test-cross-window-drag` skill + `__openp41geTestHooks`): start a
    file drag in window A, mouse into window B → ghost shows there → drop → file
    opens in window B's grid; verify no stray duplicate window is created
    (`_fileDropHandled` / `endSession` guard).
  - **Desktop release:** drag a file out of the window and release over the OS
    desktop → a new window must open at the release point (custom-pipeline
    `onMouseUp` → `actionOpenFileInNewWindow`), and a release over another openp41ge
    window must not spawn an extra window.
  - Regression: single- and double-click on a file still open/preview & pin as today.
- **Quality gate:** `nx run-many -t typecheck test`, `nx lint`, `nx format`, build.

## UX Considerations

- Ghost + grid preview reuse the exact `GhostManager`/`GridDropTarget` code as tab
  drags → identical visuals (consistent with the requested "like an existing tab").
- Main-process ghost for files shows the file name (DragGhostManager), same as tabs.
- Drop on a cell opens a **pinned** file tab (deliberate placement) — matches the
  existing cross-window file-drop behaviour; click-without-drag keeps preview
  semantics (single click = unpinned preview, per `FileOpenHandler`).
- Keyboard/focus: `onFileMouseDown` already `preventDefault()`s mousedown (as it does
  today over open file panes); single-click still fires `click` → preview open. No new
  shortcuts.
- No new CSS variables; reuses existing grid ghost styles.

## Open Questions

Resolved during review (no user decision needed):

1. **Desktop-release → new window.** Was claimed not to work in an earlier draft; it
   does — see **Rationale**. Mouse capture delivers the source window's `mouseup` even
   over the desktop, feeding `actionOpenFileInNewWindow` → Electron window at the drop
   point. It functions **only** via the custom pipeline, so this plan's conversion of
   explorer rows to that pipeline preserves it (completing requirement 2).
   Platforms: designed/validated on macOS; if Linux lacks drag mouse-capture this
   could regress — flag for manual verification, not a blocker.
2. **file-editor `data-file-path` collision.** Does not exist: the editor's `.fe-root`
   `mousedown → stopPropagation()` shields it from the document-level `onFileMouseDown`
   and from grid drag handlers. Enabling the marker on tree rows cannot affect editor
   text selection. No action needed.

Remaining: none blocking. (Native `dragend` fallback is kept, not removed.)

## SOLID Review

- **S** — `init-drag-system.ts` is a large, multi-concern module (pre-existing). The
  additions are limited to two listeners + a resolver tweak; no new class or
  responsibility split introduced.
- **O** — uikit tree reason is extended without modifying the native-drag contract for
  non-file consumers (attribute is additive). `GridDropTarget` continues to translate a
  source → event (no switch growth beyond the existing `file` branch).
- **L / I / D** — no interface changes; `FileDragSource`, `GridDropTarget`, resolver,
  and handlers are reused as-is.

## Completion Criteria

- [ ] Explorer file rows render `data-file-path`; directories do not.
- [ ] Dragging a file into the same window places it in the hovered cell (or splits a
      new column at a boundary), with the same ghost/preview as tab drags.
- [ ] Dropping a file over a cell tab bar opens it into that column.
- [ ] Releasing a file drag in the source window's non-target area — including over
      the OS desktop — creates a new window with the file open at the drop point (no
      double-open and no stray window when a grid drop or cross-window drop handled it).
- [ ] Dragging a file into another existing window shows the ghost there and opens the
      file in that window's grid.
- [ ] Single-/double-click file opening unchanged.
- [ ] New uikit tests pass; typecheck, lint, format, build green.
