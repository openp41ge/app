2026-09-05

# Logs → Sidebar Stream List + Grid Tab

## Goal

Move the **Logs** system-overlay tab out of the overlay into:

1. a **sidebar system tab** ("Logs") that lists **registered log streams**, and
2. clicking a stream opens a **grid tab** showing that stream's log output.

The system-overlay "logs" tab is removed; the Logs surface now lives in the
sidebar + grid.

## Rationale

The user is migrating each system-overlay tab into an app-native surface
(sidebar system tabs / grid panes). Logs are a read-only, continuously-updating
surface: a per-window sidebar listing streams (with live entry counts) is a
better home than a modal overlay, and opening a specific stream into the grid
lets you pin/compare multiple streams like any other pane.

## Approach

### 1. Logger package — stream registry

File: `packages/openp41ge-logger/src/`

- New module `log-streams.ts` (single responsibility): maintain a registry of
  named log streams.
  - `registerLogStream(name: string): void` (idempotent), `unregisterLogStream(name)`,
    `listLogStreams(): LogStreamInfo[]` where `LogStreamInfo = { name: string; entryCount: number; lastTs?: number }`.
  - `entryCount`/`lastTs` are derived live from the log buffer (single source of
    truth: `queryLog`/`getLogBuffer`); the registry only stores names + registration order.
- `logger.ts`'s `createLogger(name)` calls `registerLogStream(name)` so every
  declared stream appears in the list **even before it logs** ("registered" = declared).
- Export `registerLogStream`, `listLogStreams`, `LogStreamInfo` from `index.ts`.
- `pushLog` (or a subscription) keeps `entryCount`/`lastTs` fresh — the sidebar
  subscribes to `subscribeLogs` and re-derives counts.

### 2. Sidebar system tab — "Logs" stream list

File: `packages/openp41ge/src/renderer/apps/system-tabs/logs-system-tab.ts` (new)

- `LogsSystemTabController implements SystemTabController`, `appType = "logs"`.
  (Named `logs` to match the sidebar registration, distinct from the grid
  `log-viewer` app type.)
- Renders a scrollable list of `listLogStreams()` rows: stream name + live entry
  count. Refreshes on `subscribeLogs` and on `listLogStreams` changes; only while
  visible (`setVisible`).
- Clicking a row dispatches `openp41ge:open-log-stream` with `{ source, title }`
  (single-click = unpinned preview, second click promotes to pinned — mirrors
  the Chat sidebar).
- Optional: a "recent/live" ordering (most recently active stream first).
- Register in `apps/system-tabs/index.ts` (`logsSystemTabRegistration`,
  `defaultSide: "right"`), add to `allSystemTabRegistrations`.

### 3. Log open handler — sidebar → grid tab

File: `packages/openp41ge/src/renderer/services/log-open-handler.ts` (new)

- Listens for `openp41ge:open-log-stream`; mimics `ChatOpenHandler`:
  - find an existing `log-viewer` tab for the same `source` in the target cell →
    activate it (or pin a preview on second click),
  - else open a `log-viewer` tab via `actionOpenFile` with
    `config = { source }` and a title of the stream name (tab handle uses the
    stream name, like the chat pane shows its own header).
- Wire `init(commandBus, workspaceState)` in `StartupContext.wireServices()` +
  register the document listener in `bootstrap/steps/register-event-listeners.step.ts`.

### 4. Grid log tab — stream-filtered output

Files: `packages/openp41ge/src/renderer/apps/log-viewer/` + `openp41ge-logger/viewer`

- Enhance `<openp41ge-log-viewer>` (in `openp41ge-logger`) with an optional
  `source?: string` attribute: when set, only entries from that source render
  (keeps level filter + search + clear + auto-scroll). Empty source = all logs
  (pane-picker "Logs" keeps working).
- Enhance `LogViewerController.mount` to read `this._tab.config.source` (the
  controller needs access to the tab config — the registry passes config when
  creating the controller, or the controller reads it from the panel host) and
  set it on the viewer. `snapshot`/`restore` keep the `source` so it survives
  tab switches/reload.
- App registration `log-viewer` id/label unchanged.

### 5. Remove the overlay "logs" tab

File: `packages/openp41ge/src/renderer/bootstrap/steps/register-app-types.step.ts`

- Remove `systemOverlayService.registerTab({ id: "logs", ... })`.
- Delete/retire `logs-overlay-tab.ts` (and its `LogsSystemTab`); the package's
  `<openp41ge-log-viewer>` and `<debug-log-panel>` remain (debug-log-panel may now
  be unused — decide in this change whether to keep it for the grid tab or drop it).

## Files Changed

