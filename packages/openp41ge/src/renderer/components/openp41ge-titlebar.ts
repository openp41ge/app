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
import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge-titlebar");

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
    // Refresh project name when draft is saved
    this.addEventListener("draft:saved", this._onDraftSaved as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("draft:saved", this._onDraftSaved as EventListener);
  }

  private _onDraftSaved = (): void => {
    this._loadProjectName();
  };

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

  private _onSaveDraftClick(): void {
    if (!this._projectName || !this._isDraft) return;
    log.info("Save draft triggered from titlebar");
    this.dispatchEvent(
      new CustomEvent("draft:save", {
        bubbles: true,
        composed: true,
        detail: { draftName: this._projectName },
      }),
    );
  }

  render(): TemplateResult | typeof nothing {
    const win = this.windowData;
    if (!win) return nothing;

    const displayName = this._projectName
      ? this._isDraft
        ? "Draft Project"
        : this._projectName
      : "Openp41ge";

    const title = `Openp41ge — ${displayName}`;

    return html`
      <div
        style="display:flex;align-items:center;height:${HEIGHT}px;background:var(--bg-gutter);border-bottom:1px solid var(--border-divider);flex-shrink:0;user-select:none;-webkit-app-region:drag;position:relative;"
      >
        <!-- Traffic-light spacer (85px on Mac, 12px otherwise) -->
        <div style="width:${isMac ? 85 : 12}px;flex-shrink:0;"></div>

        <!-- Title with draft badge -->
        <div
          style="flex:1;min-width:0;padding:0 12px;font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:8px;"
        >
          <span>${title}</span>
          ${
            this._isDraft
              ? html`
                  <button
                    title="Save this draft as a permanent project"
                    style="font-size:11px;padding:2px 8px;border:1px solid var(--accent, #4a9eff);border-radius:4px;background:transparent;color:var(--accent, #4a9eff);cursor:pointer;white-space:nowrap;-webkit-app-region:no-drag;transition:background 0.1s;"
                    @mouseenter=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(74, 158, 255, 0.15)";
                    }}
                    @mouseleave=${(e: MouseEvent) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                    @click=${(e: MouseEvent) => {
                      e.stopPropagation();
                      this._onSaveDraftClick();
                    }}
                  >
                    Save Project
                  </button>
                `
              : ""
          }
        </div>

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
