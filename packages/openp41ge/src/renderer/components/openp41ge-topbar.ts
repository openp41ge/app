/**
 * <openp41ge-topbar> — simplified title bar (no workset tabs).
 *
 * Worksets have been removed. This component now just renders a simple
 * title bar with project name and window controls.
 * To be replaced with a proper project-aware title bar in a future phase.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import type { Window } from "../../layout/types";

const isMac = (() => {
  try {
    return window.openp41ge?.platform === "darwin" || navigator.platform.startsWith("Mac");
  } catch {
    return false;
  }
})();

const HEIGHT = 35;

class Openp41geTopBar extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  windowData: Window | null = null;

  render(): TemplateResult | typeof nothing {
    const win = this.windowData;
    if (!win) return nothing;

    return html`
      <div
        class="flex items-center bg-gutter border-b border-divider shrink-0 select-none relative -webkit-app-region:drag"
        class="tb-row" style="--tb-h:${HEIGHT}px"
      >
        <!-- Traffic-light spacer (85px on Mac, 12px otherwise) -->
        <div class="tb-mw shrink-0" style="--tb-mw:${isMac ? 85 : 12}px"></div>

        <!-- Project name / window title -->
        <div
          class="flex-1 min-w-0 px-3 text-sm text-muted whitespace-nowrap overflow-hidden text-ellipsis"
        >
          Openp41ge
        </div>

        ${
          isMac
            ? ""
            : html`
                <!-- Non-Mac window controls -->
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
        class="w-[46px] h-full flex items-center justify-center cursor-pointer text-sm text-secondary transition-[background] duration-100 -webkit-app-region:no-drag"
        @mouseenter=${(e: MouseEvent) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = isClose ? "#e81123" : "#333";
          if (isClose) el.style.color = "#fff";
        }}
        @mouseleave=${(e: MouseEvent) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "transparent";
          if (isClose) el.style.color = "#999";
        }}
        @click=${onClick}
      >
        ${label}
      </div>
    `;
  }
}

customElements.define("openp41ge-topbar", Openp41geTopBar);
