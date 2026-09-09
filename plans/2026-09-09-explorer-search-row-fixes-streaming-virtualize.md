# 2026-09-09 — Explorer search match-row fixes, streaming, and virtualization

## Goal

Fix the problems found in the last chunk of Explorer search work:

1. **Line-number gutter alignment** — numbers must align by place value (units/tens/hundreds align).
2. **Crop content around the match** — show the matched value with context instead of only the line's beginning.
3. **Gutter right border full height** — connect with all other match rows' right borders in a file's sublist.
4. **Gutter background block** — a visible background (with and without hover) that reaches the row's top/bottom edges so consecutive rows form a continuous colour block.
5. **Partial syntax highlighting** — some tokens stay white; expand token coverage + CSS scope classes + theme wiring.
6. **Streaming search** — content search must stream results into the renderer so the UI is not blocked.
7. **Virtualize the tree** — render only the visible rows (+top/bottom buffer) so syntax highlighting and rendering only run for what's on screen.

## Approach

### Phase 1 — Visual / layout fixes (uikit)

`packages/openp41ge-uikit/src/highlight/highlight-line.ts`
- Add `cropLine(line, start, end, opts)` — crops a line to a window around the
  matched range, inserting leading/trailing ellipsis when content is cut.
- Enhance `scanLine` to emit more scope classes (`s-var`, `s-pun`, `s-ent`,
  `s-sup`, `s-lbl`, `s-te`, `s-scl`) and to colour `foo.bar(`/member access and
  method calls so `.`-separated identifiers don't fall back to white.
- Expand `SCOPE_CLASS` for the new token kinds.

`packages/openp41ge-uikit/src/components/tree/tree-styles.ts`
- `.cm-match-row` stretches to the full row height (`align-self: stretch`).
- `.cm-match-gutter`: fixed `width: calc(Nch + padding)`, right-aligned number,
  `font-variant-numeric: tabular-nums`, full-height background + border-right.
- Add colour rules + `--cm-*` vars for the new scope classes (var/pun/ent/…).
- Add a `.tree-node--cm` variant that makes the label flush (remove default
  label padding/ellipsis) so the gutter block spans the row.

`packages/openp41ge-uikit/src/components/tree/tree.ts`
- When a node has `renderLabel`, add `.tree-node--cm` (flush layout) so the
  gutter can span full row height and align right borders.

`packages/openp41ge/src/renderer/components/openp41ge-repo-tree-item.ts`
- Use `cropLine` before `highlightLine` in `_contentMatchNodes`.
- Pass a per-file gutter width (max line-number digits) to the renderer.
- Wire all `--cm-*` theme vars (var/pun/ent/… via `_themeTokenVars`).

`packages/openp41ge-uikit/test/highlight/highlight-line.test.ts` + tree tests — extend.

### Phase 2 — Streaming search

`packages/openp41ge/electron/ipc-handlers/file-handlers.ts`
- Replace `file:searchContents` bulk return with a streaming channel:
  `file:searchContents:start` → returns `{ searchId }`; sends
  `file:searchContents:chunk` per file found; sends `file:searchContents:done`
  with a summary/caps. Use async `fs.promises.readdir`/`readFile` so the main
  process never blocks. Respect existing caps (200 files / 50 matches/file).

`packages/openp41ge/electron/preload.cjs`
- Expose `file.startContentSearch(query, roots, opts)` and
  `file.onContentSearchChunk(cb)` / `file.offContentSearchChunk(cb)`.
- Keep `file.searchContents` for any callers that want a one-shot await.

`packages/openp41ge/src/renderer/models/explorer-search-model.ts`
- `IExplorerSearchModel.searchContents` may now accept an `onChunk` callback and
  return a cancellable handle; the Ipc model subscribes to streaming chunks,
  accumulates `FileContentSearchResult[]`, and calls `onChunk` as files arrive.
  A new `searchToken` guards against superseded searches.

`packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts`
- In `_runSearch`, accumulate results incrementally: each chunk updates
  `_contentMatchesByPath`/`_contentMatchesByPath` and calls `requestUpdate()`
  so the tree paints as results stream in. Cancel the previous search on a new
  query/token.

Tests: `packages/openp41ge/test/unit/services/explorer-search-model.test.ts`.

### Phase 3 — Virtualize the tree (uikit + explorer)

`packages/openp41ge-uikit/src/components/tree/tree.ts`
- Flatten the visible nodes (with depth) into a single ordered list.
- When virtualization is active (measurable scroll viewport) render only the
  rows intersecting the viewport ± a buffer, as absolutely-positioned rows in a
  fixed-height `.tree-root`, and only call `renderLabel` for rendered rows.
- When there is no measurable viewport (jsdom / tests) fall back to the legacy
  nested render so existing behaviour and tests are preserved.
