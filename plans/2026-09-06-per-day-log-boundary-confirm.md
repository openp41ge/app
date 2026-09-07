2026-09-06

# Per-day manual boundary in the file-backed log viewer (DONE)

## Goal

Make the file-backed log viewer auto-load the **current day** but require an
explicit click to read into **each older day** ("Load yesterday's logs" / "Load
logs from N days ago"). Within a single day, scrolling up still auto-loads older
lines. The per-day confirmation resets when the viewer is closed and reopened.

## Why

Today `readLogsBackward` transparently crosses daily file boundaries, so opening
the viewer can silently page through every retained day. Users want to stay in
the current day by default and confirm before pulling in a previous day's noise.

## Current behaviour

- `LogFileStore.readLogsBackward(cursor, limit)` loops across files, auto-crossing
  day boundaries (the `while (fileIndex < files.length)` loop). `hasOlder` is
  `true` if there are more lines in the current file **or** an older file exists.
- `LogFilePageReader` maps that to a `LogPageResult { entries, hasOlder, cursor }`.
- The viewer auto-loads older whenever `_hasOlder` and the user scrolls near top.
- In-memory `MemLogPageReader` has no day boundaries.

## Approach

1. **Main (`log-file-store.ts`, `LogBackPage`)**: stop auto-crossing files. Read
   strictly within `files[cursor.fileIndex]`. When that file is exhausted and an
   older file exists, return `hasOlder: false`, `cursor: null`, and a new
   `nextDay?: { cursor: LogBackCursor; label: string }`. Compute `label` from the
   next file's date (`daysAgo === 1` → "Load yesterday's logs", else "Load logs
   from N days ago"). When no older file remains, `nextDay` is `null`.
   Update the doc comment.

2. **Logger (`log-page-reader.ts`, `LogPageResult`)**: add optional
   `nextDayCursor?: unknown` and `nextDayLabel?: string`. Leave `MemLogPageReader`
   unchanged (returns no `nextDay`).

3. **Renderer reader (`log-file-page-reader.ts`)**: pass through `res.nextDay` as
   `nextDayCursor`/`nextDayLabel` in both `loadLatest` and `loadOlder`.

4. **Viewer (`openp41ge-log-viewer.ts`, light DOM)**:
   - Add `_nextDayCursor` / `_nextDayLabel` fields; reset both in `_start()`.
   - `_loadLatest` (success + fallback) and `_loadOlder` set them from the page.
   - Change `_loadOlder(target?)` to accept an explicit cursor (used when the
     confirm row is clicked) and only guard `_hasOlder` on the auto path.
   - Render a clickable `.day-boundary` row at the top of `.log-list` (above the
     oldest entry) when `_nextDayCursor` is set; `@click` → `_loadOlder(_nextDayCursor)`.
   - `_onScroll` keeps auto-loading only when `_hasOlder` (within-day); no auto
     cross of `nextDay`.
   - Style the row (bright, bordered, clickable) and label it `_nextDayLabel`.

5. **IPC shape (`global.d.ts`)**: add `nextDay?: { cursor: LogBackCursorShape; label: string }`
   to `LogBackPageShape`.

6. **`log-handlers.ts`**: unchanged (returns the whole store result; the store now
   supplies `nextDay`).

## Tests

- `log-file-store` unit: reading within a file returns `hasOlder` + `cursor` and
  `nextDay: null`; exhausting a file with an older file returns `hasOlder:false`,
  `cursor:null`, `nextDay` set with a label; no older file → `nextDay:null`.
- `openp41ge-log-viewer`: an injected reader producing `nextDayCursor` renders the
  `.day-boundary` row; clicking it prepends the next day and clears/resets the row;
  the auto scroll-up path does not cross a `nextDay` boundary.
- `log-file-page-reader`: maps `nextDay` → `nextDayCursor`/`nextDayLabel`.

## Completion criteria

- `nx run-many -t typecheck`, `nx lint`, `nx format:check`, `nx run-many -t test`,
  `nx run openp41ge:build` all pass. ✅
- Live: opening the viewer shows today's logs; scrolling to the top shows
  "Load yesterday's logs"; clicking loads that day and repeats at each boundary;
  closing/reopening resets to today.

## Status

Done. Store, reader, viewer, IPC shape, and tests updated:

- `log-file-store.ts`: `readLogsBackward` no longer auto-crosses files. Returns
  `hasOlder:false, cursor:null, nextDay:{cursor,label}` at a day boundary.
- `log-page-reader.ts`: `LogPageResult` gains optional `nextDayCursor`/`nextDayLabel`.
- `log-file-page-reader.ts`: maps `nextDay` → `nextDayCursor`/`nextDayLabel`.
- `openp41ge-log-viewer.ts`: renders a clickable `.day-boundary` row labelled from
  `nextDayLabel`; clicking loads the previous day; auto scroll-up never crosses a
  boundary. State resets in `_start()`.
- `global.d.ts`: `LogBackPageShape` gains optional `nextDay`.
- Tests: store day-boundary (was "continues into previous day" — rewritten),
  viewer day-boundary (3 new), log-file-page-reader `nextDay` mapping (2 new).

Verification: logger 101 pass; platform 1223 pass; typecheck/lint/format/build clean.
Live UI verification not performed — requires a fresh main process
(`nx run openp41ge:dev` restart). Recommend a manual QA click-through.
