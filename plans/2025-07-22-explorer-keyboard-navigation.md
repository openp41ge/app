2025-07-22

# Feature: Keyboard navigation in the worktree explorer

## Problem

The worktree explorer (file tree) currently has no keyboard navigation.
Users can only navigate by clicking rows with the mouse. Unlike VS Code's
explorer, there is no:

- **Row selection**: Clicking a file row doesn't visually "select" it
- **Arrow key navigation**: Up/Down arrows don't move through tree rows
- **Expand/collapse via keyboard**: Left/Right arrows don't expand folders
  or collapse them
- **Enter to open**: No keyboard shortcut to open the selected file

## Current State

In `openp41ge-worktree-tree.ts`:

```typescript
private _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
        this.close();
    }
};
```

Only `Escape` is handled. There is no selection state, no focus tracking,
and no keyboard traversal.

### Tree Structure

The explorer has three hierarchical levels, all rendered with inline styles
(no `<ul>`/`<li>` structure):

```
openp41ge-worktree-tree
├── openp41ge-repo-tree-item (repo "my-repo")
│   ├── Worktree row (branch "main")        ← click expands/collapses files
│   │   ├── File/folder rows               ← click opens/toggles
│   │   │   ├── src/
│   │   │   │   ├── index.ts
│   │   │   │   └── utils/
│   │   │   └── package.json
│   └── Worktree row (branch "feature")
│       └── ...
├── openp41ge-repo-tree-item (repo "other-repo")
│   └── ...
└── "Add repo" / "Add worktree" rows
```

## Solution

Add a keyboard navigation system to the worktree explorer that provides:

1. **Visible row selection** — clicking a row highlights it (`_selectedPath`
   state), and the highlight follows keyboard navigation
2. **ArrowUp / ArrowDown** — move selection to the previous/next visible row
   in tree order, wrapping at edges
3. **ArrowRight** — expand a collapsed repo, worktree, or folder; move into
   the first child if currently collapsed; open a file if it's a file row
4. **ArrowLeft** — collapse an expanded repo, worktree, or folder; if the
   row is a file or already collapsed, move selection to the parent row
5. **Enter** — open a file (same as single-click); expand/collapse a
   folder, worktree, or repo (same as click)
6. **Home / End** — jump to first/last visible row

## SOLID Principles Alignment

### Single Responsibility — openp41ge-worktree-tree does too much

`openp41ge-worktree-tree.ts` currently handles:

1. Rendering the tree DOM
2. Managing selection state
3. Keyboard event handling and navigation
4. Mouse click handling
5. Scroll-into-view
6. Drag-and-drop initialization
7. Context menu management

**Refactoring target**: Extract navigation and selection into separate classes:

```typescript
// 1. Selection management
interface ITreeSelectionManager {
  readonly selectedRow: RowId | null;
  select(row: RowId): void;
  clear(): void;
  onSelectionChange(callback: (row: RowId | null) => void): void;
}
class Openp41geTreeSelectionManager implements ITreeSelectionManager {
  // ...manages selected row state, emits change events
}

// 2. Keyboard navigation (stateless — receives selection, returns navigation commands)
interface ITreeKeyboardNavigator {
  handleKeyDown(
    event: KeyboardEvent,
    visibleRows: RowData[],
    currentSelection: RowId | null,
  ): NavigationCommand | null;
}

type NavigationCommand =
  | { type: "select"; rowId: RowId }
  | { type: "expand"; rowId: RowId }
  | { type: "collapse"; rowId: RowId }
  | { type: "open-file"; rowId: RowId }
  | { type: "activate"; rowId: RowId }
  | { type: "close" }
  | { type: "none" };

class WorktreeTreeKeyboardNavigator implements ITreeKeyboardNavigator {
  // ...pure logic: maps key events to NavigationCommand values
}

// 3. Scroll controller
interface ITreeScrollController {
  scrollRowIntoView(rowEl: HTMLElement): void;
}
class Openp41geTreeScrollController implements ITreeScrollController {
  constructor(private _container: HTMLElement) {}
}

// openp41ge-worktree-tree becomes thin orchestrator
class Openp41geWorktreeTree extends LitElement {
  private _selectionManager: ITreeSelectionManager = new Openp41geTreeSelectionManager();
  private _navigator: ITreeKeyboardNavigator = new WorktreeTreeKeyboardNavigator();
  private _scrollController: ITreeScrollController | null = null;

  // Inject for testing
  setSelectionManager(mgr: ITreeSelectionManager): void { ... }
  setNavigator(nav: ITreeKeyboardNavigator): void { ... }
}
```

### Open/Closed

- New navigation keys (e.g., `Ctrl+Shift+[` / `]` for navigate to parent repo)
  can be added by extending `WorktreeTreeKeyboardNavigator` or registering
  additional key handlers — no need to modify `openp41ge-worktree-tree`.
- The `NavigationCommand` discriminated union is extensible: new command
  types can be added without changing existing handlers.

### Dependency Inversion

- `Openp41geWorktreeTree` depends on `ITreeSelectionManager`, `ITreeKeyboardNavigator`,
  and `ITreeScrollController` interfaces.
- Production: inject real implementations.
- Tests: inject `TestTreeSelectionManager` and `TestTreeKeyboardNavigator`
  via `page.evaluate()` (matching the existing model-based DI pattern).

### Interface Segregation

- `ITreeSelectionManager`: select/clear/observe — 3 methods
- `ITreeKeyboardNavigator`: single method `handleKeyDown()` returning a command
- `ITreeScrollController`: single method `scrollRowIntoView()`
- Each interface describes exactly one capability.

### Liskov Substitution — Row types

The `RowId` discriminated union is an enum-like pattern:

```typescript
type RowId =
  | { type: "repo"; repoName: string }
  | { type: "worktree"; repoName: string; branch: string }
  | { type: "file"; branch: string; path: string }
  | { type: "add-repo" }
  | { type: "add-worktree"; repoName: string };
```

This is clean but would be more SOLID-aligned as an interface hierarchy:

```typescript
interface IRowId {
  readonly type: string;
}
interface IRepoRowId extends IRowId {
  readonly type: "repo";
  readonly repoName: string;
}
interface IWorktreeRowId extends IRowId {
  readonly type: "worktree";
  readonly repoName: string;
  readonly branch: string;
}
// ...etc
```

This allows polymorphic handling: `switch (row.type)` becomes `row.doSomething()`
when the behavior differs by row type.

### Impact on `openp41ge-repo-tree-item`

The child component `Openp41geRepoTreeItem` should also depend on
`ITreeSelectionManager` (injected) rather than receiving `selectedRowId` as
an `@property`. This decouples the child from the parent's rendering cycle.

## Implementation Plan

### Phase 1: Add selection state and row identification

Add a module-level or component-level selection ID that identifies the
currently "focused" tree row. Each row must have a unique, stable
identifier.

```typescript
// In openp41ge-worktree-tree.ts
type RowId =
  | { type: "repo"; repoName: string }
  | { type: "worktree"; repoName: string; branch: string }
  | { type: "file"; branch: string; path: string }
  | { type: "add-repo" }
  | { type: "add-worktree"; repoName: string };
```

Store the selected ID:

```typescript
private _selectedRow: RowId | null = null;
```

### Phase 2: Add visual selection to rows

Add a CSS class or inline style for the selected row:

```css
.wt-row-selected {
  background: rgba(74, 158, 255, 0.15) !important;
  outline: none;
}
```

In each row renderer (`openp41ge-repo-tree-item`), check if the current row
matches `_selectedRow` and apply the highlight class.

**Challenge**: Rows are rendered inside `<openp41ge-repo-tree-item>` (a Lit
component), but the selection state lives in `<openp41ge-worktree-tree>` (the
parent). The selection state needs to be communicated down.

**Approach**: Pass `selectedRowId` as a property or attribute to
`<openp41ge-repo-tree-item>`, or dispatch custom events for selection
changes. The cleanest approach:

- Add `@property() selectedRowId: string | null` to `Openp41geRepoTreeItem`
- The parent sets this property when selection changes
- Each row `<div>` checks `selectedRowId` against its own row ID and
  applies the highlight class

### Phase 3: Build the visible row index

To navigate with arrow keys, we need a flat ordered list of ALL currently
visible rows in tree order. This must be recomputed whenever:

- A repo is expanded/collapsed
- A worktree is expanded/collapsed
- A directory is expanded/collapsed
- Files finish loading

**Approach**: Add a method `_computeVisibleRows(): RowData[]` that walks
the tree state (repos, expanded worktrees, expanded dirs, loaded files)
and returns a flat ordered array. This can be computed on demand when
arrow keys are pressed, rather than maintained reactively, to avoid
complexity.

### Phase 4: Implement keyboard handlers

Replace the stub `_onKeyDown` with a full handler:

```typescript
private _onKeyDown = (e: KeyboardEvent): void => {
    switch (e.key) {
        case "ArrowDown":
            e.preventDefault();
            this._selectNextRow(1);
            break;
        case "ArrowUp":
            e.preventDefault();
            this._selectNextRow(-1);
            break;
        case "ArrowRight":
            e.preventDefault();
            this._expandOrOpenSelected();
            break;
        case "ArrowLeft":
            e.preventDefault();
            this._collapseOrGoToParent();
            break;
        case "Enter":
            e.preventDefault();
            this._activateSelected();
            break;
        case "Home":
            e.preventDefault();
            this._selectFirstRow();
            break;
        case "End":
            e.preventDefault();
            this._selectLastRow();
            break;
        case "Escape":
            this.close();
            break;
    }
};
```

### Phase 5: Implement navigation methods

**`_selectNextRow(direction: number)`**:

