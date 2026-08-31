2026-08-31

# Fix: left line-number column scroll alignment

## Goal

The leftmost (BEFORE) line-number column misplaced its numbers when scrolled.

## Root cause

`InlineDiffGutterColumns.setVisibleRange` positioned its labels at
`(line - start) * lineHeight` (relative to the visible band) while
`setScrollOffset` transforms the inner container by `-scrollTop` — which
assumes labels sit at ABSOLUTE document coordinates (the normal gutter's
convention, `(line - 1) * lineHeight`). Once scrolled, band-relative labels
plus the scroll transform lands rows in the wrong place.

## Change

- inline-diff-gutter-columns.ts: labels now use `(line - 1) * lineHeight`
  (absolute), matching the normal line-number gutter; the scroll transform then
  aligns them exactly.
- +Regression test (`inline-diff-gutter-columns.test.ts`): labels at absolute
  positions for any band (3..5 → 40/60/80px), inner transform == -scrollTop,
  hide/show + dispose behaviour.

## Completion (live: ascii-drawing-tool public/app.js@43985c3)

- [x] Left + middle column row tops identical at every scroll depth (0/300/680/
      1040/1470 lines; e.g. line 300 → both 5980px).
- [x] Tests: uikit file-editor 62; typecheck/lint/build green; 0 captured errors.
