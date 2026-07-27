/**
 * <openp41ge-secondary-sidebar> — sidebar panel on the left side of the grid.
 *
 * Mirrors the primary sidebar but lives on the opposite side. Currently
 * hosts the projects view. Resize handle is on the right edge (drag right
 * to widen, left to narrow).
 *
 * Architecture (SOLID):
 *   - Single Responsibility: manages the sidebar container, resize, and view lifecycle
 *   - Communication: dispatches workspace operations to persist state
 *   - Width is stored in the layout data model (per-workset)
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { SidebarView } from "./sidebar-views/sidebar-view";
import { dispatch } from "../app";
import { ProjectSidebarView } from "./sidebar-views/projects-view";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const GRID_MIN_WIDTH = 200;
const ACTIVITY_BAR_WIDTH = 48;
const BORDER_WIDTH = 3;

class Openp41geSecondarySidebar extends LitElement {
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

  connectedCallback(): void {
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);
    this._unmountView();
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

  // ═══ View lifecycle ───────────────────────────────────────────────

  private _mountView(): void {
    if (!this.activeViewId) return;
    this._unmountView();

    const container = this.querySelector(".secondary-sidebar-content") as HTMLElement;
    if (!container) return;

    let view: SidebarView | null = null;

    if (this.activeViewId === "projects") {
      view = new ProjectSidebarView();
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
    const notch = this.querySelector(".secondary-sidebar-resize-notch") as HTMLElement;
    if (notch) notch.classList.add("dragging");
  }

  private _getMaxSidebarWidth(): number {
    const available = window.innerWidth - GRID_MIN_WIDTH - ACTIVITY_BAR_WIDTH - BORDER_WIDTH;
    return Math.min(MAX_SIDEBAR_WIDTH, available);
  }

  private _onResizeMove = (e: MouseEvent): void => {
    if (!this._isResizing) return;
    // Resize handle is on the right edge.
    // Moving right = wider, moving left = narrower.
    const dx = e.clientX - this._resizeStartX;
    const newWidth = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(this._getMaxSidebarWidth(), this._resizeStartWidth + dx),
    );
    this.width = newWidth;
    this.style.flex = `0 1 ${newWidth}px`;
    this.requestUpdate();
  };

  private _onResizeEnd = (): void => {
    this._isResizing = false;
    document.removeEventListener("mousemove", this._onResizeMove);
    document.removeEventListener("mouseup", this._onResizeEnd);

    const notch = this.querySelector(".secondary-sidebar-resize-notch") as HTMLElement;
    if (notch) notch.classList.remove("dragging");

    // Persist the new width
    if (this.windowId && this.worksetId) {
      dispatch("setSecondarySidebarWidthOp", this.windowId, this.worksetId, this.width);
    }
  };

  // ═══ Render ───────────────────────────────────────────────────────

  render(): TemplateResult | typeof nothing {
    if (!this.activeViewId) return nothing;

    return html`
      <div
        style="display:flex;flex-direction:column;flex:0 1 ${this.width}px;min-width:${MIN_SIDEBAR_WIDTH}px;height:100%;background:var(--bg-gutter);border-right:1px solid var(--border-divider);overflow:hidden;position:relative;"
      >
        <!-- Resize notch on the right edge -->
        <div
          class="secondary-sidebar-resize-notch"
          style="position:absolute;right:0;top:0;width:4px;height:100%;cursor:col-resize;z-index:10;pointer-events:auto;touch-action:none;background:transparent;"
          @mousedown=${this._startResize}
        ></div>
        <style>
          .secondary-sidebar-resize-notch::before {
            content: "";
            position: absolute;
            right: 0;
            top: 0;
            width: 3px;
            height: 100%;
            background: rgba(74, 158, 255, 0.7);
            opacity: 0;
            transition: opacity 0.12s ease;
            pointer-events: none;
          }
          .secondary-sidebar-resize-notch:hover::before,
          .secondary-sidebar-resize-notch.dragging::before {
            opacity: 1;
          }
        </style>

        <!-- View content area -->
        <div
          class="secondary-sidebar-content"
          style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;"
        ></div>
      </div>
    `;
  }
}

customElements.define("openp41ge-secondary-sidebar", Openp41geSecondarySidebar);

export { Openp41geSecondarySidebar, MIN_SIDEBAR_WIDTH as SECONDARY_SIDEBAR_MIN_WIDTH };
