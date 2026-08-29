2026-08-29

# Agent Chat: Grid Chat Panes + Per-Window Chat-List Sidebar + vLLM Runtime

## Goal

Add a full **AI agent chat** surface to Openp41ge:

1. **Central grid chat panes** — a new `agent-chat` app type. Chat conversations open as tabs in the grid (`<openp41ge-agent-chat>`, upgraded). All chats live and run in the central grid.
2. **Per-window chat-list sidebar** — a new system tab listing all chats, with **full-content search** over message text **and tool-call commands** (names + args, *not* responses). Each chat row can be **opened (expanded) to glance at the list of tool calls** made so far. Chats are shared/persisted app-wide, but a chat may be **open in at most one window** ("opened once"): the sidebar shows an indicator when a chat is open in another window, plus a **highlight button** that paints a blue highlight on that chat's tab handle in the other window (no activation/focus).
3. **Real agent runtime** — a provider-agnostic runtime executing against a **local vLLM server** now (OpenAI-compatible `/v1/chat/completions` SSE streaming), architected so other providers can be added later. **Provider setup lives in the system overlay** (a new "Agent" overlay tab).

## Rationale / Current State

- `packages/openp41ge-agent-chat` today is a minimal self-contained Lit component: `<openp41ge-agent-chat>` renders a message list + prompt input; `ChatMessage = { role: "user"|"assistant", content, timestamp }`. **No chats list, no persistence, no tool calls, no backend** (the demo fakes replies). Its package only depends on `lit`.
- The platform **anticipated** an `agent-chat` app type but never wired it: `topbar-drop-target.ts` labels it "Agent Chat" in the scope-expand modal, and `scope-expansion-utils.ts` reads `config.scopeRoots`/`config.scopeRoot` for `appType === "agent-chat"`. There is **no `apps/agent-chat/` controller, no `app-registry` entry, and no entry in `APP_TYPES`**.
- **No AI/chat plumbing exists** anywhere in main or IPC: no LLM connector, no tool registry, no chat store.
- Existing patterns to reuse:
  - **Main persistence**: `config-service.ts` (atomic JSON at `~/.openp41ge/.config/config.json`, `UserConfig`) — extend for provider settings. `workspace-state-store.ts` (atomically-written JSON in `~/.openp41ge/`) — pattern for the chat store file.
  - **Models (Model-Based DI)**: `models/ipc-repo-service.ts` + `test-models.ts` (Ipc/Test pairs exposed on `window.__testModels` by `expose-test-models.step.ts`) — new `ChatStoreModel`/`ChatRuntimeModel` follow this.
  - **System overlay**: `systemOverlayService.registerTab({ id, label, icon?, createController })` already hosts Workspaces/Logs/Editor tabs — the "Agent" provider tab registers here.
  - **Sidebar system tabs**: `apps/system-tabs/index.ts` `allSystemTabRegistrations` (Explorer/Git/Search) — the chat-list tab registers here (per window via the existing per-window sidebar model).
  - **Grid app type**: `registerAppType` in `register-app-types.step.ts` + a `TabController` in `apps/<type>/` — `GitRepositoryController` (which bridges a Lit uikit component with IPC data via `__pendingGitRepo`) is the closest model for `AgentChatController` (use a `__pendingChatId` analog).
  - **Streaming main→renderer**: progress-style IPC (`file:chunkProgress`, `workspace:clone-progress`) — token deltas flow the same way (`chat:delta`).

## Approach

### Part A — Agent runtime + provider registry (main process)

