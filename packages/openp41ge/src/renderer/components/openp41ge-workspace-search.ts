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
import { workspacesOverlayService } from "../services/workspaces-overlay-service";

const WORKSPACE_CHANGED_EVENT = "workspace-file-changed";

class Openp41geWorkspaceSearch extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private _unsub?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener(WORKSPACE_CHANGED_EVENT, this._onUpdate);
    this._unsub = workspacesOverlayService.subscribe(() => this.requestUpdate());
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
    const open = workspacesOverlayService.isOpen;
    return html`
      <div
        style="display:flex;align-items:center;gap:6px;width:min(360px, calc(100vw - 270px));height:26px;padding:0 10px;box-sizing:border-box;border:1px solid ${open ? 'var(--accent,#4a9eff)' : 'var(--border-divider,#2d2d2d)'};border-radius:4px;background:var(--bg-secondary,#252526);cursor:pointer;user-select:none;white-space:nowrap;-webkit-app-region:no-drag;transition:background .1s, border-color .1s;"
        title="Workspaces"
        @click=${() => workspacesOverlayService.toggle()}
        @mouseenter=${(e: MouseEvent) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover,#2a2a2a)";
        }}
        @mouseleave=${(e: MouseEvent) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary,#252526)";
        }}
      >
        <svg width="13" height="13" viewBox="0 -960 960 960" fill="currentColor" style="flex-shrink:0;color:var(--text-secondary,#999)">
          <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Z"/>
        </svg>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--text-primary,#ccc);">${name}</span>
      </div>
    `;
  }
}

customElements.define("openp41ge-workspace-search", Openp41geWorkspaceSearch);
