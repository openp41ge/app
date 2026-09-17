/**
 * <openp41ge-agents> — Chat interface web component (Lit).
 *
 * Renders a full chat transcript (user / assistant / tool messages, tool-call
 * rows with running→done/error status), streams assistant text, and surfaces
 * provider connection status. It is UI-only: it never touches IPC or the chat
 * store — data flows through the platform controller's imperative API.
 *
 * Event contract (bubbles, composed):
 *   - `chat:send`   detail `{ text, thinkingLevel }` — user submitted a message.
 *   - `chat:abort`  — user clicked the abort button while streaming.
 *   - `chat:provider-change` detail `{ providerId }` — user picked a provider/model.
 *   - `chat:thinking-change` detail `{ thinkingLevel }` — user picked a thinking level.
 *   - `chat:add-content` — user clicked the “+ / add content” button.
 */

import { LitElement, html, type TemplateResult } from "lit";
import { state, query } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { OverlayScrollbar } from "openp41ge-scrollbar";
import { tooltipContent, tooltipController } from "openp41ge-uikit/tooltip";
import type { Chat, ChatMessage, ChatRuntimeStatus, MessageSegment, TokenUsage, ToolCall } from "../types";
import { renderMarkdownSegments, type MarkdownSegment, type CodeBlockSegment } from "./markdown.js";
import {
  highlight,
  langLabel,
  detectLanguageCandidates,
  SUPPORTED_LANGUAGES,
} from "./syntax-highlight.js";

function deepCloneMessage(m: ChatMessage): ChatMessage {
  return {
    ...m,
    toolCalls: m.toolCalls?.map((t) => ({ ...t })),
    segments: m.segments?.map((s) =>
      s.type === "tool" ? { ...s, toolCall: { ...s.toolCall! } } : { ...s },
    ),
  };
}

/** Append a text chunk to the ordered segment list, merging into a trailing text segment. */
function appendTextSegment(
  segments: MessageSegment[] | undefined,
  text: string,
): MessageSegment[] {
  const segs = segments ?? [];
  const last = segs[segs.length - 1];
  if (last && last.type === "text") {
    return [...segs.slice(0, -1), { type: "text", text: (last.text ?? "") + text }];
  }
  return [...segs, { type: "text", text }];
}

/** Insert or update a tool-call segment at its recorded position in the ordered list. */
function upsertToolSegment(
  segments: MessageSegment[] | undefined,
  tool: ToolCall,
): MessageSegment[] {
  const segs = segments ?? [];
  const idx = segs.findIndex((s) => s.type === "tool" && s.toolCall?.id === tool.id);
  if (idx >= 0) {
    return segs.map((s, i) =>
      i === idx ? { ...s, toolCall: { ...tool } } : s,
    );
  }
  return [...segs, { type: "tool", toolCall: { ...tool } }];
}

/** A selectable provider shown in the composer's config row. */
interface ComposerProvider {
  id: string;
  label: string;
  /** The provider's default/current model id. */
  model: string;
  /** All models available from this provider (optional). */
  models?: ComposerModel[];
  /** The endpoint/base URL for this provider (optional). */
  baseUrl?: string;
}

/** A selectable model shown in the composer's model dropdown. */
interface ComposerModel {
  id: string;
  /** Thinking config (key/value pairs) if the model declares one. */
  thinking?: Record<string, string>;
  /** Context window size in tokens (optional). */
  contextWindow?: number;
  /** Max output tokens (optional). */
  maxTokens?: number;
}

/** A selectable tool shown in the composer's multi-select dropdown. */
interface ComposerTool {
  name: string;
  /** Optional one-line summary shown beneath the name. */
  description?: string;
}

/** The thinking-level options come from the active model's configured thinking
 *  entries (key/value pairs in the Agent settings). No entries → no selector
 *  and nothing is sent, so there is no fixed level set here. */

/** Format a token count for display (e.g. 128000 → "128k", 1000000 → "1M"). */
function formatTokens(n?: number): string {
  if (!n || n <= 0) return "";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}

class Openp41geAgents extends LitElement {
  @state() private _messages: ChatMessage[] = [];
  @state() private _streaming = false;
  @state() private _status: ChatRuntimeStatus | null = null;
  @state() private _title = "";
  @state() private _usage: TokenUsage | null = null;
  /** Live generation rate (tok/s) while a response is streaming. */
  @state() private _liveTps: number | null = null;
  /** Language overrides for code blocks, keyed by `${msgId}::${blockIndex}`. */
  @state() private _codeLangOverrides: Record<string, string> = {};

  /** Tool results received live, keyed by tool-call id (for opening in a tab). */
  @state() private _toolResults: Record<string, string> = {};

  /** Per code-block line-wrap toggle, keyed by `${msgId}::${index}`. */
  @state() private _codeWrap: Record<string, boolean> = {};

  /** The code-block language picker that is currently open, or null. */
  @state() private _openLangMenu: string | null = null;
  // These two are intentionally NOT @state: the composer content and caret are
  // updated imperatively so keystrokes never trigger a full re-render (which
  // would reset focus and clear the rendered content).
  private _draft = "";
  private _composerFocused = false;
  /** Text-area selection (raw text offsets, including backticks) for the highlight. */
  private _selStart = 0;
  private _selEnd = 0;
  /** Actual caret/focus position (raw offset). Differs from _selEnd when the
   *  selection is anchored at the end (backward, e.g. Shift+Left), so the
   *  rendered caret follows the moving edge instead of sitting frozen at the
   *  end of the highlight. */
  private _caretRaw = 0;
  /** Previous selection, used to infer the moving/focus edge when the browser
   *  leaves `selectionDirection` as "none" (e.g. macOS Cmd+Shift+Arrow). */
  private _prevSelStart = 0;
  private _prevSelEnd = 0;
  /** Anchor used while dragging a mouse selection. */
  private _selAnchor = 0;
  private _draggingSelection = false;
  /** Direction of the last navigation key (1 = down/right, -1 = up/left, 0 =
   *  none). On macOS a Cmd+Shift+Arrow reports `selectionDirection` as "none"
   *  and, when the whole document is already selected, leaves the endpoints
   *  unchanged — so the only way to know which edge the caret should ride is
   *  the arrow key itself.
   */
  private _caretHint = 0;
  /** Maps rendered-content offsets to raw-text offsets (backticks dropped). */
  private _contentSegments: {
    isCode: boolean;
    text: string;
    rawStart: number;
    rawEnd: number;
    contentStart: number;
    contentEnd: number;
  }[] = [];
  @state() private _providers: ComposerProvider[] = [];
  @state() private _providerId = "";
  /** The selected model id for the active provider (may be empty until set). */
  @state() private _modelId = "";
  /** All tools exposed to the composer (the selectable universe). */
  @state() private _availableTools: ComposerTool[] = [];
  @state() private _activeTools: string[] = [];
  /** The selected thinking entry's key (null → use the first available entry). */
  @state() private _thinkingKey: string | null = null;
  /** Which custom dropdown (provider, model, thinking or tools) is open, or null. */
  @state() private _menuOpen: "provider" | "model" | "thinking" | "tools" | null = null;
  private _docListenerAttached = false;
  private _composerResizeObserver: ResizeObserver | null = null;
  private _chatScrollbar: OverlayScrollbar | null = null;
  /** Horizontal overlay scrollbars attached to code-block `<pre>`s, keyed by
   *  the target element so they can be re-synced across re-renders (a new
   *  block gets one; a removed or now-wrapped block has it destroyed). */
  private _codeScrollbars = new Map<HTMLElement, OverlayScrollbar>();
  @query(".chat-input") private _inputEl!: HTMLTextAreaElement;
  @query(".composer-content") private _contentEl!: HTMLElement;

  get messages(): readonly ChatMessage[] {
    return this._messages;
  }

  get title(): string {
    return this._title;
  }

  // ─── Controller-facing imperative API ──────────────────────────────

  setChat(chat: Chat): void {
    this._title = chat.title;
    this._messages = chat.messages.map(deepCloneMessage);
    this._streaming = false;
    this._liveTps = null;
    this._providerId = chat.providerId;
    this._modelId = "";
    this._toolResults = {};
    // Restore the last reported token usage so the bottom bar shows it even
    // after the tab is reopened.
    this._usage = this._lastAssistantUsage(chat.messages);
    this._scrollToBottom();
  }

  appendDelta(text: string): void {
    if (!text) return;
    const messages = this._messages.map(deepCloneMessage);
    let last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") {
      last = {
        id: `stream_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      messages.push(last);
    }
    last.content = (last.content ?? "") + text;
    last.segments = appendTextSegment(last.segments, text);
    this._messages = messages;
    this._streaming = true;
    this._scrollToBottom();
  }

  /** Streamed reasoning/thinking text, shown above the final answer. */
  appendReasoning(text: string): void {
    if (!text) return;
    const messages = this._messages.map(deepCloneMessage);
    let last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") {
      last = {
        id: `stream_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      messages.push(last);
    }
    last.reasoning = (last.reasoning ?? "") + text;
    this._messages = messages;
    this._streaming = true;
    this._scrollToBottom();
  }

