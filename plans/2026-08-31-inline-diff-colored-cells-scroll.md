2026-08-31

# Inline diff: scrollable line columns + colored number cells (drop +/-)

## 1. Scroll over the line columns

**Bug**: wheel over the line-number columns did not scroll the editor.
**Fix**: forward wheel from the columns to the editor viewport:
- `InlineDiffGutterColumns` takes a `scrollTarget` (the viewport) and binds a
  non-passive wheel listener on its column.
- `<file-editor>` binds the same forwarding on the normal `.fe-gutter`
  (AFTER column) once (`_gutterWheelBound` guard).
- Hovering any number column now scrolls exactly like the text area.

## 2. Drop the +/− sign column; color the number cells instead

**Change**: remove the transparent sign/glyph column entirely. The change
indication is now the NUMBER CELL background, colored all the way across each
column:
- deleted row → BEFORE (left) cell tinted red (`fe-inline-removed-cell`,
  rgba(248,81,73,.22/.24))
- added row → AFTER (middle) cell tinted green (`fe-inline-added-cell`,
  rgba(46,160,67,.22/.24) on the normal `.line-number`)
- context rows keep plain cells; row tints on the text stay.

Files:
- inline-diff-gutter-columns.ts rewritten: left column only (+ decoder info
  `{ leftLabel, cls }`), scroll target, absolute label positions, wheel fwd.
- line-numbers-overlay.ts: new optional `getLabelDecoration(lineNumber)` config
  (+ per-entry `cellCls` management) to color the normal gutter's number cell.
- file-editor.ts: provider returns `cls`; overlay config adds
  `getLabelDecoration` for added rows; CSS swaps sign rules for cell rules;
  wheel forwarding on gutter + viewport as column scroll target.

## 3. Debug note (root cause of failing tests mid-change)

My new comment text inside the `style.textContent = \`...\`` template used raw
backticks (`\`.line-number\``), which TERMINATE a JS template literal, so the
sheet tail re-parsed as code and threw `ReferenceError: number is not defined`.
Comments inside the style template must never contain a raw backtick. Fixed the
comment text; inline-diff.test went 5/5.

## Verification

- uikit+editor-engine: 144 tests (incl. new gutter-columns absolute-position,
  scroll-transform, decoration-class, wheel-forwarding cases).
- openp41ge: 1071 tests; typecheck/lint/build green.
- Live (public/app.js @ 43985c3): no `.fe-inline-sign`; left 50px / mid 50px;
  deleted row → red cell, added row → green cell, recalll row bg values
  rgba(248,81,73,.24) / rgba(46,160,67,.24); wheel over left gutter + normal
  gutter scrolls viewport (0→160→280); 0 captured errors.
