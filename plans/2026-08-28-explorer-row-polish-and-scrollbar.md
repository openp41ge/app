2026-08-28

# Explorer row polish: rounded-square refresh buttons + right-edge breathing room + scrollbar fix

## Goal
Three Explorer (sidebar) fixes requested by the user:
1. The refresh (−↻) buttons at the end of each repo row should look like
   square tiles with rounded corners (currently transparent/bare → they read
   as stray icons).
2. Rows need right-side space so the end-of-row buttons don't sit flush
   against the window edge.
3. The explorer custom scrollbar is broken: when worktrees/files make the
   list scrollable the custom scrollbar never appears; collapsing back down
   can leave the scroll indication stale.

## Rationale
Observed in the running app (DOM + code inspection):

- Refresh buttons are `span.wt-row-btn` / `span.repo-header-btn` with
  `w-5 h-5 … rounded` and only a `:hover` background. Idle they are
  transparent with a 3.25px radius → not perceived as square tappable tiles.
- Repo/worktree rows use `px-2 pl-3` / `px-2 pl-7` (right padding 8px), so the
  last button sits ~6px from the window edge.
- `_syncScrollbar()` is only invoked from the wt-tree's own `updated()` and the
  scroll event. Repo/worktree/file rows are rendered by the child
  `<openp41ge-repo-tree-item>`, which re-renders independently — so content
  growth/shrink never re-runs `_syncScrollbar`. Verified: with content at
  scrollH 1568 vs clientH 806 the custom track stays `display:none`; calling
  `_syncScrollbar()` manually makes the track+thumb render correctly.

## Approach
1. `openp41ge-worktree-tree.ts` — fix scrollbar sync:
   - Add a `ResizeObserver` on `.wt-tree-scroll-content` (created once in
     `updated()` after `_treeEl` is known; observed when content box height
     changes → re-run `_syncScrollbar()`). Disconnect in `disconnectedCallback`.
   - Guard with `typeof ResizeObserver !== "undefined"` for jsdom.
2. `openp41ge-repo-tree-item.ts` — button tile + breathing room:
   - Extend the component <style>: `.repo-header-btn,.wt-row-btn` get
     explicit 20×20 box, `border-radius:5px`, a subtle inset outline
     (`box-shadow: inset 0 0 0 1px var(--border-divider,…)`) so idle buttons
     read as squares; keep hover fill.
   - Bump right padding of repo-header row, worktree rows, and the add-wt row:
     `px-2 pl-3`→`px-2 pl-3 pr-3`, `px-2 pl-7`→`px-2 pl-7 pr-3` so the
     end-of-row buttons sit ~12px from the window edge (also clear of the
     8px hover overlay scrollbar).

## Files Changed
- `packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts`
- `packages/openp41ge/src/renderer/components/openp41ge-repo-tree-item.ts`

## Testing Strategy
- Regression (unit/integration, jsdom): assert ExplorerController/rows use
  increased right padding and that the wt-tree sets up a ResizeObserver on the
  scroll content when available — mainly re-run full package tests.
- Manual (running app + DevTools):
  - Expand enough worktrees/files to overflow → custom scrollbar track+thumb
    appear; collapse → they disappear (no stale "can scroll" indication).
  - Refresh buttons read as rounded squares with a right-edge gap (~10px).
- `nx run-many -t typecheck`, `nx lint`, `nx knip`, `nx run openp41ge:test`,
  build.

## UX Considerations
- Button tiles match existing subtle hover language (`--bg-hover`) — outline
  only, no loud borders.
- No layout shift: padding bump is 4px on the right only.
- Scrollbar appears/hides without animation delays already handled by CSS.

## Open Questions
- None.

## Completion Criteria
- [ ] Refresh buttons look like bordered rounded-square tiles (idle + hover).
- [ ] End-of-row buttons have clear right-edge spacing.
- [ ] Custom scrollbar appears when over-scrolled and hides when content fits
      (verified with repo expanded/contracted).
- [ ] Tests pass, no new typecheck/lint/knip issues, build passes.
