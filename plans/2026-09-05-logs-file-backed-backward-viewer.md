2026-09-05

# Log grid tab → file-backed, backward-paging viewer

## Goal

Rework the `log-viewer` grid tab so it:

- shows **all logs in plain datetime order** (drop the system→stream grouping added this turn),
- is **scrolled to the bottom** (latest logs) when opened and stays at the bottom as new
  entries arrive,
- **loads backwards**: starts at the bottom of the newest daily file, and as you scroll up it
  loads older lines from that file, then prepends the previous day's file, then the day before,
  and so on.

## Context

Logs are already persisted as daily JSONL files under `~/.openp41ge/logs/` (`openp41ge.log`
= live day, `openp41ge-YYYY-MM-DD.log` = archived days, 14-day retention). A `LogFileStore`
in the main process writes them. The `<openp41ge-log-viewer>` currently renders the renderer's
in-memory buffer (renderer-process logs only) with grouping. We switch the grid tab to a
**file-backed** source so it reflects _all_ logs (main + renderer) and pages backward through
history.

## Approach

### 1. Persist `system` in log files

`LogFileStore._serialize` / `_parseLine` / `PersistedLogEntry` gain a `system` field so the
backward reader can filter by system (sidebar system tabs). New entries carry `system`; older
files parse as `"unknown"`.

### 2. Backward paging API (main)

`LogFileStore` gains `readLogsBackward(cursor, limit, filter?)`:

- `cursor?: { fileIndex: number; lineCount: number } | null` — `null` = start at the very end
  (latest). `fileIndex` indexes `listFiles()` (0 = newest). `lineCount` = raw lines already
  served from that file's bottom.
- Reads backwards (bottom → top) across files, collecting up to `limit` entries matching the
  filter, returning them **oldest → newest**, plus the next `cursor` and `hasOlder`.
- New IPC `log:read-backward` (`ipcMain.handle`), preload `window.openp41ge.logs.readBackward(cursor, limit, system?)`,
  and `global.d.ts` types.

### 3. `LogPageReader` abstraction (openp41ge-logger)

Define in `openp41ge-logger` (self-contained, only depends on `lit`):

- `LogViewEntry` — display shape `{ timestamp, level, levelLabel, system, source, message, process }`.
- `LogPageResult` / `LogPageReader` — `loadLatest(limit)`, `loadOlder(cursor, limit)`,
  `subscribe(listener)`.
- `MemLogPageReader` — default in-memory implementation over `getLogBuffer()` + `subscribeLogs`
  (keeps the demo/tests working; pushed entries automatically appear via `subscribe`).

### 4. Viewer rewrite (`openp41ge-log-viewer.ts`)

- Drop grouping; render a flat, datetime-ordered list (level tag, time, `[source]`, message).
- Accept an injected `pageReader` (property); default = `MemLogPageReader`.
- On connect: `await loadLatest()`, render, auto-scroll to bottom.
- On scroll near the top: if `hasOlder`, `await loadOlder(cursor)` and **prepend** (preserve
  scrollTop).
- `pageReader.subscribe` appends new entries to the bottom; auto-scroll if at the bottom.
- Keep the level filter; `system` filter still scopes a sidebar-opened tab (flattened, no
  grouping).

### 5. File-backed reader (platform)

`packages/openp41ge/src/renderer/services/log-file-page-reader.ts` (new):

- Implements `LogPageReader` over `window.openp41ge.logs.readBackward`.
- Polls the newest file tail (~1s) for live entries, deduped by `(ts|level|source|message)`,
  and forwards them to subscribers.

`LogViewerController` injects it: `viewer.pageReader = new LogFilePageReader(system)`.

## Files Changed

- `openp41ge-logger/src/openp41ge-log-viewer.ts` — rewrite (backward paging, flat, auto-scroll).
- `openp41ge-logger/src/log-page-reader.ts` — new: `LogViewEntry`, `LogPageReader`, `MemLogPageReader`.
- `openp41ge-logger/src/index.ts` / `viewer.ts` — export reader + types.
- `openp41ge/src/main/services/log-file-store.ts` — persist `system`; `readLogsBackward`.
- `openp41ge/electron/ipc-handlers/log-handlers.ts` — `log:read-backward`.
- `openp41ge/electron/preload.cjs`, `openp41ge/src/renderer/global.d.ts` — `logs.readBackward`.
- `openp41ge/src/renderer/services/log-file-page-reader.ts` — new.
- `openp41ge/src/renderer/apps/log-viewer/log-viewer-controller.ts` — inject reader.
- Tests: viewer rewrite (grouping→flat, backward paging), `LogFileStore.readLogsBackward`,
  `log-file-page-reader`.

## Testing Strategy

- **Unit (logger)**: `MemLogPageReader.loadLatest/loadOlder`; viewer renders flat datetime list,
  prepends older pages, auto-scrolls to bottom.
- **Unit (platform)**: `LogFileStore.readLogsBackward` across multiple files + filter; reader maps
  cursor pages and dedupes live entries.
- **Integration**: `log:read-backward` IPC returns pages; grid tab opens scoped to system.
- **E2E (manual, no display here)**: open system → grid tab pinned at bottom; scroll up loads older
  lines, then yesterday's file.

## Open Questions (answered)

1. **Live updates** — source of truth is the file; live entries are picked up by polling the
   newest file tail (no main→renderer push, avoids echo). Interval ~1s.
2. **Grouping** — dropped entirely; the grid log tab is a flat, datetime-ordered list.

## Completion Criteria

- [x] Grid log tab shows a **flat, datetime-ordered** list (no system→stream grouping).
- [x] Viewer **starts scrolled to the bottom** (latest logs) and stays at the bottom as new
      entries arrive.
- [x] **Backward paging** — `LogFileStore.readLogsBackward` reads from the bottom of the newest
      file; scrolling up loads older lines from that file, then prepends the previous day's file,
      then the day before, and so on.
- [x] Logs are persisted with `system`; `log:read-backward` IPC + preload `logs.readBackward`.
- [x] `LogFilePageReader` (platform) reads files backward and picks up live entries by polling the
      newest file tail (deduped).
- [x] `openp41ge-logger` defines `LogPageReader` / `MemLogPageReader` (default); package stays
      self-contained. The grid tab shows **all logs** (no system/source filter — the persisted
      files predate the `system` field, so a system filter would hide every entry).
- [x] Sidebar header row removed; the sidebar is just the system list.
- [x] `LogViewerController` uses `LogFilePageReader` (the file-backed reader). The reader is now
      wired; the running dev **main** process must be restarted so it serves `log:read-backward`
      (the renderer falls back to the in-memory bus until then).
- [ ] Manual E2E (no display here): open a system → grid tab pinned at bottom; scroll up loads
      older lines, then yesterday's file.

### Known limitation

The grid tab shows all logs (no system filter) because the persisted daily files were written
before the `system` field existed and therefore parse as `system: "unknown"`. If per-system
scoping is wanted later, backfill `system` for old entries or thread a `system` filter into
`readLogsBackward` (entries now carry `system`).