1. **Provider abstraction** — `src/main/interfaces/chat-provider.ts`:
   - `ChatProviderConfig = { baseUrl, model, apiKey?, temperature?, maxTokens? }`
   - `ChatProvider { readonly id; readonly label; streamChat(req: { messages, tools, signal }): AsyncIterable<ProviderDelta>; ping(): Promise<boolean> }` where `ProviderDelta = { type: "text" | "tool_call"; text?; toolCall? }`.
   - `src/main/services/chat-provider-registry.ts` — keyed registry so **new providers register without editing existing code** (Open/Closed). `VllmChatProvider` (`services/vllm-chat-provider.ts`) speaks OpenAI-compatible `/v1/chat/completions` SSE via `fetch`/undici in main: parse `data:` lines, emit `content` deltas and `tool_calls` deltas; `ping()` calls `/v1/models` (or an empty completion). Abort via `AbortController`.

2. **Tool registry** — `src/main/interfaces/tool.ts` + `src/main/services/tool-registry.ts`: `AgentTool { name, description, jsonSchema(params), execute(args, ctx): Promise<{ content, error? }>, isAvailable(ctx)? }`. Registry pattern (Open/Closed) with an initial built-in set (see Open Question 1): `read_file(path, offset?, maxLength?)`, `search_files(query, roots?)`, `run_command(command, cwd?)` — executed by a `NodeToolExecutor` in main (node:fs/child_process). Tool availability & outputs are logged to the chat as `tool` messages (persisted).

3. **Agent runtime** — `src/main/services/agent-runtime.ts` (`AgentRuntime`):
   - `send(chatId, winId, userText)`: append user message → build messages (system prompt + history + tool defs) → `ChatProvider.streamChat` → persist/forward text deltas to the owning window (`chat:delta`) → on `tool_call` delta: persist a `tool` message (status `running`), call `ToolRegistry.execute`, append the tool result, **loop** (max-turns guard, e.g. 8) → final persist → broadcast `chat:changed`.
   - `abort(chatId)`: cancel the `AbortController`, mark the in-flight tool/message as interrupted.
   - Singleton wired like other main services in `openp41ge-application.ts`; injected with `ChatProviderRegistry` + `ToolRegistry`.

### Part B — Chat store + IPC

1. **Data model** (`packages/openp41ge/src/renderer/global.d.ts` types + shared `openp41ge-chat`-style plain types in main):
   - `ToolCall { id, name, arguments (string|object), status: "running"|"done"|"error", error? }`
   - `ChatMessage { id, role: "user"|"assistant"|"tool", content?, toolCalls?: ToolCall[], timestamp }`
   - `Chat { id, title, providerId, createdAt, updatedAt, messages: ChatMessage[] }`
   - `ChatSummary { id, title, updatedAt, messageCount, toolCallCount, lastMessagePreview? }`
   - `ChatSearchResult { chatId, matchedMessageIds: string[], matchedToolCallIds: string[] }`
   - **"opened once"**: main keeps `openChats: Record<chatId, winId>`.

2. **`ChatStoreService`** (`src/main/services/chat-store-service.ts`) — CRUD + search + open-state, persisted atomically to `~/.openp41ge/CHATS_FILENAME` (mirror `WorkspaceStateStore` write strategy). **Search matches message content (user + assistant) and tool-call `name` + `arguments` (the command) — never tool results.**

3. **IPC** (`electron/ipc-handlers/chat-handlers.ts`, preload bridge + `global.d.ts`):
   - `chat:list → ChatSummary[]`, `chat:get(id) → Chat`, `chat:create({ providerId?, title? }) → Chat`, `chat:delete(id)`, `chat:rename(id, title)`, `chat:search(q) → ChatSearchResult[]`.
   - `chat:send(id, text)` / `chat:abort(id)` → `AgentRuntime`.
   - `chat:open(id, winId)` / `chat:close(id)` → maintains `openChats`; broadcast `chat:open-state` to all windows.
   - `chat:highlight(id)` → targeted broadcast to the window holding the chat (blue handle highlight only — no activation).
   - Main→renderer events: `chat:changed` (list refresh), `chat:delta` ({ chatId, delta }), `chat:tool` ({ chatId, toolCall }), `chat:open-state`, `chat:highlight`.
   - Provider config: extend the existing config IPC (see Part E).

### Part C — Grid chat pane (`apps/agent-chat/`)