  setToolCallState(tc: ToolCall, result?: string): void {
    const messages = this._messages.map(deepCloneMessage);
    let last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") {
      last = {
        id: `stream_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      messages.push(last);
    }
    const calls = last.toolCalls ?? [];
    const idx = calls.findIndex((c) => c.id === tc.id);
    if (idx >= 0) calls[idx] = { ...tc };
    else calls.push({ ...tc });
    last.toolCalls = calls;
    last.segments = upsertToolSegment(last.segments, tc);
    this._messages = messages;
    if (result !== undefined) this._toolResults = { ...this._toolResults, [tc.id]: result };
    this._scrollToBottom();
  }

  setProviderStatus(status: ChatRuntimeStatus): void {
    this._status = status;
    this._streaming = status.streaming;
    if (!status.streaming) this._liveTps = null;
  }

  /** Set the chat title (e.g. when auto-titled from the first user message). */
  setTitle(title: string): void {
    this._title = title;
  }

  /** Set the latest token usage reported for a completion. */
  setUsage(usage: TokenUsage): void {
    this._usage = usage;
  }

  /** Set the live generation rate shown only while the response streams. */
  setStreamRate(tps: number | null): void {
    this._liveTps = tps;
  }

  /** The usage of the most recent assistant message that carries one. */
  private _lastAssistantUsage(messages: ChatMessage[]): TokenUsage | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const u = messages[i]?.usage;
      if (u) return u;
    }
    return null;
  }

  /** Short human-readable token usage line for the bottom bar. */
  private _formatUsage(u: TokenUsage): TemplateResult {
    return html`
      <span
        class="bb-stat"
        ${tooltipContent({
          type: "detail",
          title: "Tokens uploaded",
          subtitle: `Amount sent to the model (system prompt, connected worktree context, and your messages). ${u.promptTokens.toLocaleString("en-US")} tokens uploaded.`,
        })}
        >${this._fmtTok(u.promptTokens)}${this._arrow(false)}</span>
      <span class="bb-sep">·</span>
      <span
        class="bb-stat"
        ${tooltipContent({
          type: "detail",
          title: "Tokens downloaded",
          subtitle: `Amount the model generated in this response. ${u.completionTokens.toLocaleString("en-US")} tokens downloaded.`,
        })}
        >${this._fmtTok(u.completionTokens)}${this._arrow(true)}</span>
    `;
  }

  /** Compact 1K/1M token formatting. */
  private _fmtTok(n: number): string {
    if (n >= 1_000_000) return this._trimZero(n / 1_000_000) + "M";
    if (n >= 1_000) return this._trimZero(n / 1_000) + "K";
    return String(n);
  }

  private _trimZero(v: number): string {
    const s = v.toFixed(1).replace(/\.0$/, "");
    return s;
  }

  /** Format a tokens/sec rate: one decimal (trimmed), compact K/M above 1K. */
  private _fmtRate(tps: number): string {
    if (tps >= 1000) return this._fmtTok(Math.round(tps));
    return String(Number(tps.toFixed(1)));
  }

  /** Small direction arrow: up by default, rotated 180° for down. */
  private _arrow(down: boolean): TemplateResult {
    return html`<svg class="bb-arrow${down ? " down" : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M11 20V7.825l-5.6 5.6L4 12l8-8l8 8l-1.4 1.425l-5.6-5.6V20z"/></svg>`;
  }

  // ─── Back-compat API ────────────────────────────────────────────────

  addMessage(role: "user" | "assistant", content: string): void {
    const msg: ChatMessage = { id: this._id(), role, content, timestamp: Date.now() };
    this._messages = [...this._messages, msg];
    this._scrollToBottom();
  }

  clearMessages(): void {
    this._messages = [];
    this._streaming = false;
  }

  focusInput(): void {
    this._inputEl?.focus();
  }

  // ─── Lifecycle / outside-click blur ────────────────────────────────

  connectedCallback(): void {
    super.connectedCallback();
    if (!this._docListenerAttached) {
      document.addEventListener("pointerdown", this._onDocPointerDown);
      this._docListenerAttached = true;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._docListenerAttached) {
      document.removeEventListener("pointerdown", this._onDocPointerDown);
      this._docListenerAttached = false;
    }
    this._composerResizeObserver?.disconnect();
    this._composerResizeObserver = null;
    this._chatScrollbar?.destroy();
    this._chatScrollbar = null;
    this._destroyCodeBlockScrollbars();
  }

  /** Keep the hidden text-area's soft-wrap identical to the rendered content
   *  so up/down arrow caret movement matches the visible lines. Lazy-set up so
   *  it runs after the @query fields resolve on first render. */
  private _ensureComposerObserver(): void {
    const content = this._contentEl;
    if (!content || this._composerResizeObserver) return;
    // jsdom/test env has no ResizeObserver; skip gracefully.
    if (typeof ResizeObserver === "undefined") return;
    this._composerResizeObserver = new ResizeObserver(() => {
      this._syncComposerInputWidth();
    });
    this._composerResizeObserver.observe(content);
    this._syncComposerInputWidth();
  }

  /** Match the hidden text-area's content width to the rendered content. */
  private _syncComposerInputWidth(): void {
    const el = this._contentEl;
    const ta = this._inputEl;
    if (!el || !ta) return;
    const cs = getComputedStyle(el);
    const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    ta.style.width = `${Math.max(w, 8)}px`;
  }

  private _onDocPointerDown = (e: PointerEvent): void => {
    // Clicking anywhere outside the composer card should drop the caret and
    // clear the focus outline. The off-screen textarea may not naturally blur
    // when the click lands on a non-focusable area (e.g. the transcript), so
    // we blur explicitly.
    const composer = this.renderRoot?.querySelector(".composer") as HTMLElement | null;
    // Use the composed path instead of e.target: events crossing the shadow
    // boundary have their target retargeted to the host element, which would
    // make `.contains(host)` fail even for clicks inside the composer (e.g.
    // toggling a tool in the multi-select). `composedPath()` preserves the
    // inner nodes, so clicks inside the composer (including its menus) are
    // correctly treated as "inside" and never close the dropdown.
    if (!composer || !e.composedPath().includes(composer)) {
      if (this._menuOpen) this._menuOpen = null;
      if (this._composerFocused) {
        this._composerFocused = false;
        this._renderComposerContent();
      }
      if (this._inputEl && this.isConnected) this._inputEl.blur();
    }
  };

  // ─── Send / abort ───────────────────────────────────────────────────

  private get _sendDisabled(): boolean {
    return !this._draft.trim();
  }

  private _sendMessage(): void {
    if (!this._inputEl || this._streaming) return;
    const text = this._inputEl.value.trim();
    if (!text) return;
    this._inputEl.value = "";
    this._draft = "";
    this._selStart = 0;
    this._selEnd = 0;
    this._caretRaw = 0;
    this._prevSelStart = 0;
    this._prevSelEnd = 0;
    this._renderComposerContent();
    this._updateComposerState();
    this.addMessage("user", text);
    this._streaming = true;
    this.dispatchEvent(
      new CustomEvent("chat:send", {
        bubbles: true,
        composed: true,
        detail: {
          text,
          // Only send a thinking level when the model exposes thinking entries.
          ...(this._currentThinking() ? { thinkingLevel: this._currentThinking()!.value } : {}),
        },
      }),
    );
    // Back-compat alias (older consumer tests listened for chat-message).
    this.dispatchEvent(
      new CustomEvent("chat-message", { bubbles: true, composed: true, detail: { text } }),
    );
  }

  private _abort(): void {
    this._streaming = false;
    this.dispatchEvent(new CustomEvent("chat:abort", { bubbles: true, composed: true }));
  }

  // ─── Composer ───────────────────────────────────────────────────────

  /**
   * Controller-facing API: populate the provider/model selector and the set of
   * tools active for the current chat. Called by the agents controller which
   * has access to provider/config data; the component itself stays UI-only.
   */
  setComposerContext(ctx: {
    providers?: ComposerProvider[];
    activeProviderId?: string;
    /** The model to preselect for the active provider (defaults to its model). */
    activeModelId?: string;
    /** The full set of tools available to enable/disable. */
    availableTools?: ComposerTool[];
    /** The tools currently enabled (the multi-select selection). */
    activeTools?: string[];
  }): void {
    if (ctx.providers) {
      this._providers = ctx.providers;
      if (!ctx.activeProviderId && this._providers.length) this._providerId = this._providers[0].id;
    }
    if (ctx.activeProviderId) this._providerId = ctx.activeProviderId;
    if (ctx.activeModelId) this._modelId = ctx.activeModelId;
    // Fall back to the active provider's configured default model so the
    // model selector always has a sensible value.
    if (!this._modelId) {
      const p = this._effectiveProviders().find((x) => x.id === this._providerId);
      this._modelId = p?.model ?? "";
    }
    if (ctx.availableTools) this._availableTools = ctx.availableTools;
    if (ctx.activeTools) this._activeTools = ctx.activeTools;
    this.requestUpdate();
  }

  /** The provider list actually shown in the dropdown (keeps the active
   *  provider valid even when it isn't in the configured table). */
  private _effectiveProviders(): ComposerProvider[] {
    const providers = [...this._providers];
    if (this._providerId && !providers.some((p) => p.id === this._providerId)) {
      providers.unshift({ id: this._providerId, label: this._providerId, model: "" });
    }
    if (providers.length === 0) {
      return [{ id: "", label: "Default model", model: "" }];
    }
    return providers;
  }

  /** The label shown on the provider-selector button. */
  private _currentProviderLabel(): string {
    const p = this._effectiveProviders().find((x) => x.id === this._providerId);
    if (p) return p.label;
    return this._providerId || "Default provider";
  }

  /** The second row shown under each provider in the dropdown: the base URL,
   *  plus the model count when the provider exposes its model list. */
  private _providerSub(p: ComposerProvider): string {
    const bits: string[] = [];
    if (p.baseUrl?.trim()) bits.push(p.baseUrl.trim());
    if (p.models?.length) bits.push(`${p.models.length} model${p.models.length === 1 ? "" : "s"}`);
    return bits.join(" · ");
  }

  /** Checked/unchecked checkbox icon for the tools multi-select. */
  private _checkboxIcon(checked: boolean) {
    const path = checked
      ? "m424-312 282-282-56-56-226 226-114-114-56 56 170 170ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z"
      : "M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Z";
    return html`<svg
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
      fill="#e3e3e3"
    >
      <path d="${path}" />
    </svg>`;
  }

  /** Checked/unchecked radio icon for the single-select provider/model menus. */
  private _radioIcon(checked: boolean) {
    const path = checked
      ? "m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"
      : "M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z";
    return html`<svg
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
      fill="#e3e3e3"
    >
      <path d="${path}" />
    </svg>`;
  }

  /** The label shown on the model-selector button for the active provider. */
  private _currentModelLabel(): string {
    const p = this._effectiveProviders().find((x) => x.id === this._providerId);
    const model = this._modelId || p?.model || "";
    return model || "Default model";
  }

  /** The model id currently selected (falls back to the provider's default). */
  private _currentModelId(): string {
    const p = this._effectiveProviders().find((x) => x.id === this._providerId);
    return this._modelId || p?.model || "";
  }

  /** The model list actually shown for the active provider. Falls back to the
   *  provider's single configured model, then to a single empty default. */
  private _effectiveModels(): ComposerModel[] {
    const p = this._effectiveProviders().find((x) => x.id === this._providerId);
    if (p?.models?.length) return p.models;
    if (p?.model) return [{ id: p.model }];
    return [{ id: "" }];
  }

  /** The second row shown under each model: default thinking ("server default"
   *  when unset) plus the context window / max token sizes when provided. */
  private _modelSub(m: ComposerModel): string {
    const bits: string[] = [];
    const keys = m.thinking ? Object.keys(m.thinking) : [];
    bits.push(keys.length ? `thinking: ${keys[0]}` : "thinking: server default");
    const ctx = formatTokens(m.contextWindow);
    if (ctx) bits.push(`context: ${ctx}`);
    const max = formatTokens(m.maxTokens);
    if (max) bits.push(`max: ${max}`);
    return bits.join(" · ");
  }

  /** Toggle the given composer dropdown (provider, model, thinking or tools). */
  private _toggleMenu(menu: "provider" | "model" | "thinking" | "tools"): void {
    this._menuOpen = this._menuOpen === menu ? null : menu;
    if (this._menuOpen) {
      // Opening the dropdown moves focus onto the selector button. Drop the
      // composer caret so typing doesn't go to a dead text-area and the caret
      // doesn't blink behind the list.
      this._composerFocused = false;
      this._inputEl?.blur();
      this._renderComposerContent();
    } else {
      this._focusComposer();
    }
  }

  private _selectProvider(id: string): void {
    if (id !== this._providerId) {
      this._providerId = id;
      // Reset the model to the provider's configured default when switching.
      const p = this._providers.find((x) => x.id === id);
      const defaultModel = p?.model ?? this._modelId;
      this._modelId = defaultModel;
      this.dispatchEvent(
        new CustomEvent("chat:provider-change", {
          bubbles: true,
          composed: true,
          detail: { providerId: id, modelId: defaultModel },
        }),
      );
    }
    // Keep the menu open (like the tools multi-select) so the user can compare
    // options; it closes only when clicking outside the composer.
  }

  private _selectModel(model: string): void {
    if (model !== this._modelId) {
      this._modelId = model;
      this.dispatchEvent(
        new CustomEvent("chat:model-change", {
          bubbles: true,
          composed: true,
          detail: { modelId: model },
        }),
      );
    }
    // Keep the menu open (like the tools multi-select) so the user can compare
    // options; it closes only when clicking outside the composer.
  }

  /** The thinking entry options for the active model ([] when none configured). */
  private _thinkingOptions(): Array<{ key: string; value: string }> {
    const model = this._effectiveModels().find((m) => m.id === this._currentModelId());
    const thinking = model?.thinking;
    if (!thinking) return [];
    return Object.entries(thinking).map(([key, value]) => ({ key, value }));
  }

  /** The currently selected thinking entry, or null when the model has none. */
  private _currentThinking(): { key: string; value: string } | null {
    const options = this._thinkingOptions();
    if (options.length === 0) return null;
    const selected =
      this._thinkingKey !== null ? options.find((o) => o.key === this._thinkingKey) : undefined;
    return selected ?? options[0];
  }

  /** The label shown on the thinking-level selector button. */
  private _currentThinkingLabel(): string {
    return this._currentThinking()?.key ?? "";
  }

  /** Select a thinking entry by its key. Keeps the menu open (like the tools
   *  multi-select) so the user can compare options; closes on outside click. */
  private _selectThinking(key: string): void {
    if (key !== this._thinkingKey) {
      this._thinkingKey = key;
      this.dispatchEvent(
        new CustomEvent("chat:thinking-change", {
          bubbles: true,
          composed: true,
          detail: { thinkingKey: key },
        }),
      );
    }
  }

  private _onAddContent(): void {
    this.dispatchEvent(new CustomEvent("chat:add-content", { bubbles: true, composed: true }));
  }

  /** The tool list shown in the tools dropdown (the selectable universe). */
  private _effectiveTools(): ComposerTool[] {
    if (this._availableTools.length) return this._availableTools;
    return this._activeTools.map((name) => ({ name }));
  }

  /** Toggle a single tool on/off in the multi-select (keeps the menu open). */
  private _toggleTool(name: string): void {
    const tools = this._activeTools.includes(name)
      ? this._activeTools.filter((t) => t !== name)
      : [...this._activeTools, name];
    this._activeTools = tools;
    this.dispatchEvent(
      new CustomEvent("chat:tools-change", {
        bubbles: true,
        composed: true,
        detail: { tools },
      }),
    );
  }

  private _focusComposer(): void {
    this._inputEl?.focus();
    // The hidden text-area's `focus` event is unreliable in Chrome, so mark it
    // focused here (its real activation path) and sync the caret/selection.
    this._composerFocused = true;
    this._syncSelection();
  }

  private _onComposerFocus(focused: boolean): void {
    this._composerFocused = focused;
    // On focus, pull the text-area's current selection so the rendered caret /
    // highlight start out correct. On blur we just drop the caret.
    if (focused) this._syncSelection();
    else this._renderComposerContent();
  }

  private _onComposerInput(e: Event): void {
    const ta = e.target as HTMLTextAreaElement;
    this._draft = ta.value;
    this._selStart = ta.selectionStart;
    this._selEnd = ta.selectionEnd;
    this._caretRaw = ta.selectionEnd;
    this._selAnchor = ta.selectionEnd;
    this._prevSelStart = ta.selectionStart;
    this._prevSelEnd = ta.selectionEnd;
    this._caretHint = 0;
    this._renderComposerContent();
    this._updateComposerState();
  }

  /** Mirror the text-area's own selection (keyboard: arrows, shift, cmd+a). */
  private _syncSelection(): void {
    const ta = this._inputEl;
    if (!ta) return;
    const newStart = ta.selectionStart;
    const newEnd = ta.selectionEnd;
    this._selStart = newStart;
    this._selEnd = newEnd;

    // The focus/moving edge of a selection is whatever the user just moved;
    // the anchor is the fixed end. `selectionDirection` is authoritative for a
    // fresh selection, but it is unreliable for a cumulatively-extended
    // Cmd+Shift+Arrow selection: macOS reports "none", and some editing
    // commands leave a stale "forward"/"backward" pointing at the wrong end.
    //
    // Two distinct cases need handling:
    //  1. Re-anchor — the endpoints moved (e.g. Cmd+Shift+Up undoing a
    //     Cmd+Shift+Down): one endpoint is still the previous anchor, so we
    //     ride the *other*, moving endpoint regardless of a stale direction.
    //  2. Boundary flip — the endpoints are unchanged but the focus direction
    //     reversed (e.g. the whole document is selected and Cmd+Shift+Up flips
    //     the caret from the end to the start): here we must trust direction,
    //     otherwise a stale anchor pins the caret to the wrong end.
    let caret: number;
    let anchor: number;
    if (newStart === newEnd) {
      // Collapsed caret (typing, plain arrow, click).
      caret = newStart;
      anchor = newStart;
    } else {
      const prevCollapsed = this._prevSelStart === this._prevSelEnd;
      const endpointsChanged = newStart !== this._prevSelStart || newEnd !== this._prevSelEnd;
      const anchorPreserved =
        !prevCollapsed &&
        endpointsChanged &&
        (newStart === this._selAnchor || newEnd === this._selAnchor);

      if (anchorPreserved && newStart === this._selAnchor) {
        anchor = newStart;
        caret = newEnd;
      } else if (anchorPreserved && newEnd === this._selAnchor) {
        anchor = newEnd;
        caret = newStart;
      } else if (ta.selectionDirection === "backward") {
        anchor = newEnd;
        caret = newStart;
      } else if (ta.selectionDirection === "forward") {
        anchor = newStart;
        caret = newEnd;
      } else if (this._caretHint > 0) {
        // Direction is "none" and a down/right navigation key is the latest
        // editor command (e.g. Cmd+Shift+Down): ride the trailing edge. This
        // also covers the boundary case where the whole document is selected
        // and the endpoints therefore do not change.
        anchor = newStart;
        caret = newEnd;
      } else if (this._caretHint < 0) {
        // Direction is "none" and an up/left navigation key (Cmd+Shift+Up).
        anchor = newEnd;
        caret = newStart;
      } else if (endpointsChanged) {
        // Direction is "none" and the endpoints moved (no key hint — e.g. a
        // programmatic selection). Infer the moving edge from which endpoint
        // of the selection actually moved.
        const startMoved = newStart !== this._prevSelStart;
        const endMoved = newEnd !== this._prevSelEnd;
        if (startMoved && !endMoved) {
          caret = newStart;
          anchor = newEnd;
        } else if (endMoved && !startMoved) {
          caret = newEnd;
          anchor = newStart;
        } else {
          // Both endpoints moved and neither matches the previous anchor:
          // prefer the end so the caret sits at the visible trailing edge.
          caret = newEnd;
          anchor = newStart;
        }
      } else {
        // Direction is "none", endpoints did not move, no key hint (e.g. a
        // follow-up keyup): nothing new to infer — keep the current caret.
        this._renderComposerContent();
        return;
      }
    }

    this._caretRaw = caret;
    this._selAnchor = anchor;
    this._prevSelStart = newStart;
    this._prevSelEnd = newEnd;
    this._renderComposerContent();
  }

  /** Insert a newline at the caret without submitting (Shift+Enter). */
  private _insertNewline(): void {
    const ta = this._inputEl;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    ta.value = value.slice(0, start) + "\n" + value.slice(end);
    const pos = start + 1;
    ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    this._caretHint = 0;
  }

  /**
   * Cmd(+Shift)+Arrow — document / line navigation driven by our own
   * anchor+focus model instead of the browser's.
   *
   * A text-area implements these as macOS editing commands that do not preserve
   * an anchor: the browser reports `selectionDirection` as "none", so pressing
   * the opposite arrow re-extends the selection instead of unselecting it, and
   * once the whole document is selected nothing moves at all. Owning the keys
   * restores file-editor behaviour — the anchor stays put and only the focus
   * edge moves, so Cmd+Shift+Down after a Cmd+Shift+Up collapses the selection
   * back onto the anchor and then extends the other way, and the caret still
   * moves when there is nothing left to select. The result is written back with
   * an explicit direction so a follow-up plain Shift+Arrow keeps extending from
   * the same edge.
   *
   * Returns true when the key was handled (and its default suppressed).
   */
  private _handleDocumentNav(e: KeyboardEvent): boolean {
    const ta = this._inputEl;
    if (!ta || !e.metaKey || e.ctrlKey || e.altKey) return false;
    const from = this._focusOffset(ta);
    let focus: number;
    switch (e.key) {
      case "ArrowUp":
        focus = 0;
        break;
      case "ArrowDown":
        focus = ta.value.length;
        break;
      case "ArrowLeft":
        focus = this._lineBound(from, -1);
        break;
      case "ArrowRight":
        focus = this._lineBound(from, 1);
        break;
      default:
        return false;
    }
    e.preventDefault();
    // Without Shift the selection collapses onto the destination. With Shift the
    // anchor is kept and only the focus edge moves — it may cross the anchor and
    // flip the selection to the other side, exactly like a file editor.
    this._applySelection(e.shiftKey ? this._anchorOffset(ta) : focus, focus);
    return true;
  }

  /** The moving (focus) edge of the text-area's current selection. */
  private _focusOffset(ta: HTMLTextAreaElement): number {
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return start;
    if (ta.selectionDirection === "backward") return start;
    if (ta.selectionDirection === "forward") return end;
    // Direction-less selection (mouse drag, Cmd+A, a macOS editing command):
    // our own tracked caret answers it as long as it is still an edge.
    if (this._caretRaw === start || this._caretRaw === end) return this._caretRaw;
    return end;
  }

  /** The fixed (anchor) edge of the text-area's current selection. */
  private _anchorOffset(ta: HTMLTextAreaElement): number {
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return start;
    if (ta.selectionDirection === "backward") return end;
    if (ta.selectionDirection === "forward") return start;
    if (this._selAnchor === start || this._selAnchor === end) return this._selAnchor;
    return this._focusOffset(ta) === end ? start : end;
  }

  /** Write an anchor/focus pair to the text-area and the rendered composer. */
  private _applySelection(anchor: number, focus: number): void {
    const ta = this._inputEl;
    if (!ta) return;
    const max = ta.value.length;
    const a = Math.max(0, Math.min(anchor, max));
    const f = Math.max(0, Math.min(focus, max));
    const start = Math.min(a, f);
    const end = Math.max(a, f);
    ta.setSelectionRange(start, end, a <= f ? "forward" : "backward");
    this._selStart = start;
    this._selEnd = end;
    this._selAnchor = a;
    this._caretRaw = f;
    this._prevSelStart = start;
    this._prevSelEnd = end;
    // We are authoritative here — no edge has to be guessed from a key hint.
    this._caretHint = 0;
    this._renderComposerContent();
  }

  /**
   * The start (dir -1) or end (dir 1) of the line containing `raw`.
   *
   * macOS's Cmd+Left/Right stop at the *visual* line, so we hit-test the
   * rendered content out past the left/right edge on the caret's own line and
   * clamp the result to the hard line. The clamp keeps the caret on the correct
   * side of a newline and gives the right answer when there is no layout to
   * measure (an unrendered composer, tests).
   */
  private _lineBound(raw: number, dir: -1 | 1): number {
    const text = this._draft;
    const hardStart = raw <= 0 ? 0 : text.lastIndexOf("\n", raw - 1) + 1;
    const nextNewline = text.indexOf("\n", raw);
    const hardEnd = nextNewline === -1 ? text.length : nextNewline;
    const fallback = dir < 0 ? hardStart : hardEnd;
    const el = this._contentEl;
    if (!el) return fallback;
    const elRect = el.getBoundingClientRect();
    if (!elRect.height) return fallback;
    const target = this._textNodeAtContentOffset(this._contentOffsetFromRaw(raw));
    if (!target) return fallback;
    const rect = this._caretTargetRect(
      target.node,
      target.offset,
      el,
      elRect,
      getComputedStyle(el),
    );
    if (!rect) return fallback;
    const y = elRect.top + rect.top - el.scrollTop + rect.height / 2;
    const x = dir < 0 ? elRect.left - 10000 : elRect.right + 10000;
    const probe = this._rawOffsetFromContent(this._contentOffsetFromPoint(x, y));
    return Math.min(hardEnd, Math.max(hardStart, probe));
  }

  private _onComposerKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) this._insertNewline();
      else this._sendMessage();
      return;
    }
    // Cmd+Arrow (document / line jumps) is ours: the browser's implementation
    // loses the selection anchor, so it cannot unselect or flip direction.
    if (this._handleDocumentNav(e)) return;
    // Arrow / Home / End / PageUp / PageDown move the text-area's caret as
    // their default action. The `select`/`keyup` events are unreliable while a
    // key is held (auto-repeat), so schedule a sync after the browser applies
    // the caret move; that keeps the rendered caret (and scroll) live.
    if (this._isNavigationKey(e)) {
      // Record the direction of the key so a direction-less ("none") selection
      // — e.g. macOS Cmd+Shift+Arrow at the whole-document boundary — can still
      // ride the correct edge even when the endpoints do not change.
      switch (e.key) {
        case "ArrowUp":
        case "ArrowLeft":
        case "Home":
        case "PageUp":
          this._caretHint = -1;
          break;
        case "ArrowDown":
        case "ArrowRight":
        case "End":
        case "PageDown":
          this._caretHint = 1;
          break;
        default:
          this._caretHint = 0;
      }
      setTimeout(() => this._syncSelection(), 0);
    } else {
      // Any other key (typing, Cmd+A, …) invalidates the arrow-key hint so it
      // can never be applied to a selection it did not cause.
      this._caretHint = 0;
    }
  }

  /** Keys that move the text-area's selection without inserting text. */
  private _isNavigationKey(e: KeyboardEvent): boolean {
    switch (e.key) {
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight":
      case "Home":
      case "End":
      case "PageUp":
      case "PageDown":
        return true;
      default:
        return false;
    }
  }

  private _renderComposerContent(): void {
    const el = this._contentEl;
    if (!el) return;
    // Render the text (with the selection highlight), then draw the caret as an
    // overlay on top of the gap at the caret position. Keeping it a separate
    // positioned element (rather than an inline span) means it never pushes the
    // surrounding text out of the way.
    el.innerHTML = this._contentHtml(this._draft || "", this._selStart, this._selEnd);
    this._positionCaret();
  }

  private _updateComposerState(): void {
    // Scope to the send button (not the abort button, which shares the
    // `.composer-send` class but is always interactive during streaming).
    const sendBtn = this.renderRoot.querySelector<HTMLButtonElement>(".composer-send:not(.abort)");
    if (sendBtn) {
      sendBtn.disabled = this._sendDisabled;
      // Refresh the styled tooltip content so it tracks the disabled state.
      tooltipController.attach(sendBtn, {
        type: "simple",
        text: this._sendDisabled ? "Type a message to send" : "Send message",
      });
      // A button's `disabled` attribute suppresses mouse events, so the custom
      // tooltip can't fire while it is inert. Keep a native `title` fallback for
      // that hint only — cleared once enabled so the two never double up.
      if (this._sendDisabled) {
        sendBtn.title = "Type a message to send";
      } else {
        sendBtn.removeAttribute("title");
      }
    }
    const el = this._contentEl;
    if (el) {
      // Toggle an overflow marker once the content passes 10 lines.
      el.classList.toggle("composer-overflow", el.scrollHeight > 200);
    }
  }

  /**
   * Split draft text into render units. Only *paired* backticks create inline
   * code; an unclosed (orphan) backtick is rendered as a literal character so
   * it never switches styling to the end of the line.
   */
  private _parseSegments(text: string): {
    isCode: boolean;
    text: string;
    rawStart: number;
    rawEnd: number;
    contentStart: number;
    contentEnd: number;
  }[] {
    const segments: {
      isCode: boolean;
      text: string;
      rawStart: number;
      rawEnd: number;
      contentStart: number;
      contentEnd: number;
    }[] = [];
    const parts = text.split("`");
    const n = parts.length;
    const backtickCount = n - 1;
    // An odd backtick count leaves the final backtick unpaired.
    const orphanDelimiter = backtickCount % 2 === 1 ? backtickCount - 1 : -1;
    let raw = 0;
    let content = 0;
    for (let i = 0; i < n; i++) {
      const seg = parts[i];
      // Odd-indexed part is code only when a closing backtick follows it.
      const isCode = i % 2 === 1 && i < n - 1;
      if (seg.length > 0) {
        segments.push({
          isCode,
          text: seg,
          rawStart: raw,
          rawEnd: raw + seg.length,
          contentStart: content,
          contentEnd: content + seg.length,
        });
      }
      raw += seg.length;
      content += seg.length;
      if (i < n - 1) {
        if (i === orphanDelimiter) {
          // Unclosed opening backtick — show it literally (no styling).
          segments.push({
            isCode: false,
            text: "`",
            rawStart: raw,
            rawEnd: raw + 1,
            contentStart: content,
            contentEnd: content + 1,
          });
          raw += 1;
          content += 1;
        } else {
          raw += 1; // matched delimiter — dropped from rendered text
        }
      }
    }
    return segments;
  }

  /**
   * Render the draft as visible HTML, wrapping the selected raw range in a
   * highlight span. Backticks become inline <code> (and are dropped from the
   * rendered text), so segment metadata maps rendered-content offsets back to
   * raw-text offsets for mouse selection (and caret placement).
   */
  private _contentHtml(text: string, selStart = -1, selEnd = -1): string {
    const escape = (s: string): string =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const hasSel = selStart >= 0 && selEnd >= 0 && selStart < selEnd;

    const segs = this._parseSegments(text);
    let html = "";
    for (const sgm of segs) {
      const seg = sgm.text;
      const s = Math.max(sgm.rawStart, selStart);
      const e = Math.min(sgm.rawEnd, selEnd);
      const isSel = hasSel && s < e;
      if (sgm.isCode) {
        // Highlight the whole code chip as a unit so its chip padding falls
        // inside the selection — keeps the highlight continuous across the
        // code boundary (no 3px notch) while preserving partial per-char
        // highlighting for plain text.
        html += isSel
          ? `<span class="composer-highlight"><code>${escape(seg)}</code></span>`
          : `<code>${escape(seg)}</code>`;
      } else {
        let pre = seg;
        let mid = "";
        let post = "";
        if (isSel) {
          const a = Math.max(0, s - sgm.rawStart);
          const b = Math.min(seg.length, e - sgm.rawStart);
          pre = seg.slice(0, a);
          mid = seg.slice(a, b);
          post = seg.slice(b);
        }
        const inner =
          mid !== ""
            ? escape(pre) + `<span class="composer-highlight">${escape(mid)}</span>` + escape(post)
            : escape(seg);
        html += inner;
      }
    }
    this._contentSegments = segs;
    return html;
  }

  /** Convert a rendered-content offset to a raw-text offset using segment metadata. */
  private _rawOffsetFromContent(content: number): number {
    for (const seg of this._contentSegments) {
      if (content >= seg.contentStart && content <= seg.contentEnd) {
        return seg.rawStart + (content - seg.contentStart);
      }
    }
    return this._contentSegments.length
      ? this._contentSegments[this._contentSegments.length - 1].rawEnd
      : 0;
  }

  /** Convert a raw-text offset (with backticks) to a rendered-content offset. */
  private _contentOffsetFromRaw(raw: number): number {
    if (raw <= 0) return 0;
    for (const seg of this._contentSegments) {
      if (raw <= seg.rawEnd) {
        return seg.contentStart + Math.max(0, raw - seg.rawStart);
      }
    }
    return this._contentSegments.length
      ? this._contentSegments[this._contentSegments.length - 1].contentEnd
      : 0;
  }

  /** Find the text node + offset for a rendered-content offset (for caret math). */
  private _textNodeAtContentOffset(offset: number): { node: Text; offset: number } | null {
    const el = this._contentEl;
    if (!el) return null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: { node: Text; start: number; end: number }[] = [];
    let node: Node | null;
    let total = 0;
    while ((node = walker.nextNode())) {
      const len = node.textContent?.length ?? 0;
      if (len > 0) {
        nodes.push({ node: node as Text, start: total, end: total + len });
        total += len;
      }
    }
    if (!nodes.length) return null;
    const o = Math.max(0, Math.min(offset, total));
    for (const n of nodes) {
      if (o <= n.end) {
        return {
          node: n.node,
          offset: Math.max(0, Math.min(o - n.start, n.node.textContent!.length)),
        };
      }
    }
    const last = nodes[nodes.length - 1];
    return { node: last.node, offset: last.node.textContent!.length };
  }

  /**
   * Paint the blinking caret as an overlay over the gap at the caret position.
   * It is measured from a collapsed Range so it tracks the actual caret offset
   * *without being an inline element*, so it never shifts the text around it.
   */
  private _positionCaret(): void {
    const el = this._contentEl;
    if (!el) return;
    let caret = el.querySelector<HTMLElement>(".composer-caret");
    if (!this._composerFocused) {
      caret?.remove();
      return;
    }
    const offset = this._contentOffsetFromRaw(this._caretRaw);
    const target = this._textNodeAtContentOffset(offset);
    const elRect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    let left = parseFloat(cs.paddingLeft);
    let top = parseFloat(cs.paddingTop);
    let caretH = 14;
    if (target) {
      const rect = this._caretTargetRect(target.node, target.offset, el, elRect, cs);
      if (rect) {
        left = rect.left;
        top = rect.top;
        caretH = rect.height;
      }
    }
    if (!caret) {
      caret = document.createElement("span");
      caret.className = "composer-caret";
      caret.setAttribute("aria-hidden", "true");
      el.appendChild(caret);
    }
    caret.style.left = `${Math.max(0, left)}px`;
    caret.style.top = `${Math.max(0, top)}px`;
    caret.style.height = `${Math.round(caretH)}px`;
    // Keep the caret within the composer's visible area (e.g. when arrow keys
    // move it past the top/bottom edge of the overflow region).
    this._scrollCaretIntoView(left, top, caretH);
  }

  /**
   * Scroll the composer content vertically so the caret stays in view. The
   * caret coordinates are content-relative (already folded into scroll), and
   * the composer is the scroll container (`overflow-y: auto`), so we only need
   * to move `scrollTop` when the caret drifts outside the visible band.
   */
  private _scrollCaretIntoView(left: number, top: number, height: number): void {
    const el = this._contentEl;
    if (!el) return;
    // Nothing to scroll unless the content overflows the fixed-height composer.
    if (el.scrollHeight <= el.clientHeight) return;
    const pad = 12;
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight;
    let next = el.scrollTop;
    if (top < viewTop + pad) {
      next = Math.max(0, top - pad);
    } else if (top + height > viewBottom - pad) {
      next = top + height - el.clientHeight + pad;
    }
    if (next !== el.scrollTop) el.scrollTop = next;
  }

  /**
   * Compute the rendered caret rectangle (content-relative left/top/height) for
   * a content offset. A collapsed Range normally yields a usable rect, but on a
   * blank line (two consecutive newlines) there is no glyph at the caret, so
   * the collapsed Range is empty and the caret would snap to the first line.
   * In that case we anchor to the nearest rendered line and step by whole line
   * boxes so the caret still rides the blank line it is actually on.
   */
  private _caretTargetRect(
    node: Text,
    offset: number,
    el: HTMLElement,
    elRect: DOMRect,
    cs: CSSStyleDeclaration,
  ): { left: number; top: number; height: number } | null {
    const lineHeight = parseFloat(cs.lineHeight) || 20;

    // Fast path: a collapsed Range at the caret normally has a rect.
    try {
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset);
      const rects = Array.from(range.getClientRects());
      if (rects.length) {
        const r = rects[0];
        let h = 14;
        if (r.height) h = Math.max(12, Math.min(20, r.height));
        return {
          left: r.left - elRect.left + el.scrollLeft,
          top: r.top - elRect.top + el.scrollTop + (h - 14) / 2,
          height: h,
        };
      }
    } catch {
      /* best-effort */
    }

    // Blank line: no glyph at the caret. Anchor to a neighbouring rendered
    // line and step by whole line boxes to the caret's (blank) line. All of the
    // values below are content coordinates (scroll already folded in), so the
    // returned top is used directly as the absolutely positioned caret's top.
    const data = node.data;
    const padLeft = parseFloat(cs.paddingLeft);
    const lineBoxTop = (charIndex: number): number | null => {
      if (charIndex < 0 || charIndex >= data.length) return null;
      try {
        const r = document.createRange();
        r.setStart(node, charIndex);
        r.setEnd(node, charIndex + 1);
        const rs = Array.from(r.getClientRects());
        if (!rs.length) return null;
        const cr = rs[0];
        const charTop = cr.top - elRect.top + el.scrollTop;
        // Convert the character box top to its line box top (the character is
        // vertically centered within the line box).
        return charTop - (lineHeight - cr.height) / 2;
      } catch {
        return null;
      }
    };

    // The newline *at* the caret is the last glyph of the blank line the caret
    // is on, so a Range over it lands on that blank line's box (e.g. the caret
    // sits just before a trailing newline with nothing but newlines after it).
    if (offset < data.length && data[offset] === "\n") {
      const hereBoxTop = lineBoxTop(offset);
      if (hereBoxTop != null) {
        const caretTop = hereBoxTop + (lineHeight - 14) / 2;
        return { left: padLeft, top: caretTop, height: 14 };
      }
    }

    // Forward: the caret sits on a blank line above the next rendered line.
    let next = offset;
    while (next < data.length && data[next] === "\n") next++;
    if (next < data.length) {
      const nextLineTop = lineBoxTop(next);
      if (nextLineTop != null) {
        const blankCount = next - offset;
        const caretTop = nextLineTop - blankCount * lineHeight + (lineHeight - 14) / 2;
        return { left: padLeft, top: caretTop, height: 14 };
      }
    }

    // Backward: the caret is on a trailing blank line at the end of the text.
    let prev = Math.min(offset, data.length) - 1;
    while (prev >= 0 && data[prev] === "\n") prev--;
    if (prev >= 0) {
      const prevLineTop = lineBoxTop(prev);
      if (prevLineTop != null) {
        const trailingNewlines = data.length - (prev + 1);
        const caretTop = prevLineTop + trailingNewlines * lineHeight + (lineHeight - 14) / 2;
        return { left: padLeft, top: caretTop, height: 14 };
      }
    }

    return null;
  }

