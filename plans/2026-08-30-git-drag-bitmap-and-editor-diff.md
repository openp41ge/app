2026-08-30

# Git-search drag bitmap + VS Code-style editor diff

Two follow-ups on the commit-search work:

1. **Drag bitmap captures sub-rows.** Dragging a commit-search row with
   expanded file rows gives a ghost of the row AND its sub-rows. The capture
   rect (main-process `capturePage`) uses the whole `row.getBoundingClientRect()`,
   and in `_commitRow` the file rows are CHILDREN of the row. Fix: capture only
   the row's own header band (`.commit-result-head`) for commit-result rows.

2. **Diff feels like a <pre>, not an editor diff.** Convert `SearchHunk[]` into a
   real diff **document structure** and render it in the `<file-editor>`, read-only,
   VS Code style: gutter line numbers (old|new), green added / red removed row
   backgrounds, +/- glyphs, `@@` header rows.

## A. Drag fix (`init-drag-system.ts`)

In the git-entry drag-start handler, for `data-git-search-result` rows capture the
**header band** rect/height (`row.querySelector('.commit-result-head')`) instead of the
full row (which spans the expanded sub-rows). Offset/ghost size use the band too.
Regression: expanded commit row drags as just the header; collapsed rows look identical.

## B. Diff document (`openp41ge-git`)

- New types: `DiffLine { type: "context"|"added"|"removed"|"header"; text; oldLine?; newLine? }`,
  `DiffDocument { lines: DiffLine[] }`.
- New `hunksToDiffDocument(hunks: SearchHunk[]): DiffDocument` — parses each `@@ -O,C +N,C @@`
  range (counts optional; `0` start for new/removed files), walks lines assigning
  old/new numbers: context -> both, added -> new only, removed -> old only, header ->
  `@@` line as a header row.

## C. `<file-editor>` diff mode (`openp41ge-uikit`)

- New method `setDiffDocument(doc: DiffDocument | null)` (+ property `diffDocument`).
  Enters **read-only diff mode**: pending diff is applied when the viewport exists;
  `setReadOnly(true)`, status bar stopped, current-line highlight off.
- Rendering inside the existing `.fe-viewport` (overflow-y auto): rows absolutely
  positioned at `top = i*lineHeight`, full width, each row = [gutter numbers 48px:
  old|new] + [glyph] + [text]. Per-type styling via classes (green tint bg +
  `+`, red tint bg + `−`, context neutral, header muted). Gutter hidden.
- Guard every normal-mode path (find/selection/line-width) so diff mode never
  touches the tokenizer/model. `clearDiffDocument()` restores normal mode when a
  real file loads.

## D. Wire `commit-file-diff` pane

Replace the `<pre>` block with `<file-editor>` + `setDiffDocument(hunksToDiffDocument(hunks))`,
keeping the header (repo · path · hash). Diff fetch uses `getCommitFileHunks(...,"",{})`
unchanged; cached `DiffDocument` restores instantly. Add `data-commit-diff` +
`data-diff-line` attributes for tests.

## Tests

- openp41ge-git: `hunksToDiffDocument` — header parse (multi-line ranges, optional
  counts, added-file `0,0`), old/new numbers, types.
- openp41ge-uikit: `file-editor` diff mode — setDiffDocument renders rows with
  correct classes/counts, read-only (no caret/textarea), clear restores.
- openp41ge: pane test switches to diff-line assertions; new init-drag-system test
  asserts commit-result capture uses the header band (not the full expanded height).
- Full `nx run-many -t test`, typecheck, lint, build; live-verify drag ghost +
  diff rendering in dev (main restart for the drag handler is renderer-only, so HMR
  covers it; service unchanged).

## Completion

- [x] Drag ghost of an expanded commit row shows only the row header (live: 135px row → 39px head band captured).
- [x] `hunksToDiffDocument` + `<file-editor>.setDiffDocument` render VS Code-style read-only diff (green/red rows, line numbers, glyphs).
- [x] Suites green (openp41ge-git 46, file-editor 58, openp41ge 1069/1069); typecheck/lint/build; only pre-existing openp41ge-filesystem:test fails (no test files).
- [x] Live-verified in dev: editor diff mode shows 413 rows (74 added/134 removed) with green/red bg + glyphs, read-only; drag pending measures head band; 0 captured errors.
