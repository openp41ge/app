2026-08-31

# Inline diff columns: before only left, after only right, never both

## Goal

Fix the broken pair numbers in the inline commit-diff gutter. The two number
columns are BEFORE and AFTER:
- deleted row → a number in the BEFORE (left) column only,
- added row   → a number in the AFTER (middle) column only,
- unchanged context rows → their AFTER (new-file) number,
- NEVER a number in both before and after on the same row.

## Changes

- file-editor `setInlineDiff` provider: the left (BEFORE) column shows the old
  number ONLY on removed rows (added rows have no before side); the middle
  (AFTER/normal) gutter shows the new number only on added + context rows;
  removed rows render blank there. The combined `old new sign` single-cell
  label is gone; widths account for which column each side actually uses.

## Completion (live: ascii-drawing-tool public/app.js@43985c3)

- [x] Top change: deleted → before "2" left, after blank; added → before blank,
      after "2" right.
- [x] 0 rows across all 1490 lines show a number in BOTH columns
      (never-both invariant holds).
- [x] Tests: openp41ge 1071, git 47, uikit editor 57; typecheck/lint/build
      green; 0 live captured errors.
