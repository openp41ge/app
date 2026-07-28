2025-07-28

# Plan — Drag Repo Row from Explorer to Grid to Create Git Tab

## Goal

Enable dragging a repository row from the explorer sidebar (openp41ge-worktree-tree / openp41ge-repo-tree-item) onto the grid surface to create a new tab that renders the git repository component (GitRepositoryController). This must not interfere with the existing drag-to-reorder behaviour within the repo list.

## Rationale

Users need a quick way to open a repo's git browser (branches, commits, diff stat) by dragging a repo row from the explorer sidebar into the grid — the same way file rows can be dragged to open file-editor tabs. Currently, the only way to open the git browser is via the context menu (right-click → "Show git info") or the git icon button on the repo row.

## Approach

Two drag systems coexist in the app:

1. **Native HTML5 drag** — Used by file-tree and repo-tree items (`draggable="true"` + `dragstart`/`dragover`/`drop`). The `<tab-grid>` component (in openp41ge-tabs) already handles native drops for `Files`, `text/uri-list`, and `text/plain` (file paths) but NOT for `application/x-openp41ge-repo`.

2. **Custom mousedown/mousemove/mouseup DnD** (openp41ge-tabs DragOrchestrator) — Used for tab dragging between cells and windows.

Repo rows use native HTML5 drag. The tab-grid's native drop handler needs to be extended to recognise `application/x-openp41ge-repo` and dispatch a `grid-open-tab` event, which the existing `Openp41geTabsEventHandler` already translates into workspace commands.

### Existing Infrastructure

- `<openp41ge-repo-tree-item>` repo header: `draggable="true"`, sets `application/x-openp41ge-repo` on `dragstart` (line 449-450).
- `<openp41ge-worktree-tree>`: native `@dragenter/@dragover/@drop` handlers on `.wt-tree-scroll-content` intercept the same MIME type for reordering repos within the list. These fire first (the explorer DOM is above the grid) and stop propagation where appropriate, preserving reorder behaviour.
- `<tab-grid>` native drop handler: handles `Files`/`text/uri-list`/`text/plain` and fires `grid-open-tab` events.
- `Openp41geTabsEventHandler`: listens for `grid-open-tab` on `document`, dispatches `splitFileOpen` or `actionOpenFile` for `file-viewer` type.
- `GitRepositoryController` (git-repository-controller.ts): mounts the git browser panel. Uses `window.__pendingGitRepo` to know which repo to display.
- `Openp41geWorktreeTree._openGitTab()`: sets `window.__pendingGitRepo` and dispatches `addColumnTabAt`. Already the proven path for opening a git tab programmatically.

### Changes Required

#### 1. `<tab-grid>` — Add `application/x-openp41ge-repo` to native drop handling

**File:** `packages/openp41ge-tabs/src/components/tab-grid.ts`

- In `_boundOnDragOver`: add `"application/x-openp41ge-repo"` to the types check so `e.preventDefault()` is called and the ghost is shown.
- In the ghost display (`_showFileDropGhost`): the same ghost logic works for repo drops — it shows a split indicator or cell highlight based on cursor position.
- In `_boundOnDrop`: add a branch that checks for `application/x-openp41ge-repo` data. If found, dispatch `grid-open-tab` with `tabType: "git-repository"` and `tabConfig: { repoName }`, following the exact same pattern as the file drop branch (including boundary handling for split drops).

**Pseudo-code for the drop branch:**

```typescript
const repoName = e.dataTransfer.getData("application/x-openp41ge-repo");
if (repoName) {
  e.preventDefault();
  e.stopPropagation();
  // Same rect/pos calculation as file drop branch
  const rect = this.getBoundingClientRect();
  const relX = e.clientX - rect.left;
  const pos = computeDropTarget(this, relX, rect.width, this.cols);

  if (pos.isBoundary) {
    // ... calculate splitCol/splitLeft ...
    this.dispatchEvent(new CustomEvent("grid-open-tab", {
      bubbles: true,
      detail: {
        winId: this.winId, tabType: "git-repository",
        tabConfig: { repoName }, targetCol, isBoundary: true,
        splitCol, splitLeft, pinned: true,
      },
    }));
  } else {
    this.dispatchEvent(new CustomEvent("grid-open-tab", {
      bubbles: true,
      detail: {
        winId: this.winId, tabType: "git-repository",
        tabConfig: { repoName }, targetCol, pinned: true,
      },
    }));
  }
}
```

