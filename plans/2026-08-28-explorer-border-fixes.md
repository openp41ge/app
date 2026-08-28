2026-08-28

# Explorer sidebar border fixes (double bottom border + open-worktree boundaries)

## Goal

Fix two border defects in the Explorer sidebar tab (`<openp41ge-worktree-tree>`):

1. **Double border at the bottom** — the tree's last row (`add repository`) carries a `border-b`,
   and the new 24px `.sb-bottom-bar` carries a `border-t`; when the tree fills the drawer these
   stack into a 2px line. Fix by mirroring the existing Workspaces-list solution: detect when the
   list reaches the bottom edge and drop the last row's separator, keeping the bottom bar's border
   as the single delineating line.
2. **Unclear boundary below an open worktree** — files/folders inside an expanded worktree are
   intentionally borderless (per requirement), but this leaves no line between that borderless
   block and the next row below it (next worktree header, add-worktree row, next repo header, or
   `add repository` row). Add exactly one separator at each such junction, only when the worktree
   is open, and never double up with the existing row `border-b`s.

## Rationale

The Explorer is a VS Code-style flat tree where repos and worktree headers own a bottom border,
but expanded worktree file/folder rows are borderless by design. The user (in conversation)
confirmed: **files/folders must stay borderless**, **separators are required for repos and
worktrees**, and the borderless file blocks are the reason "some parts need separators only when
the worktree row is opened". The requirement also mandates **no double borders** anywhere.

The double-border-at-bottom defect was introduced when the sidebar tabs gained their own footer
(commit `36163ca`, "add empty bottom bar to explorer and git sidebar tabs") without updating the
tree's last-row border. A working fix already exists for the analogous Workspaces overlay list
(`_syncLeftFill` + `.wm-left-scroll.full .wm-card:last-child { border-bottom: 0 }`); we reuse that
pattern rather than inventing a second approach.

## Approach

### Issue 1 — drop the last row's separator when the tree fills the drawer

Replicate the Workspaces overlay mechanism (`workspace-manager-system-tab.ts:288-321`,
`:1540-1542`) as closely as the Explorer's existing scroll infrastructure allows.

- In `_syncScrollbar()` (`openp41ge-worktree-tree.ts`, ~`:873`), immediately after the
  `if (!el) return;` guard, toggle a `full` class on `_treeEl`:
  `el.classList.toggle("full", el.scrollHeight >= el.clientHeight - 1)`. This reuses the existing
  recompute triggers: content `ResizeObserver` (fires on worktree expand/collapse and file
  loading), the scroll listener `_boundScroll`, and the `updated()` rAF already scheduled.
- Add one CSS rule to the `_injectStyles()` `<style>` block (alongside the existing `.wt-*` rules):
  ```
  .wt-tree-scroll.full .wt-tree-scroll-content > :last-child { border-bottom: 0; }
  ```
  The `:last-child` of `.wt-tree-scroll-content` is always the `add repository` row (label variant
  or `_showingAddRepo` input variant), so dropping its `border-b` while the list reaches the
  bottom edge removes the double line with the bottom bar's `border-top`. When the list is short,
  `full` stays off and the row keeps its separator (same as Workspaces).
- Selector specificity: `.wt-tree-scroll.full .wt-tree-scroll-content > :last-child` (3 classes +
  `:last-child`) beats Tailwind's `.border-b`/`.border-divider`, so no `!important` needed.

No `_treeFull` component state is required — a `classList` toggle is enough (the effect is
CSS-only and does not need a re-render).

### Issue 2 — one separator below each open worktree's borderless file block

Render the boundary line on the **file block itself** (a bottom border on the open worktree's
uikit tree), rather than on every following row. This is the same "each row/block owns its bottom
line" convention the repo and worktree headers already use, and it makes the "next row" logic
unnecessary — whichever row follows an open worktree (next worktree header, add-worktree row, next
repo header, or `add repository`) automatically gets a line above it, and there is never a double.

In `openp41ge-repo-tree-item.ts`, the expanded file tree currently renders as:

```html
${ this._expandedWorktrees.has(wt.branch) && this._fileLoader.isWorktreeLoaded(wt.branch) ?
html`<openp41ge-tree ...></openp41ge-tree>` : "" }
```

Wrap that `<openp41ge-tree>` in a full-width container with the worktree-row border:

```html
<div class="border-b border-[#232323]"><openp41ge-tree ...></openp41ge-tree></div>
```

Because the wrapper only renders when the worktree is open (and loaded), the separator appears
exactly when required ("only when the worktree row is opened") and disappears on collapse.
Consequences, all single-line, all double-free:

- open worktree → next worktree header: line comes from the open block's `border-b`; the header
  keeps only its own `border-b` below it.
- open worktree → `#wt-addwt-row` / next repo header / `add repository` row: same single line.
- collapsed worktree → next worktree: the previous header's `border-b` is the separator, as today.

### Remove the coarse `add repository` top-border hack

