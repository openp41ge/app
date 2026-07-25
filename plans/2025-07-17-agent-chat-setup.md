2025-07-17

# Goal

Wire the existing `<openp41ge-agent-chat>` web component into the openp41ge platform as a first-class pane type with full agent/provider abstraction, switchable agents mid-conversation, folder-scoped file contexts (frontmatter-based), a tool system owned by the main openp41ge package, and robust conversation lifecycle management (cancellation, auto-compaction, timeouts, retry).

# Rationale

The `openp41ge-agent-chat` package has a basic UI stub but is not integrated into the openp41ge platform and has no backend. To be useful, it needs:

1. **Platform integration** — open chat tabs via the pane picker, survive session snapshot/restore.
2. **Provider abstraction** — talk to local models (Ollama/LM Studio via OpenAI-compatible endpoints), Anthropic, OpenAI, etc.
3. **Agent abstraction** — define agents with system prompts, model selection, and per-repo agent configuration using **frontmatter** markdown files (like VS Code Copilot's custom instructions).
4. **Agent switching** — select which agent to talk to mid-conversation, via a dropdown in the prompt area (VS Code Copilot Chat pattern).
5. **Folder contexts** — define context for specific folders/subtrees via frontmatter markdown files. More specific paths have **higher priority and are placed closest to the file content** (leveraging LLM recency bias). Contexts apply dynamically based on which files the agent touches.
6. **Tool system in openp41ge platform** — all tool interfaces and implementations live in `packages/openp41ge/src/renderer/tools/`, so they can be reused by any agent system (not just chat). The agent-chat package consumes them via subpath export.
7. **Conversation lifecycle** — stop button + Escape to cancel streaming, auto-compaction (summarize older messages when approaching token limits), configurable timeouts, and automatic retry with exponential backoff.
8. **Efficient rendering** — virtualized message list for long conversations, word-wrap by default, no horizontal scrollbars (arrow keys for long lines).

# Approach

## 1. Global Agent Configuration (`~/.openp41ge/chat/config.json`)

JSON file, plaintext keys for now (keychain migration later):

```jsonc
{
  "defaultAgent": "claude",
  "agents": {
    "gpt4": {
      "label": "GPT-4o",
      "provider": "openai",
      "model": "gpt-4o",
      "apiKey": "sk-...",
      "systemPrompt": "You are a helpful programming assistant.",
      "temperature": 0.3,
      "timeoutMs": 60000,
    },
    "claude": {
      "label": "Claude Sonnet",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "apiKey": "sk-ant-...",
      "systemPrompt": "You are a helpful programming assistant.",
      "temperature": 0.3,
      "timeoutMs": 120000,
    },
    "local": {
      "label": "Local (Ollama)",
      "provider": "openai",
      "baseUrl": "http://localhost:11434/v1",
      "model": "llama3.2",
      "systemPrompt": "You are a helpful programming assistant.",
      "temperature": 0.7,
      "timeoutMs": 30000,
    },
  },
}
```

## 2. Per-Repo Agent Definitions (Frontmatter Markdown)

Per-repo agents in `<repo-root>/.openp41ge/agents/<agent-name>.md`. Frontmatter for config, body for the system prompt:

```markdown
---
label: "Codebase Expert"
provider: "anthropic"
model: "claude-sonnet-4-20250514"
temperature: 0.3
---

You are an expert in this specific codebase.

Key architecture facts:

- This is a pnpm monorepo with packages under packages/
- Web components use Lit with Shadow DOM
- E2E tests use Playwright with model-based DI
- IPC bridge is window.openp41ge.*

Always reference the coding patterns defined in AGENTS.md when giving advice.
```

## 3. Folder Contexts (Frontmatter Markdown)

Files in `<repo-root>/.openp41ge/contexts/` mirroring the source tree:

```
.openp41ge/contexts/
  root.md                          # Applies to entire repo
  src/
    components.md                  # Applies to src/components/
    components/
      button.md                    # Applies to src/components/button/
  api/
    routes.md                      # Applies to src/api/routes/
```

Example `.openp41ge/contexts/src/components.md`:

```markdown
---
priority: 10
---

# UI Component Conventions

All UI components in src/components/ follow these patterns:

- LitElement with Shadow DOM
- CSS custom properties for theming (--bg-primary, --accent, etc.)
- Events bubble and are composed
```

### How contexts apply — least specific first, most specific last

When the agent calls `readFile`, the system:

1. Finds all `.openp41ge/contexts/` files whose path prefix matches the file being read.
2. Sorts by path specificity **shallowest first, deepest last**.
3. Uses frontmatter `priority` as a tiebreaker at the same depth (higher = more important — but within the same depth, higher priority is still placed later).
4. Prepends all matching contexts before the file content.

**Ordering rationale:** LLMs exhibit recency bias — content closer to the end of the input carries more weight. By placing the most specific (most relevant) context last, immediately before the file content, the model gives maximum weight to the guidance most applicable to the current file.

```
root.md                             ← broadest, first
src/ context                        ← less specific
src/components/ context             ← more specific
src/components/button/ context      ← most specific, last before content
------------------------------------------
--- src/components/button/index.ts ---
```

Contexts are **dynamic** — they apply based on which files the agent touches, not just at startup. If the user asks "fix the button component", reading `src/components/button/index.ts` triggers all matching contexts in the order above.

## 4. Agent / Provider Interfaces (`packages/openp41ge-agent-chat/src/providers/`)

```typescript
/** Configuration for a single agent definition. */
export interface AgentConfig {
  id: string;
  label: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number; // request timeout, default 60s
  maxRetries?: number; // auto-retry attempts, default 3
}

/** Provider interface — one per API backend. */
export interface ChatProvider {
  readonly id: string;
  readonly label: string;
  /** Send conversation + system prompt + tools → streaming response.
   *  The AbortSignal allows cancellation. The provider must handle timeouts
   *  internally and respect the signal. */
  send(
    messages: ChatMessage[],
    options: {
      systemPrompt?: string;
      tools?: import("openp41ge/tools").AgentTool[];
      signal?: AbortSignal;
    },
  ): Promise<ReadableStream<string> | string>;
}
```

Providers consume `AgentTool` from the openp41ge platform — they do not define their own tool interface.

Provider implementations:

| Provider          | File                    | Coverage                             |
| ----------------- | ----------------------- | ------------------------------------ |
| OpenAI-compatible | `openai-provider.ts`    | OpenAI API + Ollama, LM Studio, vLLM |
| Anthropic         | `anthropic-provider.ts` | Anthropic Messages API               |

Each provider supports:

- **Streaming** via SSE
- **Tool calling** (function calling) via the agent's available tools
- **AbortSignal** for cancellation
- **Timeout** via `AbortSignal.timeout(timeoutMs)` or equivalent
- **Auto-retry** with exponential backoff (3 attempts by default, jittered)

### Retry logic (in provider base)

```typescript
async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: { maxRetries: number; timeoutMs: number },
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      const result = await fn(controller.signal);
      clearTimeout(timeout);
      return result;
    } catch (err) {
      lastError = err as Error;
      if (attempt < options.maxRetries) {
        // Exponential backoff with jitter: 1s, 2s, 4s, 8s...
        const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
```

## 5. Tool System in Openp41ge Platform (`packages/openp41ge/src/renderer/tools/`)

All tool interfaces and implementations live in the main openp41ge package so they can be reused by any agent system.

```typescript
// packages/openp41ge/src/renderer/tools/agent-tool.ts
export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema for the tool's parameters (for LLM function calling). */
  inputSchema: Record<string, unknown>;
  execute(params: Record<string, unknown>): Promise<string>;
}

// packages/openp41ge/src/renderer/tools/file-context.ts
export interface FileContext {
  readonly scopeRoot: string;
  isInScope(path: string): boolean;
  getApplicableContexts(path: string): Promise<FolderContext[]>;
}

export interface FolderContext {
  path: string;
  priority: number;
  content: string;
}

// packages/openp41ge/src/renderer/tools/file-reader.ts
export interface FileReader {
  readFile(path: string): Promise<string>;
  fileExists(path: string): Promise<boolean>;
}

// packages/openp41ge/src/renderer/tools/read-file-tool.ts
export class ReadFileTool implements AgentTool {
  // ... reads file, collects contexts (least→most specific), prepends them
}

// packages/openp41ge/src/renderer/tools/context-collector.ts
export class ContextCollector {
  /** Returns contexts sorted least→most specific (shallowest→deepest path). */
  async collect(filePath: string): Promise<FolderContext[]> { ... }
}

// packages/openp41ge/src/renderer/tools/index.ts — barrel export
```

File hierarchy:

```
packages/openp41ge/src/renderer/tools/
  agent-tool.ts
  file-context.ts
  file-reader.ts
  read-file-tool.ts
  context-collector.ts
  index.ts
```

Subpath export in `packages/openp41ge/package.json`:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./tools": "./dist/renderer/tools/index.js"
  }
}
```

## 6. Agent Registry (`packages/openp41ge-agent-chat/src/providers/agent-registry.ts`)

```typescript
import type { AgentTool } from "openp41ge/tools";

