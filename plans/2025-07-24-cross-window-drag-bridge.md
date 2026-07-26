2025-07-24

# Goal

Adapt the Electron cross-window drag overlay to work with openp41ge-tabs' `DragOrchestrator` and `TabDragSource`. When a tab is dragged from one Electron window to another, the ghost overlay and drop targeting must work across window boundaries.

# Rationale

Openp41ge supports multiple Electron windows, and tabs can be dragged between them. The old system used a `drag-overlay.ts` bridge that communicated through Electron IPC to show a drag ghost in other windows. This needs to be adapted to work with openp41ge-tabs' `TabDragSource.createGhost()` and `DragOrchestrator`.

# Approach

## 1. Current state

The cross-window drag system already has some infrastructure:
- `DragGhostManager` — main-process `BrowserWindow` ghost overlay (visible outside the app window)
- `drag-handlers.ts` — IPC handlers: `openp41ge:drag-start`, `openp41ge:drag-move`, `openp41ge:drag-end`, `openp41ge:drag-ghost-show`, `openp41ge:drag-ghost-hide`, `openp41ge:drag-check`
- `init-drag-system.ts` — wires `TabDragSource`, `DragOrchestrator`, target resolver, main-process ghost lifecycle events
- `preload.cjs` — exposes `window.openp41ge.drag.*` methods

The gap: the `openp41ge:drag-check` handler uses an old API (`_dropTargetType`/`_dropPayload`) that no longer exists on the new openp41ge-tabs components. The `DRAG_EVENTS.CROSS` constant exists in the orchestrator but is never dispatched. When a mouseup occurs with no local target, the orchestrator immediately fires `DRAG_EVENTS.DETACH` (create new window) without first checking if the cursor is in another existing window.

## 2. Cross-window detection (init-drag-system.ts)

The `DragOrchestrator` runs in each Electron window. When the cursor moves to another window, the source window stops receiving mousemove/mouseup events. The mouseup fires in the **target window's** JS context, not the source window.

Therefore, cross-window target resolution cannot happen during the source orchestrator's mouseup handler. Instead:

- On mousemove in the source window, use `document.elementFromPoint` to detect when the cursor has left the grid area
- When no local target is found for a sustained period, fire the `CROSS` event to forward cursor position to the main process
- The main process forwards the position to all other windows so they can preview the ghost
- On mouseup in the **target** window, the target window's own orchestrator (or a dedicated handler) resolves the drop

But this requires two orchestrators to share session state, which is complex. A simpler approach:

## 3. Remote drag-state broadcast approach

Since mousemove events stop firing in the source window when the cursor enters another Electron window, the approach is:

1. **Main process tracks active drag session**: On `drag:start`, stores the session (sourceWinId, tabId, title).
2. **Broadcast drag-state to all windows**: On `drag:activate` (fires after the 4px drag threshold is met, not on mousedown), broadcast `drag-state=true` to all windows except the sender.
3. **Each window shows ghost independently**: When `_remoteDragActive=true`, the target window shows a grid ghost overlay on mousemove — no IPC per frame needed.
4. **Target window handles drop on mouseup**: Mouseup in the target window:
   - Queries main process via `getActive()` for drag session data
   - Resolves local target using `openp41geTargetResolver`
   - Dispatches workspace operation (`moveTabBetweenCells` or `splitTabFromCell`)
   - Ends remote session via `endSession()`
