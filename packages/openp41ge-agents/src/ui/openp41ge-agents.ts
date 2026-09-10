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
  @state() private _activeTools: string[] = [];
  @state() private _showTools = false;
  private _docListenerAttached = false;
  private _composerResizeObserver: ResizeObserver | null = null;
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
    this._composerResizeObserver?.disconnect();
    this._composerResizeObserver = null;
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
    this._caretRaw = 0;
    this._prevSelStart = 0;
    this._prevSelEnd = 0;
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
      const endpointsChanged =
        newStart !== this._prevSelStart || newEnd !== this._prevSelEnd;
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

  private _onComposerKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) this._insertNewline();
      else this._sendMessage();
      return;
    }
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
   * Split draft text into render units. Only *paired* backticks create inline
   * code; an unclosed (orphan) backtick is rendered as a literal character so
   * it never switches styling to the end of the line.
   */
  private _parseSegments(
    text: string,
  ): { isCode: boolean; text: string; rawStart: number; rawEnd: number; contentStart: number; contentEnd: number }[] {
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
        return { node: n.node, offset: Math.max(0, Math.min(o - n.start, n.node.textContent!.length)) };
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

  protected updated(): void {
    // Any re-render (e.g. a streaming delta, or a toggle) clears the imperative
    // composer content; repopulate it so typed text and caret survive re-renders.
    this._renderComposerContent();
    this._updateComposerState();
    this._ensureComposerObserver();
    this._syncComposerInputWidth();
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
          /* Match the rendered content so the hidden text-area soft-wraps the
             same way and up/down arrow navigation tracks the visible lines. */
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 13px;
          line-height: 20px;
          font-family: inherit;
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
          @keyup=${() => this._syncSelection()}
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
