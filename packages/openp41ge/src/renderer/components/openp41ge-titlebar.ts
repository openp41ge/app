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

const isMac = (() => {
  try {
    return window.openp41ge?.platform === "darwin" || navigator.platform.startsWith("Mac");
  } catch {
    return false;
  }
})();

const HEIGHT = 35;

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

  private _openWorkspaces(): void {
    const win = this.windowData;
    if (!win) return;
    emitEvent("system-tab-open", { windowId: win.id, appType: "workspace-manager" });
  }

  private _openSettings(): void {
    const win = this.windowData;
    if (!win) return;
    emitEvent("system-tab-open", { windowId: win.id, appType: "settings" });
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
        style="--tb-h:${HEIGHT}px;-webkit-app-region:drag;"
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

        <!-- Title -->
        <span
          class="inline-block px-1.5 py-0.5 text-sm text-muted whitespace-nowrap mr-12"
        >
          Openp41ge
        </span>

        <!-- Spacer to push content to the right -->
        <div class="flex-1 min-w-0"></div>

        <!-- Workspaces button -->
        <div
          class="tb-btn flex items-center justify-center w-7 h-7 rounded cursor-pointer text-secondary hover:text-primary shrink-0 mr-0.5"
          style="-webkit-app-region:no-drag"
          title="Workspaces"
          @click=${() => this._openWorkspaces()}
        >
          <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor">
            <path d="M160-240v-480 520-40Zm0 80q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v200h-80v-200H447l-80-80H160v480h200v80H160ZM584-56 440-200l144-144 56 57-87 87 87 87-56 57Zm192 0-56-57 87-87-87-87 56-57 144 144L776-56Z"/>
          </svg>
        </div>

        <!-- Settings button -->
        <div
          class="tb-btn flex items-center justify-center w-7 h-7 rounded cursor-pointer text-secondary hover:text-primary shrink-0 mr-0.5"
          style="-webkit-app-region:no-drag"
          title="Settings"
          @click=${() => this._openSettings()}
        >
          <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor">
            <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"/>
          </svg>
        </div>

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
