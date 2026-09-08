2026-09-06

# Log viewer search covers explicitly-confirmed previous days

## Goal

When the user clicks the day-boundary row ("Load yesterday's logs") in the log
viewer, the in-log search (Cmd/Ctrl+F) must also search through the logs of the
day that was just loaded. Search today covers only today; after confirming a
boundary, search must extend to include that day too.

## Rationale

Today the search drains today's file fully (so it can match entries the user
hasn't scrolled to) but filters results to `timestamp >= todayStart` — so even
after the user explicitly loads the previous day via the boundary button, the
search ignores those entries. The user wants the search to be a faithful "find in
what I've opened": confirming a day makes that day part of the searchable surface.

## Approach

All changes are in the self-contained `openp41ge-logger` viewer. No IPC/platform
changes.

### 1. Drop the `todayStart` filter (`_computeSearchMatches`)

File: `packages/openp41ge-logger/src/openp41ge-log-viewer.ts`

- Remove the `const todayStart = this._todayStartMs()` and the
  `if (entry.timestamp < todayStart) continue;` guard so search matches every
  loaded entry in `_visible`, regardless of day.
- Delete the now-unused `_todayStartMs()` helper.

This is safe because the only way a previous day enters the loaded window is the
explicit boundary click — the auto-load-on-scroll path stops at a day boundary
(`_hasOlder` false → `_loadOlder()` no-target early-returns). So "all loaded"
equals "today + any day the user confirmed."

### 2. Re-drain the just-confirmed day for search (`_loadOlder`)

- Rename `_drainToday` → `_drainSearchWindow` and `_todayDrained` → `_searchDrained`
  for clarity (the drain now spans the confirmed-day window, not just "today").
- In `_loadOlder`, when it is called with a `target` (i.e. the day-boundary row
  was clicked — not the scroll auto-load path), after applying the page:
  - reset `this._searchDrained = false`, and
  - if the find bar is open, schedule a search refresh (`_scheduleSearch()`), which
    re-drains the remainder of the just-loaded day and re-computes matches.

`_drainSearchWindow` already stops when `hasOlder` is false, i.e. it drains the
current day up to the _next_ day boundary without auto-crossing. So after a
boundary click it loads the rest of the confirmed day and stops at the
subsequent (still-unconfirmed) boundary — exactly the existing per-day manual
confirmation behaviour, extended to search.

`_scheduleSearch()` (debounced) is used rather than a direct `_refreshSearch()`
to avoid interfering with `_loadOlder`'s own scroll-preserve delta.

### 3. UX/notes

- Search still never auto-crosses an unconfirmed boundary: it only extends into a
  day after the user clicks that day's boundary row.
- No focus/keyboard change. Count/navigation/highlighting logic is unchanged; only
  the set of entries searched grows.

## Files Changed

- `packages/openp41ge-logger/src/openp41ge-log-viewer.ts` — remove `todayStart`
  filter + `_todayStartMs()`; rename `_drainToday`/`_todayDrained` →
  `_drainSearchWindow`/`_searchDrained`; reset drain + schedule a refresh on a
  boundary click in `_loadOlder`.
- `packages/openp41ge-logger/test/unit/logger/openp41ge-log-viewer.test.ts` —
  update the "only searches today's logs" test (older loaded entries now match);
  add a test that clicking the day-boundary row makes the loaded day searchable;
  update `_todayDrained` references to `_searchDrained`.

## Testing Strategy

- **Unit (logger, `openp41ge-log-viewer.test.ts`):**
  - New test: seed a reader whose `latest` is today + a `nextDay` boundary and whose
    `older` returns yesterday's entries for the next-day cursor. Search before the
    click excludes the yesterday entry; after clicking the `.day-boundary` row the
    search matches it (count grows).
  - Update "only searches today's logs" → "searches entries once they are loaded,
    including older days" (a loaded `old foo` row is matched).
  - Existing search/boundary tests remain green; update `_todayDrained`→`_searchDrained`.
- **Typecheck/lint/test:** `nx run openp41ge-logger:test`, `nx run-many -t typecheck`.

## UX Considerations

- The find bar's count and nav now reflect all confirmed days, not just today.
- The day-boundary row still requires a click; search never auto-loads a previous
  day on its own (matches the per-day manual confirmation UX).
- Opening the find bar with an empty query still must not drain/prepend anything
  (existing behaviour preserved).

## Completion Criteria

- [x] After clicking the day-boundary row, in-log search matches the loaded day's
      entries (and any further confirmed days).
- [x] Search never auto-crosses an unconfirmed day boundary.
- [x] `nx run openp41ge-logger:test` passes; logger + platform typecheck/lint clean.
- [ ] Live-verify: open a log viewer, search today, click "Load yesterday's logs",
      confirm the count now includes yesterday matches.