- Public `virtualize?: boolean` property; the explorer enables it.

`packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts` /
`openp41ge-repo-tree-item.ts`
- Enable `virtualize` on the explorer trees; the outer `.wt-tree-scroll`
  remains the single scroll container (`openp41ge-tree` host goes
  `overflow: visible; position: relative` under virtualization).

Tests: `packages/openp41ge-uikit/test/tree/tree.test.ts` + explorer integration.

## Files Changed

- `packages/openp41ge-uikit/src/highlight/highlight-line.ts`
- `packages/openp41ge-uikit/src/components/tree/tree-styles.ts`
- `packages/openp41ge-uikit/src/components/tree/tree.ts`
- `packages/openp41ge/src/renderer/components/openp41ge-repo-tree-item.ts`
- `packages/openp41ge/src/renderer/components/openp41ge-worktree-tree.ts`
- `packages/openp41ge/electron/ipc-handlers/file-handlers.ts`
- `packages/openp41ge/electron/preload.cjs`
- `packages/openp41ge/src/renderer/models/explorer-search-model.ts`
- `packages/openp41ge/src/renderer/models/test-models.ts`
- tests in uikit + openp41ge

## Testing Strategy

- Unit: `cropLine` (window sizing, ellipsis, no-op short line), `highlightLine`
  (new scope classes, member-access colouring), tree virtualization (visible
  range + buffer, fallback path).
- Integration: streaming search accumulates chunks and repaints per chunk;
  match rows render crop around the match; gutter alignment / block classes.
- Quality gate: `nx run-many -t typecheck test`, `nx lint`, `nx format`.

## Completion Status

- [x] Line numbers right-aligned by place value in a fixed-width gutter.
- [x] Match content crops around the matched value (with ellipsis context).
- [x] Gutter border-right runs full row height and connects across a file's rows.
- [x] Gutter background forms a continuous block (with and without hover).
- [x] Syntax highlighting colours the previously-white tokens (var/pun/ent/…).
- [x] Search streams results; UI updates while search runs; no blocking.
- [x] Tree virtualization is implemented in the uikit tree (flat windowed render +
      fallback when the viewport is not measurable) and unit-tested.
  - Note: not yet wired into the explorer file tree. That tree grows inside the
    drawer's scroll container, so its host has no bounded viewport to virtualize
    against; enabling it there requires giving the tree a bounded height/own
    scroll area (a larger layout change, kept out of this pass).
- [x] Tests pass (uikit 183, openp41ge 1834 passed).

## Implementation notes (deviations from the original sketch)

- Streaming channel names: `file:searchContentsStream` (invoke) with
  `file:searchContentsChunk` events carrying `{ type: 'chunk', result }` /
  `{ type: 'done', total }`; preload exposes `file.searchContentsStream`
  returning `{ promise, onChunk, destroy }`. Content walk is async and yields
  every 32 files so the renderer repaints incrementally.
- `cropLine` default window is 44 chars (`before: 6`, `after: 38`) so the match
  stays near the left edge and is visible in the narrow drawer.
- Added `openp41ge-uikit` / `openp41ge-uikit/theme` source aliases to the root
  vitest config so renderer code importing the uikit package (and subpaths like
  `file-editor`) resolves to source instead of the stale dist.

## Follow-up polish (match-row rendering + focus highlight)

- Vertical centring: `.cm-match-code` uses `line-height: var(--tree-row-height)`
  so the cropped matched text sits vertically in the row (was top-aligned).
- Hover/selected highlight: applied as a `background` on `.tree-node--cm`
  (BEHIND the content) so the line number and highlighted code are never
  covered. The app's theme highlight colours are opaque (`--bg-hover #2a2d2e`,
  `--tree-selected-bg` 60% `#2d2d2d`), so a full-row `::after` overlay (earlier
  attempt) painted them ON TOP of the text and hid it — reverted. The gutter
  colour is derived from the syntax theme's `gutterBg` but darkened in dark
  themes (`color-mix(… 70%, black)` → `#121212`) so it reads as a clearly
  distinct rail on the `#1e1e1e` explorer panel. On hover/selected the gutter
  blends with the highlight (`color-mix(... 35%, var(--tree-hover-bg/…))`) so
  the highlight shows through the rail instead of being cut off. Non-`--cm`
  rows keep the legacy `background`-based hover/selected.
- Indentation: the line-number gutter overhangs left (`margin-left`) so its
  RIGHT border aligns with the start of the file row's text, instead of the
  row content starting there.
- Clicked-instance emphasis: a content-match row carries `meta.matchIndex`;
  `openp41ge:open-file` → `FileOpenHandler` → `revealLine(..., matchIndex)` →
  `FileEditorElement.setSearchHighlight(query, opts, activeIndex)` sets the
  emphasised/navigated match, so the specific instance the user clicked renders
  with the stronger `find-match-active` highlight. Uikit `setSearchHighlight`
  gained an optional `activeIndex` and a private `_setActiveFindIndex` helper;
  the index is clamped to the recomputed match set.
- Typecheck note: openp41ge still reports the pre-existing
  `openp41ge-agent-settings.ts:1644` `nothing` → `TemplateResult` error.

## Follow-up polish (#2) — selection indicator over the gutter, streaming expansion, match counts

Three issues reported after the previous pass:

### 1. Blue arrow-key selection indicator hidden behind the line-number gutter

The keyboard/focus row indicator (`.tree-node--cm.selected` background and the
`:focus-visible` inset outline) was painted at the row's background layer, which
sits BEHIND the opaque `.cm-match-gutter` background, so it only peeked through
(greyish via the old hover/selected blend) and was fully hidden on the gutter.

Reworked the content-match row to use a three-layer stacking instead of an
opaque gutter that catches the selection:

- `.tree-node--cm { isolation: isolate; }` establishes a stacking context so the
  row's select/focus `::after` is confined to the row.
- `.tree-node--cm.selected { background: transparent; }` — the selection is no
  longer the row background.
- `.tree-node--cm.selected::after` / `:focus-visible::after` (z-index 2) draw
  the selection fill / focus outline ABOVE the gutter rail but BELOW the row
  text, so the indicator is visible across the whole row (including the rail).
- The rail was moved to `.cm-match-gutter::before` (z-index -1, opaque) so it
  stays the distinct, very-visible band; the line number is wrapped in
  `.cm-match-gutter-num` (z-index 3) and `.cm-match-code` (z-index 3) so text
  always paints above the selection.
- `.tree-node--cm.selected .cm-match-gutter` blend rule removed (selection is
  handled by the row `::after`); the `:hover` blend rule is kept so the gutter
  shows the hover highlight through it.

### 2. Folders not expanded during streaming search

`_revealContentDirs` had a one-time `_revealedContentBranches` guard. Results
stream in, so a match that appears in a later chunk under a brand-new directory
found the branch already “revealed”, skipped `expandDir` for that directory's
ancestors, and the folder rendered open with no children until close/reopen.

Removed the guard (and the `_revealedContentBranches` state). `_revealContentDirs`
runs on every `contentMatches` change and is idempotent (`expandDir` skips
loaded/loading dirs), so newly-streamed matches now reveal their directory chain
and their files render.

### 3. Match count badges

File rows show their match count, folder rows show the accumulated count of
matches under them, right-aligned via the existing `node.badge` slot:

- `_fileMatchCount(filePath)` → `contentMatches.get(p)?.matches.length`.
- `_countMatchesUnder(dirPath)` → sum of `matches.length` for every file under
  the directory.
- Wired as `badge` on file/folder nodes in `_buildFileTreeNodes` (only when a
  filter is active and the count is > 0).
- Gave `.tree-badge` a subtle pill background so the count reads clearly.

### Tests

- `explorer-search.test.ts` now asserts `badge` on the matched file `"1"`, the
  `src` folder `"2"` and `app.ts` `"2"`.
- New `content-match-reveal.test.ts` verifies `_revealContentDirs` reveals the
  ancestor chain for a match AND reveals a directory that only appears in a
  later (streamed) batch (no one-time guard).

### Verification

- uikit full suite: 21 files / 185 tests passed.
- openp41ge full suite: 144 files / 1838 passed, 20 skipped.
- uikit `tsc --noEmit` clean; openp41ge `tsc --noEmit` reports only the
  pre-existing `openp41ge-agent-settings.ts:1644` error.

## Follow-up polish (#3) — highlight only the specific match per content row

A content-search row represents a single match instance, but the cropped line
was re-highlighted with the whole query, so when the cropped window contained
several occurrences of the term (especially a short/common term appearing in
close succession) every occurrence got the `cm-match-term` emphasis. The row's
match highlight should pin to the one instance it represents.

### Change

- `highlight-line.ts` — `HighlightLineOptions` gained optional `matchStart`/
  `matchEnd`. When both are provided, `highlightLine` highlights only that
  single 0-based range in `text` instead of computing every `query` occurrence.
  The range is clamped to `[0, text.length]`; an empty/invalid range emits no
  term highlight. The default `query`/`regex`/`caseSensitive` path is unchanged
  for any other consumer.
- `openp41ge-repo-tree-item.ts` — the content-match `renderLabel` now calls
  `highlightLine(cropped.text, { language, matchStart: cropped.matchStart,
  matchEnd: cropped.matchEnd })` using the range `cropLine` already computed,
  so exactly one instance is wrapped in `cm-match-term`. `cropLine`'s
  `matchStart`/`matchEnd` already account for the leading-ellipsis marker, so
  the ellipsis is never highlighted.

### Verification

