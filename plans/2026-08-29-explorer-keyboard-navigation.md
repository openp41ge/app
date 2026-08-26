2026-08-29

# Explorer keyboard tree navigation (VS Code-style)

## Goal
Make the Explorer behave like VS Code's file explorer:
- Clicking a row gives it a persistent focus/selection style.
- ArrowUp/ArrowDown move selection across every visible row in the whole panel
  (repo headers, worktree rows, folders, files) — including crossing in and
  out of the per-worktree file trees.
- ArrowRight opens (expands) repos, worktrees, and folders; ArrowLeft closes
  them. Files are leaves — they have no expand, so Right/Left do nothing there
  (Left on a leaf moves up to its parent folder).
- Home/End and Enter/Space follow the same conventions already used by the
  inner `<openp41ge-tree>`.

## Findings / why a gap exists
- `<openp41ge-tree>` (uikit, used per expanded worktree) ALREADY implements
  selection + Arrow keys + Right/Left expand/collapse + Home/End within its
  own subtree, with `selectedId` painting and `scrollIntoView`.
- Repo headers and worktree rows are plain `.wt-row-header` elements rendered
  by `<openp41ge-repo-tree-item>` — they have NO selection style and NO
  keyboard handling. The wt-tree's `_onKeyDown` is an empty stub
  ("Reserved for future keyboard shortcuts").
- Clicks on `.tree-node` rows (tabindex 0) currently steal DOM focus from the
  panel (`_onMousedownFocus` bails on any `[tabindex]`), so the inner tree
  owns keys only while focused inside it — there is no way to arrow back up
  to worktrees/repos from inside a file tree.

## Approach
Make `Openp41geWorktreeTree` the single focus/keyboard owner for the whole
panel and drive selection across both row kinds uniformly.

1. **Focus ownership** (`_onMousedownFocus`):
   Focus the panel on any mousedown except into text-entry controls
   (`input, textarea, select, [contenteditable]`). Repo/worktree rows and
   `.tree-node` rows now all route keydowns to the panel.
2. **Row model** — flatten visible navigable rows in DOM order:
   `this.querySelectorAll(".wt-row-header, .tree-node")`. That naturally
   yields repo header → worktrees → each worktree’s file tree → next repo,
   because hidden levels are simply not in the DOM.
3. **Selection state** — `_focusedRowEl`.
   - `.wt-row-header`: new class `.wt-row-focused` with the same blue
     selection background the file tree uses
     (`var(--tree-selected-bg, rgba(74,158,255,0.12))`); rule specificity
     (`.wt-row-header.wt-row-focused`, 0,2,0) beats the row hover.
   - `.tree-node`: set the containing `<openp41ge-tree>`’s `selectedId` to the
     node id and null it on every other tree in the panel (consistent
     painting + scrollIntoView).
4. **Keyboard handler** (`_onKeyDown`):
   - ArrowDown/Up, Home, End — move `_focusedRowEl` through the flattened
     model.
   - ArrowRight — expandable rows (repo/worktree/`has-children` node) that are
     collapsed → toggle open (reuse the row’s/nodes’ existing toggle path);
     leaves → no-op.
   - ArrowLeft — expanded expandable → toggle closed; otherwise (leaf or
     already-collapsed) → move selection to the parent row (tree node →
     previous `.tree-node` / owning worktree row; worktree row → owning repo
     header).
   - Enter/Space — expandable → toggle; leaf file node → activate (same as a
     click, opens the file preview).
5. **Click adoption** — a panel click listener finds `closest('.wt-row-header,
   .tree-node')` and sets the focus (existing click semantics are untouched:
   collapse/expand + file-open still happen as today).

Toggle reuse: repo/worktree expand/collapse uses `headerEl.click()`
(`_toggleExpand` / `_toggleWorktreeFiles` — keeps persistence + events);
file-node expand/collapse uses that node’s `.tree-chevron-cell.click()`.
Expanded state reads: chevron icon name (`chevron-down` vs `chevron-right`)
for headers; `aria-expanded` for tree nodes.

## Files Changed
- `packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts`
  (focus ownership, selection model, keyboard handler, `.wt-row-focused` CSS
  in the injected styles)

No uikit changes — the inner tree’s existing keyboard path stays available but
is subsumed while panel focus owns the keys.

## Testing Strategy
- Unit (jsdom) of the derived bits is limited by the no-op `customElements`
  stub — the navigation logic is DOM-coupled. Verify behaviour in the running
  app instead (DevTools drive): click repo/worktree/file rows → selection
  shows; ArrowDown/Up traverse the whole tree; ArrowRight/Left expand/collapse
  repos, worktrees, folders; files are skipped; Left on a file moves to its
  folder; Home/End jump.
- Re-run `nx run-many -t typecheck`, `nx lint`, `nx knip`, `nx run
  openp41ge:test`, build.

## UX Considerations
- Selection colour matches the file tree (single consistent selection
  language).
- Focus style is persistent (stays while unfocused), like VS Code.
- Existing click behaviours (toggle on click, file-open) are preserved.

## Open Questions
- None.

## Completion Criteria
- [ ] Clicking any row paints a persistent focus style.
- [ ] ArrowUp/Down move across repo, worktree, folder, and file rows
      (including entering/exiting file trees).
- [ ] ArrowRight expands repos, worktrees, folders; ArrowLeft collapses them.
- [ ] Files are leaves: Right does nothing, Left moves to the parent folder.
- [ ] Home/End work. Enter/Space opens files and toggles expandables.
- [ ] Tests pass, no new typecheck/lint/knip findings, build passes.
