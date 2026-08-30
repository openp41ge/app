2026-08-31

# Commit-file diff inlined in the REAL file editor

## Goal

Replace the separate "diff document" view. The file editor should LOAD the
file at the commit as a REAL buffer (full syntax highlighting, real line
numbers, scroll/find/selection) with the commit's additions/deletions INLINED
in the editor — green added rows, red deleted rows — and no `@@` headers.

## Changes

- openp41ge-git: `buildInlineDiffDocument` → `buildInlineDiffFile(content,
  hunks)` returning `{ text, rows }`. `text` is the FULL post-commit file with
  removed lines spliced back at their positions (a normal loadable buffer);
  `rows` decorates each buffer line (`added`/`removed`/`context` + the real
  new-file line number, null for removals). No header rows. Removed
  `DiffDocument`/`DiffLine`.
- editor-engine: `LineNumbersOverlay` gains `getLabelOverride` (string replaces`
  a number, "" blanks it, null = default). The gutter shows the file's real
  numbers; deleted rows are blank.
- uikit `<file-editor>`: removed all diff-document mode (setDiffDocument etc.).
  New `setInlineDiff(rows)` decorates the loaded buffer: added rows get a green
  full-width tint, removed rows red (new `InlineDiffHighlightsRenderer` inside
  the viewport, scroll-synced via the visible-band hooks). File points to the
  real buffer, so tokenization/syntax highlighting is untouched.
- Pane: fetches content + hunks in parallel, builds the inline file, creates a
  model + loadFile (uri ends with the file name so language detection engages),
  then setInlineDiff. text/rows cached in the snapshot.

## Completion (live-verified ascii-drawing-tool public/app.js@43985c3)

- [x] Editor shows the WHOLE 1490-line buffer through the real editor
      (1356 post lines + 134 spliced removals); gutter "1,,2,3,4…".
- [x] No "@@" anywhere; red/green tints follow scroll; read-only, 0 errors.
- [x] Syntax highlighting on: hasTokenizer, 183 token spans, distinct token
      colors (gold/blue JS tokens).
- [x] Tests: openp41ge 1071, git 47, uikit file-editor 57; typecheck/lint/build
      green. Added openp41ge-git source alias to root vitest.config (was
      resolving stale dist).