export class AgentRegistry {
  registerProvider(id: string, factory: (config: AgentConfig) => ChatProvider): void;
  getAgents(): AgentDefinition[];
  createProvider(config: AgentConfig): ChatProvider;
}
```

The registry only manages providers — tools are owned by the openp41ge platform and provided to the component directly.

## 7. YAML Dependency

Add `js-yaml` to `packages/openp41ge/package.json` for frontmatter parsing of agent and context `.md` files:

```bash
cd packages/openp41ge && pnpm add js-yaml
cd packages/openp41ge && pnpm add -D @types/js-yaml
```

## 8. UI Changes (`packages/openp41ge-agent-chat/src/ui/openp41ge-agent-chat.ts`)

### Agent selector in the prompt area

Like VS Code Copilot Chat, a dropdown at the top-left of the input bar:

```
┌─────────────────────────────────────────┐
│  Messages (virtualized list)             │
│  ...                                     │
│  ┌─────────────────────────────────┐    │
│  │ [Claude Sonnet ▼] ■ Stop       │    │
│  │ Ask me...                       │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Stop button + Escape cancellation

- While the provider is streaming, the send button is replaced with a **■ Stop** button.
- Pressing **Escape** while the input area is focused also triggers cancellation.
- The stop signal is sent via `AbortController.abort()` to the provider.
- The provider must respect the abort signal and clean up the stream.
- After cancellation, the partial assistant response remains visible.

