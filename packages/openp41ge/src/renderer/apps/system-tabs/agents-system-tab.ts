/**
 * AgentsSystemTabController — system tab controller for the Chat sidebar
 * (registration id `"agents"`).
 *
 * Lists all shared chats with full-content search (message text + tool-call
 * commands, never results), a per-row tool-call sublist, and open-once UX:
 *   - clicking a row opens the chat as an unpinned preview tab in the grid;
 *     a second click promotes it to pinned.
 *   - when a chat is open in ANOTHER window, the row shows an indicator + a
 *     Highlight button (paints the other window's tab handle blue, no focus).
 *
 * Data access goes through the ChatStoreModel interface (public `_storeModel`
 * property for test injection — production IpcChatStoreModel, tests
 * TestChatStoreModel). Tool-call sublists are loaded lazily on expand.
 */

import type { SystemTabController } from "../../controllers/types";
import type { ChatSearchResult, ChatSummary } from "openp41ge-agents";
import type { ChatStoreModel } from "../../models/chat-store-model";
import { IpcChatStoreModel } from "../../models/chat-store-model";
import { toastService } from "../../components/openp41ge-toast";
import { showConfirmModal } from "../../components/openp41ge-confirm-modal";
import { createSettingsButton, type Side } from "../../services/settings-button";
import { REGEX_ICON, CASE_ON_ICON } from "../git-commit-search/search-icons";
import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge", "AgentsSystemTabController");

const DEBOUNCE_MS = 200;

