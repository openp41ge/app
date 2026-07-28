2026-07-27

# Fix File Editor Tab Creation and Tab Drag Flow

## Goal

Fix the file-editor (`<file-editor>` backed by `FileEditorController`) so that:
1. Dragging a file from the OS or file tree onto the grid creates a working file-editor tab
2. Dragging an existing file-editor tab to another cell (same window or another window) re-mounts correctly without blank/invisible content
3. Cross-window tab moves preserve editor state (file path, content model)

## Rationale

The file editor currently fails when tabs are created via file drop or moved between cells/windows. The root causes are:

- **Orphaned controller containers**: When a tab moves between cells, the grid re-renders and detaches the controller's container from the DOM. `TabMountManager.sync()` reuses the mount entry but never re-attaches the container, leaving it detached — content appears blank/invisible.

- **Fragile global `__pendingFilePath`**: The file path is passed between the file-drop handler and the controller via a module-level global (`window.__pendingFilePath`). This races with concurrent file opens and overrides the canonical file path stored in the workspace tab config.

- **Lost editor state on cross-window moves**: When a tab moves to another window, the controller is destroyed in the source window and a new one is created in the target window. The `TabController` interface has `snapshot()`/`restore()` for session persistence but they aren't used for tab moves. Cross-window moves lose cursor position, scroll state, and undo history.

## Approach

### 1. Fix `TabMountManager.sync()` — Re-mount containers on grid re-render

**Problem**: `sync()` reuses mount entries for tabs that already have controllers but never re-attaches the container to the correct cell's `<tab-content>` after the grid re-renders.

**Fix**: After looking up an existing mount entry, call `grid.mountController(tabId, entry.container)` to ensure the container is attached to the correct cell's controller slot. `mountController()` already handles the re-parenting correctly — it finds the `<div class="tab-content-controller">` inside the pane with matching `[data-tab-id]` and appends the container if it isn't already a child.

**File**: `packages/openp41ge/src/renderer/services/tab-mount-manager.ts`

In `sync()`:
```typescript
// After getting the entry:
if (grid) {
  grid.mountController(tabId, entry.container);  // NEW: re-mount on every sync
}
// Remove the old `if (!grid) { this._injectIntoCell(...) }` fallback
```

### 2. Fix `FileEditorController` — Use config as primary file path source

**Problem**: The controller reads `window.__pendingFilePath` in `mount()`, overriding the file path that `restore()` already set from `tab.config.filePath`. This global is set in `file-drop-handler.ts` and `file-open-handler.ts` before an async IPC round-trip, so it can be stale or wrong by the time the controller mounts.

**Fix**: Remove the `__pendingFilePath` override in `mount()`. The file path is already set by `restore()` before `mount()` is called (see `_getOrCreateEntry`). The controller should trust the path from its tab config.

**File**: `packages/openp41ge/src/renderer/apps/file-viewer/file-editor-controller.ts`

In `mount()`:
- Remove the `window.__pendingFilePath` block
- `this.filePath` is already set by `restore()` from `tab.config.filePath`

### 3. Clean up global declarations

**Problem**: `window.__pendingFilePath`, `window.__pendingFileName` are declared in `global.d.ts` but used as a fragile back-channel. After fixing #2, they're only used for the `restore()` default (already handled by config).

**Fix**: Remove unused `__pendingFilePath` and `__pendingFileName` assignments from file-drop-handler.ts. Keep the declarations in `global.d.ts` for backward compat during migration but mark them deprecated.

### 4. Preserve editor state across cross-window tab moves (optional stretch)

**Problem**: When a tab moves windows, `_removeOrphans` calls `entry.controller.unmount()` and `entry.container.remove()`. A new controller is created in the target window. The `FileEditorController` recreates everything from scratch.

**Fix**: Before unmount, call `entry.controller.snapshot()` and store the result as a workspace-level property (e.g., `tab.config._movedState`). In `_getOrCreateEntry`, after `restore()`, apply the moved state. This preserves cursor position, scroll position.

However, the model is already shared via `ModelRegistry`, so content state is preserved. The main loss is ephemeral UI state. This can wait for a follow-up.

## Files Changed

| File | Change |
|------|--------|
| `packages/openp41ge/src/renderer/services/tab-mount-manager.ts` | Re-mount controller container on every `sync()` to fix orphaned DOM on tab move |
| `packages/openp41ge/src/renderer/apps/file-viewer/file-editor-controller.ts` | Remove `__pendingFilePath` override in `mount()` |
| `packages/openp41ge/src/renderer/services/file-drop-handler.ts` | Remove `__pendingFilePath`/`__pendingFileName` assignment (no longer needed) |
| `packages/openp41ge/src/renderer/services/file-open-handler.ts` | Remove `__pendingFilePath`/`__pendingFileName` assignment (no longer needed) |

