2026-08-29

# Remove App-Wide Window Bottom Bar (tabs + sidebars keep their own)

## Goal

Remove the app-wide bottom bar from the (main) window, so the grid/tabs reclaim the vertical space. Keep the bottom bars inside the sidebars exactly as they are, and let each tab provide its own bottom bar (the per-column `tab-bar` already does).

## Rationale / Current State

- `openp41ge-windowview.ts` renders an **app-wide bottom bar** at the very bottom of every window:
  ```html
  <!-- Bottom bar: empty placeholder bar (kept for future use) -->
  <div class="wv-bottom-bar" style="border-top:1px solid var(--divider,#333);height:24px;…">
    <span style="flex:1"></span>
  </div>
  ```
  It is currently an **empty 24px placeholder** ("kept for future use") — no buttons, no logic. `wv-bottom-bar` is referenced nowhere else (no CSS rules, no JS height math), so removing it is safe and purely reclaims space.
- **Sidebars have their own bottom bars** inside the system-tab content (e.g. explorer edit-mode bar in `openp41ge-worktree-tree.ts`, workspace-manager detail footer in `workspace-manager-system-tab.ts`). Those are per-sidebar and stay untouched.
- **Tabs already provide their own bottom bar**: `openp41ge-uikit`'s `<tab-grid>` renders each column with its own `<tab-bar>`. Reclaiming the window-bottom 24px simply gives the grid more height — no new per-tab UI is required.

## Approach

1. **Remove** the `.wv-bottom-bar` div block from `openp41ge-windowview.ts` (the empty placeholder at the end of the root `flex-col`).
2. **No other layout change**: `.openp41ge-main-area` is `flex-1` with `min-h-0`, so the grid/sidebars automatically expand to fill the reclaimed height. Notches, drag ghost, and resize logic never reference the bar.
3. **Sidebars**: no change — their internal bottom bars remain.
4. **Tabs**: no change — per-column `tab-bar` in `tab-grid` continues to be each tab's own bottom bar.

## Files Changed

- `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts` — delete the `wv-bottom-bar` placeholder block (and the now-dangling `/* ── Bottom bar icon hover ── */` CSS comment in the style block, if it has no rules).

## Testing Strategy

- Manual (debug skill): window renders without the bottom strip; grid grows to the window bottom; sidebars' bottom bars still render; open/close sidebars, switch tabs, drag columns — no layout regressions, no console errors.
- No unit-test surface (pure DOM template removal) — verification is visual + the typecheck/lint/test gates.

## UX Considerations

- The removed 24px was dead space; the grid gains it. No visual regression to panes/tabs.
- Title bar, sidebar bottom bars, and per-tab `tab-bar` are untouched and keep their existing styling.
- Workspaces overlay stays correct: it already only covers the `.openp41ge-main-area` region, never the titlebar/bottom bar.

## Open Questions

1. Confirm the window bottom bar is the empty placeholder described above and is safe to delete outright (yes/no).
2. Confirm "tabs provide their own bottom bar" means keeping the existing per-column `tab-bar` and making no new per-tab UI (yes/no).

## Completion Criteria

- [ ] `wv-bottom-bar` block removed from `openp41ge-windowview.ts`; dangling CSS comment cleaned.
- [ ] Window renders with no bottom strip; grid uses the full window height above the title bar.
- [ ] Sidebar bottom bars unchanged and rendering.
- [ ] Per-tab `tab-bar` unchanged.
- [ ] `nx run-many -t typecheck`, `nx lint` clean; `nx run openp41ge:test` passes; runtime-verified visually, no console errors.