1. **Upgrade the UI package** (`packages/openp41ge-agent-chat`) — stays UI-only (Lit, no platform imports):
   - Extend message model types (assistant with `toolCalls`, `tool` messages) and rendering: user bubbles right / assistant left (existing), **tool-call inline rows** (name + monospace command/args + status icon: running/done/error), streaming caret, abort affordance, connection-status strip.
   - Imperative API for the controller: `setChat(chat)`, `appendDelta(text)`, `setToolCallState(tc)`, `setProviderStatus(ok, label?)`, `getTitle()`; `chat:send` bubbles with `{ text }`; keep `addMessage/clearMessages/focusInput`.
2. **Controller** — `apps/agent-chat/agent-chat-controller.ts` (`AgentChatController extends BaseController implements TabController`):
   - `mount()`: read `tab.config.chatId` (fallback `config.filePath`, or `__pendingChatId` set before dispatch, like `__pendingGitRepo`); subscribe to `chat:delta`/`chat:tool` for its chatId; render component; wire `chat:send` → `RuntimeChatModel.send(id, text)`.
   - `snapshot()/restore()`: persist `{ chatId }` (and scroll/stream position best-effort) so chat tabs survive window reload.
   - `unmount()`: unsubscribe; do **not** emit `chat:close` here blindly (see NOTE in UX/tracking — close only when the tab is removed).
3. **Registration** — `apps/agent-chat/index.ts` `agentChatAppRegistration` (`id: "agent-chat"`); register in `register-app-types.step.ts`; add to `APP_TYPES` (Cmd+N picker) — see Open Question 6.

### Part D — Per-window chat-list sidebar (`apps/system-tabs/agent-chat-system-tab.ts`)

1. New system-tab registration `{ id: "agent-chat", label: "Chat", defaultSide: "right", … }` in `allSystemTabRegistrations` (appears per-window like Explorer/Git/Search).
2. **List view**: search input (autofocus), scope of all chats, "New Chat" button. Each row: title (auto from first user message, context-menu rename), last-message/updated preview, tool-call count badge. States: loading/empty/no-match.
3. **Row open → tool-call sublist**: each chat row expands (chervon) to list its **tool calls** (`name` + command/args + status). No grid interaction needed for tool calls yet (drag-to-grid is future; note only).
4. **Open in grid**: click a chat row → open `agent-chat` tab in the **last-focused column** as an **unpinned preview tab** (VS Code preview model: second click pins), mirroring `FileOpenHandler`/commit-open flow (new `chat-open-handler` or reuse `actionOpenFile(winId, "agent-chat", title, chatId, col, false)` with `__pendingChatId`).
5. **"Opened once" UX**: if `chat:open-state` says the chat is open in **another window**, the row shows an indicator + a **"Highlight" button** → `chat:highlight(chatId)` → that window's `tab-bar` paints `--accent` blue on the matching `[data-tab-id]` handle (transient, ~3s, no focus/activation). Clicking the row while open in another window does **not** open a duplicate — it shows a toast with a Highlight action (Open Question 2).
6. **New Chat** button → `chat:create` → open pinned in last-focused column.

### Part E — Provider setup in the system overlay

1. **Config** — extend main `UserConfig` with `agent: { providerId: "vllm", providers: { vllm: { baseUrl, model, apiKey, temperature?, maxTokens? } } }` (persisted via existing atomic config write; defaults `baseUrl: "http://localhost:8000/v1"`, `model: ""`). Keep the shape provider-keyed for future providers.
2. **Overlay tab** — `apps/system-tabs/agent-chat-settings-system-tab.ts` registered via `systemOverlayService.registerTab({ id: "agent", label: "Agent", icon: "🤖", … })`: provider select (vLLM for now), base URL/model/apiKey fields, **Test Connection** (calls `provider.ping`), Save → config IPC → broadcast `openp41ge:config-changed`; surfaces vLLM reachability so chat panes can show "not configured / unreachable — configure in ⚙ Agent".

