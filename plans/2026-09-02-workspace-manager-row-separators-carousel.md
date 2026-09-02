2026-09-02

# Workspace Manager rows: separators + state-driven window skeleton carousel

Redesign the workspace-manager rows from cards into flat rows with separators,
make the mini window skeleton reflect the real workspace window state (sidebars
open, grid columns), and turn the skeleton into a carousel that slides through
each window in the workspace.

## GitHub
- Keep rows flat (no card borders/radius). Separator (border-bottom) between
  rows. The last row gets a trailing separator ONLY when the list does not
  overflow (content fits the viewport), so there's a bottom line when rows don't
  reach the fold but no double bottom border when the last row sits below the
  fold and scrolls into view.
- Skeleton grid = vertical columns only (we only split horizontally).
- Skeleton sidebar rows become small rectangles (shorter, tighter spacing).
- Skeleton layout is driven by the workspace's shared sidebar open state and
  each window's grid (cells/columns). A carousel slides through every window in
  the workspace; horizontal drag cycles windows, vertical drag-out opens the
  workspace window.

## Approach (renderer — `openp41ge-window-manager.ts`)
- Replace card CSS on `li.ws-row` with a flat row + `border-bottom` separator;
  add `ws-row--last` / `ws-row--last-visible` so the last row's separator is
  conditional on whether the list overflows. Measure `.wm-body` scroll vs client
  height in `updated()` (and on window resize) to toggle `_listOverflows`.
- New skeleton structure per window:
  `ws-thumb > ws-thumb-chrome + ws-carousel > ws-carousel-track > ws-win*`
  where each `ws-win` is `[left sidebar?][grid columns][right sidebar?]`.
  Sidebar presence = `sharedSidebars.leftSidebarOpen` / `rightSidebarOpen`;
  grid cells = `window.grid` placements (or cols) rendered as vertical columns.
- Carousel: `_carouselIndex: Map<path, number>`; `ws-carousel-track` slides via
  `translateX(-idx*100%)`; dots indicate the active window. Horizontal drag on
  the thumb cycles the index; vertical drag keeps the existing drag-out → open.
  Gate the drag for already-open workspaces (static preview) as before.

## Approach (main — request 5 "reopen windows")
- Preserve windows on app quit: set `_isQuitting` in `before-quit`; the window
  `closed` handler skips `closeWindow` when quitting, so a Cmd+Q leaves all
  windows in `data.windows` and `_openWorkspaceSession` restores them. Closing
  windows one-at-a-time (no quit in progress) still removes the window.

## Completion criteria
- Rows are flat with separators; the last row's separator is conditional on
  overflow (no double bottom border).
- Skeleton grid is vertical columns; sidebar rows are small rectangles.
- Skeleton reflects left/right sidebar open state + grid cell count; multi-window
  workspaces show a carousel (dots + slide through windows).
- Horizontal drag cycles the carousel; vertical drag-out opens the workspace.
- Quitting the app preserves open windows so reopening restores them all.
- Typecheck + lint + tests green; live-verified in dev.

## Status: DONE
- [x] Rows are flat (no card border/radius/background) with a `border-bottom`
      separator between rows. Last row gets a trailing separator only when the
      list fits the viewport (`_listOverflows` measured in `updated()` + resize).
      A folded (below-the-fold) last row drops the separator so no double border
      when it scrolls into view.
- [x] Skeleton grid is vertical columns (`ws-win-grid` is flex rows of full-height
      cells, one per grid cell/column); the 2x2 placeholder grid is gone.
- [x] Sidebar skeleton rows are small rectangles (12x4, tighter gap/padding).
- [x] Skeleton layout is state-driven: left/right sidebar shown from the shared
      `sharedSidebars` open flags; grid cell count from `window.grid` placements.
      Multi-window workspaces render a carousel (`ws-carousel-track` + dots) and
      horizontal drag cycles windows; vertical drag-out still opens the workspace.
- [x] Quit-preserve: `before-quit` sets `_appQuitting`; the window `closed`
      handler skips `closeWindow` while quitting so the workspace keeps all its
      windows for restore. Single-window close (no quit in flight) still removes
      the window. (`window-manager.ts` + `openp41ge-application.ts`.)
- [x] Live-verified: rows + separators, state-driven single/multi-window
      skeletons (2- and 3-column, both sidebars), carousel swipe => next window
      (transform + dot active), vertical drag-out ghost + open, open-workspace
      row is a static (default-cursor) skeleton. Typecheck + oxlint clean;
      `nx run openp41ge:test` green.
