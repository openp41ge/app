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
/* marker:footer-icons-inside-edge */

import type { SystemTabController } from "../../controllers/types";
import type { ChatSummary } from "openp41ge-agents";
import type { ChatStoreModel } from "../../models/chat-store-model";
import { IpcChatStoreModel } from "../../models/chat-store-model";
import { toastService } from "../../components/openp41ge-toast";
import { createSettingsButton, type Side } from "../../services/settings-button";
import { openSearchDrawer, type SearchDrawerProvider } from "../../services/search-drawer";
import type { Openp41geSettingsDrawerHost } from "../../components/openp41ge-settings-drawer-host";
import { plusIcon, searchIcon } from "../../icons";
import { tooltipController } from "openp41ge-uikit";
import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge", "AgentsSystemTabController");

export class AgentsSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "agents";

  /** DI seam — production IpcChatStoreModel; tests inject TestChatStoreModel. */
  _storeModel: ChatStoreModel = new IpcChatStoreModel();

  private _view: HTMLElement | null = null;
  private _list: HTMLElement | null = null;
  private _footer: HTMLElement | null = null;
  private _container: HTMLElement | null = null;

  private _chats: ChatSummary[] = [];
  private _expanded = new Set<string>();
  private _openChats: Record<string, string> = {};
  private _unsubscribers: Array<() => void> = [];
  private _resizeObserver: ResizeObserver | null = null;
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
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._view && this._view.parentNode) this._view.parentNode.removeChild(this._view);
    this._view = null;
    this._list = null;
    this._footer = null;
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

    // ── New chat row (top): click to create a chat ─────────────────────
    const newChatRow = document.createElement("button");
    newChatRow.type = "button";
    newChatRow.className = "chat-new-row";
    newChatRow.title = "New chat";
    newChatRow.innerHTML = `${plusIcon(14)}<span>New chat</span>`;
    Object.assign(newChatRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      width: "100%",
      padding: "7px 10px",
      fontSize: "12px",
      border: "none",
      borderBottom: "1px solid var(--divider,#2a2a2a)",
      cursor: "pointer",
      textAlign: "left",
      flexShrink: "0",
    });
    newChatRow.addEventListener("click", () => void this._newChat());
    wrapper.appendChild(newChatRow);

    // ── Chat list ──────────────────────────────────────────────────────
    const list = document.createElement("div");
    list.className = "chat-list";
    Object.assign(list.style, {
      flex: "1",
      minHeight: "0",
      overflowY: "auto",
      overflowX: "hidden",
      display: "flex",
      flexDirection: "column",
    });
    wrapper.appendChild(list);

    // Re-evaluate overflow (to toggle the bottom separator) when the list
    // container resizes — content changes are handled in _renderList.
    this._resizeObserver = new ResizeObserver(() => this._syncScrollState());
    this._resizeObserver.observe(list);

    // ── Footer: settings gear + search tool toggle (both on the inside edge) ──
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      flexShrink: "0",
      height: "34px",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      padding: this._side === "left" ? "0 0 0 8px" : "0 8px 0 0",
      borderTop: "1px solid var(--divider,#333)",
      background: "var(--bg-secondary, #161616)",
    });

    // EXPERIMENTAL: the Agents gear now opens the new "negative drawer" system
    // (openp41ge:open-agents-settings-drawer) instead of a settings grid tab.
    // The old grid-tab path (openp41ge:open-agents-settings) is left intact and
    // easily reverted by flipping this event string back.
    const settingsBtn = createSettingsButton(
      "openp41ge:open-agents-settings-drawer",
      "agent",
      "Agents",
      "Agent settings",
      this._side,
    );
    const searchBtn = this._makeFooterToolButton(searchIcon(18), "Search chats");
    searchBtn.addEventListener("click", () => this._openChatSearch());
    // Both icons sit on the INSIDE edge (facing the grid), settings first then
    // search, regardless of which side the sidebar is docked to. A flex spacer
    // on the outer side pushes the group toward the grid.
    const spacer = document.createElement("div");
    Object.assign(spacer.style, { flex: "1 1 auto" });
    if (this._side === "left") {
      // Inside edge = right → spacer on the left, then the icon group reading
      // toward the inside edge (settings innermost, search outward).
      footer.appendChild(spacer);
      footer.appendChild(searchBtn);
      footer.appendChild(settingsBtn);
    } else {
      // Inside edge = left → settings innermost, then search, then spacer.
      footer.appendChild(settingsBtn);
      footer.appendChild(searchBtn);
      footer.appendChild(spacer);
    }
    wrapper.appendChild(footer);

    container.appendChild(wrapper);
    this._view = wrapper;
    this._list = list;
    this._footer = footer;

    // Hover feedback.
    const style = document.createElement("style");
    style.textContent = `
      [data-system-tab="agents"] .chat-row-head:hover { background: var(--bg-hover,#2a2d2e); }
      [data-system-tab="agents"] .chat-row.open { background: var(--bg-hover,#282828); }
      [data-system-tab="agents"] .chat-row + .chat-row { border-top: 1px solid var(--divider,#2a2a2a); }
      [data-system-tab="agents"] .chat-row:last-child { border-bottom: 1px solid var(--divider,#2a2a2a); }
      [data-system-tab="agents"] .chat-list.is-overflowing .chat-row:last-child { border-bottom: none; }
      [data-system-tab="agents"] .chat-new-row { color: var(--text-secondary,#999); background: transparent; }
      [data-system-tab="agents"] .chat-new-row:hover { background: var(--bg-hover,#2a2d2e); color: var(--text-primary,#fff); }
      [data-system-tab="agents"] .chat-new-row span { pointer-events: none; }
      /* Merged tool-call pill: tool icon + count + chevron. Ghost button —
         no background or border until hovered, only a subtle corner radius. */
      [data-system-tab="agents"] .chat-chevron-btn {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        height: 20px;
        padding: 0 6px;
        font-size: 10px;
        font-family: var(--font-mono, "JetBrains Mono", monospace);
        color: var(--text-secondary, #aaa);
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      [data-system-tab="agents"] .chat-chevron-btn:hover {
        /* Distinct from the row-head hover (#2a2d2e) so the pill visibly lights
           up instead of blending into the highlighted row. */
        background: var(--bg-active, #37373d);
        color: var(--text-primary, #fff);
      }
      [data-system-tab="agents"] .chat-chevron-btn .chat-chevron-tool {
        line-height: 1;
      }
      /* The footer action buttons (settings gear + search) use the shared
         .p41ge-icon-btn class for their full-height, square, hover-background
         and separators — no per-tab colour overrides needed here. */
    `;
    wrapper.appendChild(style);
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

  /** Build a footer tool button (icon-only, grey off / white on hover or active). */
  private _makeFooterToolButton(icon: string, title: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", title);
    btn.dataset.tip = title;
    btn.innerHTML = icon;
    btn.className = "p41ge-icon-btn agent-tool-btn";
    // The search button is the outermost action button; its outer edge gets a
    // cap separator (data-cap-side) so the group is split off from the bar.
    btn.dataset.capSide = this._side;
    tooltipController.attach(btn, { type: "simple", text: title });
    return btn;
  }

  /**
   * Open the chat search as a search drawer (over the grid) anchored to this
   * tab's sidebar. The drawer shell, shared input row and regex/match-case
   * toggles are provided by the search-drawer framework; this provider supplies
   * the chat-specific query + result rendering.
   */
  private _openChatSearch(): void {
    const host = document.querySelector(
      "openp41ge-settings-drawer-host",
    ) as Openp41geSettingsDrawerHost | null;
    if (!host) return;
    const provider: SearchDrawerProvider = {
      appType: "agents-search",
      title: "Search chats",
      placeholder: "Search chats…",
      question: "Which chats are you looking for?",
      search: async (query, opts, results) => {
        results.replaceChildren();
        if (!query) {
          results.appendChild(this._message("Type to search chats", "var(--text-muted,#777)"));
          return;
        }
        results.appendChild(this._message("Searching…", "var(--text-secondary,#999)"));
        try {
          const [chats, hits] = await Promise.all([
            this._storeModel.list(),
            this._storeModel.search(query, {
              regex: opts.regex,
              caseSensitive: opts.caseSensitive,
            }),
          ]);
          const ids = new Set(hits.map((h) => h.chatId));
          const matches = chats.filter((c) => ids.has(c.id));
          results.replaceChildren();
          if (matches.length === 0) {
            results.appendChild(this._message("No matching chats", "var(--text-muted,#777)"));
            return;
          }
          for (const chat of matches) {
            results.appendChild(this._searchResultRow(chat));
          }
        } catch (err) {
          results.replaceChildren();
          results.appendChild(
            this._message(
              `Search failed: ${err instanceof Error ? err.message : String(err)}`,
              "var(--error,#e53e3e)",
            ),
          );
        }
      },
    };
    openSearchDrawer(host, this._side, provider);
  }

  /** A single chat row inside the search drawer — opens the chat on click. */
  private _searchResultRow(chat: ChatSummary): HTMLElement {
    const row = document.createElement("div");
    row.className = "chat-result-row";
    row.dataset.chatId = chat.id;
    Object.assign(row.style, {
      display: "flex",
      flexDirection: "column",
      padding: "7px 10px",
      cursor: "pointer",
      userSelect: "none",
      fontSize: "13px",
      borderBottom: "1px solid var(--divider,#2a2a2a)",
    });
    row.addEventListener("mouseenter", () => {
      row.style.background = "var(--bg-hover,#2a2d2e)";
    });
    row.addEventListener("mouseleave", () => {
      row.style.background = "";
    });
    const title = document.createElement("div");
    title.textContent = chat.title;
    title.title = chat.title;
    Object.assign(title.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: "var(--text-primary,#ccc)",
    });
    row.appendChild(title);
    const desc = document.createElement("div");
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
    row.appendChild(desc);
    row.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent("openp41ge:open-chat", {
          detail: { chatId: chat.id, title: chat.title, pinned: false },
        }),
      );
    });
    return row;
  }

  private async _refresh(): Promise<void> {
    if (!this._list || !this._footer) return;
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

    const chats = this._chats;

    if (chats.length === 0) {
      list.replaceChildren(this._message("No chats yet", "var(--text-muted,#777)"));
      this._syncScrollState();
      return;
    }

    list.replaceChildren();
    for (const chat of chats) list.appendChild(this._chatRow(chat));
    this._syncScrollState();
  }

  /** Toggle `is-overflowing` when the content reaches the bottom of the list
   * so the last row's separator is suppressed (avoids a double border against
   * the footer's top border). True on overflow or exact fill. */
  private _syncScrollState(): void {
    const list = this._list;
    if (!list) return;
    const last = list.lastElementChild as HTMLElement | null;
    const listBottom = list.getBoundingClientRect().bottom;
    const reachesBottom = !!last && last.getBoundingClientRect().bottom >= listBottom - 1;
    const overflowing = list.scrollHeight > list.clientHeight;
    list.classList.toggle("is-overflowing", overflowing || reachesBottom);
  }

  private _chatRow(chat: ChatSummary): HTMLElement {
    const row = document.createElement("div");
    row.className = "chat-row";
    row.dataset.chatId = chat.id;
    row.dataset.chatTitle = chat.title;
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

    // Expand/collapse tool calls — a single ghost pill that merges the tool
    // icon (left), the tool-call count (middle) and the chevron (right). It
    // has no background or border until hovered, and only a subtle radius.
    if (chat.toolCallCount > 0) {
      const chevronBtn = document.createElement("button");
      chevronBtn.type = "button";
      chevronBtn.className = "chat-chevron-btn";
      const tooltipText = this._expanded.has(chat.id)
        ? "Collapse tool calls"
        : "Show tool calls";
      chevronBtn.setAttribute("aria-label", tooltipText);
      tooltipController.attach(chevronBtn, { type: "simple", text: tooltipText });

      const tool = document.createElement("span");
      tool.className = "chat-chevron-tool";
      tool.innerHTML = `<svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 -960 960 960"
        width="11"
        height="11"
        fill="currentColor"
        aria-hidden="true"
      ><path d="M756-120 537-339l84-84 219 219-84 84Zm-552 0-84-84 276-276-68-68-28 28-51-51v82l-28 28-121-121 28-28h82l-50-50 142-142q20-20 43-29t47-9q24 0 47 9t43 29l-92 92 50 50-28 28 68 68 90-90q-4-11-6.5-23t-2.5-24q0-59 40.5-99.5T701-841q15 0 28.5 3t27.5 9l-99 99 72 72 99-99q7 14 9.5 27.5T841-701q0 59-40.5 99.5T701-561q-12 0-24-2t-23-7L204-120Z"/></svg>`;
      chevronBtn.appendChild(tool);

      const count = document.createElement("span");
      count.className = "chat-chevron-count";
      count.textContent = String(chat.toolCallCount);
      chevronBtn.appendChild(count);

      const chevron = document.createElement("openp41ge-icon");
      chevron.setAttribute("name", this._expanded.has(chat.id) ? "chevron-up" : "chevron-down");
      chevron.setAttribute("size", "10");
      chevronBtn.appendChild(chevron);

      // The pill toggles the tool-call sublist; does NOT open the chat.
      chevronBtn.addEventListener("mousedown", (e: MouseEvent) => e.stopPropagation());
      chevronBtn.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        this._toggleExpanded(chat.id);
      });
      head.appendChild(chevronBtn);
    }

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
        padding: "0 8px 6px 8px",
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
