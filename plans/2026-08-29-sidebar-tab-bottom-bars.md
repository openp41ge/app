2026-08-29

# Sidebar Tab Bottom Bars (Explorer + Git)

## Goal

Add an (initially empty) bottom bar to the **Explorer sidebar tab** and the **Git sidebar tab**, giving each sidebar tab its own footer strip now that the app-wide window bottom bar was removed. Content comes later (status/actions) — for now the bar is an empty placeholder in place.

## Rationale / Current State

- The app-wide `wv-bottom-bar` was removed from `openp41ge-windowview.ts` (empty 24px placeholder). The user still wants sidebars to own a bottom bar (stated earlier: "I still want the bottom bar to appear in the sidebars").
- **Explorer tab** = `<openp41ge-worktree-tree>` mounted into the sidebar. Its root `.wt-drawer` is a flex column: scroll-wrapper (flex-1) + track. No footer. (There is an orphaned `_toggleEditMode` DOM hook `.wt-drawer > div:last-child > div:last-child` — already non-matching; leaving untouched, out of scope.)
- **Git tab** = `GitSystemTabController`, imperative DOM: `wrapper` (flex column) with header + `list` (flex-1). No footer. Content reloads on `git:refresh`; rows drag onto the grid.
- Styling mirrors the removed app-wide bar for visual continuity: `border-top ~var(--divider)`, `height ~24px`, `flex-shrink:0`, muted text color, `background ~var(--bg-secondary)`.

## Approach

1. **Explorer** (`openp41ge-worktree-tree.ts` render()): append a footer `<div class="sb-bottom-bar" style="…">` as the last child of `.wt-drawer` (after the scroll-wrapper), `flex-shrink:0` so the tree's scroll area keeps `flex-1`. Empty content: `<span style="flex:1"></span>`.
2. **Git** (`git-system-tab.ts` mount()): after `wrapper.appendChild(list)`, create a `div` footer with the same inline style (`flexShrink:0`, `borderTop`, `height:24px`, `bg-secondary`), and `wrapper.appendChild(footer)` before `container.appendChild(wrapper)`. Removed on unmount with the wrapper.
3. No state, no persistence, no interactions — placeholder only.

## Files Changed

- `packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts` — footer inside `.wt-drawer`.
- `packages/openp41ge/src/renderer/apps/system-tabs/git-system-tab.ts` — footer div in mount().

## Testing Strategy

- Manual (debug skill, live app — renderer hot-reloads): open Explorer tab in a sidebar → bottom bar visible at the sidebar tab's bottom, tree list still scrolls above it; open Git tab → bottom bar visible under the repo list; both bars empty; switching tabs/removing repos → no console errors.
- Gates: `nx run openp41ge:typecheck`, `nx lint`, `nx run openp41ge:test`.

## UX Considerations

- Visual: same border-top/height/background as the removed app-wide bar for continuity.
- Scroll: the bar is `flex-shrink:0` below the existing `flex-1` scroll area — content never hides under it; the Explorer overlay scrollbar track is scoped to `.wt-tree-scroll-wrapper`, so it stays above the bar.
- Focus/keyboard: no new focus targets; no interactions yet.

## Open Questions

- None — user confirmed bars are empty placeholders for now.

## Completion Criteria

- [ ] Explorer sidebar tab shows a bottom bar under the tree.
- [ ] Git sidebar tab shows a bottom bar under the repo list.
- [ ] Both bars empty, consistent style, `flex-shrink:0`, no content overlap.
- [ ] `nx run-many -t typecheck`, `nx lint` clean; `nx run openp41ge:test` passes; runtime-verified visually, no console errors.