#### 2. `Openp41geTabsEventHandler` — Handle `git-repository` tab type

**File:** `packages/openp41ge/src/renderer/services/openp41ge-tabs-event-handler.ts`

In the `"grid-open-tab"` handler (around line 138), add a branch for `tabType === "git-repository"`:

```typescript
if (tabType === "git-repository") {
  const repoName = tabConfig.repoName;
  if (!repoName) return;
  // Set pending repo for GitRepositoryController to pick up on mount
  (window as any).__pendingGitRepo = repoName;
  Openp41geTabsEventHandler.lastFocusedCol[winId] = focusCol;

  if (isBoundary) {
    // Split the grid and open the git tab in the new column
    this._dispatch("splitFileOpen", winId, "git-repository", repoName, repoName, splitCol, splitLeft);
  } else {
    // Open in existing cell (or add column if needed)
    this._dispatch("actionOpenFile", winId, "git-repository", repoName, repoName, targetCol, true);
  }
  return;
}
```

**Why `splitFileOpen`/`actionOpenFile` work for git repos:** These are generic operation functions that work with any `appType`. They call `createTab(tabId, appType, title)` and `registerTab()`. The `GitRepositoryController` is registered under `"git-repository"` and will be created by the grid when a tab with that appType is mounted. The title and fileName parameters are unused by the controller — it only reads `window.__pendingGitRepo`.

#### 3. Tab-grid — Show ghost overlay for repo drags

**File:** `packages/openp41ge-tabs/src/components/tab-grid.ts`

The `_showFileDropGhost` method already works generically — it just needs to be called for repo drags too. The `_boundOnDragOver` already handles `e.dataTransfer.types` checks. Adding `"application/x-openp41ge-repo"` to that check will show the ghost naturally.

The ghost rendering (via GhostManager) is already agnostic to what's being dragged — it only cares about the column geometry.

### Existing Behaviour Preserved

| Scenario | Current handler | Preserved? |
|---|---|---|
| Drag repo row within explorer list | `openp41ge-worktree-tree.ts` native DnD handlers on `.wt-tree-scroll-content` (reorder) | ✅ — These fire first (explorer is higher in DOM order + z-order). They call `e.preventDefault()` on `dragover` and consume the event on `drop`, preventing propagation to the grid. |
| Drag repo row to grid surface (new) | `tab-grid.ts` native drop handler (new code) | ✅ — Only fires when the cursor is over the grid, not over the explorer. |
| Click "Show git info" context menu | `repo-tree-item` → `repo-open-git` event → `worktree-tree._openGitTab()` | ✅ — Unchanged. |
| Existing file drag-to-grid | `tab-grid.ts` native `text/plain` handling | ✅ — Unchanged, just adding another MIME type check. |

## SOLID Review

