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
        class="tb-row flex items-center bg-gutter border-b border-divider shrink-0 select-none relative"
        style="--tb-h:${HEIGHT}px;-webkit-app-region:drag;"
      >
        <!-- Traffic-light spacer (85px on Mac, 12px otherwise) -->
        <div class="tb-mw shrink-0" style="--tb-mw:${isMac ? 85 : 12}px"></div>

        <!-- Title (clickable to open project picker) -->
        <span
          title="Switch project"
          class="inline-block px-1.5 py-0.5 text-sm text-muted whitespace-nowrap cursor-pointer rounded mr-12 transition-[color,background] duration-100"
          style="-webkit-app-region:no-drag"
          @mouseenter=${(e: MouseEvent) => {
            const el = e.currentTarget as HTMLElement;
            el.classList.add("text-primary", "bg-hover");
          }}
          @mouseleave=${(e: MouseEvent) => {
            const el = e.currentTarget as HTMLElement;
            el.classList.remove("text-primary", "bg-hover");
          }}
          @click=${() => this._openProjectPicker()}
        >
          ${this._projectName ? (this._isDraft ? "Draft" : this._projectName) : "Openp41ge"}
        </span>

        <!-- Spacer to push content to the right -->
        <div class="flex-1 min-w-0"></div>

        ${
          isMac
            ? ""
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
