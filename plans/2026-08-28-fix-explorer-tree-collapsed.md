2026-08-28

# Fix Explorer tab rendering collapsed/invisible in the sidebar

## Goal
Make the Explorer tab's tree visible again. Today the Explorer tab mounts, but the
`<openp41ge-worktree-tree>` element collapses to `0×0` (inline `width:0`) so no repos,
worktrees, or file rows render — while the sibling Git tab renders fine.

## Rationale
Diagnosed in the running app (dev mode, window `win-ws1-0`):

- Right sidebar has `[explorer, git]` tabs, `activeRightTab` = explorer, sidebar open.
- Git tab renders its REPOSITORIES panel correctly (verified by activating the tab).
- Explorer tab mounts `<openp41ge-worktree-tree>` (a Lit custom element) but the element
  has inline `width:0px; height:0px` → the whole tree is invisible.

Three interacting causes:

1. **Stale open-detection.** `Openp41geWorktreeTree._syncExplorerState()` decides the
   drawer's open/closed state from `win.sidebar.activeViewId === "explorer"`. The sidebar
   system now persists activation in `activeLeftTab`/`activeRightTab` (tab IDs resolved
   through `workspace.systemTabs[].appType`); `activeViewId` is never written (stays
   `null`). So `_isOpen` stays `false` even though the explorer tab is active + mounted.
2. **Collapse writes.** `connectedCallback()` sets `this.style.width = _isOpen ? "280px" : "0"`
   and `updated()` → `updateDrawerVisibility()` sets `style.width = _isOpen ? "" : "0"`,
   which clobbers the mount's `width:100%` (explorer controller set cssText
   `width:100%; flex:1; …` — the entire cssText is overwritten by `height:""` + `width:"0"`).
3. **No height.** `ExplorerSystemTabController.mount()` sets `flex:1` (inert in the block
   `.sidebar-content`) but never `height:100%`. Git's controller sets `height:100%` — that's
   the concrete difference; Explorer's flex-only sizing collapses to 0 height.

This is a regression: `db5b456` (mount system-tab content) made Explorer mount, but the
wt-tree's open state + fill sizing were never aligned with the `activeLeftTab`/`activeRightTab`
sidebar model.

## Approach
Targeted fix in the wt-tree (open-state + sizing) and the explorer controller (height),
keeping the legacy overlay-drawer behaviour intact outside sidebars.

1. **`openp41ge-worktree-tree.ts`**
   - `_syncExplorerState()`: resolve the window's active sidebar system tab
     (`activeLeftTab`/`activeRightTab` → `systemTabs[id].appType`, sidebar-open flags)
     instead of the stale `activeViewId`. When mounted inside an `openp41ge-sidebar`
     (`this.closest("openp41ge-sidebar")`), the explorer tree is by definition open —
     set `shouldBeOpen = true`.
   - `updateDrawerVisibility()`: when the element lives inside a sidebar, never collapse —
     keep `width:100%; height:100%; position:relative` and hide the resize notch; reserve
     the `width: _isOpen ? "" : "0"` collapse logic for the standalone overlay drawer.
   - Keep non-sidebar behaviour identical (no regression to the overlay drawer).
2. **`explorer-system-tab.ts`** — `mount()` cssText adds `height:100%` (like Git's
   controller) so the tree fills `.sidebar-content` (which has a definite flex-computed
   height); keep `flex:1; min-height:0` for the flex case.
3. No changes to state/IPC contracts — state keys already exist.

## Files Changed
- `packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts`
  (open/closed detection + drawer-collapse guard for sidebar mounts)
- `packages/openp41ge/src/renderer/apps/system-tabs/explorer-system-tab.ts`
  (mount height fill)

## Testing Strategy
- Regression test (unit, jsdom): instantiate the explorer tab's controller, mount into a
  container that mimics a sidebar, assert the created `<openp41ge-worktree-tree>` element
  is given `height:100%` and does not end up with inline `width:0`.
- Manual verification in the running dev app (Chrome DevTools): explorer tab active in the
  right sidebar renders repo rows + worktree rows + file rows; switching explorer↔git keeps
  both working; switching to left sidebar not required by this bug (left sidebar tab state
  is empty in the sample workspace — separate observation reported to user).
- `nx run-many -t typecheck`, `nx lint`, `nx knip`, `nx run openp41ge:test`, build.

## UX Considerations
- Explorer tree should fill the sidebar edge-to-edge at 100% width/height (matches Git).
- No resize notch / drawer border inside the sidebar.
- No animation or transition changes — the tree simply renders filled.
- Focus management untouched.

## Open Questions
- The left sidebar in the sample workspace has no tabs (`leftSidebarTabs: []`) — the
  explorer/git tabs live on the RIGHT. Separate from this bug; will report and ask the
  user whether default/sidebar seeding is expected before changing it.

## Completion Criteria
- [ ] Explorer tab in the sidebar shows repo rows, their worktrees, and file rows.
- [ ] Git tab still renders.
- [ ] Non-sidebar (overlay drawer) open/close behaviour unchanged.
- [ ] Regression test added and passing; typecheck/lint/knip/test/build pass.
