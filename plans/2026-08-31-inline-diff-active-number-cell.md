2026-08-31

# Inline diff: clicking a number highlights both number cells

## Goal

When the user clicks a line number, the text row already gets selected
(correct, via `selectLine`). Add a matching highlight on the row's NUMBER
CELLS in BOTH columns (BEFORE left + AFTER middle) so the active row is
obvious across the gutter.

## Design

Active row = the primary cursor line (same source as `CurrentLineHighlight`),
already re-rendered on every cursor move. So the highlight tracks the cursor
and works from any click path (number click, text click, arrow keys).

- AFTER (middle) cell: `LineNumbersOverlay.getLabelDecoration` now returns
  space-separated classes; the overlay applies/clears them token-wise
  (`cellCls` became `string[]`). file-editor's decoration callback appends
  `active-line-number` when `lineNumber === _activeDiffLine`. The overlay's
  `setActiveLine` already repaints visible labels (via `_updateAll`), so no
  extra repaint wiring is needed.
- BEFORE (left) cell: `InlineDiffGutterColumns.setActiveLine(line | null)`
  toggles `fe-inline-left-active` on its entries; also applies in
  `setVisibleRange` so freshly-painted labels carry it.
- Clicking a BEFORE number now also selects the line (new `onLineClick`
  callback on the columns, wired to `selectLine`) — matches the AFTER column.
- CSS: active cells get an inset 1.5px ring in `--fe-cursor-color` so the ring
  reads on top of red/green tinted cells.

## Key gotchas

- ORDER: `_activeDiffLine` must be updated BEFORE `setActiveLine`, because the
  latter repaints immediately and reads `getLabelDecoration` synchronously.
  (First live pass lit the BEFORE cell only — the AFTER cell missed the change
  exactly because of this ordering.)
- Template-literal hygiene: the CSS block inside `style.textContent = \`...\``
  must not contain raw backticks or unescaped `${` in comments (a backtick
  terminates the template — see previous commit's `number is not defined`).

## Verification

- New tests: overlay token-decoration compose/clear/update; gutter-columns
  `setActiveLine` toggle + repaint persistence + clear + click callback.
- uikit file-editor dir 74 (incl. pane), openp41ge 1071, typecheck/lint/build
  green.
- Live (public/app.js @ 43985c3): click AFTER number of line 4 -> BOTH cells
  active (`active-line-number` + `fe-inline-left-active`); click line 7 ->
  old line 4 highlight clears; text selects; 0 captured errors.