  /**
   * Hit-test a viewport point against the rendered content to a content offset,
   * e.g. to place a caret or start a selection. `caretRangeFromPoint` does not
   * penetrate the shadow root, so we measure each character's box instead.
   */
  private _contentOffsetFromPoint(clientX: number, clientY: number): number {
    const el = this._contentEl;
    if (!el) return this._draft.length;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let contentOffset = 0;
    let bestContent = 0;
    let bestDist = Infinity;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const tn = node as Text;
      const data = tn.data || "";
      const len = data.length;
      for (let i = 0; i < len; i++) {
        const r = document.createRange();
        r.setStart(tn, i);
        r.setEnd(tn, i + 1);
        const rect = r.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const midX = rect.left + rect.width / 2;
        const midY = rect.top + rect.height / 2;
        if (Math.abs(midY - clientY) > rect.height) continue; // off this line
        const dist = Math.abs(midX - clientX);
        if (dist < bestDist) {
          bestDist = dist;
          bestContent = contentOffset + i + (clientX > midX ? 1 : 0);
        }
      }
      contentOffset += len;
    }
    return bestDist < Infinity ? bestContent : contentOffset;
  }

  // ─── Mouse selection on the visible composer content ───────────────
  private _onContentPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    // Do NOT preventDefault: canceling pointerdown would suppress the compat
    // `mousedown` that focuses the textarea. Native selection is already
    // disabled via `user-select: none`, so the <mark> highlight is ours.
    const content = this._contentOffsetFromPoint(e.clientX, e.clientY);
    const raw = this._rawOffsetFromContent(content);
    this._selAnchor = raw;
    this._selStart = raw;
    this._selEnd = raw;
    this._caretRaw = raw;
    this._prevSelStart = raw;
    this._prevSelEnd = raw;
    this._caretHint = 0;
    this._inputEl?.setSelectionRange(raw, raw);
    this._draggingSelection = true;
    try {
      this._contentEl?.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic or inactive pointer id — capture is best-effort */
    }
    this._renderComposerContent();
  };

  private _onContentPointerMove = (e: PointerEvent): void => {
    if (!this._draggingSelection) return;
    e.preventDefault();
    const content = this._contentOffsetFromPoint(e.clientX, e.clientY);
    const raw = this._rawOffsetFromContent(content);
    const start = Math.min(this._selAnchor, raw);
    const end = Math.max(this._selAnchor, raw);
    this._selStart = start;
    this._selEnd = end;
    // The caret/focus follows the pointer (the moving edge of the drag).
    this._caretRaw = raw;
    this._prevSelStart = start;
    this._prevSelEnd = end;
    this._inputEl?.setSelectionRange(start, end);
    this._renderComposerContent();
  };

  private _onContentPointerUp = (): void => {
    this._draggingSelection = false;
  };

  /** Double-click selects the word under the pointer (like the file editor). */
  private _onContentDoubleClick = (e: MouseEvent): void => {
    const content = this._contentOffsetFromPoint(e.clientX, e.clientY);
    const raw = this._rawOffsetFromContent(content);
    const text = this._draft;
    if (!text) return;
    const isWord = (c: string) => /[\w]/.test(c);
    let start = raw;
    let end = raw;
    while (start > 0 && isWord(text[start - 1])) start--;
    while (end < text.length && isWord(text[end])) end++;
    if (start === end) return; // no word at the point
    this._selStart = start;
    this._selEnd = end;
    this._caretRaw = end;
    this._selAnchor = start;
    this._prevSelStart = start;
    this._prevSelEnd = end;
    this._caretHint = 0;
    this._inputEl?.setSelectionRange(start, end);
    this._renderComposerContent();
  };

  protected firstUpdated(): void {
    // Attach the shared floating OverlayScrollbar (the same component the file
    // editor uses) to the message list. It hides the native bar and draws its
    // own translucent thumb that floats over the content, so the left/right
    // padding stays symmetric. The chat lives in a shadow root, so pass the
    // shadow root as styleTarget for the overlay styles. The track/thumb are
    // placed in `.chat-scroll` (position:relative, not the scroll target).
    const list = this.renderRoot.querySelector<HTMLElement>(".chat-messages");
    const container = this.renderRoot.querySelector<HTMLElement>(".chat-scroll");
    // jsdom/test env has no ResizeObserver; skip attaching gracefully.
    if (typeof ResizeObserver === "undefined") return;
    if (list && container) {
      const root = this.renderRoot instanceof ShadowRoot ? this.renderRoot : undefined;
      this._chatScrollbar = OverlayScrollbar.attach(list, {
        axis: "vertical",
        container,
        styleTarget: root,
        // Fill the track width (not a skinny 6px thumb in a 10px track) —
        // matches the file editor's overlay scrollbar so the bar spans the
        // full track, leaving only the 1px faded content-edge border.
        size: 9,
        // Fade the bar out after the cursor leaves the chat for a few seconds.
        autoHide: true,
      });
    }
    // Anchor the freshly-loaded chat to the newest message (content is now
    // laid out, so the rAF in `_scrollToBottom` reads a real scrollHeight).
    this._scrollToBottom();
  }

  protected updated(): void {
    // Any re-render (e.g. a streaming delta, or a toggle) clears the imperative
    // composer content; repopulate it so typed text and caret survive re-renders.
    this._renderComposerContent();
    this._updateComposerState();
    this._ensureComposerObserver();
    this._syncComposerInputWidth();
    this._syncProviderMenuHeight();
    this._syncCodeBlockScrollbars();
  }

  /**
   * Attach the shared floating OverlayScrollbar (the same component used for the
   * chat transcript and the file editor) to each code block's `<pre>` for
   * horizontal scrolling, replacing the native bar with a translucent thumb that
   * fades out. A scrollbar is only attached when line-wrap is OFF — a wrapped
   * block reflows and never overflows horizontally. The track is overlaid in the
   * code block's border box (`.code-block`, position:relative), so it never
   * pushes the content or the toolbar around.
   */
  private _syncCodeBlockScrollbars(): void {
    // jsdom/test env has no ResizeObserver; skip attaching gracefully.
    if (typeof ResizeObserver === "undefined") return;
    const root = this.renderRoot instanceof ShadowRoot ? this.renderRoot : undefined;

    // A code block should show a horizontal scrollbar when its line-wrap is off.
    const desired = new Set<HTMLElement>();
    this.renderRoot.querySelectorAll<HTMLElement>(".code-block-wrap").forEach((wrap) => {
      const block = wrap.querySelector<HTMLElement>(".code-block");
      const pre = block?.querySelector<HTMLElement>("pre");
      if (!pre || !block) return;
      if (block.classList.contains("wrap")) return; // wrapped → reflows, no h-scroll
      desired.add(pre);
    });

    // Attach scrollbars to any block that doesn't already have one.
    for (const pre of desired) {
      if (this._codeScrollbars.has(pre)) continue;
      const container = pre.parentElement as HTMLElement;
      this._codeScrollbars.set(
        pre,
        OverlayScrollbar.attach(pre, {
          axis: "horizontal",
          container,
          styleTarget: root,
          // Fill the track's content height (9px inside the 10px track, leaving
          // the faded 1px content-edge border) so the bar isn't a skinny 6px
          // thumb floating in a 10px channel — matches the file editor's bar.
          size: 9,
          // Fade the bar out after the cursor leaves the code block.
          autoHide: true,
        }),
      );
    }

    // Drop scrollbars for blocks that were removed, or whose wrap was toggled on.
    for (const [pre, sb] of [...this._codeScrollbars]) {
      if (!desired.has(pre) || !pre.isConnected) {
        sb.destroy();
        this._codeScrollbars.delete(pre);
      }
    }
  }

  private _destroyCodeBlockScrollbars(): void {
    for (const [, sb] of this._codeScrollbars) sb.destroy();
    this._codeScrollbars.clear();
  }

  /** When a provider/model dropdown is open, size the text area so the composer
   *  can grow to reveal the whole list (pushing the top border up when the text
   *  is short). The list is positioned over the text area, so its measured
   *  height becomes the content's minimum height; if the text is already taller
   *  the list simply covers the top of it, aligned to the top. */
  private _syncProviderMenuHeight(): void {
    const content = this._contentEl;
    if (!content) return;
    if (!this._menuOpen) {
      content.style.minHeight = "";
      return;
    }
    const menu = this.renderRoot.querySelector<HTMLElement>(".composer-provider-menu");
    if (menu) {
      content.style.minHeight = `${menu.getBoundingClientRect().height}px`;
    }
  }

  // ─── Rendering ──────────────────────────────────────────────────────

  private _toolResultFor(tc: ToolCall): string | undefined {
    const live = this._toolResults[tc.id];
    if (live !== undefined) return live;
    const msg = this._messages.find((m) => m.role === "tool" && m.toolCallId === tc.id);
    return msg?.content;
  }

  /**
   * Open a completed tool-call card's result in a tab in the next cell,
   * instead of expanding an inline accordion. Only fires for cards that have
   * a result available (the tool has finished).
   */
  private _openToolResult(tc: ToolCall): void {
    const result = this._toolResultFor(tc);
    if (result === undefined) return;
    this.dispatchEvent(
      new CustomEvent("chat:tool-open", {
        bubbles: true,
        composed: true,
        detail: { toolCall: tc, result },
      }),
    );
  }

  /**
   * The provider-diagnostic status text shown in the strip above the
   * transcript. Only the unreachable/warning case is surfaced here — the
   * streaming indicator is intentionally NOT a bar, because appearing and
   * disappearing it shifts the transcript content around (and scrunches the
   * composer) on every request. Streaming state is instead shown by the
   * single "thinking…" tail indicator inside the transcript.
   */
  private _statusText(): string | null {
    const s = this._status;
    if (!s) return null;
    if (s.providerOk === false) return "⚠ Provider unreachable — configure in ⚙ Agent.";
    return null;
  }

  render(): TemplateResult {
    const statusText = this._statusText();
    return html`
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary, #1e1e1e);
          color: var(--text-primary, #d4d4d4);
          font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13px;
          overflow: hidden;
        }
        .chat-bottombar {
          box-sizing: border-box;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          /* Bottom padding = the grid's reserved scrollbar space so the bar
             content slides UP (staying vertically centred above it) when the
             grid overflows horizontally, keeping it clear of the floating
             horizontal scrollbar. --grid-bb-reserve is set by <tab-grid> on
             the grid container and inherits into this shadow root. */
          /* NOTE: no transition here. We empirically found that a
             transition: padding-bottom on this shadow-DOM bar prevents the
             value from following --grid-bb-reserve (Chrome does not re-evaluate
             the transition when the inheriting custom property changes across
             the shadow boundary), so the content would never shift. Dropping
             the transition makes the slide-up apply immediately and reliably. */
          padding: 0 12px var(--grid-bb-reserve, 0px);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted, #888);
          border-top: 1px solid var(--border-color, #2a2a2a);
          background: var(--bg-secondary, #181818);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-shrink: 0;
        }
        .bb-usage {
          text-transform: none;
          letter-spacing: normal;
          font-weight: 500;
          color: var(--text-secondary, #9a9a9a);
        }
        .bb-left {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bb-tps {
          flex-shrink: 0;
          margin-left: 8px;
          text-transform: none;
          letter-spacing: normal;
          font-weight: 500;
          color: var(--text-muted, #888);
        }
        .bb-arrow {
          width: 1.15em;
          height: 1.16em;
          display: inline-block;
          vertical-align: -0.11em;
          margin-left: 2px;
          margin-right: 1px;
          fill: currentColor;
        }
        .bb-arrow.down {
          transform: rotate(180deg);
        }
        .bb-stat {
          cursor: help;
          color: var(--text-secondary, #9a9a9a);
        }
        .bb-stat:hover {
          color: var(--text-primary, #ddd);
        }
        .bb-sep {
          color: var(--text-muted, #888);
          padding: 0 3px;
        }
        .chat-status {
          padding: 4px 12px;
          font-size: 11px;
          color: var(--text-secondary, #aaa);
          background: var(--bg-tertiary, #222);
          border-bottom: 1px solid var(--border-color, #2a2a2a);
        }
        .chat-scroll {
          flex: 1;
          min-height: 0;
          position: relative;
          overflow: hidden;
        }
        .chat-messages {
          position: absolute;
          inset: 0;
          box-sizing: border-box;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .chat-message {
          word-wrap: break-word;
          line-height: 1.4;
        }
        /* User messages are grey bubbles: 3 medium-rounded corners with a
           smaller bottom-right, sized to their content (max 90% width). */
        .chat-message.user {
          align-self: flex-end;
          max-width: 90%;
          width: fit-content;
          padding: 4px 12px;
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #d4d4d4);
          border-radius: 12px 12px 4px 12px;
          white-space: normal;
        }
        /* Assistant responses are inline text — no bubble — rendered as
           markdown, so they span the full width and flow like prose. */
        .chat-message.assistant {
          align-self: stretch;
          background: transparent;
          border: none;
          padding: 0;
          max-width: 100%;
          white-space: normal;
        }
        .msg-reasoning {
          margin: 2px 0 10px;
          border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
          border-radius: 6px;
          background: color-mix(in srgb, var(--panel-bg, #1b1e24) 55%, transparent);
        }
        .msg-reasoning summary {
          cursor: pointer;
          padding: 6px 10px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted-color, #8b93a1);
          user-select: none;
          list-style: none;
        }
        .msg-reasoning summary::-webkit-details-marker {
          display: none;
        }
        .msg-reasoning summary::before {
          content: "▸";
          display: inline-block;
          margin-right: 6px;
          transition: transform 0.15s ease;
        }
        .msg-reasoning[open] summary::before {
          transform: rotate(90deg);
        }
        .msg-reasoning .msg-reasoning-body {
          padding: 10px 14px 12px;
          white-space: pre-wrap;
          word-wrap: break-word;
          font-size: 13px;
          color: color-mix(in srgb, var(--muted-color, #8b93a1) 80%, #fff);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .chat-message.assistant .msg-content {
          white-space: normal;
        }
        .msg-content {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .chat-message.assistant .msg-content p {
          margin: 0 0 8px;
        }
        .chat-message.assistant .msg-content p:last-child {
          margin-bottom: 0;
        }
        .chat-message.assistant .msg-content h1,
        .chat-message.assistant .msg-content h2,
        .chat-message.assistant .msg-content h3,
        .chat-message.assistant .msg-content h4,
        .chat-message.assistant .msg-content h5,
        .chat-message.assistant .msg-content h6 {
          margin: 12px 0 6px;
          line-height: 1.3;
        }
        .chat-message.assistant .msg-content ul,
        .chat-message.assistant .msg-content ol {
          margin: 0 0 8px;
          padding-left: 20px;
        }
        .chat-message.assistant .msg-content li {
          margin: 2px 0;
        }
        .chat-message.assistant .msg-content blockquote {
          margin: 0 0 8px;
          padding: 2px 12px;
          border-left: 3px solid var(--border-color, #3a3a3a);
          color: var(--text-secondary, #999);
        }
        .chat-message.assistant .msg-content code {
          padding: 1px 4px;
          border-radius: 4px;
          background: var(--bg-tertiary, #222);
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 12px;
        }
        .chat-message.assistant .msg-content pre {
          margin: 0;
          padding: 0;
          border: none;
          background: transparent;
          overflow-x: auto;
          border-radius: 0;
        }
        /* Fenced code blocks: a bordered surface with a toolbar above it. The
           toolbar holds the language badge (full name) and a line-wrap toggle;
           clicking the badge opens an inline language picker. */
        .chat-message.assistant .msg-content .code-block-wrap {
          position: relative;
          margin: 0 0 10px;
        }
        .chat-message.assistant .msg-content .code-block-toolbar {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          margin-bottom: 6px;
        }
        .chat-message.assistant .msg-content .code-lang {
          display: inline-flex;
          align-items: center;
          height: 20px;
          padding: 0 8px;
          font-size: 11px;
          line-height: 1;
          color: var(--text-secondary, #999);
          background: var(--bg-active, #2d2d2d);
          border: 1px solid var(--border-color, #3a3a3a);
          border-radius: 4px;
          cursor: pointer;
          opacity: 0.9;
        }
        .chat-message.assistant .msg-content .code-lang:hover,
        .chat-message.assistant .msg-content .code-lang.active {
          opacity: 1;
          color: var(--text-primary, #d4d4d4);
          border-color: var(--border-color, #4a4a4a);
        }
        .chat-message.assistant .msg-content .code-wrap {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          padding: 0;
          color: var(--text-secondary, #999);
          background: var(--bg-active, #2d2d2d);
          border: 1px solid var(--border-color, #3a3a3a);
          border-radius: 4px;
          cursor: pointer;
          opacity: 0.9;
        }
        .chat-message.assistant .msg-content .code-wrap:hover {
          opacity: 1;
          color: var(--text-primary, #d4d4d4);
        }
        .chat-message.assistant .msg-content .code-wrap.active {
          opacity: 1;
          color: #4b9fff;
          border-color: #4b9fff;
        }
        .chat-message.assistant .msg-content .code-block {
          position: relative;
          border: 1px solid var(--border-color, #2a2a2a);
          border-radius: 6px;
          background: var(--bg-tertiary, #222);
          overflow: hidden;
        }
        .chat-message.assistant .msg-content .code-block pre {
          margin: 0;
          padding: 8px 10px;
          border: none;
          background: transparent;
        }
        .chat-message.assistant .msg-content .code-block code {
          padding: 0;
          background: transparent;
          border-radius: 0;
          font-size: 12px;
        }
        .chat-message.assistant .msg-content .code-block.wrap pre {
          white-space: pre-wrap;
          word-break: break-word;
          overflow-x: hidden;
        }
        .chat-message.assistant .msg-content .code-block.wrap code {
          white-space: pre-wrap;
        }
        .chat-message.assistant .msg-content .code-lang-menu {
          position: absolute;
          top: 100%;
          right: 0;
          z-index: 20;
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-top: 4px;
          min-width: 140px;
          padding: 4px;
          background: var(--bg-active, #2d2d2d);
          border: 1px solid var(--border-color, #3a3a3a);
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .chat-message.assistant .msg-content .code-lang-option {
          display: block;
          text-align: left;
          width: 100%;
          padding: 4px 8px;
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        }
        .chat-message.assistant .msg-content .code-lang-option:hover,
        .chat-message.assistant .msg-content .code-lang-option.selected {
          color: var(--text-primary, #d4d4d4);
          background: #3a3a3a;
        }
        .chat-message.assistant .msg-content .hl-key {
          color: #7ec6f0;
        }
        .chat-message.assistant .msg-content .hl-string {
          color: #ce9178;
        }
        .chat-message.assistant .msg-content .hl-number {
          color: #b5cea8;
        }
        .chat-message.assistant .msg-content .hl-bool,
        .chat-message.assistant .msg-content .hl-null {
          color: #569cd6;
        }
        .chat-message.assistant .msg-content .hl-punct {
          color: #808080;
        }
        .chat-message.assistant .msg-content .hl-text {
          color: #d4d4d4;
        }
        .chat-message.assistant .msg-content .hl-comment {
          color: #6a9955;
        }
        .chat-message.assistant .msg-content .hl-escape {
          color: #d7ba7d;
        }
        .chat-message.assistant .msg-content .hl-bracket {
          color: #ffd700;
        }
        .chat-message.assistant .msg-content .hl-method {
          color: #dcdcaa;
        }
        .chat-message.assistant .msg-content .hl-type {
          color: #4ec9b0;
        }
        .chat-message.assistant .msg-content a {
          color: var(--accent, #4a9eff);
          text-decoration: none;
        }
        .chat-message.assistant .msg-content a:hover {
          text-decoration: underline;
        }
        .chat-message.assistant .msg-content img {
          max-width: 100%;
          border-radius: 6px;
        }
        .chat-message.assistant .msg-content hr {
          margin: 10px 0;
          border: none;
          border-top: 1px solid var(--border-color, #2a2a2a);
        }
        .chat-message.assistant .msg-content table {
          margin: 0 0 8px;
          border-collapse: collapse;
          width: 100%;
          font-size: 12px;
        }
        .chat-message.assistant .msg-content th,
        .chat-message.assistant .msg-content td {
          padding: 4px 8px;
          border: 1px solid var(--border-color, #2a2a2a);
          text-align: left;
        }
        .chat-message.assistant .msg-content th {
          background: var(--bg-tertiary, #222);
          font-weight: 600;
        }
        .chat-message.assistant .msg-content tbody tr:nth-child(even) td {
          background: var(--bg-tertiary, #222);
        }
        /* A single "thinking…" tail shown at the bottom of the transcript while
           streaming — replaces the old flashing caret that was appended to every
           assistant response block. The label stays put while the three dots
           pulse in sequence, so it never pushes existing content around. */
        .chat-thinking {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          color: var(--text-muted, #888);
          font-size: 13px;
          line-height: 1;
          flex-shrink: 0;
        }
        .thinking-label {
          letter-spacing: 0.02em;
        }
        .thinking-dots {
          display: inline-flex;
          align-items: baseline;
          gap: 1px;
        }
        .thinking-dots .dot {
          display: inline-block;
          animation: thinking-blink 1.2s infinite;
        }
        .thinking-dots .dot:nth-child(2) {
          animation-delay: 0.2s;
        }
        .thinking-dots .dot:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes thinking-blink {
          0%,
          60%,
          100% {
            opacity: 0.2;
          }
          30% {
            opacity: 1;
          }
        }
        .tool-calls {
          margin-top: 8px;
          border-top: 1px solid var(--border-color, #333);
          padding-top: 6px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tool-call-row {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-family: var(--font-mono, "JetBrains Mono", monospace);
          font-size: 11.5px;
          background: var(--bg-tertiary, #1c1c1c);
          border: 1px solid var(--border-color, #333);
          border-radius: 4px;
          padding: 4px 8px;
        }
        .tool-call-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          margin-top: 6px;
        }
        .tool-call-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          padding: 0;
          color: var(--text-secondary, #999);
          background: var(--bg-active, #2d2d2d);
          border: 1px solid var(--border-color, #3a3a3a);
          border-radius: 4px;
          cursor: pointer;
          opacity: 0.9;
        }
        .tool-call-btn:hover {
          opacity: 1;
          color: var(--text-primary, #d4d4d4);
        }
        .tool-call-btn.primary {
          color: var(--text-primary, #d4d4d4);
        }
        .tool-call-btn svg {
          width: 11px;
          height: 11px;
        }
        .chat-message.assistant > .tool-call-wrap {
          margin: 5px 0;
        }
        .tool-call-name {
          font-weight: 600;
          color: var(--text-secondary, #ccc);
          flex: 1 1 auto;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tool-call-args {
          color: var(--text-muted, #999);
          font-size: 11px;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.35;
        }
        .tool-status {
          flex-shrink: 0;
          font-weight: 700;
          margin-left: auto;
        }
        .tool-status.running {
          color: var(--accent, #4a9eff);
        }
        .tool-status.done {
          color: #4caf50;
        }
        .tool-status.error {
          color: #f44336;
        }
        .composer {
          flex-shrink: 0;
          position: relative;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary, #1e1e1e);
          border-top: 1px solid var(--border-color, #2a2a2a);
        }
        .composer-content {
          position: relative;
          box-sizing: border-box;
          padding: 10px 12px 4px;
          line-height: 20px;
          font-size: 13px;
          color: var(--text-primary, #d4d4d4);
          white-space: pre-wrap;
          word-break: break-word;
          min-height: 34px;
          max-height: 200px; /* 10 lines */
          overflow-y: auto;
          cursor: text;
          user-select: none;
          -webkit-user-select: none;
        }
        .composer-content:empty::before {
          content: "Type a message...";
          color: var(--text-muted, #666);
        }
        .composer-content code {
          /* Inherit the body font + size so the highlight boxes share the same
             vertical metrics and form one flush, uniform-height highlight.
             A mono font has a different ascent, which offsets its background
             box by ~1px and visibly breaks the highlight across code spans. */
          font-family: inherit;
          font-size: inherit;
          color: #e5c07b;
          /* Inline-code chip: a subtle background box behind the token. */
          background: rgba(255, 255, 255, 0.06);
          border-radius: 3px;
          /* Horizontal padding only (no vertical) so the line box height stays
             identical to body text and the highlight stays one uniform height. */
          padding: 0 3px;
        }
        /* When the provider dropdown is open and the typed text is short, grow
           the composer so the list is fully revealed (the top border is pushed
           up). If the text already has many lines, the list simply covers the
           top of it, aligned to the top. The min-height is set imperatively to
           the measured menu height from updated().
        */
        .composer-provider-menu {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 10;
          max-height: 200px;
          overflow-y: auto;
          box-sizing: border-box;
          background: var(--bg-primary, #1e1e1e);
          border-bottom: 1px solid var(--border-color, #2a2a2a);
        }
        .composer-provider-menu .provider-item {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          width: 100%;
          padding: 2px 10px;
          border: none;
          background: transparent;
          color: var(--text-primary, #d4d4d4);
          font-size: 11px;
          line-height: 18px;
          text-align: left;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .composer-provider-menu .provider-item:hover {
          background: var(--bg-hover, #2a2d2e);
          color: #fff;
        }
        .composer-provider-menu .provider-item:first-child {
          margin-top: 0;
        }
        .composer-provider-menu .provider-item:last-child {
          margin-bottom: 0;
        }
        /* Two-row layout: provider name on the first row, base URL + model
           count on the second. */
        .composer-provider-menu .row-check {
          flex: 0 0 auto;
          width: 16px;
          /* Height = the name line, so the icon sits centered in the first
             row rather than across a two-row item. */
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .composer-provider-menu .row-check svg,
        .composer-tools-menu .tool-check svg {
          width: 14px;
          height: 14px;
          flex: 0 0 auto;
        }
        .composer-provider-menu .provider-item .row-body {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .composer-provider-menu .provider-item .row-name {
          font-size: 11px;
          line-height: 18px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .composer-provider-menu .provider-item .row-sub {
          font-size: 10px;
          line-height: 14px;
          color: var(--text-secondary, #999);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .composer-content .composer-highlight {
          background: var(--fe-selection-bg, rgba(87, 145, 217, 0.3));
          color: inherit;
          /* No radius so adjacent highlight spans (e.g. across a code
             boundary) form one continuous highlight with no notch. */
          border-radius: 0;
          /* Reset so the highlight never affects layout (a global <mark> rule
             adds padding/border/font that would shift the text). */
          padding: 0;
          margin: 0;
          border: none;
          font: inherit;
          text-decoration: none;
        }
        .composer-caret {
          position: absolute;
          width: 2px;
          background: var(--fe-cursor-color, #d4d4d4);
          animation: composer-blink 1s step-end infinite;
          /* Overlay: never intercepts clicks and never affects layout. */
          pointer-events: none;
        }
        @keyframes composer-blink {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        .composer-toolbar {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 1px 6px 5px;
          background: transparent;
        }
        .composer-tokenrow {
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 2px 12px 0;
          font-size: 11.5px;
          font-weight: 500;
          color: var(--text-secondary, #9a9a9a);
          white-space: nowrap;
          overflow: hidden;
          flex-shrink: 0;
        }

        .composer-select {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          max-width: 180px;
          width: auto;
          height: 26px;
          background: transparent;
          color: var(--text-secondary, #aaa);
          border: none;
          border-radius: 4px;
          font-size: 11px;
          padding: 0 6px;
          outline: none;
          cursor: pointer;
          white-space: nowrap;
        }
        .composer-select:hover {
          background: var(--bg-hover, #2a2d2e);
          color: #fff;
        }
        .composer-select-label {
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .composer-select.composer-model-select {
          color: var(--text-secondary, #aaa);
        }
        .composer-select.composer-model-select:hover {
          color: #fff;
        }
        .composer-select.composer-thinking-select {
          color: var(--text-secondary, #aaa);
        }
        .composer-select.composer-thinking-select:hover {
          color: #fff;
        }
        .composer-tool {
          flex: 0 0 auto;
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-secondary, #aaa);
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          user-select: none;
        }
        .composer-tool:hover {
          background: var(--bg-hover, #2a2d2e);
          color: #fff;
        }
        .composer-tool svg {
          flex: 0 0 auto;
          width: 16px;
          height: 16px;
          fill: currentColor;
          stroke: none;
        }
        .composer-spacer {
          flex: 1 1 auto;
        }
        .composer-send {
          flex: 0 0 auto;
          align-self: flex-end;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          padding: 0;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-secondary, #999);
          cursor: pointer;
          transition:
            opacity 0.1s,
            background-color 0.1s,
            color 0.1s;
          user-select: none;
        }

        .composer-send:not(:disabled) {
          background: var(--bg-active, #37373d);
          color: #fff;
        }
        .composer-send:not(:disabled):hover {
          background: #454545;
        }
        .composer-send:disabled {
          background: transparent;
          color: var(--text-secondary, #999);
          opacity: 0.6;
          cursor: default;
        }
        .composer-send.abort {
          background: #c0392b;
          color: #fff;
        }
        .composer-send.abort:hover {
          background: #e74c3c;
        }
        .composer-send svg {
          flex: 0 0 auto;
          width: 17px;
          height: 17px;
          fill: currentColor;
          stroke: none;
        }
        .composer-input {
          position: absolute;
          top: 0;
          left: -9999px;
          width: 1px;
          height: 1px;
          opacity: 0;
          padding: 0;
          border: none;
          resize: none;
          overflow: hidden;
          outline: none;
          /* Match the rendered content so the hidden text-area soft-wraps the
             same way and up/down arrow navigation tracks the visible lines. */
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 13px;
          line-height: 20px;
          font-family: inherit;
        }
        .composer-tools-menu .tool-item {
          display: flex;
          align-items: flex-start;
          gap: 6px;
        }
        /* Enabled tools are indicated by the checkmark, not a persistent row
           background — otherwise every checked row stays highlighted and you
           can't tell which one the pointer is over. */
        .composer-provider-menu .tool-item.active {
          background: transparent;
          color: var(--text-primary, #d4d4d4);
        }
        /* A clear, distinct hover highlight so you always know which row the
           pointer is on. Declared after the .active override so it wins. */
        .composer-provider-menu .tool-item:hover {
          background: var(--bg-hover, #2a2d2e);
          color: #fff;
        }
        .composer-tools-menu .tool-check {
          flex: 0 0 auto;
          width: 16px;
          /* Height = the name line, so the icon sits centered in the first
             row rather than across the whole two-row item. */
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .composer-tools-menu .tool-body {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .composer-tools-menu .tool-name {
          font-size: 11px;
          line-height: 18px;
          color: inherit;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .composer-tools-menu .tool-desc {
          font-size: 10px;
          line-height: 14px;
          color: var(--text-secondary, #999);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 240px;
        }
        .composer-tool.active {
          background: var(--bg-active, #37373d);
          color: #fff;
        }
      </style>

      ${statusText ? html`<div class="chat-status">${statusText}</div>` : html``}

      <div class="chat-scroll">
        <div class="chat-messages">
          ${this._messages.map((msg) => this._renderMessage(msg))}
          ${this._waitingForReply() ? this._renderThinking() : html``}
        </div>
      </div>

      <div class="composer ${this._menuOpen ? "menu-open" : ""}">
        <div
          class="composer-content"
          @mousedown=${() => this._focusComposer()}
          @pointerdown=${this._onContentPointerDown}
          @pointermove=${this._onContentPointerMove}
          @pointerup=${this._onContentPointerUp}
          @pointercancel=${this._onContentPointerUp}
          @dblclick=${this._onContentDoubleClick}
        ></div>
        ${
          this._menuOpen === "provider"
            ? html`<div class="composer-provider-menu" role="listbox">
                ${this._effectiveProviders().map((p) => {
                  const active = p.id === this._providerId;
                  return html`<button
                    class="provider-item ${active ? "active" : ""}"
                    role="option"
                    aria-selected="${active}"
                    @click=${() => this._selectProvider(p.id)}
                  >
                    <span class="row-check">${this._radioIcon(active)}</span
                    ><span class="row-body">
                      <span class="row-name">${p.label}</span>
                      <span class="row-sub">${this._providerSub(p)}</span>
                    </span>
                  </button>`;
                })}
              </div>`
            : ""
        }
        ${
          this._menuOpen === "model"
            ? html`<div class="composer-provider-menu" role="listbox">
                ${this._effectiveModels().map((m) => {
                  const active = m.id === this._currentModelId();
                  return html`<button
                    class="provider-item ${active ? "active" : ""}"
                    role="option"
                    aria-selected="${active}"
                    @click=${() => this._selectModel(m.id)}
                  >
                    <span class="row-check">${this._radioIcon(active)}</span
                    ><span class="row-body">
                      <span class="row-name">${m.id || "Default model"}</span>
                      <span class="row-sub">${this._modelSub(m)}</span>
                    </span>
                  </button>`;
                })}
              </div>`
            : ""
        }
        ${
          this._menuOpen === "thinking" && this._thinkingOptions().length > 0
            ? html`<div class="composer-provider-menu" role="listbox">
                ${this._thinkingOptions().map((option) => {
                  const active = option.key === this._currentThinking()?.key;
                  return html`<button
                    class="provider-item ${active ? "active" : ""}"
                    role="option"
                    aria-selected="${active}"
                    @click=${() => this._selectThinking(option.key)}
                  >
                    <span class="row-check">${this._radioIcon(active)}</span
                    ><span class="row-body"
                      ><span class="row-name">${option.key}</span
                      >${option.value ? html`<span class="row-sub">${option.value}</span>` : ""}</span
                    >
                  </button>`;
                })}
              </div>`
            : ""
        }
        ${
          this._menuOpen === "tools"
            ? html`<div
                class="composer-provider-menu composer-tools-menu"
                role="listbox"
                aria-multiselectable="true"
              >
                ${this._effectiveTools().map((t) => {
                  const active = this._activeTools.includes(t.name);
                  return html`<button
                    class="provider-item tool-item ${active ? "active" : ""}"
                    role="option"
                    aria-selected="${active}"
                    @click=${() => this._toggleTool(t.name)}
                  >
                    <span class="tool-check">${this._checkboxIcon(active)}</span
                    ><span class="tool-body"
                      ><span class="tool-name">${t.name}</span
                      >${t.description ? html`<span class="tool-desc">${t.description}</span>` : ""}</span
                    >
                  </button>`;
                })}
              </div>`
            : ""
        }
        ${
          this._usage
            ? html`<div class="composer-tokenrow">${this._formatUsage(this._usage)}</div>`
            : html``
        }
        <div class="composer-toolbar">
          <button
            class="composer-tool"
            ${tooltipContent({ type: "simple", text: "Add files or content" })}
            @click=${() => this._onAddContent()}
          >
            ＋
          </button>
          <button
            class="composer-select"
            ${tooltipContent({ type: "simple", text: "Provider" })}
            @click=${() => this._toggleMenu("provider")}
          >
            <span class="composer-select-label">${this._currentProviderLabel()}</span>
          </button>
          <button
            class="composer-select composer-model-select"
            ${tooltipContent({ type: "simple", text: "Model" })}
            @click=${() => this._toggleMenu("model")}
          >
            <span class="composer-select-label">${this._currentModelLabel()}</span>
          </button>
          ${
            this._thinkingOptions().length > 0
              ? html`<button
                  class="composer-select composer-thinking-select"
                  ${tooltipContent({ type: "simple", text: "Thinking level" })}
                  @click=${() => this._toggleMenu("thinking")}
                >
                  <span class="composer-select-label">${this._currentThinkingLabel()}</span>
                </button>`
              : ""
          }
          <button
            class="composer-tool ${this._menuOpen === "tools" ? "active" : ""}"
            ${tooltipContent({ type: "simple", text: "Active tools" })}
            @click=${() => this._toggleMenu("tools")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
              <path
                d="M756-120 537-339l84-84 219 219-84 84Zm-552 0-84-84 276-276-68-68-28 28-51-51v82l-28 28-121-121 28-28h82l-50-50 142-142q20-20 43-29t47-9q24 0 47 9t43 29l-92 92 50 50-28 28 68 68 90-90q-4-11-6.5-23t-2.5-24q0-59 40.5-99.5T701-841q15 0 28.5 3t27.5 9l-99 99 72 72 99-99q7 14 9.5 27.5T841-701q0 59-40.5 99.5T701-561q-12 0-24-2t-23-7L204-120Z"
              />
            </svg>
          </button>
          <span class="composer-spacer"></span>
          ${
            this._streaming
              ? html`<button
                  class="composer-send abort"
                  ${tooltipContent({ type: "simple", text: "Stop" })}
                  @click=${() => this._abort()}
                >
                  <svg viewBox="0 0 24 24">
                    <rect
                      x="6"
                      y="6"
                      width="12"
                      height="12"
                      rx="1"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                </button>`
              : html`<button
                  class="composer-send"
                  ${tooltipContent({ type: "simple", text: "Send message" })}
                  ?disabled=${this._sendDisabled}
                  @click=${() => this._sendMessage()}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 -960 960 960"
                    fill="currentColor"
                  >
                    <path d="m256-240-56-56 384-384H240v-80h480v480h-80v-344L256-240Z" />
                  </svg>
                </button>`
          }
        </div>
        <textarea
          class="chat-input composer-input"
          rows="1"
          @input=${(e: Event) => this._onComposerInput(e)}
          @select=${() => this._syncSelection()}
          @keyup=${() => this._syncSelection()}
          @keydown=${(e: KeyboardEvent) => this._onComposerKeydown(e)}
          @focus=${() => this._onComposerFocus(true)}
          @blur=${() => this._onComposerFocus(false)}
        ></textarea>
      </div>

      <div class="chat-bottombar"><span class="bb-left">${
        this._title || "Agent chat"
      }</span>${
        this._streaming && this._liveTps != null
          ? html`<span class="bb-tps" part="tps">~${this._fmtRate(
              this._liveTps,
            )} tok/s</span>`
          : html``
      }</div>
    `;
  }

  /** Whether we are waiting for the model to start producing its reply — the
   *  only moment the "thinking…" tail is shown. Once any assistant text has
   *  started streaming (the last assistant message has content) the indicator
   *  disappears, so it reads as "waiting" rather than persisting alongside
   *  the reply that is already flowing in. */
  private _waitingForReply(): boolean {
    if (!this._streaming) return false;
    const last = this._messages[this._messages.length - 1];
    // Still waiting when there is no assistant message in flight, or it exists
    // but is empty (e.g. the model is about to emit its first token).
    return !last || last.role !== "assistant" || !(last.content ?? "").length;
  }

  /** A single "thinking…" tail indicator rendered at the bottom of the
   *  transcript while waiting for a reply. It is the one place that waiting
   *  state is shown (no per-message caret), so the layout never jumps. */
  private _renderThinking(): TemplateResult {
    return html`
      <div class="chat-thinking" aria-hidden="true">
        <span class="thinking-label">thinking</span>
        <span class="thinking-dots"
          ><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span
        >
      </div>
    `;
  }

  /** Collapsible reasoning/thinking block above an assistant answer. It is
   *  auto-expanded for the in-flight message so the user sees it stream. */
  private _renderReasoning(reasoning: string | undefined, live: boolean): TemplateResult {
    if (!reasoning) return html``;
    return html`<details class="msg-reasoning" ?open=${live}>
      <summary>Reasoning</summary>
      <div class="msg-reasoning-body">${reasoning}</div>
    </details>`;
  }

  private _renderMessage(msg: ChatMessage): TemplateResult {
    if (msg.role === "user") {
      return html`<div class="chat-message user">
        <div class="msg-content">${msg.content}</div>
      </div>`;
    }
    if (msg.role === "tool") {
      // Tool results are surfaced by the tool-call card (which opens them in a
      // tab in the next cell), so the standalone result message is not rendered
      // here — only the card represents it. Keep the message in `_messages` so
      // the card can look up the result.
      return html``;
    }
    // assistant
    const toolCalls = msg.toolCalls ?? [];
    const overrides = this._codeLangForMessage(msg.id);
    // New messages carry an ordered segment list (text/tool interleaved) so tool
    // calls render inline at the position they occurred in the response.
    if (msg.segments && msg.segments.length > 0) {
      return html`
        <div class="chat-message assistant">
          ${this._renderReasoning(msg.reasoning, this._streaming && msg === this._messages[this._messages.length - 1])}
          ${msg.segments.map((seg) => {
            if (seg.type === "tool") return this._renderToolCall(seg.toolCall!);
            const parts = seg.text
              ? renderMarkdownSegments(seg.text, { codeLanguages: overrides, msgId: msg.id })
              : [];
            return html`<div class="msg-content" @click=${this._onMsgContentClick}>
              ${parts.map((s) => this._renderSegment(s))}
            </div>`;
          })}
        </div>
      `;
    }
    // Legacy messages (no segment order recorded): content then grouped tool calls.
    const segments = msg.content
      ? renderMarkdownSegments(msg.content, { codeLanguages: overrides, msgId: msg.id })
      : [];
    return html`
      <div class="chat-message assistant">
        ${this._renderReasoning(msg.reasoning, this._streaming && msg === this._messages[this._messages.length - 1])}
        <div class="msg-content" @click=${this._onMsgContentClick}>
          ${segments.map((seg) => this._renderSegment(seg))}
        </div>
        ${
          toolCalls.length > 0
            ? html`<div class="tool-calls">${toolCalls.map((tc) => this._renderToolCall(tc))}</div>`
            : ""
        }
      </div>
    `;
  }

  /** Render one markdown segment (plain HTML or an interactive code block). */
  private _renderSegment(seg: MarkdownSegment): unknown {
    if (seg.type === "html") return unsafeHTML(seg.html);
    return this._renderCodeBlock(seg);
  }

  /** Render an interactive fenced code block with a toolbar + language picker. */
  private _renderCodeBlock(seg: CodeBlockSegment): TemplateResult {
    const key = `${seg.msgId ?? ""}::${seg.index}`;
    const wrapped = !!this._codeWrap[key];
    const menuOpen = this._openLangMenu === key;
    const candidates = this._languageCandidates(seg);
    const label = langLabel(seg.language);
    return html`
      <div class="code-block-wrap" data-code-index=${seg.index}>
        <div class="code-block-toolbar">
          <button
            type="button"
            class="code-wrap ${wrapped ? "active" : ""}"
            ${tooltipContent({ type: "simple", text: "Toggle line wrap" })}
            @click=${(e: Event) => {
              e.stopPropagation();
              this._toggleWrap(key);
            }}
          >
            ${unsafeHTML(this._wrapIcon(wrapped))}
          </button>
          <button
            type="button"
            class="code-lang ${menuOpen ? "active" : ""}"
            ${tooltipContent({ type: "simple", text: "Change language" })}
            @click=${(e: Event) => {
              e.stopPropagation();
              this._toggleLangMenu(key);
            }}
          >
            ${label}
          </button>
          ${
            menuOpen
              ? html`
                  <div class="code-lang-menu" @click=${(e: Event) => e.stopPropagation()}>
                    ${candidates.map(
                      (id) => html`
                        <button
                          type="button"
                          class="code-lang-option ${id === seg.language ? "selected" : ""}"
                          data-lang=${id}
                          @click=${(e: Event) => this._pickLang(e, seg, id)}
                        >
                          ${langLabel(id)}
                        </button>
                      `,
                    )}
                  </div>
                `
              : ""
          }
        </div>
        <div class="code-block ${wrapped ? "wrap" : ""}">
          <pre><code>${unsafeHTML(highlight(seg.code, seg.language))}</code></pre>
        </div>
      </div>
    `;
  }

  /** Build the per-message code-language override map for the markdown renderer. */
  private _codeLangForMessage(msgId: string): Record<number, string> {
    const prefix = `${msgId}::`;
    const map: Record<number, string> = {};
    for (const [key, value] of Object.entries(this._codeLangOverrides)) {
      if (key.startsWith(prefix)) {
        map[Number(key.slice(prefix.length))] = value;
      }
    }
    return map;
  }

  /** Close any open code-language menu when clicking outside it. */
  private _onMsgContentClick(e: Event): void {
    if (!this._openLangMenu) return;
    const target = e.target as HTMLElement;
    if (target.closest(".code-lang") || target.closest(".code-lang-menu")) return;
    this._openLangMenu = null;
  }

  /** Toggle the language picker for a code block. */
  private _toggleLangMenu(key: string): void {
    this._openLangMenu = this._openLangMenu === key ? null : key;
  }

  /** Toggle line wrapping for a code block. */
  private _toggleWrap(key: string): void {
    this._codeWrap = { ...this._codeWrap, [key]: !this._codeWrap[key] };
  }

  /** Select a language from the picker for a code block. */
  private _pickLang(e: Event, seg: CodeBlockSegment, lang: string): void {
    e.stopPropagation();
    const key = `${seg.msgId ?? ""}::${seg.index}`;
    this._codeLangOverrides = { ...this._codeLangOverrides, [key]: lang };
    this._openLangMenu = null;
  }

  /** For inferred blocks show only the detector matches; otherwise all languages. */
  private _languageCandidates(seg: CodeBlockSegment): string[] {
    if (seg.inferred) {
      const matches = detectLanguageCandidates(seg.code);
      return matches.length ? matches : SUPPORTED_LANGUAGES.map((l) => l.id);
    }
    return SUPPORTED_LANGUAGES.map((l) => l.id);
  }

  /** A small inline SVG icon for the line-wrap toggle. */
  private _wrapIcon(active: boolean): string {
    return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h6"/><path d="${active ? "M8 12l2 2 2-2" : "M11 10l3 2-3 2"}"/></svg>`;
  }

  private _renderToolCall(tc: ToolCall): TemplateResult {
    const status = tc.status ?? "running";
    const result = this._toolResultFor(tc);
    const openable = status !== "running" && result !== undefined;
    return html`
      <div class="tool-call-wrap" data-tool-call-id=${tc.id}>
        <div class="tool-call-row">
          <div class="tool-call-header">
            <span class="tool-call-name">${tc.name}</span>
            <span class="tool-status ${status}">
              ${status === "running" ? "…" : status === "done" ? "✓" : "✗"}
            </span>
          </div>
          <div class="tool-call-args">${this._toolArgsSummary(tc)}</div>
        </div>
        ${
          openable
            ? html`<div class="tool-call-actions">
                <button
                  type="button"
                  class="tool-call-btn"
                  title="Copy result"
                  aria-label="Copy result"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    void this._copyToolResult(tc);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                </button>
                <button
                  type="button"
                  class="tool-call-btn primary"
                  title="Open result in a new tab"
                  aria-label="Open result in a new tab"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this._openToolResult(tc);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                </button>
              </div>`
            : ""
        }
      </div>
    `;
  }

  /** Copy a completed tool-call card's result to the clipboard. */
  private async _copyToolResult(tc: ToolCall): Promise<void> {
    const result = this._toolResultFor(tc);
    if (result === undefined) return;
    try {
      await navigator.clipboard.writeText(result);
    } catch {
      // Clipboard may be unavailable (e.g. no permission); fail silently.
    }
  }

  /** Human-friendly second line for a tool call (path / query + worktrees). */
  private _toolArgsSummary(tc: ToolCall): string {
    const args = this._parseArgs(tc.arguments);
    if (tc.name === "read_file") {
      const p = args.path;
      if (typeof p === "string" && p.trim()) return p.trim();
    }
    if (tc.name === "search_files") {
      const q = typeof args.query === "string" ? args.query : "";
      const roots = Array.isArray(args.roots)
        ? (args.roots as unknown[]).filter((r): r is string => typeof r === "string")
        : [];
      const scope = roots.length
        ? roots.map((r) => this._worktreeLabel(r)).join(", ")
        : "all worktrees";
      return q.trim() ? `“${q.trim()}” · ${scope}` : scope;
    }
    return this._argsText(tc.arguments);
  }

  private _parseArgs(args: ToolCall["arguments"]): Record<string, unknown> {
    if (typeof args === "string") {
      try {
        const parsed = JSON.parse(args);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // not JSON
      }
      return {};
    }
    return args ?? {};
  }

  /** Compact repo/branch label for a worktree root path. */
  private _worktreeLabel(p: string): string {
    const segs = p.split("/").filter(Boolean);
    if (segs.length >= 2) return `${segs[segs.length - 2]}/${segs[segs.length - 1]}`;
    return p;
  }

  private _argsText(args: ToolCall["arguments"]): string {
    if (typeof args === "string") return args;
    try {
      return JSON.stringify(args);
    } catch {
      return String(args);
    }
  }

  private _scrollToBottom(): void {
    requestAnimationFrame(() => {
      const el = this.renderRoot.querySelector(".chat-messages");
      // The list scrolls normally (top-down); keep it anchored to the newest
      // message by scrolling to the bottom. `OverlayScrollbar` observes the
      // change and repaints the floating thumb.
      if (el) el.scrollTop = el.scrollHeight;
      // On the very first render the content may not be laid out yet, so the
      // assignment above is a no-op (scrollHeight ~ clientHeight). Detect the
      // overflow-but-unscrolled case and retry next frame.
      if (el && el.scrollHeight - el.clientHeight > 0 && el.scrollTop === 0) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    });
  }

  private _id(): string {
    return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }
}

export function registerOpenp41geAgents(): void {
  if (!customElements.get("openp41ge-agents")) {
    customElements.define("openp41ge-agents", Openp41geAgents);
  }
}

registerOpenp41geAgents();

export { Openp41geAgents };