`openp41ge-worktree-tree.ts:550-554` currently adds `border-t border-divider` to the add-repo
**input** row whenever `_anyExpanded` (any repo expanded). Under the new Issue-2 rule that top
border would double with the open worktree block's `border-b`, and it is also inconsistent (it is
applied to the input variant only, never the label variant). Remove the `_anyExpanded`
computation and the conditional `border-t`; the open worktree block (or the last worktree/repo
header's `border-b`) now provides the separator above the add-repo row in both variants.

## Files Changed

- `packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts`
  - `_syncScrollbar()`: toggle `full` on `_treeEl` from `scrollHeight`/`clientHeight`.
  - `_injectStyles()`: add `.wt-tree-scroll.full .wt-tree-scroll-content > :last-child` rule.
  - Remove `_anyExpanded` (line ~550) and the conditional `border-t` on the add-repo input row
    (line ~554).
- `packages/openp41ge/src/renderer/components/openp41ge-repo-tree-item.ts`
  - Wrap the rendered `<openp41ge-tree>` for an open worktree in `<div class="border-b border-[#232323]">`.

Plans dir note: follow-up Git sidebar tab border work is tracked separately by the user; not in
scope here.

## Testing Strategy

- **Issue 1 (unit/integration, jsdom):** new test exercising `_syncScrollbar`'s `full` toggle.
  jsdom gives `scrollHeight`/`clientHeight` of 0, so stub them with `Object.defineProperty` on the
  tree's `.wt-tree-scroll` element (or mock the element), mount the component with a stubbed
  preload (the existing `explorer-system-tab.test.ts` stub pattern), then:
  - content shorter than viewport → no `full` class, last row keeps its border;
  - content taller than viewport → `full` class present; assert the last row's rendered `border-b`
    class or computed style is absent (or assert the CSS rule/Fixture selector exists).
  - This is the regression guard that the double border cannot return when the list fills.
- **Issue 2 (integration, jsdom):** with `TestRepoService` (as `explorer-system-tab.test.ts` does)
  create a repo with two worktrees; expand the worktree list, open the first worktree, and assert
  a `border-b border-[#232323]` wrapper exists around its file tree while the **second** worktree
  header has no top-border class; collapse and assert the wrapper border is gone. Also assert the
  file/folder rows remain borderless (no border classes on `.tree-node`).
- **Manual/visual:** use the **debug** skill + Chrome DevTools screenshot on the running app:
  - drawer filled with an open worktree → exactly one 1px line at the bottom (no 2px stack);
  - open worktree followed by a collapsed worktree → one line between the file block and the next
    header; no line between file rows; collapse removes the line;
  - repo with multiple open worktrees + add-repo row below → all junctions single-line.
- Run `nx run openp41ge:test` (and `nx run-many -t typecheck` / `nx lint`) after implementing.

## UX Considerations

- **Visual consistency:** the new separator uses the same color as worktree rows
  (`#232323`), not `var(--divider)`, to read as part of the tree's own border system.
- **No interaction changes:** borders are purely cosmetic; hover feedback, keyboard navigation,
  drag-and-drop, selection/focus borders (`wt-row-focused` / `wt-row-selected`) are untouched.
- **No double borders:** verified per-state in the Approach section; the borderless file rows are
  preserved as required.
- **Scroll edge case (shared with Workspaces):** dropping only the _last_ row's border means a
  border-bearing row that happens to sit flush at the scrollport bottom mid-scroll can still abut
  the bottom bar's border. The Workspaces implementation has the same behaviour and it is accepted
  there; we keep parity. (See Open Questions.)

## Open Questions

1. **Separator ownership (design decision).** The user described the defect as "the next worktree
   does not have a top border", but the chosen approach draws the line as a **bottom border on the
   open worktree's file block**. Visual result is identical (one 1px line at that junction, all
   cases, no doubles) and needs zero cross-row neighbour logic. If a top-border-on-next-row look is
   specifically required, flag it and we switch to neighbour-aware `border-t` (as
   `_repoWrapperStyle` does for the Workspaces accordion).
2. **Column color (pre-existing inconsistency, not changed here unless requested).** Repo/worktree
   rows use `#232323`; the add-repo row and `.sb-bottom-bar` use `var(--divider,#333)`. Unified
   separately if desired.
3. **Mid-scroll flush-row double.** Accept Workspaces-parity (last-row only) or upgrade later to
   drop the border of whichever row is flush at the scrollport bottom.

## Completion Criteria

- [ ] Tree drawer filled to bottom shows exactly one 1px line above the bottom bar (no 2px stack).
- [ ] Short tree (< viewport) keeps the `add repository` row's separator under normal use.
- [ ] Open worktree: file/folder rows stay borderless; exactly one line between the file block and
      the next worktree header / add-worktree row / next repo header / add-repo row.
- [ ] Collapse or single worktree: no stray separator; no element ever shows a doubled border.
- [ ] `_anyExpanded` top-border hack removed; add-repo input and label variants behave
      identically.
- [ ] Issue-1 and Issue-2 regression tests added and passing; `nx run-many -t typecheck`, `nx lint`,
      and `nx run openp41ge:test` are green; visual state verified in the running app via debug
      skill screenshots.
- [ ] This plan file deleted on completion.
