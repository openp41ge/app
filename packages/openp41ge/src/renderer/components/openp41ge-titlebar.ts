/**
 * <openp41ge-titlebar> — minimal title bar (Lit).
 *
 * Worksets have been removed. This component provides:
 *   - macOS traffic-light spacer / non-Mac window controls
 *   - Window title
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { Window } from "../../layout/types";
import { dispatch } from "../app";


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

  connectedCallback(): void {
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
  }

  private _openProjects(): void {
    const win = this.windowData;
    if (!win) return;
    dispatch("toggleSecondarySidebarViewOp", win.id, "projects");
  }

  render(): TemplateResult | typeof nothing {
    const win = this.windowData;
    if (!win) return nothing;

    return html`
      <div
        style="display:flex;align-items:center;height:${HEIGHT}px;background:var(--bg-gutter);border-bottom:1px solid var(--border-divider);flex-shrink:0;user-select:none;-webkit-app-region:drag;position:relative;"
      >
        <!-- Traffic-light spacer (85px on Mac, 12px otherwise) -->
        <div style="width:${isMac ? 85 : 12}px;flex-shrink:0;"></div>

        <!-- Spacer to push content to the right -->
        <div style="flex:1;min-width:0;"></div>

        ${
          isMac
            ? ""
            : html`
                <div style="display:flex;height:100%;flex-shrink:0;">
                  ${this._winBtn("\u2500", false, () => window.openp41ge?.window.minimize())}
                  ${this._winBtn("\u25a1", false, () => window.openp41ge?.window.maximize())}
                  ${this._winBtn("\u2715", true, () => window.openp41ge?.window.close())}
                </div>
              `
        }

        <!-- Project name — opens secondary sidebar -->
        <span
          title="Projects"
          style="display:inline-block;padding:3px 6px;font-size:12px;color:var(--text-muted);white-space:nowrap;cursor:pointer;border-radius:4px;-webkit-app-region:no-drag;transition:color 0.1s,background 0.1s;margin-right:12px;"
          @mouseenter=${(e: MouseEvent) => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--text-primary, #e0e0e0)";
            el.style.background = "var(--hover-bg, #333)";
          }}
          @mouseleave=${(e: MouseEvent) => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--text-muted, #888)";
            el.style.background = "transparent";
          }}
          @click=${() => this._openProjects()}
        >
          Projects
        </span>
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

customElements.define("openp41ge-titlebar", Openp41geTitleBar);
