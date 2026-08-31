2026-08-31

# Inline diff numbers: two columns, before | after, mostly both full

## Goal

Two LINE-NUMBER columns, both mostly full:
- LEFT  = BEFORE — the old-file numbers. Every context (unchanged) line and
  every deleted line has a before number. GAP only on added lines (they did
  not exist before, so they have no before number).
- RIGHT = AFTER — the new-file numbers. Context and added lines have an after
  number. GAP only on deleted lines (they have no new side).
A changed line shows exactly one side; unchanged lines show both (same area is
full). The two columns drift apart exactly where the other column changed
(additions push the AFTER number up, deletions pull it down).

## Changes

- git builder: added `parseHunkRanges` (full `@@ -O,C +N,C2 @@`); added rows now
  carry `oldLine: null` (no before); gap/tail context rows carry the true OLD
  number via a `shift` accumulated from each hunk's (`oldCount - newCount`), so
  context lines after a change show honest before/after pairs (e.g. `62 | 63`).
- file-editor: left (BEFORE) provider fills context + deleted rows and gaps
  added rows; middle (AFTER) fills context + added rows and gaps deleted rows;
  widths match whichever columns are actually filled.

## Completion (live: ascii-drawing-tool public/app.js@43985c3)

- [x] context rows: 1282/1282 show a number in BOTH columns; deleted 134/134
      before-only; added before-gap / after-number; drift visible after changes
      ("62 | 63" on a context line after an insertion).
- [x] Tests: openp41ge 1071, git 47, uikit editor 58; typecheck/lint/build
      green; 0 live captured errors.
