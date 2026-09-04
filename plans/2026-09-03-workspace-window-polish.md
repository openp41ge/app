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

**Approach** — build a reusable overlay scrollbar component in `openp41ge-uikit`
(`components/scrollbar/overlay-scrollbar.ts`) that hides the native scrollbar and
draws its own track+thumb (floating over content), and a global native-restyle
module (`components/scrollbar/global-scrollbar-styles.ts`) so any remaining native
scrollbars match: **square corners**, thin translucent thumb, **faded/transparent
left side border (vertical) / top border (horizontal)**, and a spring thicken on
hover/use. Apply the overlay component to the primary scroll surfaces (worktree
tree, pane picker, workspace-manager list, file editor vertical + horizontal) and
restyle the file editor's custom horizontal bar + adjust its `virtual-scroll`
gutter accounting for the overlay bars. Install the global styles at bootstrap so
all native scrollbars across every window type look consistent.

**UX** — same visual language everywhere: thin translucent thumbs that thicken
automatically on hover/drag; no reserved gutter (bars float over content); square
corners; a subtle faded inner border on the content-facing edge.

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
      width. (`tab-grid.ts` `_cellWidths` + per-cell resize handles.) The drag
      bar + blue indicator now paint above the neighbouring cell's content
      (handle `z-index: 1000`) so it's fully grabbable/visible.
- [x] 6 — **Reusable overlay scrollbar + consistent look built.** New
      `OverlayScrollbar` in `openp41ge-uikit` (square corners, faded left/top
      border, spring thicken, floats over content) + geometry unit tests; a
      global scrollbar restyle (square corners + faded per-axis border) installed
      at bootstrap covers every native scrollbar; aligned `Openp41geScrollbar` and
      the file editor; applied `OverlayScrollbar` to the workspace-manager list
      and to the file editor's **vertical** bar, and made the editor's vertical +
      horizontal bars consistent (same theme-aware thumb colour + thumb width, no
      bottom-right corner overlap, and the horizontal bar spans full width when
      there's no vertical bar).
      **Deliberate deferrals**: the worktree tree keeps its bespoke overlay (no
      visual gain in converting) and the pane picker uses the global restyled
      native bar.
- [x] 7 — history search config wraps by separator groups.
      (`commit-search-system-tab.ts` groups + test updated.)
- [x] typecheck + lint + tests green. The scrollbar + drag-bar changes were
      live-verified in the running app (file editor vertical/horizontal bars,
      the bottom-right corner, and the grid resize handle being on top).