export class AgentsSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "agents";

  /** DI seam — production IpcChatStoreModel; tests inject TestChatStoreModel. */
  _storeModel: ChatStoreModel = new IpcChatStoreModel();

  private _view: HTMLElement | null = null;
  private _list: HTMLElement | null = null;
  private _footer: HTMLElement | null = null;
  private _input: HTMLInputElement | null = null;
  private _regexToggle: HTMLButtonElement | null = null;
  private _caseToggle: HTMLButtonElement | null = null;
  private _container: HTMLElement | null = null;

  private _chats: ChatSummary[] = [];
  private _searchHits = new Map<string, ChatSearchResult>();
  private _query = "";
  private _searchRegex = false;
  private _searchCase = false;
  private _expanded = new Set<string>();
  private _openChats: Record<string, string> = {};
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _unsubscribers: Array<() => void> = [];
  private _suspended = false;
  private _side: Side = "right";

  constructor(tabId: string, config?: Record<string, unknown>) {
    this.tabId = tabId;
    this._side = (config?.side as Side) ?? "right";
  }

  mount(container: HTMLElement): Promise<void> | void {
    this._container = container;
    this._buildUI(container);
    this._subscribe();
    void this._refresh();
  }

  unmount(): void {
    for (const un of this._unsubscribers) un();
    this._unsubscribers = [];
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = null;
    if (this._view && this._view.parentNode) this._view.parentNode.removeChild(this._view);
    this._view = null;
    this._list = null;
    this._footer = null;
    this._input = null;
    this._regexToggle = null;
    this._caseToggle = null;
    this._container = null;
  }

  setVisible(visible: boolean): void {
    this._suspended = !visible;
    if (visible) void this._refresh();
  }

  // ── UI build ─────────────────────────────────────────────────────────

  private _buildUI(container: HTMLElement): void {
    const wrapper = document.createElement("div");
    wrapper.dataset.systemTab = "agents";
    Object.assign(wrapper.style, {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    });

    // ── Header: full-width search with regex / match-case toggles ──────
    const header = document.createElement("div");
    Object.assign(header.style, {
      padding: "8px 10px",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      flexShrink: "0",
      borderBottom: "1px solid var(--divider,#2a2a2a)",
    });

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search chats…";
    input.setAttribute("spellcheck", "false");
    Object.assign(input.style, {
      flex: "1",
      minWidth: "0",
      boxSizing: "border-box",
      height: "26px",
      padding: "0",
      fontSize: "12px",
      color: "var(--text-primary,#ccc)",
      background: "transparent", // no field chrome — flush with the header padding
      border: "none",
      outline: "none",
    });
    input.addEventListener("input", () => this._debounce());
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        input.value = "";
        this._query = "";
        void this._refresh();
      }
    });
    header.appendChild(input);

    const makeIconToggle = (icon: string, title: string): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = title;
      btn.innerHTML = icon; // SVG uses currentColor — grey off, white on.
      Object.assign(btn.style, {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "18px",
        height: "18px",
        padding: "0",
        cursor: "pointer",
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: "4px",
        color: "var(--text-secondary,#888)",
        flexShrink: "0",
      });
      return btn;
    };
    const regexToggle = makeIconToggle(REGEX_ICON, "Regex search");
    regexToggle.addEventListener("click", () => this._toggleRegex());
    header.appendChild(regexToggle);
    const caseToggle = makeIconToggle(CASE_ON_ICON, "Match case (case-sensitive)");
    caseToggle.addEventListener("click", () => this._toggleCase());
    header.appendChild(caseToggle);
    wrapper.appendChild(header);

    this._regexToggle = regexToggle;
    this._caseToggle = caseToggle;

    // ── Chat list ──────────────────────────────────────────────────────
    const list = document.createElement("div");
    Object.assign(list.style, {
      flex: "1",
      minHeight: "0",
      overflowY: "auto",
      overflowX: "hidden",
      display: "flex",
      flexDirection: "column",
    });
    wrapper.appendChild(list);

    // ── Footer: New Chat button (left aligned) ─────────────────────────
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      flexShrink: "0",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      padding: "0 8px 0 4px",
      borderTop: "1px solid var(--divider,#333)",
      background: "var(--bg-secondary,#252526)",
    });

    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "chat-new-btn";
    newBtn.title = "New chat";
    newBtn.textContent = "+";
    Object.assign(newBtn.style, {
      flexShrink: "0",
      width: "18px",
      height: "18px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      fontSize: "14px",
      lineHeight: "1",
      background: "transparent",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
    });
    newBtn.addEventListener("click", () => void this._newChat());

    // Spacer + this tab's own settings button, with the gear on the OUTSIDE
    // edge for the sidebar side: right → `[+, spacer, ⚙]`, left → `[⚙, spacer, +]`.
    const spacer = document.createElement("div");
    Object.assign(spacer.style, { flex: "1 1 auto" });
    const settingsBtn = createSettingsButton(
      "openp41ge:open-agents-settings",
      "agent",
      "Agents",
      "Agent settings",
    );
    if (this._side === "left") {
      // Outside edge = left → gear first, new-chat button on the inside.
      footer.appendChild(settingsBtn);
      footer.appendChild(spacer);
      footer.appendChild(newBtn);
    } else {
      // Outside edge = right → new-chat button on the inside, gear last.
      footer.appendChild(newBtn);
      footer.appendChild(spacer);
      footer.appendChild(settingsBtn);
    }
    wrapper.appendChild(footer);

    container.appendChild(wrapper);
    this._view = wrapper;
    this._list = list;
    this._footer = footer;
    this._input = input;

    // Hover feedback.
    const style = document.createElement("style");
    style.textContent = `
      [data-system-tab="agents"] .chat-row-head:hover { background: var(--bg-hover,#2a2d2e); }
      [data-system-tab="agents"] .chat-row.open { background: var(--bg-hover,#282828); }
      [data-system-tab="agents"] .chat-archive {
        opacity: 0; pointer-events: none;
        background: transparent; border: none;
        color: #fff;
        transition: opacity 0.1s ease, background 0.1s ease, color 0.1s ease;
      }
      [data-system-tab="agents"] .chat-row-head:hover .chat-archive {
        opacity: 1; pointer-events: auto;
      }
      [data-system-tab="agents"] .chat-archive:hover {
        background: rgba(229,62,62,0.14); color: var(--error,#e53e3e);
      }
      [data-system-tab="agents"] .chat-archive:active { background: rgba(229,62,62,0.28); }
      [data-system-tab="agents"] .chat-new-btn { color: var(--text-secondary,#999); }
      [data-system-tab="agents"] .chat-new-btn:hover { color: #fff; }
    `;
    wrapper.appendChild(style);

    requestAnimationFrame(() => input.focus());
  }

  // ── Data ─────────────────────────────────────────────────────────────

  private _subscribe(): void {
    this._unsubscribers.push(
      this._storeModel.onChanged(() => {
        if (this._suspended) return;
        void this._refresh();
      }),
      this._storeModel.onOpenState((openChats) => {
        this._openChats = openChats;
        if (this._view) void this._refresh();
      }),
      this._storeModel.onHighlight(() => {
        // Highlight events are consumed by the window's tab bar; no-op here.
      }),
    );
  }

  private _debounce(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      void this._refresh();
    }, DEBOUNCE_MS);
  }

  private _toggleRegex(): void {
    this._searchRegex = !this._searchRegex;
    this._applySearchToggleStyles();
    void this._refresh();
  }

  private _toggleCase(): void {
    this._searchCase = !this._searchCase;
    this._applySearchToggleStyles();
    void this._refresh();
  }

  private _applySearchToggleStyles(): void {
    if (this._regexToggle) {
      this._regexToggle.style.color = this._searchRegex ? "#e3e3e3" : "var(--text-secondary,#888)";
    }
    if (this._caseToggle) {
      this._caseToggle.style.color = this._searchCase ? "#e3e3e3" : "var(--text-secondary,#888)";
    }
  }

  private async _refresh(): Promise<void> {
    if (!this._list || !this._footer) return;
    this._query = this._input ? this._input.value.trim() : "";
    const empty = this._message("Loading chats…", "var(--text-muted,#777)");
    this._list.replaceChildren(empty);

    try {
      const [chats, openChats] = await Promise.all([
        this._storeModel.list(),
        this._storeModel.getOpenChats(),
      ]);
      if (!this._list) return;
      this._chats = chats;
      this._openChats = openChats;
      if (this._query) {
        try {
          const hits = await this._storeModel.search(this._query, {
            regex: this._searchRegex,
            caseSensitive: this._searchCase,
          });
          this._searchHits = new Map(hits.map((h) => [h.chatId, h]));
        } catch {
          this._searchHits.clear();
        }
      } else {
        this._searchHits.clear();
      }
      this._renderList();
    } catch (err) {
      log.warn("chat list refresh failed:", (err as Error).message);
      if (this._list) {
        this._list.replaceChildren(this._message("Failed to load chats", "var(--error,#e53e3e)"));
      }
    }
  }

  private async _newChat(): Promise<void> {
    try {
      const chat = await this._storeModel.create();
      document.dispatchEvent(
        new CustomEvent("openp41ge:open-chat", {
          detail: { chatId: chat.id, title: chat.title, pinned: true },
        }),
      );
    } catch (err) {
      log.warn("failed to create chat:", (err as Error).message);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────

  private _renderList(): void {
    const list = this._list;
    if (!list) return;

    let chats = this._chats;
    if (this._query) {
      chats = chats.filter((c) => this._searchHits.has(c.id));
    }

    if (chats.length === 0) {
      list.replaceChildren(
        this._message(this._query ? "No matching chats" : "No chats yet", "var(--text-muted,#777)"),
      );
      return;
    }

    list.replaceChildren();
    for (const chat of chats) list.appendChild(this._chatRow(chat));
  }

  private _chatRow(chat: ChatSummary): HTMLElement {
    const row = document.createElement("div");
    row.className = "chat-row";
    row.dataset.chatId = chat.id;
    if (this._expanded.has(chat.id)) row.classList.add("open");
    Object.assign(row.style, {
      display: "flex",
      flexDirection: "column",
      userSelect: "none",
      cursor: "pointer",
    });

    const head = document.createElement("div");
    head.className = "chat-row-head";
    Object.assign(head.style, {
      display: "flex",
      alignItems: "flex-start",
      gap: "6px",
      padding: "7px 8px",
      fontSize: "13px",
    });

    // Chevron appears ONLY when the chat has sub-items (tool calls). Without
    // tool calls there is nothing to expand, so no chevron is rendered.
    if (chat.toolCallCount > 0) {
      const chevron = document.createElement("span");
      chevron.className = "chat-chevron";
      chevron.textContent = this._expanded.has(chat.id) ? "▾" : "▸";
      Object.assign(chevron.style, {
        width: "14px",
        flexShrink: "0",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted,#777)",
        cursor: "pointer",
      });
      // Chevron toggles the tool-call sublist; does NOT open the chat.
      chevron.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        this._toggleExpanded(chat.id);
      });
      head.appendChild(chevron);
    }

    const titleBlock = document.createElement("div");
    Object.assign(titleBlock.style, { flex: "1", minWidth: "0", overflow: "hidden" });

    const title = document.createElement("div");
    title.textContent = chat.title;
    title.title = chat.title;
    Object.assign(title.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: "var(--text-primary,#ccc)",
    });
    titleBlock.appendChild(title);

    // AI-written one-line description (falls back to "No description").
    const desc = document.createElement("div");
    desc.className = "chat-row-desc";
    desc.textContent = (chat.description ?? "").trim() || "No description";
    Object.assign(desc.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "11px",
      lineHeight: "1.3",
      marginTop: "2px",
      color: "var(--text-muted,#777)",
    });
    titleBlock.appendChild(desc);
    head.appendChild(titleBlock);

    // Tool-call count badge.
    if (chat.toolCallCount > 0) {
      const badge = document.createElement("span");
      badge.textContent = `⚙ ${chat.toolCallCount}`;
      badge.title = `${chat.toolCallCount} tool call${chat.toolCallCount === 1 ? "" : "s"}`;
      Object.assign(badge.style, {
        flexShrink: "0",
        fontSize: "10px",
        color: "var(--text-secondary,#aaa)",
        background: "var(--bg-tertiary,#1c1c1c)",
        border: "1px solid var(--divider,#333)",
        borderRadius: "8px",
        padding: "1px 6px",
      });
      head.appendChild(badge);
    }

    // Open-in-another-window indicator + Highlight.
    const owner = this._openChats[chat.id];
    const myWinId = window.openp41ge?.workspace?.getWindowId();
    const openElsewhere = owner !== undefined && owner !== myWinId;
    if (openElsewhere) {
      const ind = document.createElement("span");
      ind.title = "Open in another window";
      ind.textContent = "↗";
      Object.assign(ind.style, {
        flexShrink: "0",
        color: "var(--accent,#4a9eff)",
        fontSize: "12px",
      });
      head.appendChild(ind);

      const hlBtn = document.createElement("button");
      hlBtn.type = "button";
      hlBtn.title = "Highlight the open chat tab";
      hlBtn.textContent = "✧";
      Object.assign(hlBtn.style, {
        flexShrink: "0",
        width: "20px",
        height: "20px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "12px",
        color: "var(--accent,#4a9eff)",
        background: "transparent",
        border: "1px solid var(--divider,#333)",
        borderRadius: "4px",
        cursor: "pointer",
      });
      hlBtn.addEventListener("mousedown", (e: MouseEvent) => e.stopPropagation());
      hlBtn.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        void this._storeModel.highlight(chat.id);
      });
      head.appendChild(hlBtn);
    }

    // Archive button — styled like a delete button, but archives (soft-hides)
    // the chat rather than deleting it. Appears on the far right of the row.
    const archiveBtn = document.createElement("button");
    archiveBtn.type = "button";
    archiveBtn.className = "chat-archive";
    archiveBtn.title = "Archive chat";
    archiveBtn.setAttribute("aria-label", "Archive chat");
    archiveBtn.innerHTML = `<svg viewBox="0 -960 960 960" width="15px" height="15px" fill="currentColor" aria-hidden="true"><path d="m480-240 160-160-56-56-64 64v-168h-80v168l-64-64-56 56 160 160ZM200-640v440h560v-440H200Zm0 520q-33 0-56.5-23.5T120-200v-499q0-14 4.5-27t13.5-24l50-61q11-14 27.5-21.5T250-840h460q18 0 34.5 7.5T772-811l50 61q9 11 13.5 24t4.5 27v499q0 33-23.5 56.5T760-120H200Zm16-600h528l-34-40H250l-34 40Zm264 300Z"/></svg>`;
    Object.assign(archiveBtn.style, {
      alignSelf: "center",
      flexShrink: "0",
      width: "22px",
      height: "22px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      borderRadius: "4px",
      cursor: "pointer",
    });
    archiveBtn.addEventListener("mousedown", (e: MouseEvent) => e.stopPropagation());
    archiveBtn.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      void this._archiveChat(chat.id);
    });
    head.appendChild(archiveBtn);

    row.appendChild(head);

    // Click handling: expand chevron toggles sublist; opening a row that is
    // open in another window shows a toast + highlight instead of a duplicate.
    head.addEventListener("click", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button")) return; // highlight button handled above
      if (openElsewhere) {
        this._showOpenElsewhereToast(chat);
        return;
      }
      this._openChat(chat.id, chat.title);
    });

    // Expanded tool-call sublist — loaded lazily.
    if (this._expanded.has(chat.id)) {
      const sub = document.createElement("div");
      sub.className = "chat-tool-sublist";
      Object.assign(sub.style, {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: "0 8px 6px 20px",
      });
      sub.appendChild(this._message("Loading…", "var(--text-muted,#777)"));
      row.appendChild(sub);
      void this._loadToolCalls(chat.id, sub);
    }

    return row;
  }

  private async _loadToolCalls(chatId: string, sub: HTMLElement): Promise<void> {
    try {
      const chat = await this._storeModel.get(chatId);
      if (!this._view || !sub.isConnected) return;
      const toolCalls = (chat?.messages ?? []).flatMap((m) => m.toolCalls ?? []);
      if (toolCalls.length === 0) {
        sub.replaceChildren(this._message("No tool calls", "var(--text-muted,#777)"));
        return;
      }
      sub.replaceChildren();
      for (const tc of toolCalls) {
        const row = document.createElement("div");
        Object.assign(row.style, {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "11px",
          fontFamily: "var(--font-mono,'JetBrains Mono',monospace)",
          color: "var(--text-secondary,#aaa)",
        });
        const name = document.createElement("span");
        name.textContent = tc.name;
        Object.assign(name.style, { fontWeight: "600", color: "var(--text-primary,#ccc)" });
        row.appendChild(name);
        const args = document.createElement("span");
        args.textContent =
          typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments);
        Object.assign(args.style, {
          flex: "1",
          minWidth: "0",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: "var(--text-muted,#888)",
        });
        row.appendChild(args);
        const status = document.createElement("span");
        status.textContent = tc.status === "running" ? "…" : tc.status === "done" ? "✓" : "✗";
        status.style.color =
          tc.status === "done" ? "#4caf50" : tc.status === "error" ? "#f44336" : "var(--accent)";
        row.appendChild(status);
        sub.appendChild(row);
      }
    } catch (err) {
      log.warn("failed to load tool calls:", (err as Error).message);
      sub.replaceChildren(this._message("Failed to load", "var(--error,#e53e3e)"));
    }
  }

  private _toggleExpanded(chatId: string): void {
    if (this._expanded.has(chatId)) this._expanded.delete(chatId);
    else this._expanded.add(chatId);
    this._rerender();
  }

  private _rerender(): void {
    this._renderList();
  }

  /** DI seam — production shows the confirm modal; tests can stub this. */
  _confirm: (opts: {
    message: string;
    detail?: string;
    confirmLabel: string;
    confirmStyle: string;
  }) => Promise<boolean> = (opts) => showConfirmModal(opts);

  private async _archiveChat(chatId: string): Promise<void> {
    try {
      const chat = this._chats.find((c) => c.id === chatId);
      const title = chat?.title ?? "this chat";
      const confirmed = await this._confirm({
        message: `Archive “${title}”?`,
        detail: "Archived chats are hidden from the sidebar but not deleted.",
        confirmLabel: "Archive",
        confirmStyle: "danger",
      });
      if (!confirmed) return;
      await this._storeModel.archive(chatId);
    } catch (err) {
      log.warn("failed to archive chat:", (err as Error).message);
    }
  }

  private _openChat(chatId: string, title: string): void {
    document.dispatchEvent(
      new CustomEvent("openp41ge:open-chat", {
        detail: { chatId, title, pinned: false },
      }),
    );
  }

  private _showOpenElsewhereToast(chat: ChatSummary): void {
    toastService.show(`“${chat.title}” is open in another window`, "info", 3000);
  }

  private _message(text: string, color: string): HTMLElement {
    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, {
      padding: "8px 10px",
      fontSize: "12px",
      fontStyle: "italic",
      color,
    });
    return el;
  }
}
