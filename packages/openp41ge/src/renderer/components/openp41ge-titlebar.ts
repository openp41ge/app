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
import { showProjectPicker } from "../services/project-switch-service";


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

  @state()
  private _projectName: string | null = null;

  @state()
  private _isDraft = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._loadProjectName();
    // Refresh when project changes (switched or saved)
    document.addEventListener("project:changed", this._onProjectChanged);
    this.addEventListener("draft:saved", this._onDraftSaved as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("project:changed", this._onProjectChanged);
    this.removeEventListener("draft:saved", this._onDraftSaved as EventListener);
  }

  private _onProjectChanged = (): void => {
    this._loadProjectName();
  };

  private _onDraftSaved = (): void => {
    this._loadProjectName();
  };

  private _openProjectPicker(): void {
    showProjectPicker();
  }

  private async _loadProjectName(): Promise<void> {
    try {
      const name = await window.openp41ge.project.current();
      this._projectName = name;
      if (name) {
        this._isDraft = await window.openp41ge.project.isDraft(name);
      }
    } catch {
      // preload might not be ready yet — ignore
    }
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

        <!-- Title (clickable to open project picker) -->
        <span
          title="Switch project"
          style="display:inline-block;padding:3px 6px;font-size:12px;color:var(--text-muted);white-space:nowrap;cursor:pointer;border-radius:4px;-webkit-app-region:no-drag;transition:color 0.1s,background 0.1s;margin-right:48px;"
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
          @click=${() => this._openProjectPicker()}
        >
          ${this._projectName ? (this._isDraft ? "Draft" : this._projectName) : "Openp41ge"}
        </span>

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