### Streaming response rendering

- Progressively append tokens to the last `assistant` message.
- Show an animated typing indicator while no tokens have arrived yet (e.g., streaming is connecting).
- When a tool is called, show "🔍 Reading src/foo.ts..." inline.

### Auto-compaction (VS Code Copilot pattern)

When the conversation is about to exceed the model's token limit (detected client-side via token estimation), the system:

1. **Cancels the in-progress stream** (if streaming).
2. **Sends a compaction request** to the same provider (or a configured fallback) with a summary prompt like:

   > "Create a comprehensive, detailed summary of this conversation that captures all essential information needed to seamlessly continue the work without losing context. Include goals, decisions, file paths discussed, code snippets referenced, and any errors encountered."

3. **Replaces older messages** with the summary, keeping only the most recent N messages intact.
4. **Resends the user's latest message** (or continues the tool loop) with the compacted history.
5. **Re-renders** — the UI shows a "📝 Conversation compacted" notice in the message list.

**Configuration:** Compaction uses the same provider as the active agent (or a separate model configured in `config.json` with a `"compactionModel"` field). The compaction threshold is a configurable percentage of the model's max context window (default: 80%).

### Virtualized message list

For long conversations, a virtualized scroll container renders only visible messages:

- Uses a simple intersection-observer or scroll-position-based approach to render ~20 messages at a time.
- Older messages above the viewport are detached from the DOM (or replaced with a placeholder height marker).
- Auto-scroll to bottom on new messages.
- **Word-wrap by default** — no horizontal scrollbar. Long lines wrap.
- **Arrow key navigation** for long unwrapped lines: if the user wants to view a long line without wrapping, pressing →/← scrolls horizontally within the message (but wrapping is the default presentation).
- The virtualizer preserves scroll position during streaming and compaction.

### Loading / Error states

- **Loading:** Disable input, show typing indicator. Stop button visible.
- **Error:** Inline error below the last assistant message. "Retry" button retries the failed request (with backoff). After exhausting retries, show the final error and offer a manual "Try Again" button.
- **Timeout:** If the provider times out, show "Request timed out after X seconds. [Retry]"
- **Compaction notice:** Show a brief "📝 Conversation compacted" line in the message flow when auto-compaction occurs.

### CSS variable migration

Replace hard-coded colours with CSS custom properties.

## 9. Platform Integration (`packages/openp41ge/src/renderer/apps/agent-chat/`)

### AgentChatController (extends BaseController)