5. **Orchestrator DETACH as fallback**: If cross-window drop fails (e.g., cursor wasn't over any valid target), falls through to the existing DETACH → new-window flow.

Key design decisions:
- **No `executeJavaScript`**: Target window resolves locally — avoids IPC roundtrip for drop resolution.
- **No `DRAG_EVENTS.CROSS`**: Each window independently tracks `_remoteDragActive` and shows ghost on local mousemove.
- **Drag activation deferred**: `drag:activate` fires only after drag threshold met (first `DRAG_EVENTS.POSITION`), preventing stale `_remoteDragActive` from click-without-drag.

## 4. Cross-window ghost preview

The ghost overlay in the target window is computed using the same `computeDropTarget` function used by `GridDropTarget.onHover` for same-window drags. This ensures identical split/cell-center classification.

For cross-window, the ghost always shows a column highlight (cell-center) at the column under the cursor, with enhanced visibility via `isFileDrop=true`. The split preview is omitted because the underlying grid in the target window doesn't re-render during the ghost phase — the overlay would show N+1 columns while the actual grid shows N columns, creating visual mismatch.

The drop handler uses `computeDropTarget` to correctly decide move vs. split at drop time.

## 5. Main process session management

- `openp41ge:drag-start`: Creates `_activeSession` with sourceWinId, label, dragData. Shows BrowserWindow ghost.
- `openp41ge:drag-activate`: Broadcasts `drag-state=true` to all other windows.
- `openp41ge:drag-move`: Moves BrowserWindow ghost.
- `openp41ge:drag-end`: Hides ghost, clears session, broadcasts `drag-state=false`.
- `openp41ge:drag-end-session`: As above, but also notifies the source window via `openp41ge:drag-end-session` IPC so it can cancel its orchestrator session.
- `openp41ge:drag-get-active`: Returns active session data to any window.
- `openp41ge:drag-state`: Broadcast sent to all windows to set/clear `_remoteDragActive`.

# Files Changed

| File | Change |
| ---- | ------ |
| `electron/ipc-handlers/drag-handlers.ts` | Update `openp41ge:drag-check` handler: replace `_dropTargetType`/`_dropPayload` with openp41ge-tabs `GridDropTarget`/`TabBarDropTarget` target resolution via `executeJavaScript`. Add `openp41ge:drag-cross-drop` handler for executing drops in target windows. |
| `electron/preload.cjs` | Expand `drag.check` to accept drag data for cross-window drop execution. |
| `src/renderer/services/init-drag-system.ts` | Wire cross-window drop flow: after orchestrator finds no local target, check cross-window via IPC before falling through to DETACH. Listen for cross-window ghost events forwarded via IPC. |
| `packages/openp41ge-tabs/src/orchestrator.ts` | Fire `DRAG_EVENTS.CROSS` when mousemove detects cursor has left the window (elementFromPoint returns null outside the grid).

# Testing Strategy

## Unit tests

- `openp41ge:drag-check` IPC handler: verify it finds the correct target window and returns correct drop metadata
- `init-drag-system.ts`: verify mouseup with no local target invokes cross-window check before DETACH

## Manual test scenarios:

1. Open two windows (Cmd+N)
2. Drag a tab from window A → window B's tab bar → tab appears in B
3. Drag a tab from window A → window B's grid right edge → column split in B
4. Drag a tab from window A back to window A → existing same-window behaviour preserved
5. Cross-window drag of last tab in a cell → creates column split in target window

## E2E

A multi-window Playwright E2E test is ideal but will be added in a separate change (requires test infrastructure for multiple Electron windows).

# Completion Criteria

- [x] Main process `_activeSession` tracks drag state (session store)
- [x] `drag:activate` IPC broadcasts `drag-state=true` only after drag threshold met
- [x] Target window receives `drag-state` via `onDragState` → sets `_remoteDragActive`
- [x] Target window shows grid ghost overlay on mousemove when `_remoteDragActive` is true
- [x] Mouseup in target window queries `getActive()`, resolves local target, dispatches workspace operation
- [x] `endSession()` cleans up session, notifies source window, broadcasts `drag-state=false`
- [x] Tab-bar drop: resolves drop index and dispatches `moveTabBetweenCells`
- [x] Grid cell drop: dispatches `moveTabBetweenCells` to existing cell
- [x] Grid boundary/split drop: dispatches `splitTabFromCell` to create new column
- [x] In-DOM floating ghost suppressed (ghostFactory returns invisible element — only BrowserWindow ghost visible)
- [x] Cross-window DETACH fallback: `_tryCrossWindowDrop` via `drag.check()` for detach-or-destination resolution
- [x] All tests pass

# Remaining Issues

- Ghost overlay shows incorrect type classification in target window (consistently reported as "wrong variation"). Currently simplified to always show column highlight (no split preview) in target window. Drop handler still correctly creates splits.
- Drop handler was using manual boundary calculation that prevented new-cell creation for 1-column grids (`mouseCol > 0` guard). Fixed to use `computeDropTarget` for boundary detection.