1. Get the flat visible row list
2. Find the current `_selectedRow` index (or start at -1/0 if none)
3. Compute new index = current + direction, clamped to [0, rows.length - 1]
4. Set `_selectedRow` to the new row's ID
5. Call `_scrollRowIntoView(newRow)` to ensure the row is visible
6. Update visual highlight

**`_expandOrOpenSelected()`**:

- For a collapsed repo/worktree/folder: dispatch the expand event
- For a file: dispatch the open file event

**`_collapseOrGoToParent()`**:

- For an expanded repo/worktree/folder: dispatch collapse event
- For a file (or already-collapsed item): find the parent row in the
  visible tree and select it

**`_activateSelected()`**:

- Same as a click on that row — dispatches the appropriate event

### Phase 6: Scroll selected row into view

When selection moves via keyboard, the row must be scrolled into the
visible area if it's off-screen:

```typescript
private _scrollRowIntoView(rowEl: HTMLElement): void {
    const container = this._treeEl;
    if (!container) return;
    const rowRect = rowEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    if (rowRect.bottom > containerRect.bottom) {
        container.scrollTop += rowRect.bottom - containerRect.bottom;
    } else if (rowRect.top < containerRect.top) {
        container.scrollTop -= containerRect.top - rowRect.top;
    }
}
```

### Phase 7: Add row `data-*` attributes for DOM lookup

Each row's DOM element needs a `data-row-id` attribute so:

1. The selection highlight can be applied via attribute selector
2. `_scrollRowIntoView` can find the element
3. Click handlers can determine which row was clicked

```html
<div data-row-id="repo:my-repo" ...>
  <div data-row-id="worktree:my-repo:main" ...>
    <div data-row-id="file:main:src/index.ts" ...></div>
  </div>
</div>
```

### Phase 8: Update click handler to set selection

When a row is clicked (mousedown or click), set `_selectedRow` to that
row's ID and apply the highlight. This makes the selection follow mouse
clicks too.

```typescript
// In row click handler
private _onFileClick(e: MouseEvent, path: string, name: string): void {
    this._selectedRow = { type: "file", branch, path };
    // .. existing logic
}
```

## Files to Change

### Primary

1. **`packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts`**
   - Add `_selectedRow: RowId | null` state
   - Replace stub `_onKeyDown` with full arrow/enter handler
   - Add `_computeVisibleRows()`, `_selectNextRow()`, `_expandOrOpenSelected()`,
     `_collapseOrGoToParent()`, `_activateSelected()`, `_scrollRowIntoView()`
   - Add `data-row-id` attributes to all row containers
   - Update click handlers to also set `_selectedRow`
   - Pass `selectedRowId` to `<openp41ge-repo-tree-item>` components

2. **`packages/openp41ge/src/renderer/components/openp41ge-repo-tree-item.ts`**
   - Add `@property() selectedRowId: string | null`
   - Apply `.wt-row-selected` class to rows matching `selectedRowId`
   - Add `data-row-id` attributes to repo header, worktree rows, and file rows
   - Forward keyboard events up to parent, or let the parent handle via
     event delegation

### Secondary

3. **`packages/openp41ge/src/renderer/services/repo-tree-renderer.ts`**
   - Add `data-row-id` attributes to the rows rendered via `innerHTML`
     (the "Add repo" / "Add worktree" rows)
   - These are rendered as raw HTML strings, not Lit templates, so they
     need manual attribute addition

## Interaction with Existing Features

- **Drag-and-drop**: Keyboard selection should not interfere with
  drag-and-drop. Mousedown on a selected row starts a drag only after
  the 4px threshold (as per the ghost-on-click fix). The selection
  highlight does not affect `draggable="true"` behavior.

- **Context menu**: Keyboard selection should persist during context menu
  display. Right-clicking a row should select it AND show the context menu.

- **Edit mode**: Keyboard navigation should work in both normal and edit
  modes. The eye icon toggle button in edit mode should not interfere with
  row selection (pressing ArrowRight on an edit-mode row should expand it,
  not toggle visibility).

## Test Plan

1. Open the explorer with multiple repos, worktrees, and files
2. Click on a file row — verify it gets a blue highlight background
3. Press ArrowDown — verify selection moves to the next visible row
4. Press ArrowUp — verify selection moves up
5. Select a collapsed repo — press ArrowRight — verify it expands
6. Select an expanded repo — press ArrowLeft — verify it collapses
7. Select a collapsed folder — press ArrowRight — verify it expands and
   selection enters the first child
8. Select an expanded folder — press ArrowLeft — verify it collapses
9. Select a file — press Enter — verify the file opens in an editor tab
10. Press Home — verify selection jumps to the first row
11. Press End — verify selection jumps to the last row
12. Click a different row — verify selection moves to the clicked row
13. Scroll the tree — use ArrowDown past the visible area — verify the
    tree auto-scrolls to keep the selected row visible
