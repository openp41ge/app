/**
 * <openp41ge-sidebar> — sidebar container.
 *
 * Receives width via inline style from parent. No longer manages its own
 * resize — that's handled by <openp41ge-windowview>.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { emitEvent } from "../app";
import { appState } from "../services/app-state";
import type { SystemTabRegistration } from "../controllers/types";

// Keep in sync with openp41ge-windowview if changed
const MIN_SIDEBAR_WIDTH = 160;

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

  private _onTabBarScroll(e: Event): void {
    const target = e.target as HTMLElement;
    this._scrollLeft = target.scrollLeft;
    this._hasOverflow = target.scrollWidth - target.clientWidth > 2;
  }

  /** True when this sidebar is the focused sidebar and the window is active. */
  private get _isFocused(): boolean {
    return appState.focusedSide === this.side && appState.windowFocused;
  }

  // ═══ Mount / unmount view ────────────────────────────────────────────

  private _view: { mount: (container: HTMLElement) => void; unmount: () => void } | null = null;

  private _mountView(): void {
    if (this._view || !this.activeTabId || !this.isOpen) return;
    const reg = (window as unknown as Record<string, unknown>).__openp41geApp as
      | { getSystemTabRegistration: (id: string) => SystemTabRegistration | undefined }
      | undefined;
    if (!reg) return;
    const registration = reg.getSystemTabRegistration(this.activeTabId);
    if (!registration) return;
    const controller = registration.createController(this.activeTabId);
    const container = this.querySelector<HTMLElement>(".sidebar-content");
    if (!container) return;
    controller.mount(container);
    this._view = controller;
  }

  private _unmountView(): void {
    if (this._view) {
      this._view.unmount();
      this._view = null;
    }
    const container = this.querySelector<HTMLElement>(".sidebar-content");
    if (container) {
      while (container.lastChild) {
        container.removeChild(container.lastChild);
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
          .sidebar-tab-scroll::-webkit-scrollbar { display: none; }
          .sidebar-tab-close:hover { background: var(--bg-hover-strong, #444); }
        </style>

        <!-- System tab bar -->
        <div class="sidebar-tab-bar relative shrink-0${this.systemTabs.length > 0 ? ' border-b border-divider' : ''}" data-sidebar-tab-bar="${this.side}">
          ${this.systemTabs.length > 0 ? html`
            <div class="sidebar-tab-scroll flex items-stretch overflow-x-auto" style="scrollbar-width:none;-ms-overflow-style:none;" @scroll=${this._onTabBarScroll}>
              ${this.systemTabs.map((tab, idx) => {
                const isActive = tab.id === this.activeTabId;
                const isLast = idx === this.systemTabs.length - 1;
                let sideBorder = idx === 0 && this.side !== "right" ? "border-l" : "";
                if ((!isLast || !this._hasOverflow) && !(isLast && this.side === "left")) sideBorder += " border-r";
                return html`
                  <div
                    class="sidebar-tab flex items-center gap-1 px-2 cursor-pointer text-xs whitespace-nowrap select-none transition-colors duration-75 shrink-0 ${sideBorder} border-divider"
                    data-sidebar-tab-id=${tab.id}
                    data-sidebar-side=${this.side}
                    data-tab-title=${tab.title}
                    style="width:120px;height:34px;${isActive
                      ? this._isFocused
                        ? "background:var(--tab-active-bg, rgba(74,158,255,0.12));color:var(--text-primary, #e0e0e0)"
                        : "background:rgba(255,255,255,0.05);color:var(--text-primary, #e0e0e0)"
                      : "color:var(--text-secondary, #888)"}"
                    @click=${() => this._onTabClick(tab.id)}
                    @mouseup=${(e: MouseEvent) => this._onTabMiddleClick(e, tab.id)}
                  >
                    <span class="truncate flex-1">${tab.title}</span>
                    <span
                      class="sidebar-tab-close flex items-center justify-center w-4 h-4 rounded-sm text-xs leading-none"
                      @click=${(e: Event) => this._onTabClose(e, tab.id)}
                    >✕</span>
                  </div>`;
              })}
            </div>
          ` : nothing}
          ${this._showLeftShadow ? html`<div class="absolute top-0 left-0 w-4 h-full pointer-events-none" style="background:linear-gradient(to right, rgba(0,0,0,0.3), transparent)"></div>` : nothing}
          ${this._showRightShadow ? html`<div class="absolute top-0 right-0 w-4 h-full pointer-events-none" style="background:linear-gradient(to left, rgba(0,0,0,0.3), transparent)"></div>` : nothing}
        </div>

        <!-- Content area -->
        <div class="sidebar-content flex-1 overflow-y-auto overflow-x-hidden"></div>
      </div>
    `;
  }
}

customElements.define("openp41ge-sidebar", Openp41geSidebar);
export { Openp41geSidebar };
