2026-09-06

# Logs: platform instrumentation review + follow-up cleanups

## Goal

The log stream is in place but appears quiet: no debug logs, and few warnings/errors
surface. This plan records the review findings, defines **where to add further logs**
for the `openp41ge` platform, and captures the two follow-up cleanups the review surfaced
(wire the file-backed reader; retire the dead overlay `debug-log-panel`).

## Context

Prior plans (`2026-09-05-logs-sidebar-grid.md`, `2026-09-05-logs-file-backed-backward-viewer.md`)
already delivered the sidebar stream list, the grid `log-viewer` tab, the `LogPageReader`
abstraction, `log:read-backward` IPC, and `LogFilePageReader`. What remains is **observability
coverage** — the seams that do not log — plus de-risking two bits of leftover scaffolding.

### Why the stream looks quiet (diagnosis)

1. **Debug is gated by a session toggle.** `log-buffer.ts` defaults `_minLevel = INFO`; DEBUG
   entries are dropped before any transport. The toggle lives only in `debug-log-panel.ts`
   (`setMinLevel(DEBUG)` + `window.openp41ge.logs.setDebug(true)`), or via `OPENP41GE_DEBUG=1`
   / `localStorage["openp41ge-debug"]="1"` seed in `app.ts`.
2. **The most valuable renderer seams do not log.** `event-router.ts` logs only handler
   overwrites; `workspace-state-manager.ts` logs only listener errors; `dom-bridge.ts` logs
   nothing. So normal interaction produces almost nothing at INFO/WARN/ERROR in the renderer bus.
3. **Display surfaces miss main-process logs.** The Logs sidebar (`logs-system-tab.ts`) reads
   `listLogStreams()` from the renderer in-memory bus; the grid `log-viewer` uses
   `MemLogPageReader`. Neither shows main-process streams (`operation-dispatcher`,
   `workspace-state-store`). The on-disk file (`~/.openp41ge/logs/openp41ge.log`) is the only
   surface with everything.

## Approach

### A. Wire the file-backed reader into the grid log tab

The prior plan deliberately left `LogViewerController` on `MemLogPageReader` because the then-running
main process predated `log:read-backward` (would flood the error overlay). The IPC now exists, so:

- `packages/openp41ge/src/renderer/apps/log-viewer/log-viewer-controller.ts` — replace
  `new MemLogPageReader()` with `new LogFilePageReader(system)` so a grid tab shows main +
  renderer + persisted history. Update the stale comment block claiming the IPC is not wired.
- On reader error, the viewer already falls back to `MemLogPageReader`; keep that.

### B. Add further platform logs (prioritized)

P0 (seams with no logging):

- `services/event-router.ts` — log each routed event (type, matched edge, handler results +
  durations, `when`-predicate outcome). INFO on handler error, DEBUG on routing detail.
- `services/workspace-state-manager.ts` — log workspace mutations (window/tab/grid) and the
  operation that caused them.
- `services/dom-bridge.ts` — log DOM→router events at DEBUG, including events that match **no**
  edge (the "click does nothing" class).

P1:

- `services/init-drag-system.ts` — add INFO/WARN for drag session start/end, resolved drop target,
  and no-op/rejected drops (current diagnostics are all DEBUG).
- `renderer/handlers/*.ts` — log which terminal handler ran, the command dispatched, and whether
  state changed.
- TabController lifecycle — add mount/unmount/snapshot/restore logging in `apps/*/controllers`
  (e.g. `file-editor-controller`, `agent-chat-controller`, `log-viewer-controller`).

P2:

- `services/error-capture-service.ts` — emit `log.error` on uncaught errors / unhandled rejections
  so they land in the bus + file.
- `main/services/config-service.ts` — log config load; `config:get`/`config:set` at DEBUG.
- `electron/openp41ge-application.ts` — log window create / load / renderer-ready / lifecycle events.

### C. Retire the dead overlay `debug-log-panel`

The system-overlay "logs" tab was already removed from `register-app-types.step.ts` (the overlay now
registers only `Editor` + `Agent`). `debug-log-panel` is no longer mounted — dead code. Before deletion:

1. Relocate **`isDebugSeed()`** out of `debug-log-panel.ts` (still used by `app.ts:33`).
2. Re-home the **Debug capture toggle** (currently only `debug-log-panel.ts` calls
   `setMinLevel(DEBUG)` + `logs.setDebug`). **Open decision — default to A:**
   - A. Add the toggle to the sidebar **Logs** panel (`logs-system-tab.ts`) — keeps it in the logs
     context, small change. (**recommended / conservative**)
   - B. Add it to the `<openp41ge-log-viewer>` toolbar (logger package) — generic, but can only set
     the local capture level; wiring `logs.setDebug` needs the platform.
3. Delete `components/debug-log-panel.ts`, its `app.ts` import, the stale `.so-body-inner
debug-log-panel` CSS in `openp41ge-system-overlay.ts`, and `test/unit/modals/debug-log-panel.test.ts`.

### Gotcha

`log.error` in the renderer pops the blocking error overlay: `console-transport.ts` replays ERROR to
`console.error`, which `error-capture-service.ts` intercepts. Prefer `log.warn` for recoverable
renderer issues; reserve `log.error` deliberately.

## Files Changed (candidate)

- `renderer/apps/log-viewer/log-viewer-controller.ts` — use `LogFilePageReader`.
- `renderer/services/event-router.ts`, `workspace-state-manager.ts`, `dom-bridge.ts`,
  `init-drag-system.ts`, `handlers/*.ts`, `apps/*/controllers`, `error-capture-service.ts`,
  `main/services/config-service.ts`, `electron/openp41ge-application.ts` — add logging.
- `renderer/components/debug-log-panel.ts` — delete; relocate `isDebugSeed` + debug toggle.
- `renderer/components/openp41ge-system-overlay.ts` — remove stale CSS.
- `renderer/app.ts` — drop `debug-log-panel` import, keep `isDebugSeed` from new home.
- `renderer/apps/system-tabs/logs-system-tab.ts` — add Debug toggle (option A).
- Tests: update/remove `debug-log-panel.test.ts`; add coverage for new logging / toggle.

## Testing Strategy

- `nx run-many -t typecheck`, `nx lint`, `nx format:check`, `nx run-many -t test`, `nx run-many -t build`.
- Component: grid log tab shows persisted main + renderer entries after rewire.
- Manual/CDP: enable Debug toggle → DEBUG captured (renderer + main); verify overlay no longer
  shows a Logs tab.

## Completion Criteria

- [ ] Grid log tab reads via `LogFilePageReader` (file-backed, main + renderer + history); stale
      comment removed.
- [ ] P0 seams (`event-router`, `workspace-state-manager`, `dom-bridge`) emit structured logs.
- [ ] P1 drag + handlers + TabController lifecycle instrumented.
- [x] Dead `debug-log-panel` removed; `isDebugSeed` relocated to `services/log-debug.ts` — done in
      `2026-09-06-settings-grid-tabs.md` (Decision 4), which also sends the Debug toggle decision.
- [ ] Renderer ERROR usage audited to avoid spurious blocking error-overlay triggers.
- [ ] Quality skill passes; tests updated.

## Status

- **Log row wrap fix (2026-09-06)** — implemented in `openp41ge-logger/src/openp41ge-log-viewer.ts`
  (`.log-entry` flex → block; meta tags `inline-block`; message `inline` + `pre-wrap`), captured as
  item 9 in `2026-09-06-settings-grid-tabs.md`. This plan's remaining P0/P1/P2 logging additions and
  the `LogFilePageReader` rewire are **recommendations only** — not yet implemented.
