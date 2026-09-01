/**
 * <openp41ge-workspace-search> — title-bar workspace button.
 *
 * Shows the currently selected workspace name and toggles the full workspaces
 * overlay. It is no longer a search bar — the search input lives inside the
 * overlay's own top bar. Kept under the original element name to avoid churn in
 * the title bar.
 */

import { LitElement, html } from "lit";
import { workspaceFileService } from "../services/workspace-file-service";
import { systemOverlayService } from "../services/system-overlay-service";
import { tooltipContent } from "openp41ge-uikit";

const WORKSPACE_CHANGED_EVENT = "workspace-file-changed";

class Openp41geWorkspaceSearch extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private _unsub?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener(WORKSPACE_CHANGED_EVENT, this._onUpdate);
    this._unsub = systemOverlayService.subscribe(() => this.requestUpdate());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener(WORKSPACE_CHANGED_EVENT, this._onUpdate);
    this._unsub?.();
    this._unsub = undefined;
  }

  private _onUpdate = (): void => {
    this.requestUpdate();
  };

  render() {
    const name = workspaceFileService.activeWorkspaceName;
    return html`
      <div
        style="display:flex;align-items:center;gap:5px;max-width:min(180px, calc((100vw - 270px) / 2));height:26px;padding:0 8px;box-sizing:border-box;border-radius:4px;background:var(--bg-secondary,#252526);cursor:pointer;user-select:none;white-space:nowrap;-webkit-app-region:no-drag;transition:background .1s;"
        ${tooltipContent({
          type: "detail",
          title: "Workspaces",
          subtitle:
            "Open the Workspaces overlay to switch projects and reopen recent workspaces.",
        })}
        @click=${() => systemOverlayService.toggle()}
        @mouseenter=${(e: MouseEvent) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover,#2e2e2e)";
        }}
        @mouseleave=${(e: MouseEvent) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary,#252526)";
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 -960 960 960"
          fill="currentColor"
          style="flex-shrink:0;color:var(--text-secondary,#999)"
        >
          <path
            d="M160-240v-480 520-40Zm0 80q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v200h-80v-200H447l-80-80H160v480h200v80H160ZM584-56 440-200l144-144 56 57-87 87 87 87-56 57Zm192 0-56-57 87-87-87-87 56-57 144 144L776-56Z"
          />
        </svg>
        <span
          style="min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--text-primary,#ccc);"
          >${name}</span
        >
      </div>
    `;
  }
}

customElements.define("openp41ge-workspace-search", Openp41geWorkspaceSearch);
