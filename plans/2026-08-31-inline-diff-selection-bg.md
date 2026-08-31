2026-08-31

# Inline diff: grey-bg number-cell selection highlight (multi-row)

## Goal
The number-cell highlight was a box-shadow ring — replace it with the grey
background used for border lines and active tabs, and extend it to EVERY row
covered by the current selection (not just the cursor line).

## Change
- CSS: `.fe-inline-left-label.fe-inline-left-active` and
  `.fe-gutter .line-number.active-line-number` now use
  `background: var(--fe-border-color, #2a2a2a)` (rgb(42,42,42) dark) — the
  same grey as the editor's border lines and the tab UX (tabs drag preview uses
  #2a2a2a too). No box-shadow.
- Selected rows instead of one active line:
  - `InlineDiffGutterColumns.setActiveLine(line)` -> `setActiveLines(
    Iterable<number> | null)`; toggles `fe-inline-left-active` for every entry
    in the set (also on fresh labels during setVisibleRange).
  - file-editor tracks `_selectedDiffLines: ReadonlySet<number>`, rebuilt in
    `_syncCursorView` from ALL cursors: for each cursor, every model line from
    `min(anchor, position)` to `max(...)` is selected (single click -> cursor
    line; multi-row selection -> all covered lines; multi-cursors union).
  - `getLabelDecoration` adds `active-line-number` when the line is in the set.
  - ORDER matters: the set is refreshed BEFORE
    `_lineNumbersOverlay.setActiveLine` (repaints synchronously).
  - `setInlineDiff(null)` resets the set.

## Verification
- Tests: gutter-columns setActiveLines single/multi/persistence/clear; inline
  diff single-row + multi-row (2 lines) + shrink-to-1 clears second row.
- uikit+editor-engine 148, openp41ge 1071, typecheck/lint green.
- Live (public/app.js @ 43985c3): click number -> both cells rgb(42,42,42)
  grey, no ring, `_selectedDiffLines=[5]`; selectDown x3 -> set [5,6,7,8] and
  EXACTLY 4 active cells in EACH column (after + before), grey bg; 0 errors.
