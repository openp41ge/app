/**
 * <openp41ge-sidebar> — sidebar panel between the grid and activity bar.
 *
 * Renders the currently active sidebar view panel. Contains a header
 * (view title + close button), a content area for the view, and a
 * left-edge drag handle for resizing.
 *
 * Architecture (SOLID):
 *   - Single Responsibility: manages the sidebar container, resize,
 *     and view lifecycle
 *   - Communication: listens for "openp41ge:activity-click" events and
 *     dispatches workspace operations to persist state
 *   - Width is stored in the layout data model (per-workset)
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { SidebarView } from "./sidebar-views/sidebar-view";
import { dispatch } from "../app";
import { ExplorerSidebarView } from "./sidebar-views/explorer-view";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const GRID_MIN_WIDTH = 200;
const ACTIVITY_BAR_WIDTH = 48;
const BORDER_WIDTH = 3;

class Openp41geSidebar extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  windowId: string = "";

  @property({ attribute: false })
  worksetId: string = "";

  @property({ attribute: false })
  activeViewId: string | null = null;

  @property({ attribute: false })
  width: number = 280;

  @state()
  private _view: SidebarView | null = null;

  private _isResizing = false;
  private _resizeStartX = 0;
  private _resizeStartWidth = 0;
  private _resizeObserver: ResizeObserver | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("openp41ge:activity-click", this._onActivityClick as EventListener);

    // Observe actual rendered width so flex-shrink updates this.width
    // and content reflows correctly when the window is narrow.
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const actualWidth = Math.round(entry.contentRect.width);
        if (
          !this._isResizing &&
          actualWidth >= MIN_SIDEBAR_WIDTH &&
          Math.abs(actualWidth - this.width) > 1
        ) {
          this.width = Math.min(actualWidth, MAX_SIDEBAR_WIDTH);
        }
      }
    });
    this._resizeObserver.observe(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener(
      "openp41ge:activity-click",
      this._onActivityClick as EventListener,
    );
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._unmountView();
  }

  willUpdate(changed: Map<string | number | symbol, unknown>): void {
    if (changed.has("worksetId") && this.worksetId) {
      // Recreate the view with the new worksetId
      if (this._view) {
        const view = this._view as HTMLElement & { setWorksetId?(id: string): void };
        if (typeof view.setWorksetId === "function") {
          view.setWorksetId(this.worksetId);
        }
      }
    }
  }

  updated(changed: Map<string | number | symbol, unknown>): void {
    if (changed.has("activeViewId")) {
      // View ID changed — unmount old, mount new if non-null
      this._unmountView();
      if (this.activeViewId) {
        this._mountView();
      }
    } else if (this.activeViewId && !this._view) {
      // Initial mount
      this._mountView();
    } else if (!this.activeViewId && this._view) {
      // Sidebar closed
      this._unmountView();
    }
  }

  // ═══ Activity click handler ───────────────────────────────────────

  private _onActivityClick = (e: Event): void => {
    const detail = (e as CustomEvent).detail;
    if (!detail || !detail.viewId) return;
    if (!this.windowId) return;

    const viewId = detail.viewId;
    dispatch("toggleSidebarViewOp", this.windowId, viewId);
  };

  // ═══ View lifecycle ───────────────────────────────────────────────

  private _mountView(): void {
    if (!this.activeViewId) return;
    this._unmountView();

    const container = this.querySelector(".sidebar-content") as HTMLElement;
    if (!container) return;

    let view: SidebarView | null = null;

    if (this.activeViewId === "explorer") {
      view = new ExplorerSidebarView(this.worksetId);
    }

    if (view) {
      view.mount(container);
      this._view = view;
    }
  }

  private _unmountView(): void {
    if (this._view) {
      this._view.unmount();
      this._view = null;
    }
  }

  // ═══ Resize ───────────────────────────────────────────────────────

  private _startResize(e: MouseEvent): void {
    e.preventDefault();
    this._isResizing = true;
    this._resizeStartX = e.clientX;
    this._resizeStartWidth = this.width;

    document.addEventListener("mousemove", this._onResizeMove);
    document.addEventListener("mouseup", this._onResizeEnd);

    // Add dragging class to the resize notch
    const notch = this.querySelector(".sidebar-resize-notch") as HTMLElement;
    if (notch) notch.classList.add("dragging");
  }

  private _getMaxSidebarWidth(): number {
    const available = window.innerWidth - GRID_MIN_WIDTH - ACTIVITY_BAR_WIDTH - BORDER_WIDTH;
    return Math.min(MAX_SIDEBAR_WIDTH, available);
  }

  private _onResizeMove = (e: MouseEvent): void => {
    if (!this._isResizing) return;
    // The grid is to the left, sidebar to the right.
    // Resizing the sidebar left edge means: moving left = wider, moving right = narrower.
    const dx = this._resizeStartX - e.clientX;
    const newWidth = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(this._getMaxSidebarWidth(), this._resizeStartWidth + dx),
    );
    this.width = newWidth;
    this.style.width = `${newWidth}px`;
    this.requestUpdate();
  };

  private _onResizeEnd = (): void => {
    this._isResizing = false;
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);

    const notch = this.querySelector(".sidebar-resize-notch") as HTMLElement;
    if (notch) notch.classList.remove("dragging");

    // Persist the new width
    if (this.windowId && this.worksetId) {
      dispatch("setSidebarWidthOp", this.windowId, this.worksetId, this.width);
    }
  };

  // ═══ Render ───────────────────────────────────────────────────────

  render(): TemplateResult | typeof nothing {
    if (!this.activeViewId) return nothing;

    return html`
      <div
        style="display:flex;flex-direction:column;width:${this.width}px;min-width:${MIN_SIDEBAR_WIDTH}px;height:100%;background:var(--bg-gutter);border-left:1px solid var(--border-divider);overflow:hidden;position:relative;"
      >
        <!-- Resize notch on the left edge -->
        <div
          class="sidebar-resize-notch"
          style="position:absolute;left:0;top:0;width:4px;height:100%;cursor:col-resize;z-index:10;pointer-events:auto;touch-action:none;background:transparent;"
          @mousedown=${this._startResize}
        ></div>
        <style>
          .sidebar-resize-notch::before {
            content: "";
            position: absolute;
            left: 0;
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
        </style>

        <!-- View content area -->
        <div
          class="sidebar-content"
          style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;"
        ></div>
      </div>
    `;
  }
}

customElements.define("openp41ge-sidebar", Openp41geSidebar);

export { Openp41geSidebar };