## Implementation Reference Seams

- **Main service injection** — copy `WorkspaceStateStore`/`ConfigService` wiring in `electron/openp41ge-application.ts`; add `ChatStoreService`, `AgentRuntime`, `ChatProviderRegistry`, `ToolRegistry` to the main dependency graph and pass them into `registerChatHandlers(...)`.
- **IPC registration** — copy `registerGitHandlers(gitCommitService, gitService)` style in `electron/*/...` main init; add `registerChatHandlers(store, runtime)`; mirror the preload `workspaceController` block for a `chat` bridge + a `chat.on*` subscription block.
- **Config IPC** — check the existing config get/set IPC (`config-service.ts` renderer + main) and reuse it for `agent` settings; broadcast via the existing `openp41ge:config-changed` listener in `register-event-listeners.step.ts`.
- **Model DI** — copy `models/ipc-repo-service.ts` + `test-models.ts`; new `ChatStoreModel` (list/get/create/delete/rename/search/open/close/subscribe) and `ChatRuntimeModel` (send/abort/subscribe-deltas), each with Ipc/Test impls exposed on `window.__testModels` via `expose-test-models.step.ts`.
- **Sidebar controller skeleton** — copy `GitSystemTabController` (mount/unmount/`setVisible` keep-alive + document-event refresh).
- **Grid controller skeleton** — copy `GitRepositoryController` (BaseController, `__pending<X>` pattern, uikit component bridge) and `FileOpenHandler`'s preview/pin flow for the open handler.
- **Chat pane dispatch** — confirm `actionOpenFile` positional args land in `tab.config`; set `config.chatId = chatId` so restore/scope utils read one canonical key.
- **Existing tests to mirror/extend** — `packages/openp41ge-agent-chat/test/unit/chat/openp41ge-agent-chat.test.ts`, `test/integration/system-tabs/git-system-tab.test.ts`, `test/unit/services/file-drag-source.test.ts` (drag seams if tool rows become draggable), `test/unit/services/config-service...` if present for config shape.

## Files Changed

**Package (`openp41ge-agent-chat`)**
- `src/ui/openp41ge-agent-chat.ts` — message/tool-call model + rendering, streaming, connection strip, imperative API.
- `src/index.ts` — export new types.
- `test/unit/chat/openp41ge-agent-chat.test.ts` — extend.

**Main (`packages/openp41ge`)**
- `src/main/interfaces/chat-provider.ts`, `src/main/interfaces/tool.ts` — new.
- `src/main/services/chat-provider-registry.ts`, `vllm-chat-provider.ts`, `tool-registry.ts`, `agent-runtime.ts`, `chat-store-service.ts` — new.
- `src/main/interfaces/git-commit-service.ts` — untouched; `src/main/index.ts` + `electron/openp41ge-application.ts` — wire new services.
- `src/main/config-service.ts` — extend `UserConfig` with `agent`.
- `electron/ipc-handlers/chat-handlers.ts` — new; `electron/preload.cjs` + `src/renderer/global.d.ts` — `window.openp41ge.chat.*`.

**Platform renderer (`packages/openp41ge`)**
- `src/renderer/apps/agent-chat/agent-chat-controller.ts` + `index.ts` — new grid pane; register in `src/renderer/bootstrap/steps/register-app-types.step.ts`; add `id: "agent-chat"` to `src/renderer/app-types.ts` `APP_TYPES`.
- `src/renderer/apps/system-tabs/agent-chat-system-tab.ts` — new sidebar list; register in `apps/system-tabs/index.ts`.
- `src/renderer/apps/system-tabs/agent-chat-settings-system-tab.ts` — new overlay tab; register via `systemOverlayService.registerTab(...)` in `register-app-types.step.ts`.
- `src/renderer/services/chat-open-handler.ts` — new preview-open handler for chat rows; wire in `register-event-listeners.step.ts`.
- `src/renderer/models/chat-store-model.ts`, `chat-runtime-model.ts` (+ Test impls) — new; expose in `expose-test-models.step.ts`.

