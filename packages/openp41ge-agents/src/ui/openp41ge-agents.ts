/**
 * <openp41ge-agents> — Chat interface web component (Lit).
 *
 * Renders a full chat transcript (user / assistant / tool messages, tool-call
 * rows with running→done/error status), streams assistant text, and surfaces
 * provider connection status. It is UI-only: it never touches IPC or the chat
 * store — data flows through the platform controller's imperative API.
 *
 * Event contract (bubbles, composed):
 *   - `chat:send`   detail `{ text }` — user submitted a message.
 *   - `chat:abort`  — user clicked the abort button while streaming.
 *   - `chat:provider-change` detail `{ providerId }` — user picked a provider/model.
 *   - `chat:add-content` — user clicked the “+ / add content” button.
 */

import { LitElement, html, type TemplateResult } from "lit";
import { state, query } from "lit/decorators.js";
import type { Chat, ChatMessage, ChatRuntimeStatus, ToolCall } from "../types";

function deepCloneMessage(m: ChatMessage): ChatMessage {
  return {
    ...m,
    toolCalls: m.toolCalls?.map((t) => ({ ...t })),
  };
}

/** A selectable provider/model shown in the composer's config row. */
interface ComposerProvider {
  id: string;
  label: string;
  model: string;
}

class Openp41geAgents extends LitElement {
  @state() private _messages: ChatMessage[] = [];
  @state() private _streaming = false;
  @state() private _status: ChatRuntimeStatus | null = null;
  @state() private _title = "";
  // These two are intentionally NOT @state: the composer content and caret are
  // updated imperatively so keystrokes never trigger a full re-render (which
  // would reset focus and clear the rendered content).
  private _draft = "";
  private _composerFocused = false;
  /** Text-area selection (raw text offsets, including backticks) for the highlight. */
  private _selStart = 0;
  private _selEnd = 0;
  /** Anchor used while dragging a mouse selection. */
  private _selAnchor = 0;
  private _draggingSelection = false;
  /** Maps rendered-content offsets to raw-text offsets (dropped backticks). */
  private _contentSegments: { rawStart: number; rawEnd: number; contentStart: number; contentEnd: number }[] = [];
  @state() private _providers: ComposerProvider[] = [];
  @state() private _providerId = "";
  @state() private _activeTools: string[] = [];
  @state() private _showTools = false;
  private _docListenerAttached = false;
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
    this._providerId = chat.providerId;
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
    this._messages = messages;
    this._streaming = true;
    this._scrollToBottom();
  }

  setToolCallState(tc: ToolCall): void {
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
    this._messages = messages;
    this._scrollToBottom();
  }

  setProviderStatus(status: ChatRuntimeStatus): void {
    this._status = status;
    this._streaming = status.streaming;
  }

  /** Set the chat title (e.g. when auto-titled from the first user message). */
  setTitle(title: string): void {
    this._title = title;
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
  }

  private _onDocPointerDown = (e: PointerEvent): void => {
    // Clicking anywhere outside the composer card should drop the caret and
    // clear the focus outline. The off-screen textarea may not naturally blur
    // when the click lands on a non-focusable area (e.g. the transcript), so
    // we blur explicitly.
    const composer = this.renderRoot?.querySelector(".composer") as HTMLElement | null;
    const target = e.target as Node | null;
    if (!composer || !target || composer.contains(target)) return;
    if (this._composerFocused) {
      this._composerFocused = false;
      this._renderComposerContent();
    }
    if (this._inputEl && this.isConnected) this._inputEl.blur();
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
    this._renderComposerContent();
    this._updateComposerState();
    this.addMessage("user", text);
    this._streaming = true;
    this.dispatchEvent(
      new CustomEvent("chat:send", { bubbles: true, composed: true, detail: { text } }),
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
    activeTools?: string[];
  }): void {
    if (ctx.providers) {
      this._providers = ctx.providers;
      if (!ctx.activeProviderId && this._providers.length)
        this._providerId = this._providers[0].id;
    }
    if (ctx.activeProviderId) this._providerId = ctx.activeProviderId;
    if (ctx.activeTools) this._activeTools = ctx.activeTools;
    this.requestUpdate();
  }

  private _providerOptions(): TemplateResult[] {
    const providers = [...this._providers];
    if (this._providerId && !providers.some((p) => p.id === this._providerId)) {
      // Keep the select's value valid even when the active provider isn't in
      // the configured table (e.g. a migrated chat referencing a removed id).
      providers.unshift({ id: this._providerId, label: this._providerId, model: "" });
    }
    if (providers.length === 0) {
      return [html`<option value="">Default model</option>`];
    }
    return providers.map(
      (p) => html`<option value=${p.id}>${p.label}${p.model ? ` · ${p.model}` : ""}</option>`,
    );
  }

  private _onProviderChange(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    this.dispatchEvent(
      new CustomEvent("chat:provider-change", {
        bubbles: true,
        composed: true,
        detail: { providerId: value },
      }),
    );
  }

  private _onAddContent(): void {
    this.dispatchEvent(new CustomEvent("chat:add-content", { bubbles: true, composed: true }));
  }

  private _toggleTools(): void {
    this._showTools = !this._showTools;
  }

  private _focusComposer(): void {
    this._inputEl?.focus();
  }

  private _onComposerFocus(focused: boolean): void {
    this._composerFocused = focused;
    this._renderComposerContent();
  }

  private _onComposerInput(e: Event): void {
    const ta = e.target as HTMLTextAreaElement;
    this._draft = ta.value;
    this._selStart = ta.selectionStart;
    this._selEnd = ta.selectionEnd;
    this._renderComposerContent();
    this._updateComposerState();
  }

  /** Mirror the text-area's own selection (keyboard: arrows, shift, cmd+a). */
  private _syncSelection(): void {
    const ta = this._inputEl;
    if (!ta) return;
    this._selStart = ta.selectionStart;
    this._selEnd = ta.selectionEnd;
    this._renderComposerContent();
  }

  private _onComposerKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this._sendMessage();
    }
  }

  private _renderComposerContent(): void {
    const el = this._contentEl;
    if (!el) return;
    const body = this._draft ? this._contentHtml(this._draft, this._selStart, this._selEnd) : "";
    const caret = this._composerFocused ? `<span class="composer-caret"></span>` : "";
    el.innerHTML = body + caret;
  }

  private _updateComposerState(): void {
    const sendBtn = this.renderRoot.querySelector<HTMLButtonElement>(".composer-send");
    if (sendBtn) {
      sendBtn.disabled = this._sendDisabled;
      // Explain the disabled state via a native tooltip (Chrome shows `title`
      // even on a disabled button, and the composer's other controls use title).
      sendBtn.title = this._sendDisabled ? "Type a message to send" : "Send message";
    }
    const el = this._contentEl;
    if (el) {
      // Toggle an overflow marker once the content passes 10 lines.
      el.classList.toggle("composer-overflow", el.scrollHeight > 200);
    }
  }

  /**
   * Render the draft as visible HTML, wrapping the selected raw range in a
   * highlight <mark>. Backticks become inline <code> and are dropped from the
   * rendered text, so we record segment metadata to map rendered-content
   * offsets back to raw-text offsets for mouse selection.
   */
  private _contentHtml(text: string, selStart = -1, selEnd = -1): string {
    const escape = (s: string): string =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const hasSel = selStart >= 0 && selEnd >= 0 && selStart < selEnd;

    const segs: { rawStart: number; rawEnd: number; contentStart: number; contentEnd: number }[] = [];
    const parts = text.split("`");
    let rawPos = 0;
    let contentPos = 0;
    let html = "";
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      const isCode = i % 2 === 1;
      const rawStart = rawPos;
      const rawEnd = rawPos + seg.length;
      const contentStart = contentPos;
      const contentEnd = contentPos + seg.length;
      rawPos = rawEnd + 1; // skip the dropped backtick delimiter
      contentPos = contentEnd; // backtick contributes no rendered char
      segs.push({ rawStart, rawEnd, contentStart, contentEnd });

      let pre = seg;
      let mid = "";
      let post = "";
      if (hasSel) {
        const s = Math.max(rawStart, selStart);
        const e = Math.min(rawEnd, selEnd);
        if (s < e) {
          const a = Math.max(0, s - rawStart);
          const b = Math.min(seg.length, e - rawStart);
          pre = seg.slice(0, a);
          mid = seg.slice(a, b);
          post = seg.slice(b);
        }
      }
      const inner =
        mid !== ""
          ? escape(pre) + `<mark class="composer-select">${escape(mid)}</mark>` + escape(post)
          : escape(seg);
      html += isCode ? `<code>${inner}</code>` : inner;
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
    this._inputEl?.setSelectionRange(start, end);
    this._renderComposerContent();
  };

  protected updated(): void {
    // Any re-render (e.g. a streaming delta, or a toggle) clears the imperative
    // composer content; repopulate it so typed text and caret survive re-renders.
    this._renderComposerContent();
    this._updateComposerState();
  }

  // ─── Rendering ──────────────────────────────────────────────────────

  private _toolResultFor(tc: ToolCall): string | undefined {
    const msg = this._messages.find((m) => m.role === "tool" && m.toolCallId === tc.id);
    return msg?.content;
  }

  private _statusText(): string | null {
    const s = this._status;
    if (!s) return null;
    if (s.providerOk === false) return "⚠ Provider unreachable — configure in ⚙ Agent.";
    if (s.streaming) return "● streaming…";
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
          padding: 5px 12px;
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
        .chat-status {
          padding: 4px 12px;
          font-size: 11px;
          color: var(--text-secondary, #aaa);
          background: var(--bg-tertiary, #222);
          border-bottom: 1px solid var(--border-color, #2a2a2a);
        }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .chat-message {
          padding: 8px 12px;
          border-radius: 6px;
          max-width: 88%;
          word-wrap: break-word;
          white-space: pre-wrap;
          line-height: 1.4;
        }
        .chat-message.user {
          align-self: flex-end;
          background: var(--accent, #2b5a9c);
          color: #fff;
        }
        .chat-message.assistant {
          align-self: flex-start;
          background: var(--bg-secondary, #2d2d2d);
          color: var(--text-primary, #d4d4d4);
          border: 1px solid var(--border-color, #3a3a3a);
        }
        .msg-content {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .caret {
          display: inline-block;
          width: 7px;
          height: 14px;
          vertical-align: text-bottom;
          background: var(--accent, #4a9eff);
          animation: blink 1s steps(2) infinite;
          margin-left: 2px;
        }
        @keyframes blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
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
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono, "JetBrains Mono", monospace);
          font-size: 11.5px;
          background: var(--bg-tertiary, #1c1c1c);
          border: 1px solid var(--border-color, #333);
          border-radius: 4px;
          padding: 4px 8px;
        }
        .tool-call-name {
          font-weight: 600;
          color: var(--text-secondary, #ccc);
          flex-shrink: 0;
        }
        .tool-call-args {
          color: var(--text-muted, #999);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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
        .tool-result {
          margin-top: 2px;
          margin-left: 10px;
          font-family: var(--font-mono, "JetBrains Mono", monospace);
          font-size: 11px;
          color: var(--text-muted, #888);
          background: var(--bg-tertiary, #191919);
          border-left: 2px solid var(--border-color, #333);
          padding: 3px 6px;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 120px;
          overflow-y: auto;
        }
        .tool-empty {
          align-self: flex-start;
          color: var(--text-muted, #555);
          font-style: italic;
        }
        .composer {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary, #1e1e1e);
          border-top: 1px solid var(--border-color, #2a2a2a);
        }
        .composer-content {
          position: relative;
          padding: 10px 12px 4px;
          line-height: 20px;
          font-size: 13px;
          color: var(--text-primary, #d4d4d4);
          white-space: pre-wrap;
          word-break: break-word;
          min-height: 20px;
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
          font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
          font-size: 12px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 3px;
          padding: 1px 4px;
          color: #e5c07b;
        }
        .composer-content mark.composer-select {
          background: var(--fe-selection-bg, rgba(87, 145, 217, 0.3));
          color: inherit;
          border-radius: 2px;
        }
        .composer-caret {
          display: inline-block;
          vertical-align: text-bottom;
          width: 2px;
          height: 14px;
          margin-left: 1px;
          background: var(--fe-cursor-color, #d4d4d4);
          animation: composer-blink 1s step-end infinite;
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
          padding: 2px 6px 6px;
          background: transparent;
        }
        .composer-select {
          flex: 0 0 auto;
          max-width: 180px;
          min-width: 96px;
          background: var(--bg-secondary, #252526);
          color: var(--text-primary, #d4d4d4);
          border: 1px solid var(--border-color, #3a3a3a);
          border-radius: 6px;
          font-size: 11px;
          padding: 3px 6px;
          outline: none;
          cursor: pointer;
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
        .composer-tool .tool-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          min-width: 14px;
          height: 14px;
          padding: 0 3px;
          border-radius: 7px;
          background: var(--accent, #2b5a9c);
          color: #fff;
          font-size: 9px;
          line-height: 14px;
          text-align: center;
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
          transition: opacity 0.1s, background-color 0.1s, color 0.1s;
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
        }
        .composer-tools {
          padding: 6px 12px;
          background: transparent;
          font-size: 11px;
          color: var(--text-secondary, #aaa);
        }
        .composer-tools .tools-list {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 4px;
        }
        .composer-tools .tool-chip {
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--bg-hover, #2a2d2e);
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 10px;
          color: var(--text-primary, #d4d4d4);
        }
      </style>

      ${statusText ? html`<div class="chat-status">${statusText}</div>` : html``}

      <div class="chat-messages">
        ${
          this._messages.length === 0
            ? html`<div class="tool-empty">Start a conversation by typing a message below.</div>`
            : this._messages.map((msg) => this._renderMessage(msg))
        }
      </div>

      <div class="composer">
        <div
          class="composer-content"
          @mousedown=${() => this._focusComposer()}
          @pointerdown=${this._onContentPointerDown}
          @pointermove=${this._onContentPointerMove}
          @pointerup=${this._onContentPointerUp}
          @pointercancel=${this._onContentPointerUp}
          @dblclick=${this._onContentDoubleClick}
        ></div>
        <div class="composer-toolbar">
          <select
            class="composer-select"
            title="Provider / model"
            .value=${this._providerId}
            @change=${(e: Event) => this._onProviderChange(e)}
          >
            ${this._providerOptions()}
          </select>
          <button
            class="composer-tool"
            title="Add files or content"
            @click=${() => this._onAddContent()}
          >
            ＋
          </button>
          <button
            class="composer-tool"
            title="Active tools"
            @click=${() => this._toggleTools()}
          >
            ⚙
            ${this._activeTools.length
              ? html`<span class="tool-badge">${this._activeTools.length}</span>`
              : ""}
          </button>
          <span class="composer-spacer"></span>
          ${
            this._streaming
              ? html`<button class="composer-send abort" title="Stop" @click=${() => this._abort()}>
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
                  title="Send message"
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
        ${
          this._showTools
            ? html`<div class="composer-tools">
                <div>
                  ${this._activeTools.length
                    ? `Active tools for this chat:`
                    : `No active tools configured.`}
                </div>
                ${this._activeTools.length
                  ? html`<div class="tools-list">
                      ${this._activeTools.map(
                        (t) => html`<span class="tool-chip">${t}</span>`,
                      )}
                    </div>`
                  : ""}
              </div>`
            : ""
        }
        <textarea
          class="chat-input composer-input"
          rows="1"
          @input=${(e: Event) => this._onComposerInput(e)}
          @select=${() => this._syncSelection()}
          @keydown=${(e: KeyboardEvent) => this._onComposerKeydown(e)}
          @focus=${() => this._onComposerFocus(true)}
          @blur=${() => this._onComposerFocus(false)}
        ></textarea>
      </div>

      <div class="chat-bottombar">${this._title || "Agent chat"}</div>
    `;
  }

  private _renderMessage(msg: ChatMessage): TemplateResult {
    if (msg.role === "user") {
      return html`<div class="chat-message user">
        <div class="msg-content">${msg.content}</div>
      </div>`;
    }
    if (msg.role === "tool") {
      // Standalone tool-result message (rare): render as a mono result block.
      return html`<div class="tool-result">${msg.content}</div>`;
    }
    // assistant
    const toolCalls = msg.toolCalls ?? [];
    return html`
      <div class="chat-message assistant">
        <div class="msg-content">
          ${msg.content || ""}${this._streaming ? html`<span class="caret"></span>` : ""}
        </div>
        ${
          toolCalls.length > 0
            ? html`<div class="tool-calls">${toolCalls.map((tc) => this._renderToolCall(tc))}</div>`
            : ""
        }
      </div>
    `;
  }

  private _renderToolCall(tc: ToolCall): TemplateResult {
    const status = tc.status ?? "running";
    const result = this._toolResultFor(tc);
    return html`
      <div class="tool-call-row" data-tool-call-id=${tc.id}>
        <span class="tool-call-name">${tc.name}</span>
        <span class="tool-call-args">${this._argsText(tc.arguments)}</span>
        <span class="tool-status ${status}">
          ${status === "running" ? "…" : status === "done" ? "✓" : "✗"}
        </span>
      </div>
      ${status !== "running" && result ? html`<div class="tool-result">${result}</div>` : ""}
    `;
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
      if (el) el.scrollTop = el.scrollHeight;
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
