2026-08-31

# Inline diff: two-number gutter (old|new) + change sign, auto-widened

## Goal

In the file editor's inline commit-diff, the line-number column should show
TWO numbers on added/deleted rows (the old|new pair) plus a `+`/`−` sign, and
widen automatically to fit the widest label.

## Changes

- openp41ge-git `InlineDiffRow`: `fileLine` → `oldLine` + `newLine`. The builder
  walks each hunk with old/new cursors so every row carries its pair — a
  replaced line renders removed "620 574 −" then added "620 574 +"; pure
  additions/deletions drop the absent side ("3 +", "5 −"; deleted-file rows have
  no new side).
- uikit `inlineDiffLabel(row)` — the canonical gutter label (context = single
  new number; changed = `old new sign`) shared by the gutter renderer and the
  width calculation.
- `<file-editor>` `setInlineDiff`: sizes the gutter to the widest label
  (`widest * charWidth + padding`, min 48px); `setInlineDiff(null)` restores 48.
- engine `LineNumbersOverlay.setGutterWidth(width)` — runtime gutter resize.

## Completion (live: ascii-drawing-tool public/app.js@43985c3)

- [x] Top change shows "2 2 −" / "2 2 +"; mid-file shows real pairs like
      "620 574 −" / "621 574 +"; context rows single new number.
- [x] Gutter widened to 113px; back to 48 on clear.
- [x] Tests: openp41ge 1071, git 47, uikit editor 57; typecheck/lint/build
      green; 0 live captured errors.
