2026-09-02

# Workspace Manager redesign

Rename the top-level picker from "Window Manager" to "Workspace Manager", move
"Show workspace manager" into a new "Workspace" menu, and replace the card list
with rows that show a mini workspace-window skeleton on the left (draggable out
to open the workspace window).

## Goal
The top-level window is a workspace manager: rows (not cards) with a miniature
preview of a workspace window on the left, the workspace name to its right, and a
drill-in chevron on the far right. Dragging the skeleton out of the window opens
that workspace's window (replacing the long-press).

## Approach
- Rename user-facing labels: title bar "Window Manager" -> "Workspace Manager";
  menu "Show Window Manager" -> "Show Workspace Manager" under a new "Workspace"
  menu; keep "Add Workspace Window" under the Window menu. (Internal
  `window-manager` identifiers unchanged — that's the component/type name.)
- Row layout: `[mini window skeleton] [name + meta] [chevron]`. Skeleton shows a
  title bar, an open sidebar, and grid-tab placeholders. Delete mode swaps the
  chevron for a checkbox.
- Remove the long-press fill. Replace with a pointer-based drag on the skeleton:
  pointerdown + move past a threshold -> a floating ghost follows the pointer;
  release -> open the workspace window. Gated off for already-open workspaces
  (the skeleton then reads as a static preview, `cursor: default`).

## Completion criteria
- Menu has a "Workspace" menu with "Show Workspace Manager"; Window menu keeps
  "Add Workspace Window" and no longer lists "Show Window Manager".
- Top-level rows render the skeleton and chevron; card layout and Open pill gone.
- Drag skeleton out -> opens the workspace window; row click -> opens the drawer.
- Typecheck + lint + tests green; live-verified in both dev windows.

## Status: DONE
- [x] Title bar -> "Workspace Manager"; new "Workspace" menu with "Show Workspace
      Manager"; Window menu keeps "Add Workspace Window", drops "Show Window
      Manager". (`openp41ge-application.ts` — main process, restarted dev.)
- [x] Rows: mini window skeleton (title bar + dots, sidebar, grid tabs) on the
      left, name + meta to the right, chevron on the right; `ws-row--open` class
      when open. Card layout, Open pill, and window-count pill removed.
- [x] Long-press fill removed. Pointer drag on the skeleton spawns a floating
      ghost (`.drag-ghost`); release opens the workspace window (`_openWorkspaceWindow`).
      Gated off for already-open workspaces; `pointercancel`/teardown cleans the ghost.
- [x] Add-workspace inline card now uses a skeleton thumb; delete mode swaps
      chevron for checkbox.
- [x] `nx run-many -t typecheck` clean; `nx lint` clean; `nx run openp41ge:test`
      1101/1101 pass; live-verified (title, rows, drag+release, cancel, delete mode).
