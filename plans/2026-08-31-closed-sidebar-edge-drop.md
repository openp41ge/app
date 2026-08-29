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

## Status — DONE
- `ClosedSidebarDropTarget` added (new file `drop-targets/closed-sidebar-drop-target.ts`,
  one class per file per oxlint `max-classes-per-file`); `getTabButtonsInSidebarBar`
  exported from `sidebar-drop-target.ts` for reuse.
- Resolver: sidebar branch now keys off the drag's sidebar side (live source during
  moves; remembered `_sidebarTabDragSide` for the final mouseup resolve — the
  orchestrator fires DRAG_EVENTS.END → host teardown nulls `_currentSource` BEFORE
  resolving the drop target, so the final resolve must not depend on it).
  `_sidebarTabDragSide` is set on sidebar-tab mousedown, cleared when a grid-tab /
  file drag starts and on interruption (no leakage into other gestures).
- Edge target cached per side; `_clearSidebarDropTargetCache()` hides any live edge
  indicator on teardown (no leftover line after interrupted drags).
- Live-verified (HMR): closed-left-edge drop moves Explorer right→left and auto-opens
  the left sidebar (`moveSystemTabToSidebar` already flips the open flag); no edge
  line when the left sidebar is open; normal open-sidebar cross-drop + reorder intact;
  no stranded ghost window; state restored.
- Tests: 943/943 (7 new); tsc/lint/knip/prettier clean.
- Assumption: `CLOSED_SIDEBAR_EDGE_THRESHOLD = 160`.

## Commits
- `74ba801` plan.
- Pending (offered to user): tab/sidebar bitmap-ghost batch (main-process drag-handlers,
  preload, global.d.ts, drag-ghost-manager) + closed-sidebar edge-drop feature.

## Follow-up round (same day) — two refinements

### 1. Keep a tab active when the active sidebar tab moves out
- Added `lastAccessedAt` (ISO timestamp, nullable) to `SidebarTabSchema` (types.ts).
- `activateSystemTab`, `openSystemTab` (both branches), and `moveSystemTabToSidebar`
  now stamp `lastAccessedAt` via `touchSystemTab`.
- `moveSystemTabToSidebar`: when the moved tab WAS the source-side active tab, it now
  activates the remaining tab with the most recent `lastAccessedAt`
  (`mostRecentlyAccessedSystemTab`; legacy nulls → first-in-list; empty → null) instead
  of blanking the sidebar.
- Layout ops run in the MAIN process (operation-dispatcher.ts) → required
  `build:electron` + full dev restart (verified live after rebuild).

### 2. Closed-sidebar edge indicator geometry
- Indicator now spans only the sidebar area: `top: TITLEBAR_HEIGHT(35px)` (stops below the
  title bar) and `bottom: WINDOW_BOTTOM_CORNER_RADIUS(10px)` with a matching
  `border-bottom-left/right-radius` so the bottom follows the window's rounded corner
  (side-dependent; macOS default radius — tuneable constant).
- Tests updated (top 35px / bottom 10px / correct rounded corner per side).

### Status
Verified live: active tab moved out → source sidebar activates the most-recently-used
remaining tab (not blank) + edge indicator constrained to sidebar area with rounded bottom.
948/948 tests, prettier/oxlint/knip/tsc clean.

## Follow-up (same day) — no-op reorder indicator suppression
- `SidebarDropTarget.onHover` now suppresses ONLY the precise vertical insert bar when a
  same-sidebar drop would not move the dragged tab: `dropIndex === fromIndex` (right before
  itself) or `dropIndex === fromIndex + 1` (right after itself) — the same condition `onDrop`
  already uses to refuse the reorder. The sidebar-wide overlay is retained, so hovering still
  visibly targets the sidebar (per user clarification: only the short bar should hide).
- Added 5 unit tests (mocked tab rects for deterministic dropIndex; bar visibility = element
  mounted AND displayed): bar hidden but overlay kept before-self / after-self, bar shown when
  it actually moves, bar shown for cross-sidebar, lone tab → bar hidden + overlay kept.
  953/953 tests, prettier/oxlint/knip/tsc clean; renderer-only (HMR).
- Live-verified with a real held drag: overlay shown at every hover; the vertical bar appears
  only at positions that actually move the tab; release at a no-op leaves the order unchanged.