```typescript
import { BaseController } from "../../controllers/base-controller";

export class AgentChatController extends BaseController {
  mount(container: HTMLElement): void {
    // 1. Create pane header (like PlaceholderController / TerminalController)
    //    Shows: [icon] scope-folder-name     [×]
    //    The pane header is the draggable top bar with label and close button.
    //    For agent chat, the label shows the scope folder name (e.g., "📁 my-project")
    // 2. Create <openp41ge-agent-chat> element
    // 3. Set scopeRoot (provided at creation time, stored in tab config)
    // 4. Create FileContext + FileReader + ReadFileTool + ContextCollector
    // 5. Load agent configs (global + per-repo)
    // 6. Parse frontmatter from .md files using js-yaml
    // 7. Inject agents, activeAgent, tools into the component
    // 8. Listen for chat-message → route to active provider with tool support
    // 9. Handle tool calls in the provider loop
    // 10. Wire AbortController for stop/cancel
    // 11. Wire auto-compaction logic (token estimation → compact → resume)
  }

  unmount(): void {
    // Cancel any in-progress request
    // Remove component from DOM
    this.container = null;
  }

  setVisible(visible: boolean): void {
    // Refocus input on visible=true
  }

  snapshot(): Record<string, unknown> {
    return {
      messages: this._component.messages,
      activeAgentId: this._component.activeAgent?.id,
      scopeRoot: this._scopeRoot,
    };
  }

  restore(state: Record<string, unknown>): void {
    this.state = { ...state };
    // Restore messages and agent selection on next mount
  }
}
```

### Pane header

Every pane in openp41ge has a **pane header** — the top bar (28px height) that shows:

- The pane label (left side)
- The close button (right side, using `paneHeaderButton()`)

For agent chat, the pane header additionally shows:

- The scope folder name (e.g., "📁 my-project") when a scope is set
- The active agent name (e.g., "Claude Sonnet")

The pane header is draggable (CSS `cursor:grab`) — this is how users drag tabs between openp41ges.

### Scope provision

The scope is set when the chat tab is created:

1. **Worktree context menu** — "Chat about this folder" creates a scoped tab.
2. **Pane picker** — creates an unscoped chat tab (file tools unavailable until scope is set).

The scope is stored in tab config:

```typescript
{ tabId: "...", appType: "agent-chat", config: { scopeRoot: "/Users/me/repos/my-project" } }
```

### Chat tab immovability → Scope expansion on drag

**This is not enforced as a block.** Instead, when a scoped chat tab is dragged to another openp41ge, the user sees a modal explaining that the scope must be expanded to include the new openp41ge's worktrees. [This is covered in a separate plan](2025-07-17-tab-relocation-scope-expansion.md).

Unscoped chat tabs move freely.

## 10. Add Dependencies

- `packages/openp41ge/package.json`: add `"openp41ge-agent-chat": "workspace:*"`, `"js-yaml"`, `"@types/js-yaml"`.
- Export `"./tools"` subpath in `packages/openp41ge/package.json`.
- Import and `registerAppType(agentChatAppRegistration)` in `packages/openp41ge/src/renderer/app.ts`.

# Files Changed

## `packages/openp41ge-agent-chat/` (new/modified files)

