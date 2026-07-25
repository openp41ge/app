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
        style="display:flex;align-items:center;height:${HEIGHT}px;background:var(--bg-gutter);border-bottom:1px solid var(--border-divider);flex-shrink:0;user-select:none;-webkit-app-region:drag;position:relative;"
      >
        <!-- Traffic-light spacer (85px on Mac, 12px otherwise) -->
        <div style="width:${isMac ? 85 : 12}px;flex-shrink:0;"></div>

        <!-- Project name / window title -->
        <div
          style="flex:1;min-width:0;padding:0 12px;font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
        >
          Openp41ge
        </div>

        ${
          isMac
            ? ""
            : html`
                <!-- Non-Mac window controls -->
                <div style="display:flex;height:100%;flex-shrink:0;">
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
        style="width:46px;height:100%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;color:var(--text-secondary);transition:background 0.1s;-webkit-app-region:no-drag;"
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
