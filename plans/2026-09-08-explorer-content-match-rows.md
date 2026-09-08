# 2026-09-08 — Explorer content-match row rendering (gutter, highlight)

## Goal

Improve how content-search match rows render in the Explorer repo tree:

1. **Line-number gutter** — numbers right-aligned in a fixed-width gutter
   (width fits the file's largest match line number), with a background so
   the leading space reads as the gutter, not blank space.
2. **Reduced indentation** — match rows currently sit one full tree depth
   deeper than the file; pull them back so they align near the file row's
   label instead of far to the right.
3. **Syntax highlighting** — colour the matched line's tokens (keywords,
   strings, comments, numbers, functions, …) like the editor.
4. **Highlight the matched search term** — wrap the query occurrence in a
   distinct `.cm-match-term` background.

## Approach

### Phase 1 — uikit tree: allow rich label rendering

- `packages/openp41ge-uikit/src/components/tree/types.ts`:
  - Add `TreeNodeLabelContext { depth, paddingLeft, labelOffset, indentPerLevel }`.
  - Add `TreeNodeLabelRenderer = (node, ctx) => TemplateResult | string`.
  - Add `renderLabel?: TreeNodeLabelRenderer` to `TreeNode`.
- `packages/openp41ge-uikit/src/components/tree/tree.ts`:
  - In `_renderNode`, compute `labelOffset` (chevron-cell + icon-cell widths)
    and call `node.renderLabel?.(node, ctx)` when present, else render
    `node.label` as today.

### Phase 2 — lightweight line highlighter

- `packages/openp41ge-uikit/src/highlight/highlight-line.ts` (new):
  - `highlightLine(text, opts): string` — synchronous regex tokenizer that
    wraps keywords/strings/comments/numbers/functions/types in `.s-*` spans
    (reusing the editor's scope class names), and wraps the matched search
    term in `.cm-match-term` (respecting regex/case flags).
  - `languageFromPath(path)` — map a file path to a language id via the
    `openp41ge-syntax-highlighting` `TokenRegistry` extension table.
  - Pure, no DOM. Unit-testable.

### Phase 3 — repo-tree-item: build gutter rows

- `packages/openp41ge/src/renderer/components/openp41ge-repo-tree-item.ts`:
  - `_contentMatchNodes(branch, filePath)`: compute the file's max-match line
    digit count, then give each match node a `renderLabel` that returns a
    gutter + highlighted-code row. Set `reduceIndent: 16` so the tree pulls
    the row back one level to align near the file row.
  - `_themeTokenVars()`: read theme colours from
    `appServices.configService.getSyntaxTheme()` → `getThemeById()`, and set
    them as `--cm-*` custom properties inline on the `<openp41ge-tree>`
    element.

### Shadow-DOM CSS (important)

The match rows render inside the `openp41ge-tree` **shadow DOM**, so CSS in the
repo-tree-item's light-DOM `<style>` cannot reach them. The `.cm-match-*`
structural rules therefore live in `tree-styles.ts`, reading the theme-driven
`--cm-*` custom properties set on the tree's host element.

- `packages/openp41ge-uikit/src/components/tree/tree-styles.ts`:
  `.cm-match-row/gutter/code/term` and `.cm-match-code .s-*` colour rules
  (with `--cm-*` fallbacks).

### SOLID / UX

- **S** — highlighter is its own pure module; the row builder stays in
  repo-tree-item.
- **O** — `renderLabel` + `reduceIndent` are additive; existing nodes
  unaffected.
- **D** — highlighter depends only on its own language map + a theme string;
  no platform coupling.
- **UX** — gutter background = `--cm-gutter-bg`/`#1a1a1a`; term highlight =
  `rgba(234,140,0,0.32)` (matches the editor find-match). Numbers right
  aligned; code monospace; row hover unchanged.

## Files Changed

- `packages/openp41ge-uikit/src/components/tree/types.ts` — renderLabel + ctx + reduceIndent
- `packages/openp41ge-uikit/src/components/tree/tree.ts` — use renderLabel
- `packages/openp41ge-uikit/src/components/tree/tree-styles.ts` — `.cm-match-*` shadow rules
- `packages/openp41ge-uikit/src/highlight/highlight-line.ts` — **new**
- `packages/openp41ge-uikit/src/index.ts` — export highlight helpers
- `packages/openp41ge/src/renderer/components/openp41ge-repo-tree-item.ts`
- tests: `packages/openp41ge-uikit/test/highlight/highlight-line.test.ts`,
  `packages/openp41ge-uikit/test/tree/tree.test.ts`,
  `packages/openp41ge/test/integration/system-tabs/explorer-search.test.ts`

## Testing Strategy

- Unit test `highlightLine` (keyword/string/comment/number, term wrap,
  regex + case handling, empty query).
- Uikit tree: a node with `renderLabel` renders the custom label.
- Explorer integration: match nodes still open at the instance; the gutter
  row carries the line number, and the term is highlighted.
- Quality gate: `nx run-many -t test typecheck`, `nx lint`, `nx format`.

## Completion Criteria

- [x] Match rows render a right-aligned line-number gutter with background.
- [x] Match-row indentation is visibly reduced (near the file row).
- [x] Matched line content is syntax-highlighted.
- [x] The matched search term is highlighted (all occurrences per line).
- [x] Match-row click still opens at the instance; file-row click opens at top.
- [x] Tests pass; typecheck/lint/build clean.
