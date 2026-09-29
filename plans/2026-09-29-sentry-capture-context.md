# Sentry: capture additional context (plan)

Status: proposed
Date: 2026-09-29

## Goal

Sentry is currently initialized (main + renderer) but only captures *global*
uncaught errors. This plan adds **targeted, high-signal** Sentry capture at the
places where the app actually fails, plus breadcrumbs and tags/context so a
reported issue (in particular the **local-AI message failure** in alpha) can be
diagnosed from a single event without a reproduction.

Guiding rules:

- **Don't wrap everything.** Add capture only at real failure boundaries that
  currently `log.error(...)` or `throw`. The log line is our "smell" for where
  something is expected to go wrong.
- **Tag + breadcrumb before capture**, so each event carries the surrounding
  state (model, URL, channel, workspace, operation).
- **Never throw from a capture call** (wrap in a small safe helper).
- Main process captures on its own (it owns the DSN). Renderer errors flow to
  main, which sends them, so renderer capture is `Sentry.captureException`.
- For transient/per-second failures (stream heartbeats, pings, failed fetches
  with expected retries), prefer a **breadcrumb** over an exception to avoid
  flooding.

## Building blocks

1. **`electron/sentry.ts`** — add exports used by the rest of the main process:
   - `captureError(error, { tags, extra, level })` — safe wrapper around
     `Sentry.captureException` (never throws).
   - `captureMessage(msg, { level, tags, extra })` — for structured non-exception
     failures.
   - `addBreadcrumb({ message, category, level, data })`.
   - `setTag(key, value)` / `setUser` (optional, see privacy note).
   - These live in the `electron/` dir, imported only by main-process code
     (renderer has its own `Sentry` import already via `main.ts`).
2. **Renderer equivalents** in `src/renderer/services/error-capture-service.ts`
   (or a tiny `sentry-client.ts`) so renderer services can add breadcrumbs too.

## Where to capture (main process)

### 1. Local-AI provider — `src/main/services/vllm-chat-provider.ts` (highest priority)
This is the suspected alpha failure. Three distinct sites:
- **`stream request failed`** (network error to the vLLM server): capture
  breadcrumb + `captureError`, tags `{ operation: "chat.stream", model,
  baseUrl, aborted }`, extra `{ promptChars, messageCount, elapsedMs }`.
- **`vLLM returned <status>: <body>`** (upstream HTTP error): `captureMessage`
  at `error` level with extra `{ status, responseBody: text.slice(0,500),
  model, baseUrl }`.
- **`stream read error`** (SSE decode/parse/read aborted mid-stream):
  `captureError` with tags `{ operation: "chat.stream.read", model }` and extra
  `{ bytesStreamed, bufferTail, streamedTokens }`.

Breadcrumbs before the request so the event shows what led up to it:
`chat.request` (model, promptChars, toolCount, thinking).

### 2. Global main handlers — `electron/openp41ge-application.ts` `_registerErrorHandlers()`
- `uncaughtException` → `captureError(err, { tags: { process: "main" } })`.
- `unhandledRejection` → `captureError(reason)`, tag `process: "main"`.
- Keep the existing EPIPE filtering.
- The `console.error` intercept: add a **breadcrumb** (not an event) so repeated
  warnings don't flood, but uncaught exceptions already captured aren't
  double-counted (tag them or rely on capture instead of forwarding).

### 3. Chat persistence — `src/main/services/chat-store-service.ts`
- `Failed to load chat store` (load) and `Failed to persist chat store`
  (write): `captureError` with tags `{ operation: "chat-store.load"/"save",
  workspace }`, extra `{ storePath, errorCode }`. This catches disk-full / file
  corruption that would otherwise silently break chat history.

### 4. Agent runtime — `src/main/services/agent-runtime.ts`
- `agent send error`: `captureError` with tags `{ operation: "agent.send",
  agentId, workspace }`, extra `{ promptChars, toolCount }` (avoid full prompt).

