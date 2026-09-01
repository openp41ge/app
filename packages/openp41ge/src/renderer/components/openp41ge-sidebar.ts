/**
 * <openp41ge-sidebar> — sidebar container.
 *
 * Receives width via inline style from parent. No longer manages its own
 * resize — that's handled by <openp41ge-windowview>.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { emitEvent } from "../app";
import type { SystemTabRegistration } from "../controllers/types";
import { allSystemTabRegistrations } from "../apps/system-tabs";
import { getSystemTabRegistration } from "../apps/app-registry";
import { emitOpenSystemTab } from "./openp41ge-worktree-controller";
import type { Openp41geContextMenuElement } from "../interfaces/element-guards";
import type { SystemTabController } from "../controllers/types";
import { tooltipContent } from "openp41ge-uikit";

// Keep in sync with openp41ge-windowview if changed


import { MIN_SIDEBAR_WIDTH } from "openp41ge-constants";

class Openp41geSidebar extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({})
  side: "left" | "right" = "left";

  @property({ attribute: false })
  windowId: string = "";

  @property({ attribute: false })
  workspaceData: unknown = null;

  @property({ attribute: false })
  systemTabs: Array<{ id: string; title: string; appType: string; pinned: boolean }> = [];

  @property({ attribute: false })
  activeTabId: string | null = null;

  @property({ attribute: false })
  isOpen: boolean = false;

  // ═══ Tab scroll ──────────────────────────────────────────────────────

  @state()
  private _scrollLeft = 0;

  @state()
  private _hasOverflow = false;

  @state()
  private _tabBarHeight = 34;

  private get _showLeftShadow(): boolean {
    const el = this.querySelector(".sidebar-tab-scroll");
    if (!el) return false;
    return el.scrollLeft > 2;
  }

  private get _showRightShadow(): boolean {
    const el = this.querySelector(".sidebar-tab-scroll");
    if (!el) return false;
    return el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
  }

  private _onTabClick(tabId: string): void {
    const side = this.side;
    emitEvent("tab-activate", { windowId: this.windowId, side, tabId });
  }

  private _onTabClose(e: Event, tabId: string): void {
    e.stopPropagation();
    emitEvent("tab-close", { windowId: this.windowId, side: this.side, tabId, force: true });
  }

  private _onTabMiddleClick(e: MouseEvent, tabId: string): void {
    if (e.button === 1) {
      e.preventDefault();
      emitEvent("tab-close", { windowId: this.windowId, side: this.side, tabId, force: true });
    }
  }

  private _onTabPin(tabId: string, pinned: boolean): void {
    emitEvent("tab-pin", { tabId, pinned: !pinned });
  }

  private _onSidebarToggle(): void {
    emitEvent("sidebar-toggle", { windowId: this.windowId, side: this.side });
  }

  // ═══ + add-tab menu ─────────────────────────────────────────────────

  /**
   * Which side(s) each sidebar-tab appType is currently open in, for the
   * + menu's R/L badges (from workspace state, not local props).
   */
  private _openSidesFor(appType: string): string {
    const ws = this.workspaceData as unknown as {
      sidebar?: { leftSidebarTabs?: string[]; rightSidebarTabs?: string[] };
      systemTabs?: Record<string, { appType?: string }>;
    } | null;
    const sysTabs = ws?.systemTabs ?? {};
    const inLeft = (ws?.sidebar?.leftSidebarTabs ?? []).some(
      (id) => sysTabs[id]?.appType === appType,
    );
    const inRight = (ws?.sidebar?.rightSidebarTabs ?? []).some(
      (id) => sysTabs[id]?.appType === appType,
    );
    if (inLeft && inRight) return "R/L";
    if (inRight) return "R";
    if (inLeft) return "L";
    return "";
  }

  /** Open the inline + menu listing all registered sidebar tabs. */
  private _onAddTabClick(): void {
    const btn = this.querySelector(".sidebar-tab-add") as HTMLElement | null;
    const r = btn?.getBoundingClientRect();
    const menu = document.createElement("openp41ge-contextmenu") as Openp41geContextMenuElement;
    // Anchor the menu so it drops below the + button, right-aligned to it,
    // and stays inside the viewport (never negative x).
    menu.x = Math.max(8, (r?.right ?? 160) - 160);
    menu.y = (r?.bottom ?? 0) + 2;
    menu.items = allSystemTabRegistrations.map((reg: SystemTabRegistration) => ({
      label: reg.label,
      badge: this._openSidesFor(reg.id),
      action: () => emitOpenSystemTab(this.windowId, reg.id, reg.label, reg.defaultSide),
    }));
    document.body.appendChild(menu);
  }

  private _onTabBarScroll(e: Event): void {
    const target = e.target as HTMLElement;
    this._scrollLeft = target.scrollLeft;
    this._hasOverflow = target.scrollWidth - target.clientWidth > 2;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Keep the scroll overflow/shadow state in sync when the sidebar is
    // resized (no scroll event fires on resize, and width is parent-set).
    this._resizeObserver = new ResizeObserver(() => {
      const el = this.querySelector<HTMLElement>(".sidebar-tab-scroll");
      if (el) {
        this._scrollLeft = el.scrollLeft;
        this._hasOverflow = el.scrollWidth - el.clientWidth > 2;
      }
    });
    this._resizeObserver.observe(this);
  }

  disconnectedCallback(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    super.disconnectedCallback();
  }

  private _resizeObserver: ResizeObserver | null = null;

  // ═══ Keep-alive host management ─────────────────────────────────────

  /**
   * Per-side cache of tab controllers. Hosts + controllers are created once and
   * stay mounted (hidden) across tab switches and sidebar open/close. Inactive
   * tabs get setVisible(false) so they run no background work while hidden.
   * Key: `${side}:${tabId}`.
   */
  private _controllers = new Map<string, SystemTabController>();

  /** Last visibility signalled to each controller (avoid redundant setVisible). */
  private _hostSignaled = new Map<string, boolean>();

  /** Find a tab's persistent host in the content area. */
  private _hostFor(tabId: string): HTMLElement | null {
    const content = this.querySelector<HTMLElement>(".sidebar-content");
    return content?.querySelector<HTMLElement>(
      `[data-tab-host="${tabId}"][data-side="${this.side}"]`,
    ) ?? null;
  }

  /** Create the controller + content for a tab inside its host (once). */
  private _mountInto(host: HTMLElement, tabId: string): void {
    if (this._controllers.has(`${this.side}:${tabId}`)) return;
    const tab = this.systemTabs.find((t) => t.id === tabId);
    const appType = tab?.appType;
    if (!appType) return;
    const registration = getSystemTabRegistration(appType);
    if (!registration) return;
    const controller = registration.createController(tabId);
    this._controllers.set(`${this.side}:${tabId}`, controller);
    void controller.mount(host);
  }

  /** Ensure one persistent host per system tab; destroy removed tabs. */
  private _reconcileHosts(): void {
    const content = this.querySelector<HTMLElement>(".sidebar-content");
    if (!content) return;
    const wanted = new Set(this.systemTabs.map((t) => t.id));

    // Create hosts for present tabs, matching systemTabs order.
    for (const tab of this.systemTabs) {
      if (!this._hostFor(tab.id)) {
        const host = document.createElement("div");
        host.className = "sidebar-tab-host";
        host.dataset.tabHost = tab.id;
        host.dataset.side = this.side;
        content.appendChild(host);
      }
    }

    // Remove + unmount tabs that have left the window state.
    const hosts = Array.from(
      content.querySelectorAll<HTMLElement>(
        `[data-tab-host][data-side="${this.side}"]`,
      ),
    );
    for (const hostEl of hosts) {
      const tabId = hostEl.dataset.tabHost!;
      if (wanted.has(tabId)) continue;
      const ctrl = this._controllers.get(`${this.side}:${tabId}`);
      if (ctrl) {
        try {
          ctrl.unmount();
        } catch {
          /* ignore */
        }
        this._controllers.delete(`${this.side}:${tabId}`);
      }
      this._hostSignaled.delete(`${this.side}:${tabId}`);
      hostEl.remove();
    }
  }

  /** Show only the active host; hide + suspend the rest. */
  private _syncActiveHost(): void {
    const content = this.querySelector<HTMLElement>(".sidebar-content");
    if (!content) return;
    const open = this.isOpen;
    const activeId = this.activeTabId;
    const hosts = Array.from(
      content.querySelectorAll<HTMLElement>(
        `[data-tab-host][data-side="${this.side}"]`,
      ),
    );
    for (const host of hosts) {
      const tabId = host.dataset.tabHost!;
      const isActive = open && tabId === activeId;
      host.classList.toggle("visible", isActive);
      if (isActive) this._mountInto(host, tabId);
      const key = `${this.side}:${tabId}`;
      const ctrl = this._controllers.get(key);
      // Signal visibility only on an actual change — controllers must not be
      // woken on every sidebar update while their visibility is unchanged.
      if (ctrl && this._hostSignaled.get(key) !== isActive) {
        this._hostSignaled.set(key, isActive);
        ctrl.setVisible?.(isActive);
      }
    }
  }

  updated(changed: Map<string | number | symbol, unknown>): void {
    // Keep alive: hosts + controllers persist across tab switches and sidebar
    // open/close. Only the active host is shown; hidden controllers get
    // setVisible(false) so they run no background work while inactive.
    this._reconcileHosts();
    this._syncActiveHost();
    if (changed.has("width") || changed.has("activeTabId")) {
      const el = this.querySelector(".sidebar-tab-scroll");
      if (el) {
        this._scrollLeft = el.scrollLeft;
        this._hasOverflow = el.scrollWidth - el.clientWidth > 2;
      }
      const bar = this.querySelector(".sidebar-tab-bar");
      if (bar) {
        this._tabBarHeight = bar.getBoundingClientRect().height;
      }
    }
  }

  // ═══ Render ──────────────────────────────────────────────────────────

  render(): TemplateResult {
    const borderClass = this.side === "left"
      ? "border-r border-divider"
      : "border-l border-divider";

    return html`
      <div
        class="flex flex-col bg-gutter ${borderClass} relative"
        style="height:100%;min-width:${MIN_SIDEBAR_WIDTH}px"
      >
        <style>
          .sidebar-tab-bar { min-height: 34px; }
          .sidebar-tab-scroll::-webkit-scrollbar { display: none; }
          .sidebar-tab-close:hover { background: var(--bg-hover-strong, #444); }
          .sidebar-tab-add:hover { background: var(--bg-hover-strong, #444); }
          /* Keep-alive hosts: one absolute full-fill container per tab. Only the
             active one is displayed; the rest stay mounted (hidden) so
             switching back is an instant display flip. */
          .sidebar-content { position: relative; }
          .sidebar-tab-host {
            position: absolute; inset: 0;
            display: none;
            overflow-y: auto; overflow-x: hidden;
          }
          .sidebar-tab-host.visible { display: block; }
        </style>

        <!-- System tab bar -->
        <div class="sidebar-tab-bar relative shrink-0${this.systemTabs.length > 0 ? ' border-b border-divider' : ''}" data-sidebar-tab-bar="${this.side}">
          ${this.systemTabs.length > 0 ? html`
            <div class="sidebar-tab-scroll flex items-stretch overflow-x-auto" style="scrollbar-width:none;-ms-overflow-style:none;margin-right:29px;" @scroll=${this._onTabBarScroll}>
              ${this.systemTabs.map((tab, idx) => {
                const isActive = tab.id === this.activeTabId;
                const isLast = idx === this.systemTabs.length - 1;
                let sideBorder = idx === 0 && this.side !== "right" ? "border-l" : "";
                // Divider between tabs (including the strip's right end) so each
                // tab's extent is visible on both sidebars. Border on the last
                // tab is dropped only while overflowing (offscreen/at the fade).
                if (!isLast || !this._hasOverflow) sideBorder += " border-r";
                return html`
                  <div
                    class="sidebar-tab flex items-center gap-2.5 px-2.5 cursor-pointer whitespace-nowrap select-none transition-colors duration-75 shrink-0 ${sideBorder} border-divider"
                    data-sidebar-tab-id=${tab.id}
                    data-sidebar-side=${this.side}
                    data-tab-title=${tab.title}
                    style="width:120px;height:34px;font-size:13px;${isActive
                      ? "background:var(--border-divider, #2d2d2d);color:var(--text-primary, #ccc)"
                      : "color:var(--text-secondary, #999)"}"
                    @click=${() => this._onTabClick(tab.id)}
                    @mouseup=${(e: MouseEvent) => this._onTabMiddleClick(e, tab.id)}
                  >
                    <span class="truncate flex-1">${tab.title}</span>
                    <span
                      class="sidebar-tab-close flex items-center justify-center"
                      style="width:16px;height:16px;border-radius:3px;font-size:12px;line-height:1"
                      @click=${(e: Event) => this._onTabClose(e, tab.id)}
                    >✕</span>
                  </div>`;
              })}
            </div>
          ` : nothing}
          <div class="absolute top-0 left-0 w-4 h-full pointer-events-none" style="opacity:${this._showLeftShadow ? 1 : 0};transition:opacity .12s ease;background:linear-gradient(to right, rgba(0,0,0,0.35), transparent)"></div>
          <div class="absolute top-0 w-4 h-full pointer-events-none" style="right:29px;opacity:${this._showRightShadow ? 1 : 0};transition:opacity .12s ease;background:linear-gradient(to left, rgba(0,0,0,0.35), transparent)"></div>
          <!-- + button: open inline menu of registered sidebar tabs -->
          <div
            class="sidebar-tab-add absolute top-0 flex items-center justify-center cursor-pointer select-none transition-colors duration-75"
            style="height:18px;width:18px;top:8px;right:7px;color:var(--text-secondary,#999);z-index:2;border-radius:3px;"
            ${tooltipContent({ type: "simple", text: "Open sidebar tab" })}
            @click=${this._onAddTabClick}
            @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary,#ccc)"; }}
            @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary,#999)"; }}
          >＋</div>
        </div>

        <!-- Content area (keep-alive host stack: one persistent host per tab) -->
        <div class="sidebar-content flex-1 relative overflow-hidden" data-sidebar-content="${this.side}"></div>
      </div>
    `;
  }
}

customElements.define("openp41ge-sidebar", Openp41geSidebar);
export { Openp41geSidebar };
