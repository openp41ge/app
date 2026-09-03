2026-09-03

# Workspace window polish: sidebar drag bar, tab UX, cell resize, scrollbars, search wrap

Batch of 7 small-to-medium fixes in the workspace window. Each is independent;
complete all before finishing.

## 1. Left sidebar drag bar sits above the grid file editor

The windowview resize notch (`.wv-notch-v`, `z-index: 5`) is partially covered by
the central grid's file-editor content, so only part of the notch is hoverable/
grabbable. Raise the notch above all central grid elements so the full notch is
grabbable.

**Approach** — `openp41ge-windowview.ts`: bump `.wv-notch-v` `z-index` above the
grid content (e.g. `z-index: 20`) and ensure the grid/sidebar flex items don't
create a higher stacking context. Verify the hover highlight bar
(`.wv-notch-v::before`) still shows.

## 2. Activating a sidebar tab scrolls it fully into view

When many sidebar tabs overflow the tab strip (fade at the edge), clicking a
clipped tab activates it but leaves it half-hidden. Ensure the clicked tab is
scrolled entirely into view.

**Approach** — `openp41ge-sidebar.ts` `_onTabClick`: after emitting
`tab-activate`, find the tab host (`.sidebar-tab[data-sidebar-tab-id=...]`) and
scroll the `.sidebar-tab-scroll` container so the tab's full box is visible
(follow the pattern in `tab-bar.ts` `scrollToTab`).

## 3. Unify grid-tab and sidebar-tab close buttons

Grid-tab close (`.tab-close` in `tab-bar.ts`) and sidebar-tab close
(`.sidebar-tab-close` in `openp41ge-sidebar.ts`) differ. Use the sidebar style
(bigger/clearer ✕) as the shared look, but red on hover like the grid tab. Also
give the grid-tab close button more left spacing so long titles don't crowd it.

**Approach** — `tab-bar.ts`: enlarge `.tab-close` (e.g. 18px, larger glyph),
increase `margin-left` on the close button, and keep red hover
(`background: rgba(255,50,50,.3); color: #ff3232`). `openp41ge-sidebar.ts`: make
`.sidebar-tab-close` red on hover to match.

## 5. Add resize drag bars between grid cells

With multiple grid columns there is no drag bar between cells, so cells can't be
resized (only the edges at the sidebars). Add a drag bar between cells and allow
resizing, respecting per-cell min widths (grid already scrolls when too full).

**Approach** — `openp41ge-uikit/src/components/tabs/tab-grid.ts`: render a thin
resize handle between `.grid-cell` columns; wire pointer drag to adjust the flex
basis of adjacent cells with a min-width floor (existing min-width 200px). No
layout-op change (purely presentational width), so no IPC/state change.

## 6. Unified, floating, spring-animated scrollbars

Horizontal scrollbars in the file editor float over content and are partially
transparent; vertical scrollbars reserve space; sidebar scrollbars use different
sizes. Define one scrollbar style and build a reusable helper so all elements and
all window types match: float over content, partially transparent, thin, and
animate thicker on hover/use with a spring.

**Approach** — build a shared scrollbar helper (e.g. in `openp41ge-uikit` +
`openp41ge-constants`) exposing a CSS class/variable set, then apply it across the
file editor, sidebars, grid, and any other scrolled surfaces. The helper provides
`::-webkit-scrollbar` styled thin + transparent, plus a `:hover`/`:active` thicker
state with a spring-like transition. Consolidate the existing divergent
`scrollbar` declarations.

## 7. History search config wraps by separator groups

The search-config icon row in the History sidebar tab should wrap when the sidebar
is narrowed, wrapping by separator-delimited groups, not just the last icon.

**Approach** — `commit-search-system-tab.ts`: give the search-config row
`flex-wrap: wrap`; wrap at group boundaries (segments separated by the existing
divider gaps) so whole groups move to the next line instead of only the last icon.

## Files (indicative)
- `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts`
- `packages/openp41ge/src/renderer/components/openp41ge-sidebar.ts`
- `packages/openp41ge-uikit/src/components/tabs/tab-bar.ts`
- `packages/openp41ge-uikit/src/components/tabs/tab-grid.ts`
- `packages/openp41ge/src/renderer/apps/system-tabs/commit-search-system-tab.ts`
- new shared scrollbar helper + constants

## Completion criteria
- [x] 1 — left notch fully grabbable above the grid; hover bar shows.
      (`openp41ge-windowview.ts`, notch `z-index: 30`.)
- [x] 2 — clicking a clipped sidebar tab scrolls it fully into view.
      (`openp41ge-sidebar.ts` `_onTabClick` + `scrollLeft`.)
- [x] 3 — grid/sidebar tab close buttons share the bigger 18px ✕ look and red
      on hover; grid-tab close has more left spacing (`margin-left: 7px`).
      (`tab-bar.ts`, `openp41ge-sidebar.ts`.)
- [x] 5 — drag bars between grid cells resize them, respecting a 200px min
      width. (`tab-grid.ts` `_cellWidths` + per-cell resize handles.)
- [~] 6 — scrollbar styling unified (thin 6px, translucent, hover-thicken) in
      `Openp41geScrollbar` + aligned the file editor. **Not fully done**: a
      custom spring-animated overlay (float-over-content) scrollbar across every
      window type is a larger component build and was not implemented or
      live-verified. Flagged as partial.
- [x] 7 — history search config wraps by separator groups.
      (`commit-search-system-tab.ts` groups + test updated.)
- [x] typecheck + lint + tests green. Not live-verified in the running app.