### 5. Config service — `src/main/services/config-service.ts`
- Any non-atomic-write / parse failure: `captureError` tagged
  `{ operation: "config.load"/"config.save" }` with the config path (redact
  known sensitive keys; see privacy note).

### 6. Git + terminal + search (breadcrumb/capture, lower priority)
- `src/main/services/node-git-service.ts` / `node-git-commit-service.ts`:
  capture non-expected git failures (auth, dirty worktree, bad ref) tagged
  `{ operation, repoPath (basename only) }`.
- `terminal-manager.ts` / `operation-dispatcher.ts`: breadcrumbs only, since
  these are high-frequency.

### 7. IPC layer (optional, low priority)
- `electron/ipc-handlers/*` and `src/renderer/services/*`: add a breadcrumb
  `ipc.<channel>` for failures so a renderer error can be correlated with the
  IPC call that produced it.

## Where to capture (renderer)

`src/renderer/services/error-capture-service.ts` is already the single choke
point for renderer errors (`window.onerror`, `unhandledrejection`,
`console.error`, main-process forwarded errors). Add `Sentry.captureException`
in:
- `window.onerror` handler (pass the real `error` object when available —
  Sentry needs the stack).
- `onunhandledrejection` handler (capture `event.reason`).
- `console.error` intercept → breadcrumb (and **do not** double-capture the
  uncaught errors already captured above — the `_suppressConsoleCapture` guard
  already prevents the double-count in the overlay; mirror that for Sentry).

Also add a **breadcrumb for workspace/context** at bootstrap: project path
(basename), channel, `app.getVersion()`/build version, OS, so every event is
grouped by release + environment.

## Privacy / data control

- Sentry's default `dataCollection` sends IP + some request data. For an
  error-monitoring tool this is desirable for debugging, but we should:
  - Redact `authorization`/`Bearer` (Sentry's built-in denylist already keys on
    `auth`); ensure we never put `apiKey` or `openp41ge` secrets into `extra`.
  - Only send the **basename** of local paths (repo paths may contain the
    user's home directory / username).
  - Set `dataCollection.userInfo` correctly (default sends IP) — decide with the
    team; propose leaving IP on for the alpha to aid debugging, flag in review.
  - Confirm with the team whether the repo path should be sent at all.

## File-touch summary

| File | Change |
|------|--------|
| `packages/openp41ge/electron/sentry.ts` | add `captureError`/`captureMessage`/`addBreadcrumb`/`setTag` safe helpers |
| `packages/openp41ge/electron/openp41ge-application.ts` | capture in `_registerErrorHandlers` |
| `packages/openp41ge/src/main/services/vllm-chat-provider.ts` | capture + breadcrumbs at 3 failure sites |
| `packages/openp41ge/src/main/services/chat-store-service.ts` | capture on load/persist failures |
| `packages/openp41ge/src/main/services/agent-runtime.ts` | capture on agent send error |
| `packages/openp41ge/src/main/services/config-service.ts` | capture on config load/save failure |
| `packages/openp41ge/src/main/services/node-git-service.ts` | capture on git command failures |
| `packages/openp41ge/src/renderer/services/error-capture-service.ts` | renderer capture + breadcrumbs |
| `packages/openp41ge/src/renderer/bootstrap/*` (optional) | workspace/channel breadcrumb |

## Order of work

1. Sentry helper exports in `electron/sentry.ts` + main handler capture
   (biggest safety net).
2. vLLM provider capture + breadcrumbs (the alpha bug — do this first and
   validate in dev against a throwaway DSN).
3. Renderer error-capture-service integration.
4. chat-store / agent-runtime / config / git capture.
5. Breadcrumb-only additions (terminal, IPC, search) — low priority.

## Validation

- Unit tests: add a test that a `captureError` helper does not throw when
  Sentry is uninitialized (mock `Sentry`).
- Manual: run app, intentionally trigger each capture site, confirm one event
  per site in the Sentry project with the right tags/breadcrumbs.
- Ensure no infinite loop (breadcrumb added inside a `console.error` interceptor
  that itself logs — guard with the existing `_suppressConsoleCapture` flag).
