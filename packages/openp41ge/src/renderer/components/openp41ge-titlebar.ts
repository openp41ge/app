/**
 * <openp41ge-titlebar> — minimal title bar (Lit).
 *
 * Worksets have been removed. This component provides:
 *   - macOS traffic-light spacer / non-Mac window controls
 *   - Window title
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import type { Window } from "../../layout/types";
import { emitEvent } from "../app";
import { TITLEBAR_HEIGHT } from "openp41ge-constants";

import "./openp41ge-workspace-search";

const isMac = (() => {
  try {
    return window.openp41ge?.platform === "darwin" || navigator.platform.startsWith("Mac");
  } catch {
    return false;
  }
})();



class Openp41geTitleBar extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  windowData: Window | null = null;

  @property({ attribute: false })
  leftSidebarVisible: boolean = false;

  @property({ attribute: false })
  rightSidebarVisible: boolean = false;

  // ── Custom titlebar drag ────────────────────────────────────────────
  // The bar is permanently `no-drag`: on a `-webkit-app-region: drag` region
  // the OS swallows all mouse events, so we could never hear the double-click.
  // Instead we reimplement the move over IPC (setPosition) and intercept the
  // double-click to run the animated maximize.
  private _dragActive = false;
  private _dragMoved = false;
  private _dragMovePending = false;
  private _grabOffset = { x: 0, y: 0 };

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("workspace-file-changed", this._requestUpdate);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("workspace-file-changed", this._requestUpdate);
  }

  private _requestUpdate = (): void => {
    this.requestUpdate();
  };

  private _toggleLeft(): void {
    const win = this.windowData;
    if (!win) return;
    emitEvent("sidebar-toggle", { windowId: win.id, side: "left" });
  }

  private _toggleRight(): void {
    const win = this.windowData;
    if (!win) return;
    emitEvent("sidebar-toggle", { windowId: win.id, side: "right" });
  }

  // Custom window drag. The grab offset keeps the window's top-left pinned to
  // the same spot under the cursor for the whole gesture. Moves are
  // rAF-throttled (one IPC per frame); IPC send (not invoke) keeps it fire-and-
  // forget so pointer tracking stays tight.
  private _onBarPointerDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement;
    if (target.closest(".tb-btn, openp41ge-workspace-search, [data-winbtn]")) return;
    if (e.button !== 0) return;

    this._dragActive = true;
    this._dragMoved = false;
    this._grabOffset = { x: window.screenX - e.screenX, y: window.screenY - e.screenY };

    e.preventDefault(); // no text/image-selection while dragging the window
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }
    window.openp41ge?.window.startDrag();
  };

  private _onBarPointerMove = (e: PointerEvent): void => {
    if (!this._dragActive || this._dragMovePending) return;
    const sx = e.screenX;
    const sy = e.screenY;
    this._dragMovePending = true;
    requestAnimationFrame(() => {
      this._dragMovePending = false;
      this._dragMoved = true;
      window.openp41ge?.window.dragMove(sx + this._grabOffset.x, sy + this._grabOffset.y);
    });
  };

  private _onBarPointerUp = (e: PointerEvent): void => {
    if (!this._dragActive) return;
    this._dragActive = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    window.openp41ge?.window.endDrag();
  };

  private _onBarDblClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (target.closest(".tb-btn, openp41ge-workspace-search, [data-winbtn]")) return;
    if (this._dragMoved) return; // was a real drag, not a double-click
    window.openp41ge?.window.maximizeAnimated();
  };



  render(): TemplateResult | typeof nothing {
    const win = this.windowData;
    if (!win) return nothing;

    return html`
      <style>
        .tb-btn:hover { background: var(--hover-bg, rgba(128,128,128,0.15)); }
      </style>
      <div
        class="tb-row flex items-center bg-gutter border-b border-divider shrink-0 select-none relative"
        style="--tb-h:${TITLEBAR_HEIGHT}px;-webkit-app-region:no-drag;"
        @pointerdown=${this._onBarPointerDown}
        @pointermove=${this._onBarPointerMove}
        @pointerup=${this._onBarPointerUp}
        @pointercancel=${this._onBarPointerUp}
        @dblclick=${this._onBarDblClick}
      >
        <!-- Traffic-light spacer (85px on Mac, 12px otherwise) -->
        <div class="tb-mw shrink-0" style="--tb-mw:${isMac ? 85 : 12}px"></div>

        <!-- Left sidebar toggle -->
        <div
          class="tb-btn flex items-center justify-center w-7 h-7 rounded cursor-pointer text-secondary hover:text-primary shrink-0 mr-1"
          style="-webkit-app-region:no-drag"
          title="${this.leftSidebarVisible ? "Close left sidebar" : "Open left sidebar"}"
          @click=${() => this._toggleLeft()}
        >
          <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor">
            <path d="${this.leftSidebarVisible
              ? "M660-320v-320L500-480l160 160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm120-80v-560H200v560h120Zm80 0h360v-560H400v560Zm-80 0H200h120Z"
              : "M500-640v320l160-160-160-160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm120-80v-560H200v560h120Zm80 0h360v-560H400v560Zm-80 0H200h120Z"}"></path>
          </svg>
        </div>

        <!-- Workspace button (left-aligned, toggles the workspaces overlay) -->
        <openp41ge-workspace-search
          style="position:relative;height:100%;display:flex;align-items:center;-webkit-app-region:no-drag;margin-left:2px;"
        ></openp41ge-workspace-search>

        <!-- Spacer to push content to the right -->
        <div class="flex-1 min-w-0"></div>

        <!-- Right sidebar toggle -->
        <div
          class="tb-btn flex items-center justify-center w-7 h-7 rounded cursor-pointer text-secondary hover:text-primary shrink-0"
          style="-webkit-app-region:no-drag;margin-right:14px"
          title="${this.rightSidebarVisible ? "Close right sidebar" : "Open right sidebar"}"
          @click=${() => this._toggleRight()}
        >
          <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor">
            <path d="${this.rightSidebarVisible
              ? "M300-640v320l160-160-160-160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm440-80h120v-560H640v560Zm-80 0v-560H200v560h360Zm80 0h120-120Z"
              : "M460-320v-320L300-480l160 160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm440-80h120v-560H640v560Zm-80 0v-560H200v560h360Zm80 0h120-120Z"}"></path>
          </svg>
        </div>

        ${
          isMac
            ? nothing
            : html`
                <div class="flex h-full shrink-0">
                  ${this._winBtn("\u2500", false, () => window.openp41ge?.window.minimize())}
                  ${this._winBtn("\u25a1", false, () => window.openp41ge?.window.maximize())}
                  ${this._winBtn("\u2715", true, () => window.openp41ge?.window.close())}
                </div>
              `
        }
      </div>
    `;
  }

  private _winBtn(label: string, isClose: boolean, onClick: () => void): TemplateResult {
    return html`
      <div
        class="w-[46px] h-full flex items-center justify-center cursor-pointer text-sm text-secondary transition-[background] duration-100"
        style="-webkit-app-region:no-drag"
        data-winbtn
        @mouseenter=${(e: MouseEvent) => {
          const el = e.currentTarget as HTMLElement;
          el.classList.add(isClose ? "bg-[#e81123]" : "bg-[#333]");
          if (isClose) el.classList.add("text-white");
        }}
        @mouseleave=${(e: MouseEvent) => {
          const el = e.currentTarget as HTMLElement;
          el.classList.remove("bg-[#e81123]", "bg-[#333]");
          if (isClose) el.classList.remove("text-white");
        }}
        @click=${onClick}
      >
        ${label}
      </div>
    `;
  }
}

customElements.define("openp41ge-titlebar", Openp41geTitleBar);
