/**
 * <openp41ge-workspace-search> — title-bar workspace control.
 *
 * A centered, fixed-width pill showing the current workspace name (truncated
 * if long). Clicking expands it into an inline dropdown that doubles as the
 * search box: the pill itself becomes the focused search input at the top of
 * the palette, and the workspace list below filters live by workspace name,
 * repo names/urls, and worktree names. Escape or click-outside collapses back
 * to the pill.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { workspaceFileService } from "../services/workspace-file-service";
import { WorkspaceManagerModal } from "../apps/system-tabs/workspace-manager-system-tab";

const WORKSPACE_CHANGED_EVENT = "workspace-file-changed";
const WORKSPACES_TAB_UPDATE = "workspaces-tab:update";
const SEARCH_INPUT_SELECTOR = "[data-workspace-search-input]";

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
    // Reopen fresh: the pill switches back to the workspace name on close,
    // so start with an empty search (all workspaces listed).
    manager.query = "";
    manager.mount();
    this._open = true;
    // The pill input is only in the DOM once the palette has rendered.
    requestAnimationFrame(() => {
      const input = this.querySelector<HTMLInputElement>(SEARCH_INPUT_SELECTOR);
      input?.focus();
    });
  }

  private _close(): void {
    this._open = false;
  }

  private _ensureManager(): WorkspaceManagerModal {
    if (!this._manager) {
      // The search box lives in the pill, so the panel renders without one.
      this._manager = new WorkspaceManagerModal("dropdown-workspace-manager", {
        showSearch: false,
      });
    }
    return this._manager;
  }

  private _onQueryInput(e: Event, manager: WorkspaceManagerModal): void {
    manager.query = (e.target as HTMLInputElement).value;
  }

  private _clearQuery(manager: WorkspaceManagerModal): void {
    manager.query = "";
    this.querySelector<HTMLInputElement>(SEARCH_INPUT_SELECTOR)?.focus();
  }

  private _searchBar(manager: WorkspaceManagerModal): TemplateResult {
    return html`
      <div
        style="display:flex;align-items:center;gap:6px;flex-shrink:0;height:40px;padding:0 10px;border-bottom:1px solid var(--border-divider,#2d2d2d);"
        -webkit-app-region="no-drag"
      >
        <svg width="13" height="13" viewBox="0 -960 960 960" fill="currentColor" style="flex-shrink:0;color:var(--text-secondary,#999)">
          <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
        </svg>
        <input
          type="text"
          data-workspace-search-input
          placeholder="Search workspaces… (name, repo, worktree)"
          .value=${manager.query}
          @input=${(e: Event) => this._onQueryInput(e, manager)}
          style="flex:1;min-width:0;background:transparent;border:none;outline:none;color:var(--text-primary,#ccc);font-size:12px;"
        />
        ${manager.query
          ? html`
              <button
                @click=${() => this._clearQuery(manager)}
                title="Clear search"
                style="flex-shrink:0;background:transparent;border:none;cursor:pointer;color:var(--text-secondary,#999);font-size:14px;line-height:1;padding:2px;"
              >✕</button>
            `
          : nothing}
      </div>
    `;
  }

  render(): TemplateResult {
    const name = workspaceFileService.activeWorkspaceName;
    const manager = this._manager;
    const open = this._open && manager;

    if (open && manager) {
      return html`
        <div
          style="position:absolute;top:4px;left:50%;transform:translateX(-50%);width:440px;height:min(70vh,560px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border-divider,#2d2d2d);border-radius:6px;background:var(--bg-primary,#1e1e1e);box-shadow:0 12px 32px rgba(0,0,0,0.45);-webkit-app-region:no-drag;"
        >
          ${this._searchBar(manager)}
          <div style="flex:1;min-height:0;overflow:hidden;">
            ${manager.render()}
          </div>
        </div>
      `;
    }

    return html`
      <div
        style="display:flex;align-items:center;gap:6px;width:260px;height:26px;padding:0 10px;box-sizing:border-box;border:1px solid var(--border-divider,#2d2d2d);border-radius:4px;background:var(--bg-secondary,#252526);cursor:pointer;user-select:none;white-space:nowrap;-webkit-app-region:no-drag;transition:background .1s;"
        title="Manage workspaces"
        @click=${this._toggleOpen}
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
        <svg width="12" height="12" viewBox="0 -960 960 960" fill="currentColor" style="flex-shrink:0;color:var(--text-secondary,#999)">
          <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
        </svg>
      </div>
    `;
  }
}

customElements.define("openp41ge-workspace-search", Openp41geWorkspaceSearch);
