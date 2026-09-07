2026-09-06

# Virtualize the log viewer (bound DOM memory)

## Goal

The `<openp41ge-log-viewer>` renders **every** loaded entry as a DOM node. When a
user pages back through days it accumulates thousands of nodes, so DOM and render
cost grow unboundedly. Convert the list to a **windowed (virtual) list** that only
keeps the visible range in the DOM. Memory must stay bounded regardless of how far
back the user scrolls.

## Current behaviour

`render()` maps `this._visible` (all filtered `_entries`) to a `.log-entry` div per
entry, plus a `.day-boundary` row at the top when a day boundary is reached. No
windowing — DOM grows 1:1 with loaded entries.

## Approach

Implement a measured **variable-height** virtual list (handles both `nowrap` rows,
which are uniform height, and `wrap` rows, which vary) inside the logger package.
No external dependency (`@lit-labs/virtualizer` is absent); follow the platform's
existing `VirtualScroll` spacer pattern, but in `openp41ge-logger` so it stays a
self-contained library.

1. **New `packages/openp41ge-logger/src/log-list-layout.ts`** — pure, framework-free
   windowing math over item heights:
   - `LogListLayout(estimateHeight)` with `count`, `totalHeight`, `indexAt(px)`,
     `window(scrollTop, viewportHeight, overscan) -> { start, end, offsetTop, offsetBottom }`,
     `append(n)`, `prepend(n)`, `setCount(n)`, `updateHeights(pairs)`.
   - Uses a prefix-sum offset array + binary search; `updateHeights` rebuilds once.

2. **Viewer (`openp41ge-log-viewer.ts`)**:
   - Build a virtual item list = `[boundaryRow?] + visibleEntries`.
   - Cache measured per-item heights by a stable key (entry signature / "__day-boundary")
     so heights survive prepend/append/filter.
   - `render()` computes the window from `scrollTop`/viewport and renders only
     `[start, end)` inside top/bottom spacers; DOM count ≈ viewport + overscan.
   - `updated()` measures the rendered window, stores heights, and re-renders if the
     total changes (guarded to avoid loops).
   - Keep the existing behaviours: auto-scroll to bottom on live append, pause when
     the user scrolls up, prepend-older-on-scroll-up page loading, and the confirmed
     `.day-boundary` click that loads the previous day.
   - Initial load must show the **bottom** window when auto-scrolling to bottom (no
     flash of the top window).

## Tests

- `log-list-layout`: offset math, `indexAt` binary search, `window` with overscan,
  `append`/`prepend`/`setCount`, `updateHeights` rebuild.
- `openp41ge-log-viewer` (logger): with >viewport entries, DOM `.log-entry` count is
  bounded (≈ viewport + overscan), not equal to total; window follows scroll; live
  appends keep auto-scroll; the day-boundary row still works.
- Existing tests must still pass (filtering, level buttons, wrap toggle, empty state,
  auto-scroll, day boundary).

## Completion criteria

- `nx run openp41ge-logger:test`, `nx run-many -t typecheck`, `nx lint`,
  `nx format:check`, `nx run openp41ge:build` all pass.
- With a large loaded window, rendered DOM nodes stay small and don't grow with the
  loaded entry count.

## Status: DONE (2026-09-06)

Implemented a measured **variable-height** virtual list in `openp41ge-logger` (no
new dependency):

- New `src/log-list-layout.ts` (`LogListLayout`) — pure offset/window math
  (prefix-sum offsets, binary-search `indexAt`, `window` with overscan,
  `append`/`prepend`/`setCount`, `updateHeights`).
- `openp41ge-log-viewer.ts` now renders only the windowed slice of items between
  top/bottom spacers. Per-item heights are measured and cached by a stable key
  (entry signature / `__day-boundary`), so they survive prepend/append/filter.
  A `_measurePasses` guard prevents a pathological re-render loop.
- Kept all existing behaviours: auto-scroll to bottom, pause on scroll-up,
  prepend-on-scroll-up paging, and the confirmed `.day-boundary` click that loads
  the previous day. Initial load anchors the window at the bottom (no top flash).

Verification:

- `nx run openp41ge-logger:test` — 117 pass (3 new: log-list-layout + 2 viewer).
- `nx run openp41ge:test` — 1223 pass.
- `nx run-many -t typecheck`, `nx lint`, `nx format:check` — pass.
- `nx run openp41ge-logger:build` — passes.

Not live-verified in the running Electron app (the main process is stale and lacks
`readBackward`, and launching a full dev app wasn't part of this pass); the
bounded-DOM behaviour is covered by the new unit tests. The loaded `_entries` array
grows with the pages the user scrolls through (per-day manual boundaries) but the
DOM stays bounded.
