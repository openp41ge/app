2026-09-06

# Wire the file-backed log viewer

## Goal

Make the Logs grid tab read **persisted** logs instead of the renderer's in-memory buffer, so
logs survive development hot-reloads and app restarts. On open the viewer shows the most recent
logs (newest at the bottom), and scrolling up reads farther back in time — across the daily
`~/.openp41ge/logs` files.

## Rationale

The user reports that the log list "only ever shows logs from the current run" because it resets
when code is changed and hot-reloaded. That is exactly the in-memory log bus (`MemLogPageReader`).

The persistence pipeline already exists and works: the main-process `LogFileStore` writes every
entry (main + renderer, via `log:append`) to `~/.openp41ge/logs/` as daily JSONL; `log-handlers.ts`
registers `log:read-backward` (a `LogPageReader` bridge); and `renderer-log-transport.ts` forwards
the renderer bus. The only missing link is that `LogViewerController` deliberately injects
`MemLogPageReader` instead of the file-backed `LogFilePageReader`. That was a deliberate hold
(recorded in `plans/2026-09-05-logs-file-backed-backward-viewer.md`) until the `log:read-backward`
IPC was available in the running main process — which it is now.

The `<openp41ge-log-viewer>` is already **bottom-aligned** (loads latest, auto-scrolls to bottom,
appends new entries at the bottom) and already **pages backward** on scroll-up. No viewer change
needed.

## Approach

Flip `LogViewerController` to use the file-backed reader, and make the swap safe against a
stale main process.

- `log-viewer-controller.ts`: replace `viewer.pageReader = new MemLogPageReader()` with
  `viewer.pageReader = new LogFilePageReader()`; drop the `MemLogPageReader` import, import
  `LogFilePageReader`; update the doc comment.
- **Stale-main safety** (the original `LogFilePageReader` was left unwired precisely because a
  stale main floods the error overlay): Electron logs `"No handler registered"` via
  `console.error` whenever `ipcRenderer.invoke` targets a missing `handle`, so calling
  `log:read-backward` on a stale main trips the blocking overlay. We avoid that entirely:
  - `log-handlers.ts`: `log:path` now also returns `{ logsDir, capabilities: { readBackward: true } }`.
    The `log:path` channel is long-standing and present in both old and new mains, so probing it
    is safe (an older main returns `{ logsDir }` with no `capabilities`).
  - `global.d.ts`: `getPath` now returns `{ logsDir: string; capabilities?: { readBackward?: boolean } }`.
  - `log-file-page-reader.ts`: `loadLatest` first probes `getPath()`; if `capabilities.readBackward`
    is not `true`, it throws so the viewer's existing fallback switches to `MemLogPageReader` —
    never calling `readBackward` on a stale main, so no `console.error` reach the overlay.
  - `log-file-page-reader.test.ts`: stub `getPath`; new test asserts `loadLatest` rejects and does
    **not** call `readBackward` when the main advertises no capability.

No changes to the logger package, the store, the reader's polling, or the viewer component.

## Files Changed

- `packages/openp41ge/src/renderer/apps/log-viewer/log-viewer-controller.ts` — inject
  `LogFilePageReader` instead of `MemLogPageReader`; update comments/imports.
- `packages/openp41ge/electron/ipc-handlers/log-handlers.ts` — `log:path` advertises
  `capabilities.readBackward`.
- `packages/openp41ge/src/renderer/global.d.ts` — `getPath` return type gains optional
  `capabilities`.
- `packages/openp41ge/src/renderer/services/log-file-page-reader.ts` — capability probe gate in
  `loadLatest`; no `readBackward` call without it.
- `packages/openp41ge/test/unit/services/log-file-page-reader.test.ts` — stub `getPath`; add
  stale-main fallback test.

## Testing Strategy

- `test/unit/services/log-file-page-reader.test.ts` covers mapping, cursor forwarding, live-poll
  dedup, the stale-main fallback (stops polling on rejection), and — newly — that `loadLatest`
  rejects and never calls `readBackward` when the main advertises no capability.
- `LogFileStore.readLogsBackward` is covered by `test/unit/services/log-file-store.test.ts`.
- Run `nx run-many -t typecheck`, `nx lint`, `nx run openp41ge:test`.
- Manual (after restarting dev so the main process serves `log:read-backward`): open Logs tab →
  newest at bottom; scroll up loads older lines; restart the app → previous run's logs are still
  there.

## UX Considerations

- No UI change; the viewer already starts scrolled to the bottom (newest) and loads older on
  scroll-up. Bottom-aligned semantics are preserved for new live entries.
- Empty state: when `~/.openp41ge/logs` has no files, `readLogsBackward` returns an empty page and
  the viewer shows "No log entries" (existing behavior).

## Open Questions

- None. This completes the deliberately deferred step from
  `plans/2026-09-05-logs-file-backed-backward-viewer.md`.

## Completion Criteria

- [x] `LogViewerController` injects `LogFilePageReader`.
- [x] `MemLogPageReader` no longer hard-wired for the grid tab.
- [x] Capability probe (`log:path` → `capabilities.readBackward`) prevents calling a missing
      `log:read-backward` IPC, so a stale main never floods the error overlay.
- [x] typecheck / lint / tests / build pass.

## Operator note

The currently-running dev process's **main** process is stale (no `log:read-backward` handler);
a full `nx run openp41ge:dev` restart is required for the persisted reader to serve history. Until
then the viewer falls back to the in-memory bus (current behavior).