| File                                  | Purpose                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/providers/chat-provider.ts`      | `ChatProvider` interface                                                                                                  |
| `src/providers/agent-config.ts`       | `AgentConfig` type                                                                                                        |
| `src/providers/with-retry.ts`         | `withRetry` — timeout + exponential backoff helper                                                                        |
| `src/providers/openai-provider.ts`    | OpenAI-compatible provider                                                                                                |
| `src/providers/anthropic-provider.ts` | Anthropic Messages API provider                                                                                           |
| `src/providers/agent-registry.ts`     | `AgentRegistry`                                                                                                           |
| `src/providers/index.ts`              | Barrel export                                                                                                             |
| `src/ui/openp41ge-agent-chat.ts`      | **Modified** — agent selector, stop button, streaming, virtualized list, compaction notice, loading/error/retry, CSS vars |
| `src/ui/virtual-list.ts`              | Virtualized message list component (Lit)                                                                                  |
| `src/index.ts`                        | **Modified** — export new public API                                                                                      |

## `packages/openp41ge/src/renderer/tools/` (new — tool system owned by openp41ge platform)

| File                         | Purpose                                   |
| ---------------------------- | ----------------------------------------- |
| `tools/agent-tool.ts`        | `AgentTool` interface                     |
| `tools/file-context.ts`      | `FileContext`, `FolderContext` interfaces |
| `tools/file-reader.ts`       | `FileReader` interface                    |
| `tools/read-file-tool.ts`    | `ReadFileTool` implementation             |
| `tools/context-collector.ts` | `ContextCollector`                        |
| `tools/index.ts`             | Barrel export                             |

## `packages/openp41ge/src/renderer/apps/agent-chat/` (new)

| File                                       | Purpose                                          |
| ------------------------------------------ | ------------------------------------------------ |
| `apps/agent-chat/index.ts`                 | `AppTypeRegistration` for `"agent-chat"`         |
| `apps/agent-chat/agent-chat-controller.ts` | `AgentChatController` (extends `BaseController`) |
| `apps/agent-chat/frontmatter-parser.ts`    | Parse YAML frontmatter from `.md` files          |

## `packages/openp41ge/` (modified files)

| File                             | Purpose                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `package.json`                   | Add `"openp41ge-agent-chat": "workspace:*"`, `"js-yaml"`, `"@types/js-yaml"`, `"./tools"` subpath |
| `src/renderer/app.ts`            | Import + `registerAppType(agentChatAppRegistration)`                                              |
| `src/preload.ts` / `global.d.ts` | Add `window.openp41ge.file.read(path)` IPC bridge (if not present)                                |

# Testing Strategy

## Unit Tests (`packages/openp41ge-agent-chat/test/unit/`)

| Test                                               | What it covers                                           |
| -------------------------------------------------- | -------------------------------------------------------- |
| Agent registry                                     | Register providers, lookup, create                       |
| withRetry — success                                | Returns result on first attempt                          |
| withRetry — retries then succeeds                  | Fails twice, succeeds on third                           |
| withRetry — exhausts retries                       | Throws after maxRetries                                  |
| withRetry — timeout                                | Aborts when timeout expires                              |
| OpenAI provider — request shape                    | Validates body, headers, URL, tool declarations          |
| OpenAI provider — streaming                        | SSE decode and yield tokens                              |
| OpenAI provider — cancellation                     | Respects AbortSignal                                     |
| Anthropic provider — request shape                 | Messages API format                                      |
| Anthropic provider — streaming                     | SSE stream decoding                                      |
| Anthropic provider — cancellation                  | Respects AbortSignal                                     |
| Component — stop button                            | Stop button appears during streaming, click cancels      |
| Component — Escape cancels                         | Escape key triggers abort                                |
| Component — agent switching                        | Setting agents + activeAgent updates UI                  |
| Component — streaming append                       | Sequential tokens append to assistant message            |
| Component — loading state                          | Typing indicator visible                                 |
| Component — error + retry                          | Error shown, retry button triggers resend                |
| Component — compaction notice                      | "Conversation compacted" notice appears after compaction |
| Virtual list — basic render                        | Renders visible messages, detaches offscreen ones        |
| Virtual list — scroll to bottom                    | Auto-scrolls on new message                              |
| Virtual list — preserves position during streaming | Scroll position maintained                               |

## Unit Tests (`packages/openp41ge/test/unit/tools/`)

| Test                                | What it covers                                         |
| ----------------------------------- | ------------------------------------------------------ |
| ReadFileTool — in scope             | Returns content for allowed path                       |
| ReadFileTool — out of scope         | Returns error                                          |
| ContextCollector — ordering         | root.md → src/ → src/components/ (least→most specific) |
| ContextCollector — no match         | Empty list                                             |
| Frontmatter parser — valid          | Parses YAML frontmatter + body                         |
| Frontmatter parser — no frontmatter | Empty frontmatter, full content as body                |

## E2E Tests (`test/e2e/openp41ge/`)

Following model-based DI pattern:

| Test                              | What it covers                                                    |
| --------------------------------- | ----------------------------------------------------------------- |
| Open chat tab via pane picker     | Pane picker shows "Agent Chat", opens with empty state            |
| Open scoped chat tab              | Creates scoped tab                                                |
| Agent selector shows agents       | Dropdown lists injected agents                                    |
| Switch agents mid-conversation    | Changes activeAgent without clearing history                      |
| Send message + streaming response | User message rendered, test provider returns streaming response   |
| Stop button cancels stream        | Clicking stop during streaming cancels and partial response stays |
| Escape cancels stream             | Escape key triggers cancellation                                  |
| Tool call visible                 | readFile tool call shows status inline                            |
| Compaction notice visible         | After compaction, notice appears in message list                  |
| Error + retry                     | Provider fails, error shown, retry succeeds                       |
| Snapshot/restore                  | Preserves messages, active agent, scopeRoot                       |

# UX Considerations

- **Stop button**: Replaces send button during streaming. Red square icon "■ Stop". On click or Escape, the stream is cancelled and partial response remains visible.
- **Escape to cancel**: Works when the chat input is focused. Does not cancel when focus is elsewhere.
- **Agent selector**: Dropdown in prompt area (VS Code Copilot Chat pattern). Shows agent label.
- **Scope indicator**: Pane header shows "📁 folder-name" when scoped.
- **Focus management**: On mount and tab switch-back, focus the text input.
- **Keyboard shortcuts**: Enter sends, Shift+Enter newline, Escape cancels.
- **Auto-scroll**: To bottom during streaming (already implemented).
- **Virtualized list**: Only ~20 messages in DOM at a time. Scrollbar for history.
- **Word-wrap**: Default. No horizontal scrollbar. Arrow keys scroll long lines horizontally if needed.
- **Compaction notice**: A single "📝 Conversation compacted" line inserted into the message flow so the user understands older messages were summarized.
- **Error state**: Inline below last assistant message. "Retry" button. After exhausting retries, show final error + "Try Again" manual button.
- **Timeouts**: "Request timed out after 60s. [Retry]"
- **Visual style**: CSS custom properties.
- **Empty state**: "Start a conversation by typing a message below."

# Scope Boundaries

### In scope

- Agent/provider abstraction (OpenAI, Anthropic, OpenAI-compatible local)
- Agent registry with provider factories
- Agent selector UI
- Per-repo agents (`.openp41ge/agents/*.md` frontmatter)
- Folder contexts (`.openp41ge/contexts/**/*.md` frontmatter)
- Context resolution: least→most specific ordering
- Tool system in openp41ge platform (`packages/openp41ge/src/renderer/tools/`)
- `ReadFileTool` with scope enforcement + context prepending
- Subpath export `"./tools"`
- Chat tab creation with optional `scopeRoot`
- Scope provision at creation time
- Stop button + Escape cancellation (AbortSignal)
- Auto-compaction (summarize old messages when approaching token limit)
- Timeouts + auto-retry with exponential backoff (3 attempts)
- Virtualized message list (efficient for long conversations)
- Word-wrap by default, arrow keys for long lines
- YAML dependency (`js-yaml`)
- `BaseController` extension
- Pane header with scope/agent info
- Session snapshot/restore
- All unit tests and E2E tests

### Out of scope (separate plan or future)

- **Scope expansion on drag** — see `2025-07-17-agent-chat-scope-expansion.md`
- Additional tools (grep, git operations, file writing)
- Keychain API key storage
- Conversation export/import
- File drag-and-drop into chat
- Image/vision model support
- Agent memory / conversation summarisation beyond compaction
- Tool execution confirmation UI

# Completion Criteria

- [ ] `ChatProvider` interface defined and exported
- [ ] `AgentConfig` type and `AgentRegistry` implemented
- [ ] `withRetry` — timeout + exponential backoff helper
- [ ] OpenAI-compatible provider (with AbortSignal, retry, timeout)
- [ ] Anthropic provider (with AbortSignal, retry, timeout)
- [ ] `AgentTool` interface in `packages/openp41ge/src/renderer/tools/`
- [ ] `FileContext` / `FileReader` interfaces
- [ ] `ReadFileTool` with scope enforcement + context prepending (least→most specific)
- [ ] `ContextCollector` resolving `.openp41ge/contexts/` files
- [ ] Frontmatter parser (`js-yaml`)
- [ ] `<openp41ge-agent-chat>`: agent selector, stop button, streaming, compaction notice, virtualized list, loading/error/retry, CSS vars
- [ ] `VirtualList` component for efficient scrolling
- [ ] `AgentChatController` extending `BaseController` with pane header
- [ ] Cancel via Escape key (when input focused)
- [ ] Auto-compaction: detect approaching token limit, compact, resume
- [ ] Scope provided at creation time, stored in tab config
- [ ] `agentChatAppRegistration` created and registered
- [ ] `openp41ge-agent-chat` + `js-yaml` dependencies added
- [ ] `"./tools"` subpath export in openp41ge package
- [ ] `window.openp41ge.file.read()` IPC bridge (if not present)
- [ ] Chat tab opens via pane picker (unscoped) and worktree context menu (scoped)
- [ ] Agent selector shows all configured agents
- [ ] Switch agents mid-conversation without clearing history
- [ ] Send message → streaming response rendered
- [ ] Stop button / Escape cancels stream
- [ ] Agent calls readFile → file content with folder contexts returned
- [ ] Auto-compaction triggers when approaching token limit
- [ ] Provider timeout → error message with retry
- [ ] Provider failure → retry with backoff, then "Try Again" button
- [ ] Session snapshot/restore preserves all state
- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] Project builds without errors
