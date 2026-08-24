/**
 * <openp41ge-workspace-search> — title-bar workspace control.
 *
 * A centered, fixed-width pill showing the current workspace name (truncated
 * if long). Clicking it opens the Workspaces modal, whose search filters by
 * workspace name, repo names/urls, and worktree names.
 */

import { LitElement, html, type TemplateResult } from "lit";
import { workspaceFileService } from "../services/workspace-file-service";
import { serviceModalService } from "../services/service-modal-service";

const BAR_H = 26;
const WORKSPACE_CHANGED_EVENT = "workspace-file-changed";

class Openp41geWorkspaceSearch extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener(WORKSPACE_CHANGED_EVENT, this._onWorkspaceChanged);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener(WORKSPACE_CHANGED_EVENT, this._onWorkspaceChanged);
  }

  private _onWorkspaceChanged = (): void => {
    this.requestUpdate();
  };

  /** Open the Workspaces modal — its search filters the workspace list. */
  private _openModal(): void {
    serviceModalService.openModal("workspace-manager");
  }

  render(): TemplateResult {
    const name = workspaceFileService.activeWorkspaceName;
    return html`
      <div
        style="display:flex;align-items:center;gap:6px;width:260px;height:${BAR_H}px;padding:0 10px;box-sizing:border-box;border:1px solid var(--border-divider,#2d2d2d);border-radius:4px;background:var(--bg-secondary,#252526);cursor:pointer;user-select:none;white-space:nowrap;-webkit-app-region:no-drag;transition:border-color .1s, background .1s;"
        title="Manage workspaces"
        @click=${() => this._openModal()}
        @mouseenter=${(e: MouseEvent) => {
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = "var(--text-secondary,#999)";
          el.style.background = "var(--bg-hover,#2a2a2a)";
        }}
        @mouseleave=${(e: MouseEvent) => {
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = "var(--border-divider,#2d2d2d)";
          el.style.background = "var(--bg-secondary,#252526)";
        }}
      >
        <svg width="13" height="13" viewBox="0 -960 960 960" fill="currentColor" style="flex-shrink:0;color:var(--text-secondary,#999)">
          <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Z"/>
        </svg>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--text-primary,#ccc);">${name}</span>
        <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor" style="flex-shrink:0;color:var(--text-secondary,#999)">
          <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
        </svg>
      </div>
    `;
  }
}

customElements.define("openp41ge-workspace-search", Openp41geWorkspaceSearch);
