/**
 * <openp41ge-workspace-search> — title-bar workspace control.
 *
 * A centered, fixed-width pill showing the current workspace name (truncated
 * if long). Clicking toggles an inline dropdown (anchored under the pill) that
 * embeds the Workspace manager: search filters by workspace name, repo
 * names/urls, and worktree names; activating a workspace updates the pill.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { workspaceFileService } from "../services/workspace-file-service";
import { WorkspaceManagerModal } from "../apps/system-tabs/workspace-manager-system-tab";

const BAR_H = 26;
const WORKSPACE_CHANGED_EVENT = "workspace-file-changed";
const WORKSPACES_TAB_UPDATE = "workspaces-tab:update";

class Openp41geWorkspaceSearch extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @state() private _open = false;

  private _manager: WorkspaceManagerModal | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener(WORKSPACE_CHANGED_EVENT, this._onUpdate);
    document.addEventListener(WORKSPACES_TAB_UPDATE, this._onUpdate);
    document.addEventListener("pointerdown", this._onPointerDownOutside, true);
    document.addEventListener("keydown", this._onKeydown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener(WORKSPACE_CHANGED_EVENT, this._onUpdate);
    document.removeEventListener(WORKSPACES_TAB_UPDATE, this._onUpdate);
    document.removeEventListener("pointerdown", this._onPointerDownOutside, true);
    document.removeEventListener("keydown", this._onKeydown);
  }

  private _onUpdate = (): void => {
    this.requestUpdate();
  };

  private _onPointerDownOutside = (e: Event): void => {
    if (!this._open) return;
    if (e.target instanceof Node && this.contains(e.target)) return;
    this._close();
  };

  private _onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this._open) {
      e.stopPropagation();
      this._close();
    }
  };

  private _toggleOpen(): void {
    if (this._open) {
      this._close();
    } else {
      this._openDropdown();
    }
  }

  private _openDropdown(): void {
    const manager = this._ensureManager();
    manager.mount();
    this._open = true;
  }

  private _close(): void {
    this._open = false;
  }

  private _ensureManager(): WorkspaceManagerModal {
    if (!this._manager) {
      this._manager = new WorkspaceManagerModal("dropdown-workspace-manager");
    }
    return this._manager;
  }

  render(): TemplateResult {
    const name = workspaceFileService.activeWorkspaceName;
    const dropdown =
      this._open && this._manager
        ? html`
            <div
              style="position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);width:440px;height:min(70vh,560px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border-divider,#2d2d2d);border-radius:6px;background:var(--bg-primary,#1e1e1e);box-shadow:0 12px 32px rgba(0,0,0,0.45);z-index:1000;-webkit-app-region:no-drag;"
            >
              ${this._manager.render()}
            </div>
          `
        : nothing;

    return html`
      <div
        style="display:flex;align-items:center;gap:6px;width:260px;height:${BAR_H}px;padding:0 10px;box-sizing:border-box;border:1px solid ${this._open ? "var(--accent,#007acc)" : "var(--border-divider,#2d2d2d)"};border-radius:4px;background:var(--bg-secondary,#252526);cursor:pointer;user-select:none;white-space:nowrap;-webkit-app-region:no-drag;transition:border-color .1s, background .1s;"
        title="Manage workspaces"
        @click=${this._toggleOpen}
        @mouseenter=${(e: MouseEvent) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "var(--bg-hover,#2a2a2a)";
        }}
        @mouseleave=${(e: MouseEvent) => {
          const el = e.currentTarget as HTMLElement;
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
      ${dropdown}
    `;
  }
}

customElements.define("openp41ge-workspace-search", Openp41geWorkspaceSearch);