**Tests**
- New: unit (`vllm-chat-provider` SSE parse, `agent-runtime` loop w/ `TestChatProvider`+fake tool, `chat-store` search/open-state, `chat-search` matcher incl. tool-command-only), integration (`chat-handlers` IPC shapes, sidebar `agent-chat-system-tab` render/expand/indicator, `agent-chat-controller` with `TestChat*Models`).

## SOLID Review

- **S** — `AgentRuntime` owns the agent loop only; `ChatStoreService` owns persistence/mutations/search; `ChatProviderRegistry`/`ToolRegistry` are pure registries; the sidebar/grid controllers own UI. The upgraded `<openp41ge-agent-chat>` renders + emits events only (no IPC, no store access) — data runs through the platform controller.
- **O** — providers and tools are **registry/strategy** based: adding a provider or tool is a new registered class, no `switch` edits. Config shape is provider-keyed. Prefer this over a `switch(providerId)` anywhere (flag any such switch in review).
- **L** — `ChatProvider`/`AgentTool` implementations must satisfy their interfaces as substitutable contracts (e.g. `ping()` returns `boolean`, tools `resolve` to `{ content }` and report `error` in-band, never throw across the interface). Missing vLLM/unconfigured state degrades to a clear "not configured" UI, not a crash.
- **I** — `ChatProvider` is narrow (stream + ping); `ChatStoreModel` is read/write of chats, `ChatRuntimeModel` is send/abort/subscribe — split so the sidebar list never depends on runtime methods and vice versa.
- **D** — `AgentRuntime` is constructed with `ChatProviderRegistry` + `ToolRegistry` (abstractions), not `new VllmChatProvider()`. Renderer models inject Ipc impls by default via public settable properties and Test impls in tests (project convention). No service `new`s a concrete provider/tool.

## UX Considerations

- **Focus**: sidebar search input autofocuses; chat input autofocuses on pane open; Enter sends / Shift+Enter newline (existing component); Escape cancels in-flight streaming (abort).
- **Preview vs pinned**: sidebar click opens chat as an **unpinned preview tab** in the last-focused column; second click / click-on-open pins (VS Code model, matching files/commits). "New Chat" is pinned.
- **Open-once + highlighting**: never two windows with the same chat; the open-in-another-window indicator and Highlight button (transient `--accent` blue on the target tab handle, no activation) get the user to the right window without stealing focus.
- **Search**: debounced; matches message text + tool-call command/args, not responses; matched chats listed top-down by `updatedAt`, with message/tool-call match counts surfaced.
- **Streaming feedback**: caret + assembled assistant text; tool rows show running→done/error; disabled send while streaming; provider connection strip ("connecting to vLLM… / unreachable — configure in ⚙ Agent").
- **Visual**: theme vars (`--bg-primary`, `--border-color`, `--accent`, `--text-secondary`, `--text-muted`); message bubbles = existing styles; tool rows = monospace command, status icon, indented sublist under the chat row (mirrors repo→worktree→file hierarchy).
- **Empty/Error**: no chats ("No chats yet"), no matches, provider not configured, model empty, request timeout (30s default, per tool exec), abort — all non-blocking, toasts + inline states.

## Testing Strategy

**Unit**
- `VllmChatProvider`: SSE parser (mock stream text: content deltas, `tool_calls` items, `[DONE]`), message-payload assembly, `ping()`; abort cancels.
- `AgentTool`/`ToolRegistry`: schema validation, `isAvailable` gating, result/error in-band (no throws).
- `AgentRuntime` (TestProvider + fake tool): message sequence (system → user → tool_calls → tool result → assistant), max-turns guard, abort mid-stream, persistence calls.
- `ChatStoreService`: create/list/get/delete/rename; persistence round-trip; **search matcher**: message text and tool-call command/args match, tool responses never match; `openChats` bookkeeping (`chat:open`/`chat:close`).
- GUI component: setChat renders messages + tool rows; appendDelta stream assembly; setToolCallState status transitions; send event payload.

