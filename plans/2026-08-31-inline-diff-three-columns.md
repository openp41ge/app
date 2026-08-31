2026-08-31

# Inline diff: three parallel gutter columns (old | new | sign)

## Goal

Stop cramming "620 574 −" into one gutter cell. Render the inline commit-diff
line numbers in THREE parallel columns:
  left   — OLD line numbers, sharing the EDITOR background (a separate group
           from the normal gutter),
  middle — the normal line-number column with the NEW file numbers,
  sign   — a fully transparent column whose only visible content is the red −
           (deleted) / green + (added) glyph.

## Changes

- uikit `InlineDiffGutterColumns` — two new gutter columns inserted around the
  normal `.fe-gutter`: left (background `var(--fe-bg)`, right-aligned old
  numbers) and sign (transparent, centred +/− with `fe-sign-add/rem/none`
  classes). Labels are absolutely positioned per visible line and scroll via
  the same CSS-transform mechanism as the normal gutter.
- `<file-editor>`:
  - `_ensureInlineColumns()` creates them on firstUpdated AND at the end of
    `_initWithModel` (the pipeline teardown at its start disposes them).
  - `setInlineDiff` sizes each column to its content (old digits / new digits /
    glyph) and feeds a per-line provider; null hides the two extra columns and
    restores the default middle gutter.
  - middle gutter (LineNumbersOverlay) now shows ONLY the new number (removed
    rows without a new side blank); removed the old `old new sign` single-cell
    label.
- CSS: `.fe-inline-left` = editor bg; `.fe-sign-add` green / `.fe-sign-rem` red.

## Completion (live: ascii-drawing-tool public/app.js@43985c3)

- [x] Three columns render in parallel (widths left 50 / middle 50 / sign 23):
      left old numbers ("2","2"), middle new numbers, sign "−+" glyphs.
- [x] Left bg rgb(22,22,22) == editor root bg (vs gutter rgb(26,26,26)).
- [x] + green rgb(63,185,80); − red rgb(248,81,73); sign column transparent.
- [x] Scroll syncs all three columns; tints/tokens/no-@@/read-only unchanged.
- [x] Tests: openp41ge 1071, git 47, uikit editor 57; typecheck/lint/build
      green; 0 live captured errors.