## Testing Strategy

**Integration tests** (Vitest):

1. **TabMountManager sync test** — Create a scenario with two columns and a mounted controller. Simulate a workspace state change that moves the tab to another column. Call `sync()` and verify the controller container is re-attached to the correct column's DOM.

2. **FileDropHandler flow test** — Verify that a `grid-open-tab` event with file path results in a tab with `config.filePath` set correctly in the workspace state.

3. **FileEditorController mount test** — Verify that `mount()` uses the file path from `restore()` (tab config) and ignores `__pendingFilePath`.

**Manual verification** (dev mode):
- Drag a file from the file tree onto the grid → file editor opens with content
- Drag a file from OS (Finder) onto the grid → file editor opens with content
- Drag a file-editor tab to another column → editor re-appears, functional
- Open same file in two windows, drag tab between windows → file loads in target window

## UX Considerations

- **No visual change**: The fix makes existing behaviour work correctly — no new UI elements.
- **Loading state**: File editor already shows a loading state. When a tab moves between cells, the brief re-mount should be transparent (the model is already loaded).
- **Focus**: After tab move, the active tab should receive focus. Already handled by `grid-activate` → `activateTabInCell`.

## Open Questions

1. Should we preserve scroll/cursor state on cross-window moves? It's a nice-to-have but adds complexity. Current plan defers it.

2. The `__pendingFilePath` and `__pendingFileName` globals are also used in `topbar-drop-target.ts` — should we remove them there too? (Yes, as part of this cleanup.)

## Completion Criteria

- [x] `TabMountManager.sync()` re-mounts controller containers on every sync, not just on first creation
- [x] File drag-to-grid creates a working file-editor tab with content loaded (file path passed through config, not global)
- [x] Tab drag-to-another-cell re-mounts the editor in the correct column
- [x] Cross-window tab drag opens the editor in the target window
- [x] No regressions in existing tab operations (reorder, close, activation)
- [x] All existing tests pass (767/767, 41 test files)
- [x] `__pendingFilePath` removed as a dependency for file-editor controller

## Changes Made

### 1. `SubscribeStateUpdatesStep._render()` — Fix timing race with Lit update cycle
**File**: `packages/openp41ge/src/renderer/bootstrap/steps/subscribe-state-updates.step.ts`

Added `await (el as Openp41geWindowviewElement).updateComplete` after setting `windowData` and before calling `sync()`. 

**Problem**: Setting `.windowData` on the Lit `openp41ge-windowview` element queues an async microtask for the re-render. `sync()` was called synchronously after setting properties, before the microtask fired. This meant `grid.placements` were still stale from the previous render cycle. When `grid.mountController()` searched placements for the tab, it couldn't find it (new tabs) or found the wrong column (moved tabs), causing the controller container to be appended to the wrong column or orphaned.

**Fix**: Awaiting `updateComplete` on the windowview ensures the Lit update cycle completes first — the windowview re-renders, sets the grid's updated `.placements` property, and the grid re-renders — before `sync()` mounts controllers.

### 2. `TabMountManager.sync()` — Re-mount containers on every sync
**File**: `packages/openp41ge/src/renderer/services/tab-mount-manager.ts`

After obtaining a mount entry (existing or new), calls `grid.mountController(tabId, entry.container)` on every sync iteration. This ensures the container is re-parented to the correct column's `<tab-content>` controller slot after Lit re-renders the grid.

### 3. `FileEditorController.mount()` — Use config as primary file path source
**File**: `packages/openp41ge/src/renderer/apps/file-viewer/file-editor-controller.ts`

Removed the `window.__pendingFilePath` block in `mount()`. The file path is already set by `restore()` from `tab.config.filePath` before `mount()` is called (see `_getOrCreateEntry` in `tab-mount-manager.ts`).

### 4. Removed `__pendingFilePath`/`__pendingFileName` assignments
**Files**:
- `packages/openp41ge/src/renderer/services/file-drop-handler.ts` — removed globals from `_handleFileDrop`
- `packages/openp41ge/src/renderer/services/file-open-handler.ts` — removed globals from `handleOpenFile` (2 locations) and `_openFile`
- `packages/openp41ge/src/renderer/apps/file-viewer/index.ts` — updated comment to reflect new approach
- `packages/openp41ge/src/renderer/global.d.ts` — marked globals as `@deprecated`

### Verification
- `nx run openp41ge:test` — 767 tests pass (41 test files)
- Typecheck shows only pre-existing errors (unrelated to our changes)
