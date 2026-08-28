2026-08-28

# Replace Workspace Icon in Title Bar

## Goal

Replace the workspace icon inside the title-bar workspace button (`<openp41ge-workspace-search>`) with the supplied Material-style box-with-arrows SVG, and enlarge it so its height fills the button's background just like the sidebar icon toggle buttons (.`tb-btn`).

## Rationale

- The current workspace icon is a generic 12×12 folder glyph cramped inside a 26px-high pill — visually small (46% height fill) compared to the sidebar icon toggle buttons, whose 18px icons fill ~79% of their button background.
- The supplied SVG is the intended brand/action glyph ("workspaces"/box-with-arrows) and should carry the same visual weight as the other titlebar icon buttons.

## Approach

The workspace button lives in `packages/openp41ge/src/renderer/components/openp41ge-workspace-search.ts` (rendered inside `openp41ge-titlebar.ts`).

1. **Swap the path data.** Replace `<path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Z"/>` with the two supplied paths:
   - `M160-240v-480 520-40Zm0 80q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v200h-80v-200H447l-80-80H160v480h200v80H160ZM584-56 440-200l144-144 56 57-87 87 87 87-56 57Zm192 0-56-57 87-87-87-87 56-57 144 144L776-56Z`
2. **Enlarge the icon.** Bump the SVG `width`/`height` from `12` to **`20`** (matches the sidebar icon-button fill ratio of ~79% of the 26px pill). Keep `flex-shrink:0`. May be resized later after visual review.
3. **Keep colouring theme-aware (decided).** Keep `fill="currentColor"` and `color:var(--text-secondary,#999)` on the SVG (current behaviour) instead of the user-supplied hard-coded `#e3e3e3`, so the icon follows the app's dark/light theme and the existing hover/text-secondary styling — consistent with the sidebar icon buttons which also use `currentColor`.
4. **No structural change** to the pill (decided: keep text label, click → `workspacesOverlayService.toggle()`, mouseenter/leave hover).

Note: `openp41ge-topbar.ts` is a redundant/unused simpler bar and will **not** be touched.

## Files Changed

- `packages/openp41ge/src/renderer/components/openp41ge-workspace-search.ts`
  - Replace the folder `<path>` with the two new icon paths.
  - Enlarge the `<svg width="12" height="12">` to the target size (~20×20).

## Testing Strategy

- **Not unit-testable meaningfully** — this is a presentational SVG swap in a Lit web component with no existing test (confirmed: nothing under `packages/openp41ge/test/` references `workspace-search`).
- **Visual verification** in the running dev app (`nx run openp41ge:dev`):
  - Workspace icon renders the new box-with-arrows glyph, visibly larger (~20px), filling the pill background like the sidebar toggle buttons.
  - Workspace-name text, hover state, and click-to-open-overlay still work.
- **Quality gate** before submitting: `nx run-many -t typecheck` and `nx lint`/`nx knip` must stay clean; the component change is self-contained so the existing test suite and build are unaffected.

## UX Considerations

- **Visual consistency** — target icon size derived from the existing sidebar icon-button metric (18px in ~22.75px button ≈ 79% fill → 20px in 26px pill). Use the same `text-secondary` colour and no layout shift in the pill.
- **No keyboard/focus change** — the button already opens the overlay on click; only the glyph and its size change.
- **Theme safety** — keep `currentColor` so the icon respects both dark and light themes, matching how all other titlebar/sidebar icons are coloured.

## Open Questions

None — all previously open decisions are settled:
1. **Keep the pill + text** (workspace-name label stays; icon is enlarged only).
2. **Icon size = 20px** initially; resize after visual review if needed.
3. **Theme-aware** `currentColor` (`--text-secondary`) — not the hard-coded `#e3e3e3`.

## Completion Criteria

- [ ] Both new SVG paths present in `openp41ge-workspace-search.ts`, replacing the old folder path.
- [ ] Workspace `<svg>` sized 20×20 (matching the sidebar icon-button fill ratio) and visually fills the button background like the sidebar icon buttons.
- [ ] Pill keeps the workspace-name text.
- [ ] Pill layout (hover, click-to-toggle) unchanged and working.
- [ ] Icon uses theme-aware `currentColor` (`--text-secondary`).
- [ ] `nx run-many -t typecheck` and `nx lint` pass; no dead-code/knip regressions.
- [ ] Visually confirmed in the running dev app (screenshot comparison).
