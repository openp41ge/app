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



  render(): TemplateResult | typeof nothing {
    const win = this.windowData;
    if (!win) return nothing;

    return html`
      <style>
        .tb-btn:hover { background: var(--hover-bg, rgba(128,128,128,0.15)); }
      </style>
      <div
        class="tb-row flex items-center bg-gutter border-b border-divider shrink-0 select-none relative"
        style="--tb-h:${TITLEBAR_HEIGHT}px;-webkit-app-region:drag;"
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
