/**
 * <openp41ge-sidebar> — sidebar panel with system tab bar and content area.
 *
 * Renders a horizontal tab bar at the top and a content area below for the
 * active system tab's controller.
 *
 * KEY DESIGN:
 * - render() ALWAYS returns the same template structure — no conditional
 *   rendering based on visibility. This keeps Lit's marker comment nodes
 *   stable in the DOM across all updates.
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
}

class Openp41geSidebar extends LitElement {
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
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._syncHostStyles();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unmountView();
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);
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
    dispatch("activateSystemTab", this.windowId, this.side, tabId);
  }

  private _onTabClose(tabId: string, e: Event): void {
    e.stopPropagation();
    dispatch("closeSystemTab", this.windowId, this.side, tabId);
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
        </style>

        <!-- System tab bar -->
        <div class="sidebar-tab-bar flex items-center gap-0 px-1 py-1 border-b border-divider shrink-0 overflow-x-auto">
          ${this.systemTabs.map((tab) => {
            const isActive = tab.id === this.activeTabId;
            return html`
              <div
                class="sidebar-tab flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-xs whitespace-nowrap select-none transition-colors duration-75"
                style="${isActive
                  ? "background:var(--tab-active-bg, rgba(74,158,255,0.12));color:var(--text-primary, #e0e0e0)"
                  : "color:var(--text-secondary, #888)"}"
                @click=${() => this._onTabClick(tab.id)}
              >
                <span class="sidebar-tab-title">${tab.title}</span>
                <span
                  class="sidebar-tab-close flex items-center justify-center w-3.5 h-3.5 rounded hover:bg-hover cursor-pointer text-muted hover:text-primary ml-1"
                  @click=${(e: Event) => this._onTabClose(tab.id, e)}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                  </svg>
                </span>
              </div>
            `;
          })}
        </div>

        <!-- Content area -->
        <div class="sidebar-content flex-1 min-h-0 overflow-hidden flex flex-col"></div>
      </div>
    `;
  }
}

customElements.define("openp41ge-sidebar", Openp41geSidebar);

export { Openp41geSidebar, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH };
