2025-07-29

# Resizable Sidebars — Drag Inside Edge + Respect Minimum Widths

## Goal

Make both sidebars resizable by dragging their inside edge (the boundary between sidebar and editor grid). Fix the window's minimum width to account for two open sidebars at minimum width plus the editor grid's minimum width.

## Current Problems

1. **Resize notch broken**: The `.sidebar-resize-notch` is positioned `absolute` but its parent container (the sidebar's outer `<div>`) lacks `position: relative`. This means the absolute positioning resolves against a distant ancestor, placing the notch at the wrong location.

2. **Window minWidth too small**: Currently hardcoded to `480px` in `window-manager.ts`. When both sidebars are open at their minimum width (200px each = 400px), only 80px remains for the editor grid — far below its minimum of 200px.

## Changes

### 1. Fix resize notch positioning (`openp41ge-sidebar.ts`)

- Add `relative` class to the sidebar's outer `<div>` so the absolute-positioned resize notch sits on the correct edge of the sidebar.
- Left sidebar notch sits on its right edge (`right-0`); right sidebar notch sits on its left edge (`left-0`).
- Verify the `_onResizeMove` cursor delta direction is correct for each side.

### 2. Update window minimum width (`window-manager.ts`)

- Define `SIDEBAR_MIN_WIDTH = 200` and `GRID_MIN_WIDTH = 200` constants.
- Set `minWidth: SIDEBAR_MIN_WIDTH * 2 + GRID_MIN_WIDTH` (= 600px) when both sidebars could be open.
- Currently the window is created once — use worst-case (both sidebars open).

## Files Changed

| File | Change |
|---|---|
| `packages/openp41ge/src/renderer/components/openp41ge-sidebar.ts` | Add `relative` to container div. Fix `_getMaxSidebarWidth` to account for both sidebars dynamically. |
| `packages/openp41ge/electron/window-manager.ts` | Update `minWidth` to 600. |

## Verification

- Open app → drag left sidebar's inside edge → sidebar resizes, notch shows blue line on hover/drag
- Drag right sidebar's inside edge → same behaviour
- Window cannot be resized below 600px wide
- At 600px wide with both sidebars open, editor grid is at least 200px wide