| Principle | Check |
|---|---|
| **S** — Single Responsibility | `tab-grid.ts` already handles native drops. Adding one more MIME type is within its SRP (it's a grid component that accepts drops). `Openp41geTabsEventHandler` already handles all grid events — adding a git-repository case keeps event routing in one place. No new classes needed. |
| **O** — Open/Closed | The `grid-open-tab` handler currently has an implicit file-only assumption. The proposed change adds a conditional on `tabType`, which is a minor violation. A full OCP-compliant approach would use a registry of tab-type → command factories, but that's excessive for two types. Acceptable for now — if more types are added later, extract into a registry. |
| **L** — Liskov | No inheritance changes. `GitRepositoryController` already implements `TabController` correctly. |
| **I** — Interface Segregation | No interface changes. |
| **D** — Dependency Inversion | No new dependencies. `__pendingGitRepo` is the existing bridge between event handler and controller, already tested in the context-menu flow. |

## UX Considerations

| Aspect | Decision |
|---|---|
| **Ghost overlay** | Same ghost as file drops — blue highlight for cell center, split indicator for column boundaries. Reuses `GhostManager` via the existing `_showFileDropGhost`. |
| **Drop feedback** | Cursor shows `copy` or `move` (same as file drops). |
| **Tab position** | Drops on cell center open git tab in that cell; drops on column boundary create a new column and open the tab there. |
| **Pinning** | Git tabs are pinned by default (same as file drops). |
| **Focus** | Column focus moves to the drop target (same as file drops). |
| **Error state** | If `repoName` is missing in the drop data, the drop is silently ignored (no tab created). If the git load fails, `GitRepositoryController` already shows an error state with retry. |

## Files Changed

| File | Change |
|---|---|
| `packages/openp41ge-tabs/src/components/tab-grid.ts` | Add `"application/x-openp41ge-repo"` to `_boundOnDragOver` types check. Add repo-drop branch in `_boundOnDrop` that dispatches `grid-open-tab` with `tabType: "git-repository"`. |
| `packages/openp41ge/src/renderer/services/openp41ge-tabs-event-handler.ts` | Add `git-repository` case in `"grid-open-tab"` handler that sets `__pendingGitRepo` and dispatches `splitFileOpen`/`actionOpenFile`. |

## Testing Strategy

### Unit Tests

**TabGrid — native drop handler** (`packages/openp41ge-tabs/test/unit/`):

- Test that `_boundOnDragOver` calls `e.preventDefault()` when `application/x-openp41ge-repo` is in the dataTransfer types.
- Test that `_boundOnDrop` fires `grid-open-tab` with correct detail when `application/x-openp41ge-repo` data is present.
- Test both cell-center drop and boundary split drop scenarios.
- Test that non-repo MIME types (e.g., `text/html`) do NOT trigger repo handling.

**Openp41geTabsEventHandler** (`packages/openp41ge/src/renderer/services/`):

- Test that `grid-open-tab` with `tabType: "git-repository"` dispatches the correct command (`actionOpenFile` for cell drop, `splitFileOpen` for boundary drop).
- Test that `window.__pendingGitRepo` is set correctly.
- Test that `repoName` is passed through the `tabConfig`.

### Integration / Manual Test (via test-cross-window-drag skill)

- Open two repos in the explorer.
- Drag repo row from explorer onto grid cell center → verify git tab opens in that cell.
- Drag repo row onto grid column boundary → verify new column is created with git tab.
- Drag repo row within explorer list → verify reordering still works (no grid interference).
- Verify that the git browser loads branches, commits, and diff stat for the dropped repo.
- Drag a file row (existing behaviour) → verify file editor still opens correctly.

### E2E Tests

- Add a Playwright test that uses `page.evaluate` to simulate the native drag-and-drop of a repo row to the grid and verifies the git tab appears.

## Open Questions

None.

## Completion Criteria

- [ ] `tab-grid.ts` shows ghost overlay when dragging repo row over grid.
- [ ] `tab-grid.ts` fires `grid-open-tab` with correct `tabType: "git-repository"` when repo row is dropped on grid.
- [ ] Boundary drops (column edges) create a new column with the git tab.
- [ ] Cell-center drops add the git tab to the existing cell.
- [ ] `Openp41geTabsEventHandler` handles `git-repository` tab type by dispatching the correct workspace command.
- [ ] `window.__pendingGitRepo` is set before the tab is created.
- [ ] `GitRepositoryController` mounts and displays the correct repo's git data.
- [ ] Repo reordering within the explorer list still works (regression test passes).
- [ ] File drag-to-grid still works (regression test passes).
- [ ] Unit tests pass: `nx test`.
- [ ] Type checks pass: `nx typecheck`.
- [ ] Build passes: `nx build`.
