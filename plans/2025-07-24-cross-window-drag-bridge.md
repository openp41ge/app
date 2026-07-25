2025-07-24

# Goal

Adapt the Electron cross-window drag overlay to work with openp41ge-tabs' `DragOrchestrator` and `TabDragSource`. When a tab is dragged from one Electron window to another, the ghost overlay and drop targeting must work across window boundaries.

# Rationale

Openp41ge supports multiple Electron windows, and tabs can be dragged between them. The old system used a `drag-overlay.ts` bridge that communicated through Electron IPC to show a drag ghost in other windows. This needs to be adapted to work with openp41ge-tabs' `TabDragSource.createGhost()` and `DragOrchestrator`.

# Approach

## 1. Cross-window ghost bridge

The openp41ge-tabs `TabDragSource` accepts an optional `ghostFactory` parameter for custom ghost creation. Use this to create an Electron `BrowserWindow`-based ghost:

```typescript
const source = new TabDragSource(
  tabBtn,
  tabId,
  winId,
  worksetId,
  undefined, // title
  () => {
    // Custom ghost factory for cross-window support
    const ghost = document.createElement("div");
    ghost.textContent = title;
    ghost.style.cssText = "position:fixed;z-index:99999;pointer-events:none;...";
    return ghost;
  },
);
```

When dragging, if the cursor leaves the current window's bounds (detected via `document.elementFromPoint` returning null), signal the main process to show a cross-window drag indicator in other windows.

## 2. IPC bridge

The old `drag-overlay.ts` used IPC messages:

- `drag:start` — notify other windows a drag has started
- `drag:move` — update cursor position in other windows
- `drag:end` — clean up in other windows
- `drag:drop` — complete the drop in the target window

These same IPC messages should be adapted to carry the openp41ge-tabs drag data format (tabId, winId, worksetId).

## 3. Target resolution across windows

The `targetResolver` function uses `document.elementFromPoint`, which only works within the current window. For cross-window drops, the target is resolved by:

1. The orchestrator detects the cursor has left the window (elementFromPoint returns null or a different winId)
2. Sends an IPC message to the main process with the cursor position
3. The main process determines which window the cursor is over
4. Sends the cursor position to that window's renderer
5. That window's orchestrator resolves the target locally
6. If a target is found, the drop is executed in that window's context

# Files Changed

| File                                                    | Change                                                   |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `electron/ipc-handlers/drag-ipc-handler.ts`             | Update IPC message shapes for openp41ge-tabs data format |
| `electron/preload.cjs`                                  | Expose cross-window drag methods                         |
| `src/renderer/drag-overlay.ts`                          | Adapt for openp41ge-tabs `ghostFactory`                  |
| `src/renderer/services/openp41ge-tabs-event-handler.ts` | Handle cross-window `grid-move` and `grid-split` events  |

# Testing Strategy

Testing cross-window drag requires two Electron windows. This should be tested manually or with a multi-window Playwright E2E test.

## Manual test scenarios:

- Drag a tab from window A → window B's tab bar → tab appears in B
- Drag a tab from window A → window B's grid right edge → column split in B
- Cross-window drag ghost shows in target window
- Ghost follows cursor across window boundaries

# Completion Criteria

- [ ] `TabDragSource.ghostFactory` used for custom cross-window ghost
- [ ] IPC bridge updated for openp41ge-tabs drag data
- [ ] Cross-window target resolution works
- [ ] Tab can be dragged from window A to window B
- [ ] Build passes