- `highlight-line.test.ts` gains three tests: highlights only the given range
  when the term appears multiple times; works without a query; clamps
  out-of-bounds and skips an empty range.
- Repo prebuild: uikit 21 files / 188 tests, openp41ge 144 files / 1841 passed
  + 20 skipped.
- The openp41ge typecheck initially flagged the new `matchStart`/`matchEnd`
  because it resolves `openp41ge-uikit` to the stale `dist`; rebuilt the uikit
  `dist` locally (source-alias in dev means this only affects type resolution)
  and the openp41ge `tsc --noEmit` is back to only the pre-existing
  `openp41ge-agent-settings.ts:1644` error.

## Follow-up polish (#4) — never leave “Searching…” stuck (real walk cancellation)

Typing a query slowly (e.g. “dr” on the way to “draw”) started a debounced
search per paused keystroke. Each `file:searchContentsStream` walk in the main
process only *removed its IPC listener* on `destroy()` — it never actually
stopped the walk. So superseded searches (“d”, “dr”, “dra”) kept walking the
whole tree with synchronous `fs` reads, piling up, saturating the main-process
event loop, and leaving the final search (and therefore the “Searching…”
indicator) crawling / appearing stuck.

### Change

- `file-handlers.ts` — `walkContentSearch` gained an `isCancelled` callback and
  checks it at the start of each directory, each entry, and after each yield
  (plus the root loop), so a superseded search stops promptly. The streaming
  handler accepts a `searchId`, gates its per-file `onFile` delivery on
  `isCancelled`, and registers `file:cancelContentSearch` to track cancel
  requests in a self-pruning `Map<searchId, timestamp>` (cancels that land after
  a search already finished are pruned so rapid typing can't grow it
  unboundedly).
- `preload.cjs` — `searchContentsStream` generates a `searchId`, passes it to
  the invoke, and `destroy()` now sends `file:cancelContentSearch(searchId)` in
  addition to removing the listener, so a superseded search is actually stopped
  in the main process.
- `openp41ge-worktree-tree.ts` — hardened `_runSearch` so a synchronous throw
  from starting a search (or a rejected `done`) can't leave `_searching` stuck:
  the `searchContentsStreaming` call and `await done` are inside a single try;
  if this token is still current, `_searching` is cleared either way.

### Tests

- `TestExplorerSearchModel` gained `deferStreaming` (pending `done` that a test
  resolves), `pendingStreaming`, and `cancelledStreaming` (records `cancel()`).
- `explorer-search.test.ts` adds a supersession test: a newer search calls
  `cancel()` on the previous session, `_searching` stays true while pending, and
  clears only once the latest search resolves.

### Verification

- openp41ge 144 files / 1842 passed + 20 skipped; uikit 21 files / 188 passed.
- openp41ge `tsc --noEmit` reports only the pre-existing
  `openp41ge-agent-settings.ts:1644` error.

## Follow-up polish (#5) — the search itself could hang on short queries

Even after real cancellation, a single 2-letter query still appeared stuck on
“Searching…” in a real project. The remaining cause was two-fold **performance**
problems in the main-process walk, not the renderer state machine:

1. `findMatchesInText` computed each match's line end with
   `text.indexOf("\n", idx)`, i.e. an O(n) scan **per match**. On a large
   minified/bundled file with a single giant line and a short query matching
   thousands of times, that is O(n²) and the whole search stalls.
2. The walk descended into `node_modules`, `dist`, `build`, `.git`, etc.,
   synchronously reading tens of thousands of files, so even a bounded query
   took a very long time.

### Changes

- `content-search.ts` — the line end is now derived from the **precomputed**
  `lineStarts` (`nextLineStart - 1`, or `text.length` for the last line),
  removing the per-match `indexOf` scan; line content and CRLF stripping are
  unchanged.
- `file-handlers.ts` — `walkContentSearch` now skips a `SKIP_DIRS` set
  (`.git`, `node_modules`, `dist`, `build`, `out`, `.next`, `.cache`, `.venv`,
  `__pycache__`, `coverage`, `target`, `.turbo`) and caps total files read at
  `MAX_SCANNED_FILES = 5000` (independent of the 200 matching-file cap), so a
  search always terminates in bounded time.

### Tests

- `content-search.test.ts` adds a regression test for a single-line file with
  3000 × 2 matches (asserts full line content reported, all on line 1) and a
  CRLF stripping test.

### Verification

- openp41ge 144 files / 1844 passed + 20 skipped; uikit 21 files / 188 passed.
- `dist-electron` (gitignored but what Electron actually loads via
  `main: dist-electron/electron/main.js`) was stale and still ran the O(n²)
  `content-search.js`. Rebuilt it (`tsc -p tsconfig.node.json`) so the fix is
  live; a **full** Electron restart (not just a renderer/Vite reload) picks it
  up.