**Integration**
- `chat-handlers` IPC method shapes + broadcast events (`chat:changed`, `chat:delta`, `chat:open-state`, `chat:highlight`).
- Sidebar `AgentChatSystemTabController` with `TestChatStoreModel`: list render, search filter + counts, row expand → tool-call sublist, indicator when open in another window, highlight button dispatch.
- Grid `AgentChatController` with `TestChat*Models`: mount reads `config.chatId`, send→runtime, delta→component, snapshot/restore round-trip.
- Open-once: opening a chat already open in another window → no duplicate + toast (per Open Question 2).

**Manual / E2E**
- `debug` skill (`OPENP41GE_DEVTOOLS=1`): configure overlay Agent tab against a local vLLM (`docker run ... --api-server`), new chat → streamed reply + tool calls, sidebar list/search/expand, two windows → indicator + Highlight paints blue handle only.
- `test-cross-window-drag` skill if tool rows become draggable (future), and to confirm chat tabs drag between windows like other grid tabs.

## Scope

- **In**: `agent-chat` grid app type; runtime + vLLM provider + tool registry; chat store/persistence + search (message + tool commands); per-window chat-list sidebar w/ tool-call sublists + open-once indicator/highlight; overlay Agent provider settings; preview-model opening.
- **Out**: multi-provider connectors beyond the registry seam (only vLLM implemented now); dragging tool-call rows to the grid (flagged future); conversational context beyond message history (RAG/file indexing); auth flows beyond an apiKey field.

## Open Questions

1. **Tool set (v1)** — proposed default: `read_file`, `search_files`, `run_command`. Confirm, or expand/trim (e.g. add `git_status`, `git_log`; drop `run_command` if unsafe for v1). Tools are registry-based, so this is additive later.
2. **Open-once conflict** — default: clicking a chat open in another window shows a **toast with a "Highlight" action** (no duplicate open, no focus steal). Alternative: auto-focus the other window's chat. Default chosen: toast + highlight.
3. **Preview vs pinned** — default: sidebar click = unpinned preview (pin on second click); "New Chat" = pinned. Confirm.
4. **Search scope detail** — default: message text includes both user and assistant; tool commands = `name` + `arguments` (raw command string), never responses. Confirm assistant text included.
5. **Default sidebar side** — default `right` (matches Explorer/Git). Confirm (chat often left).
6. **Cmd+N picker** — add `agent-chat` to `APP_TYPES` so it appears in the pane picker, or keep it sidebar/overlay-only for v1? Default: include in `APP_TYPES`.
7. **System prompt / scope** — default: a built-in default system prompt, and chat tabs record `config.scopeRoots` (already anticipated by `scope-expansion-utils`) but v1 tools are **not** clamped to scope roots (flag if you want closed-scope enforcement now).

## Completion Criteria

- [ ] `agent-chat` grid panes open chats, stream assistant replies from a local vLLM server, render tool-call rows (running/done/error), support abort, and survive snapshot/restore.
- [ ] Chat store persists to disk atomically and is shared across windows; search matches message text + tool-call commands (never responses) with per-chat counts.
- [ ] Per-window Chat sidebar lists chats, filters by search, expands rows to **tool-call sublists**, opens chats as preview tabs, and shows the open-in-another-window indicator + Highlight button (blue tab handle, no activation).
- [ ] A chat cannot be open in two windows; provider config editable in the system overlay with Test Connection; unconfigured/unreachable state surfaces in chat panes.
- [ ] Provider/tool additions require no edits to existing `switch`es (registry pattern verified by review).
- [ ] `nx run-many -t typecheck`, `nx lint` clean; `nx run-many -t test` passes (new unit + integration suites); verified end-to-end against local vLLM in dev via `debug` skill; error overlay clear.
