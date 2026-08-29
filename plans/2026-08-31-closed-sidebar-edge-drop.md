# 2026-08-31 — Drop sidebar tab on a CLOSED sidebar (window-edge indicator)

## Goal
Dragging a sidebar tab must be able to target the **other** sidebar even when
that sidebar is closed. When the cursor comes close enough to the app-window
edge on the closed side, show a drop indicator — a thin vertical line at that
window edge — and dropping moves the tab to that sidebar (auto-opening it).

The edge indicator must **not** show when that sidebar is open (the open
sidebar's own tab bar + drop indicator already handle that surface).

## Approach
1. **`ClosedSidebarDropTarget`** (in `drop-targets/sidebar-drop-target.ts`):
   - `onHover` → paints a fixed vertical line at the window edge on the side it
     targets (`left:0` for left / `right:0` for right, `width:3px`, full height,
     high z-index, `pointer-events:none`).
   - `onDrop` → fires the existing `SIDEBAR_DROP_EVENT` with
     `targetSide = <other>`, `dropIndex = end of that sidebar's tab bar`,
     `sourceSide`/`tabId`/`winId` from `source.getDragData()`. The existing
     `moveSystemTabToSidebar` op already sets `leftSidebarOpen/rightSidebarOpen
     = true`, so the target sidebar opens on drop with no extra dispatch.
   - `onLeave` → removes the indicator div.
2. **Resolver fallback** (`openp41geTargetResolver`, sidebar-tab branch in
   `init-drag-system.ts`): after failing to resolve a real sidebar tab bar /
   content target, if the **other** sidebar is closed and the cursor is within
   `CLOSED_SIDEBAR_EDGE_THRESHOLD` px of the corresponding window edge, resolve
   to the cached closed-edge target for that side. Otherwise `null` (unchanged →
   cross-window events still fire).
3. **Caching / teardown**: cache one closed-edge target per side (same pattern as
   `_getSidebarDropTarget`), null + hide in `_clearSidebarDropTargetCache()`
   (already called on drag teardown), so interrupted drags never leave the edge
   line behind.
4. **Closed-side detection**: `_isSidebarOpen(side)` = the `openp41ge-sidebar[side]`
   host exists, has `offsetHeight > 0`, and lacks `.sidebar-element-hidden`.

## Assumptions (state explicitly)
- `CLOSED_SIDEBAR_EDGE_THRESHOLD = 160` — the "close enough" distance from the
  window edge. Tuneable constant; adjust if the user finds it too eager/late.

## Completion criteria
- Unit test(s) for `ClosedSidebarDropTarget` (jsdom): hover shows a vertical
  indicator at the correct edge; drop fires `sidebar-tab-drop` with the right
  `targetSide`/`dropIndex` and hides the indicator; leave hides it; interrupted
  state is clean.
- Live (HMR): right-sidebar tab dragged to left edge with left sidebar closed →
  vertical line at left edge; release → tab lands in the left sidebar and it
  opens. Left sidebar open → no edge line (only the normal bar indicator).
- `nx run-many -t typecheck`, `nx lint`, prettier, `nx run-many -t test` green.