- `packages/openp41ge-logger/src/log-streams.ts` — new: stream registry.
- `packages/openp41ge-logger/src/logger.ts` — `createLogger` registers the stream.
- `packages/openp41ge-logger/src/index.ts` — export registry API + types.
- `packages/openp41ge-logger/src/openp41ge-log-viewer.ts` — optional `source` filter.
- `packages/openp41ge/src/renderer/apps/system-tabs/logs-system-tab.ts` — new sidebar controller.
- `packages/openp41ge/src/renderer/apps/system-tabs/index.ts` — register the logs sidebar tab.
- `packages/openp41ge/src/renderer/services/log-open-handler.ts` — new open handler.
- `packages/openp41ge/src/renderer/apps/log-viewer/log-viewer-controller.ts` — pass `source` from tab config.
- `packages/openp41ge/src/renderer/bootstrap/startup-context.ts` — init `logOpenHandler`.
- `packages/openp41ge/src/renderer/bootstrap/steps/register-event-listeners.step.ts` — listen for `openp41ge:open-log-stream`.
- `packages/openp41ge/src/renderer/bootstrap/steps/register-app-types.step.ts` — remove overlay "logs" tab.
- Remove `packages/openp41ge/src/renderer/apps/system-tabs/logs-overlay-tab.ts`.
- Tests: `packages/openp41ge-logger/test/unit/log-streams.test.ts`; platform tests for the logs sidebar + open handler.

## Testing Strategy

- **Unit (logger)**: `log-streams` — register/unregister/list, idempotency, entry counts
  reconcile with the buffer.
- **Unit/Integration (platform)**: `LogsSystemTabController` renders `listLogStreams()`
  rows, refresh on log events, dispatches `openp41ge:open-log-stream`; `LogOpenHandler`
  opens/activates a `log-viewer` tab with the right `config.source`.
- **Component**: `<openp41ge-log-viewer>` with a `source` filter shows only that stream.
- **E2E (CDP)**: open the Logs sidebar → see streams; click a stream → grid tab shows
  only that stream's output; second stream opens another tab; overlay no longer shows
  the Logs tab.

## UX Considerations

- Sidebar list style mirrors the Chat sidebar (rows, counts, active/open state).
- Grid log tab = a pane like any other; uses the existing level filter/search/clear
  toolbar; title = stream name.
- Open-once within a window: activating an existing `log-viewer` tab for the same
  source instead of duplicating.
- The "Logs" overlay tab and the Cmd+Shift+D / View → Logs overlay entry are
  removed/redirected to the sidebar.

## Open Questions (answered)

1. **Which "streams" to list?** → **Only streams that have logged.** A stream is registered
   the first time it emits a **stored** log entry (from `logger.ts`'s emitter, not from
   `createLogger`). Declared-but-silent namespaces never appear; a DEBUG entry dropped by the
   capture threshold does not register a stream. `createLogger` rejects empty/blank names.
2. **Sidebar side + default:** → **right** (config in `logsSystemTabRegistration.defaultSide`).
3. **Per-stream grid tabs vs one tab with a dropdown:** → **one `log-viewer` tab per stream**.
   Deviation from the earlier "single-click = unpinned preview" note: each stream opens as its
   **own pinned grid tab** (`logsSystemTab` dispatches `pinned: true`), so a second stream opens
   another tab instead of replacing the first — required by the completion criterion and more
   useful for concurrent log monitoring.
4. **Events/Debug session toggle:** → **dropped** for the grid log tab; the grid tab shows the
   log list + level/search/clear (`openp41ge-log-viewer`). `debug-log-panel` is retained for
   `isDebugSeed()`/the overlay (still referenced by `app.ts`).

## Completion Criteria

- [x] Sidebar "Logs" tab lists registered log streams with live counts, opens a grid
      `log-viewer` tab per stream filtered to that source.
- [x] Log-stream rows can be **dragged into the grid like files** (bitmap ghost via the
      main-process DragGhostManager BrowserWindow; same- and cross-window grid drops open a
      stream-scoped `log-viewer` pane, boundary drops split a new column).
- [x] `log-viewer` grid tab supports a `source` filter (and still works unfiltered from
      the pane picker).
- [x] `openp41ge-logger` exports the stream registry; streams register on first stored emit
      (only streams that have logged appear in the sidebar).
- [x] Logs are **organized by system**, not a flat stream list. `createLogger(system, name)`
      (no backwards compat, no implicit default). A system is either **the platform** (`openp41ge`,
      every logger inside the `openp41ge` package) or **a plugin** (a separate package, named
      `openp41ge-*`, e.g. `openp41ge-terminal`). Entries carry `system` + `source` (stream).

  - Sidebar shows **one row per system** (aggregating that system's streams into a single
    live count). Clicking a system dispatches `openp41ge:open-log-system` and opens a
    system-scoped grid `log-viewer` tab (`config.system`).
  - The grid log tab **groups entries by system → stream**: a sticky system header, then a
    stream sub-header per logger namespace, then the entries.
  - Drag-and-drop drags a **system** (`tabConfig.system`), not a stream.
  - System ids: platform = `openp41ge`; plugins = the package name. Deprecated domain ids
    (`bootstrap`, `chat`, `editor`, …) were consolidated into the platform system.

- [x] System overlay no longer has the "logs" tab; Cmd+Shift+D/View→Logs wiring updated.
- [x] `nx run-many -t typecheck`, `nx lint`, `nx format:check` clean; `nx run-many -t test`
      passes (logger 90, platform 1196).
- [ ] Manual E2E via CDP / running app not verified (no display in this environment).
