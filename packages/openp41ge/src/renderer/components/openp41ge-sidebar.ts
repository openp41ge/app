/**
 * <openp41ge-sidebar> — sidebar panel with system tab bar and content area.
 *
 * Renders a horizontal tab bar at the top and a content area below for the
 * active system tab's controller.
 *
 * KEY DESIGN:
 * - render() returns a stable outer template structure (wrapper div, resize
 *   notch, content area div) so Lit's marker comment nodes remain stable.
 *   The system tab bar is only rendered when there are tabs to show.
 * - Visibility is controlled externally via the CSS class
 *   "sidebar-element-hidden" applied by the parent windowview.
 * - `isOpen` IS a Lit property: it triggers updated() so view lifecycle
 *   (mount/unmount) can run. But render() ignores it.
 * - shouldUpdate() prevents re-renders from properties that don't affect
 *   the template output (e.g. workspaceData changes from parent re-render).
 *   Only activeTabId, systemTabs, side, and width trigger actual DOM updates.
 *
 * Two instances per window: left sidebar and right sidebar.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { Workspace } from "../../layout/types";
import { dispatch } from "../app";
import { getSystemTabRegistration } from "../apps/app-registry";
import type { SystemTabController } from "../controllers/types";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const SIDEBAR_WIDTH_KEY_PREFIX = "openp41ge:sidebar-width-";

export interface SystemTabEntry {
  id: string;
  title: string;
  appType: string;
  pinned: boolean;
}

class Openp41geSidebar extends LitElement {
  /** Globally tracks which sidebar is the focused/interacted sidebar. */
  static _focusedSide: "left" | "right" | null = null;
  /** Whether the window currently has focus. */
  static _windowFocused: boolean = true;

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({})
  side: "left" | "right" = "right";

  @property({ attribute: false })
  windowId: string = "";

  @property({ attribute: false })
  workspaceData: Workspace | null = null;

  @property({ attribute: false })
  systemTabs: SystemTabEntry[] = [];

  @property({ attribute: false })
  activeTabId: string | null = null;

  /**
   * Used for view lifecycle (mount/unmount in updated()).
   * render() ignores this — the template is always the same.
   * Parent windowview also mirrors this via CSS class for actual visibility.
   */
  @property({ attribute: false })
  isOpen: boolean = false;

  /** Sidebar width, persisted per side. */
  @property({ attribute: false })
  width: number = (() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY_PREFIX + "right");
    if (saved) {
      const w = parseInt(saved, 10);
      if (!isNaN(w) && w >= 180 && w <= 600) return w;
    }
    return 280;
  })();

  @state()
  private _view: SystemTabController | null = null;

  @state()
  private _scrollLeft: number = 0;

  @state()
  private _tabBarHeight: number = 0;

  @state()
  private _hasOverflow: boolean = false;

  @state()
  private _focusVersion: number = 0;

  private _isResizing = false;
  private _resizeStartX = 0;
  private _resizeStartWidth = 0;
  private _widthKey = SIDEBAR_WIDTH_KEY_PREFIX + "right";

  /**
   * Skip re-renders for property changes that don't affect the template.
   * workspaceData and windowId changes from parent re-renders should NOT
   * trigger Lit DOM updates — they'd only increase the chance of marker
   * corruption from view DOM mounted inside .sidebar-content.
   */
  shouldUpdate(changed: Map<string | number | symbol, unknown>): boolean {
    // Only allow updates when meaningful display properties change
    if (changed.has("activeTabId")) return true;
    if (changed.has("systemTabs")) return true;
    if (changed.has("side")) return true;
    if (changed.has("width")) return true;
    if (changed.has("isOpen")) return true;
    if (changed.has("_scrollLeft")) return true;
    if (changed.has("_tabBarHeight")) return true;
    if (changed.has("_hasOverflow")) return true;
    if (changed.has("_focusVersion")) return true;
    return false;
  }

  willUpdate(changed: Map<string | number | symbol, unknown>): void {
    if (changed.has("side")) {
      this._widthKey = SIDEBAR_WIDTH_KEY_PREFIX + (this.side || "right");
      const saved = localStorage.getItem(this._widthKey);
      if (saved) {
        const w = parseInt(saved, 10);
        if (!isNaN(w) && w >= 180 && w <= 600) this.width = w;
      }
    }
  }

  updated(changed: Map<string | number | symbol, unknown>): void {
    if (changed.has("activeTabId")) {
      this._unmountView();
      if (this.activeTabId && this.isOpen) {
        this._mountView();
      }
    } else if (changed.has("isOpen")) {
      if (this.isOpen && this.activeTabId && !this._view) {
        this._mountView();
      } else if (!this.isOpen && this._view) {
        this._unmountView();
      }
    }
    // Sync host sizing whenever width changes
    if (changed.has("width")) {
      this._syncHostStyles();
    }
    // Re-check scroll state on width/activeTabId changes (sidebar resize may affect overflow)
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

  connectedCallback(): void {
    super.connectedCallback();
    this._syncHostStyles();
    document.addEventListener("mousedown", this._onDocumentMouseDown);
    this.addEventListener("click", this._onSidebarClick);
    window.addEventListener("blur", this._onWindowBlur);
    window.addEventListener("focus", this._onWindowFocus);
  }

  firstUpdated(): void {
    // Initialize scroll shadow state after the DOM is rendered
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

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unmountView();
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);
    document.removeEventListener("mousedown", this._onDocumentMouseDown);
    this.removeEventListener("click", this._onSidebarClick);
    window.removeEventListener("blur", this._onWindowBlur);
    window.removeEventListener("focus", this._onWindowFocus);
  }

  /**
   * Sync flex and min-width onto the host element itself.
   * The host is the flex item in the parent's flex layout, so these
   * properties must live on the host, not on a child div.
   */
  private _syncHostStyles(): void {
    this.style.flex = `0 1 ${this.width}px`;
    this.style.minWidth = `${MIN_SIDEBAR_WIDTH}px`;
  }

  // ═══ Tab click handler ─────────────────────────────────────────────

  private _onTabClick(tabId: string): void {
    // If switching away from an unpinned tab, close it first
    if (tabId !== this.activeTabId && this.activeTabId) {
      const currentTab = this.systemTabs.find((t) => t.id === this.activeTabId);
      if (currentTab && !currentTab.pinned) {
        dispatch("closeSystemTab", this.windowId, this.side, this.activeTabId);
      }
    }
    dispatch("activateSystemTab", this.windowId, this.side, tabId);
  }

  private _onTabClose(tabId: string, e: Event): void {
    e.stopPropagation();
    dispatch("closeSystemTab", this.windowId, this.side, tabId);
  }

  private _onPinToggle(tabId: string, pinned: boolean, e: Event): void {
    e.stopPropagation();
    dispatch("pinSystemTab", tabId, !pinned);
  }

  private _onToggleSidebar(): void {
    dispatch("toggleSidebar", this.windowId, this.side);
  }

  // ═══ View lifecycle ───────────────────────────────────────────────
  //
  // Mount target is `.sidebar-content`, a <div> rendered by Lit in the
  // template. We never set innerHTML on it — only removeChild in a loop —
  // so Lit's marker comment nodes are preserved.

  private _mountView(): void {
    if (!this.activeTabId || !this.isOpen) return;
    this._unmountView();

    const tab = this.systemTabs.find((t) => t.id === this.activeTabId);
    if (!tab) return;

    const container = this.querySelector<HTMLElement>(".sidebar-content");
    if (!container) return;

    const reg = getSystemTabRegistration(tab.appType);
    if (reg) {
      const view = reg.createController(this.activeTabId);
      const mountResult = view.mount(container);
      if (mountResult instanceof Promise) {
        mountResult.catch((err) => {
          console.error(`Failed to mount system tab ${tab.appType}:`, err);
        });
      }
      this._view = view;
    }
  }

  private _unmountView(): void {
    if (this._view) {
      this._view.unmount();
      this._view = null;
    }
    // Clear mount target using removeChild (never innerHTML) so Lit
    // marker comment nodes inside this element are preserved.
    const container = this.querySelector<HTMLElement>(".sidebar-content");
    if (container) {
      while (container.lastChild) {
        container.removeChild(container.lastChild);
      }
    }
  }

  // ═══ Resize ───────────────────────────────────────────────────────

  private _startResize(e: MouseEvent): void {
    e.preventDefault();
    this._isResizing = true;
    this._resizeStartX = e.clientX;
    this.width = this.clientWidth;
    this._resizeStartWidth = this.clientWidth;

    document.addEventListener("mousemove", this._onResizeMove);
    document.addEventListener("mouseup", this._onResizeEnd);

    const notch = this.querySelector<HTMLElement>(".sidebar-resize-notch");
    if (notch) notch.classList.add("dragging");
  }

  private _onResizeMove = (e: MouseEvent): void => {
    if (!this._isResizing) return;
    const dx = this.side === "left"
      ? e.clientX - this._resizeStartX
      : this._resizeStartX - e.clientX;
    const newWidth = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(this._getMaxSidebarWidth(), this._resizeStartWidth + dx),
    );
    this.width = newWidth;
    // Update tab bar height for shadow sizing
    const bar = this.querySelector(".sidebar-tab-bar");
    if (bar) {
      this._tabBarHeight = bar.getBoundingClientRect().height;
    }
  };

  private _onResizeEnd = (): void => {
    this._isResizing = false;
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);

    const notch = this.querySelector<HTMLElement>(".sidebar-resize-notch");
    if (notch) notch.classList.remove("dragging");

    localStorage.setItem(this._widthKey, String(this.width));
  };

  private _getMaxSidebarWidth(): number {
    // Reserve space for the other sidebar at minimum width + grid minimum width
    return Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - MIN_SIDEBAR_WIDTH - 200);
  }

  private _onTabBarScroll(e: Event): void {
    const target = e.target as HTMLElement;
    this._scrollLeft = target.scrollLeft;
    this._hasOverflow = target.scrollWidth - target.clientWidth > 2;
  }

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

  private _onDocumentMouseDown = (e: MouseEvent): void => {
    // When clicking inside this sidebar, mark it as focused
    const target = e.target as Node;
    if (this.contains(target)) {
      Openp41geSidebar._setFocusedSide(this.side);
    } else {
      // If click lands outside this sidebar and inside the other sidebar,
      // the other sidebar's _onSidebarClick will handle focus. If click
      // is outside all sidebars, clear focus.
      const inAnySidebar = target instanceof HTMLElement &&
        target.closest?.("openp41ge-sidebar");
      if (!inAnySidebar) {
        Openp41geSidebar._setFocusedSide(null);
      }
    }

    // Close unpinned active tab when clicking outside the sidebar
    if (!this.activeTabId) return;
    if (this.classList.contains("sidebar-element-hidden")) return;
    const activeTab = this.systemTabs.find((t) => t.id === this.activeTabId);
    if (!activeTab || activeTab.pinned) return;
    if (!this.contains(target)) {
      dispatch("closeSystemTab", this.windowId, this.side, this.activeTabId);
    }
  };

  /**
   * Notify all sidebar instances to re-render (e.g. when focus changes).
   * Increments _focusVersion on each instance so shouldUpdate allows the
   * re-render even though focus is tracked via static properties.
   */
  private static _notifyAll(): void {
    document.querySelectorAll("openp41ge-sidebar").forEach((el) => {
      const sidebar = el as Openp41geSidebar;
      sidebar._focusVersion++;
      sidebar.requestUpdate();
    });
  }

  /**
   * Set the focused sidebar side and notify all instances.
   */
  private static _setFocusedSide(side: "left" | "right" | null): void {
    if (Openp41geSidebar._focusedSide === side) return;
    Openp41geSidebar._focusedSide = side;
    Openp41geSidebar._notifyAll();
  }

  /**
   * Set the window focus state and notify all instances.
   */
  private static _setWindowFocused(focused: boolean): void {
    if (Openp41geSidebar._windowFocused === focused) return;
    Openp41geSidebar._windowFocused = focused;
    Openp41geSidebar._notifyAll();
  }

  private _onSidebarClick = (): void => {
    Openp41geSidebar._setFocusedSide(this.side);
  };

  private _onWindowBlur = (): void => {
    Openp41geSidebar._setWindowFocused(false);
  };

  private _onWindowFocus = (): void => {
    Openp41geSidebar._setWindowFocused(true);
  };

  /** True when this sidebar is the focused sidebar and the window is active. */
  private get _isFocused(): boolean {
    return (
      Openp41geSidebar._focusedSide === this.side &&
      Openp41geSidebar._windowFocused
    );
  }

  // ═══ Render ───────────────────────────────────────────────────────
  //
  // Always returns the same template structure. Never conditional.
  // Visibility is controlled by the parent via CSS class.

  render(): TemplateResult {
    const borderClass = this.side === "left"
      ? "border-r border-divider"
      : "border-l border-divider";

    const resizeNotchSideClass = this.side === "left" ? "right-0" : "left-0";

    return html`
      <div
        class="flex flex-col bg-gutter ${borderClass} overflow-hidden relative"
        style="height:100%;"
      >
        <!-- Resize notch -->
        <div
          class="sidebar-resize-notch absolute top-0 w-1 h-full cursor-col-resize z-10 pointer-events-auto touch-none bg-transparent ${resizeNotchSideClass}"
          @mousedown=${this._startResize}
        ></div>

        <style>
          .sidebar-resize-notch::before {
            content: "";
            position: absolute;
            top: 0;
            width: 3px;
            height: 100%;
            background: rgba(74, 158, 255, 0.7);
            opacity: 0;
            transition: opacity 0.12s ease;
            pointer-events: none;
          }
          .sidebar-resize-notch:hover::before,
          .sidebar-resize-notch.dragging::before {
            opacity: 1;
          }
          .sidebar-resize-notch.right-0::before { right: 0; }
          .sidebar-resize-notch.left-0::before { left: 0; }
          .sidebar-tab-scroll::-webkit-scrollbar { display: none; }
        </style>

        <!-- System tab bar — always rendered (even when empty) so drops are detected -->
        <div class="sidebar-tab-bar relative shrink-0 border-b border-divider" data-sidebar-tab-bar="${this.side}">
          ${this.systemTabs.length > 0 ? html`
            <!-- Scrollable tab container (scrollbar hidden) -->
            <div class="sidebar-tab-scroll flex items-stretch overflow-x-auto" style="scrollbar-width:none;-ms-overflow-style:none;" @scroll=${this._onTabBarScroll}>
              ${this.systemTabs.map((tab, idx) => {
                const isActive = tab.id === this.activeTabId;
                const isLast = idx === this.systemTabs.length - 1;
                let sideBorder = idx === 0 ? "border-l" : "";
                if (!isLast || !this._hasOverflow) sideBorder += " border-r";
                return html`
                  <div
                    class="sidebar-tab flex items-center gap-1 px-2 py-1.5 cursor-pointer text-xs whitespace-nowrap select-none transition-colors duration-75 shrink-0 ${sideBorder} border-divider"
                    data-sidebar-tab-id=${tab.id}
                    data-sidebar-side=${this.side}
                    data-tab-title=${tab.title}
                    style="width:120px;${isActive
                      ? "background:var(--tab-active-bg, rgba(74,158,255,0.12));color:var(--text-primary, #e0e0e0)"
                      : "color:var(--text-secondary, #888)"}"
                    @click=${() => this._onTabClick(tab.id)}
                  >
                    <span class="sidebar-tab-title truncate">${tab.title}</span>
                    <!-- Pin button -->
                    <span
                      class="sidebar-tab-pin flex items-center justify-center w-5 h-5 rounded hover:bg-hover cursor-pointer text-muted hover:text-primary shrink-0 ml-auto"
                      title="${tab.pinned ? "Pinned" : "Unpinned"}"
                      @click=${(e: Event) => this._onPinToggle(tab.id, tab.pinned, e)}
                    >
                      ${tab.pinned ? html`
                        <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="currentColor"><path d="m640-480 80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280Zm-286 80h252l-46-46v-314H400v314l-46 46Zm126 0Z"/></svg>
                      ` : html`
                        <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="currentColor"><path d="M680-840v80h-40v327l-80-80v-247H400v87l-87-87-33-33v-47h400ZM480-40l-40-40v-240H240v-80l80-80v-46L56-792l56-56 736 736-58 56-264-264h-6v240l-40 40ZM354-400h92l-44-44-2-2-46 46Zm126-193Zm-78 149Z"/></svg>
                      `}
                    </span>
                    <!-- Close button -->
                    <span
                      class="sidebar-tab-close flex items-center justify-center w-5 h-5 rounded hover:bg-hover cursor-pointer text-muted hover:text-primary shrink-0"
                      @click=${(e: Event) => this._onTabClose(tab.id, e)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                    </span>
                  </div>
                `;
              })}
            </div>
            ${(() => {
              const activeIdx = this.systemTabs.findIndex((t) => t.id === this.activeTabId);
              if (activeIdx === -1) return nothing;
              const indicatorColor = this._isFocused
                ? "var(--accent, #4a9eff)"
                : "#555";
              return html`
                <div class="absolute h-0.5 pointer-events-none transition-colors duration-150" style="width:120px;left:${activeIdx * 120 - this._scrollLeft}px;bottom:-1px;z-index:3;background:${indicatorColor};"></div>
              `;
            })()}
          ` : nothing}
        </div>
        <!-- Left scroll shadow (positioned relative to outer container) -->
        <div class="absolute pointer-events-none transition-opacity duration-150" style="left:0;top:0;width:24px;height:${Math.max(this._tabBarHeight, 30)}px;z-index:4;opacity:${this._showLeftShadow ? 1 : 0};background:linear-gradient(to right, var(--bg-gutter, #1a1a1a), transparent);"></div>
        <!-- Right scroll shadow (positioned relative to outer container) -->
        <div class="absolute pointer-events-none transition-opacity duration-150" style="right:0;top:0;width:24px;height:${Math.max(this._tabBarHeight, 30)}px;z-index:4;opacity:${this._showRightShadow ? 1 : 0};background:linear-gradient(to left, var(--bg-gutter, #1a1a1a), transparent);"></div>

        <!-- Content area -->
        <div class="sidebar-content flex-1 min-h-0 overflow-hidden flex flex-col" data-sidebar-content="${this.side}"></div>
      </div>
    `;
  }
}

customElements.define("openp41ge-sidebar", Openp41geSidebar);

export { Openp41geSidebar, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH };
