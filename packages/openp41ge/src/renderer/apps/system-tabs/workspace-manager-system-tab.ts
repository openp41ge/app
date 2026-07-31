/**
 * WorkspacesSystemTab — editor-area system tab for managing workspaces.
 *
 * Opens as a system tab in the editor area, overriding the grid.
 * Shows an accordion of all workspaces with activate/delete actions.
 */

import { html, type TemplateResult } from "lit";
import type { EditorSystemTabController } from "../../controllers/types";

interface WorkspaceInfo {
  name: string;
  createdAt?: string;
  updatedAt?: string;
  draft?: boolean;
  isActive: boolean;
}

export class WorkspacesSystemTab implements EditorSystemTabController {
  readonly id: string;
  readonly appType = "workspace-manager";
  readonly title = "Workspaces";

  private _workspaces: WorkspaceInfo[] = [];
  private _expanded: Set<string> = new Set();
  private _loaded = false;
  private _showNewInput = false;
  private _newName = "";

  constructor(tabId: string) {
    this.id = tabId;
    // Start loading immediately
    this._loadWorkspaces();
  }

  private async _loadWorkspaces(): Promise<void> {
    try {
      const [currentName, items] = await Promise.all([
        window.openp41ge.project.current(),
        window.openp41ge.project.listWithInfo(),
      ]);
      this._workspaces = items.map((item) => ({
        name: item.name,
        createdAt: item.config?.createdAt,
        updatedAt: item.config?.updatedAt,
        draft: item.config?.draft ?? false,
        isActive: item.name === currentName,
      }));
      this._loaded = true;
    } catch {
      this._loaded = true;
    }
    this._requestUpdate();
  }

  private _toggleExpanded(name: string): void {
    if (this._expanded.has(name)) {
      this._expanded.delete(name);
    } else {
      this._expanded.add(name);
    }
    this._requestUpdate();
  }

  private _requestUpdate(): void {
    document.dispatchEvent(new CustomEvent("workspaces-tab:update", { bubbles: true }));
  }

  render(): TemplateResult {
    if (!this._loaded) {
      return html`<div class="workspaces-wrap"><div class="empty-state">Loading...</div></div>`;
    }

    const activeName = this._workspaces.find((w) => w.isActive)?.name;

    return html`
      <style>
        .workspaces-wrap {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow-y: auto;
        }
        .workspaces-header {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 6px 12px;
          border-bottom: 1px solid var(--divider, #333);
          flex-shrink: 0;
        }
        .workspaces-header button {
          padding: 3px 8px;
          font-size: 12px;
          border: 1px solid var(--divider, #333);
          border-radius: 3px;
          cursor: pointer;
          background: var(--bg-secondary, #1e1e1e);
          color: var(--text-primary, #ccc);
          white-space: nowrap;
        }
        .workspaces-header button:hover {
          background: var(--bg-hover, #2a2a2a);
        }
        .new-input-row {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-bottom: 1px solid var(--divider, #333);
          flex-shrink: 0;
        }
        .new-input-row input {
          flex: 1;
          padding: 4px 8px;
          font-size: 13px;
          border: 1px solid var(--divider, #333);
          border-radius: 3px;
          background: var(--bg-primary, #252526);
          color: var(--text-primary, #ccc);
          outline: none;
        }
        .new-input-row input:focus {
          border-color: var(--accent, #007acc);
        }
        .new-input-row button {
          padding: 4px 10px;
          font-size: 12px;
          border: 1px solid var(--divider, #333);
          border-radius: 3px;
          cursor: pointer;
          background: var(--bg-secondary, #1e1e1e);
          color: var(--text-primary, #ccc);
          white-space: nowrap;
        }
        .new-input-row button:hover {
          background: var(--bg-hover, #2a2a2a);
        }
        .new-input-row button.primary {
          border-color: var(--accent, #007acc);
          color: var(--accent, #007acc);
        }
        .new-input-row button.primary:hover {
          background: var(--accent, #007acc);
          color: #fff;
        }
        .workspaces-accordion {
          flex: 1;
        }
        .accordion-item {
          border-bottom: 1px solid var(--divider, #333);
        }
        .accordion-header {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          cursor: pointer;
          user-select: none;
          gap: 8px;
        }
        .accordion-name {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary, #ccc);
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .accordion-badge {
          font-size: 11px;
          padding: 1px 6px;
          border-radius: 3px;
          background: var(--accent, #007acc);
          color: #fff;
          margin-right: 4px;
        }
        .accordion-actions {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .accordion-actions button {
          padding: 4px 10px;
          font-size: 12px;
          border: 1px solid var(--divider, #333);
          border-radius: 3px;
          cursor: pointer;
          background: var(--bg-secondary, #1e1e1e);
          color: var(--text-primary, #ccc);
          white-space: nowrap;
        }
        .accordion-actions button:hover {
          background: var(--bg-hover, #2a2a2a);
        }
        .accordion-actions button.activate-btn {
          border: none;
          background: transparent;
          color: var(--accent, #007acc);
        }
        .accordion-actions button.activate-btn:hover {
          background: rgba(128, 128, 128, 0.1);
        }
        .accordion-actions button.delete-btn {
          padding: 4px;
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 3px;
        }
        .accordion-actions button.delete-btn:hover {
          color: #e81123;
          background: rgba(232, 17, 35, 0.1);
        }
        .accordion-body {
          padding: 0 12px 12px 34px;
          font-size: 13px;
          color: var(--text-secondary, #999);
          display: none;
        }
        .accordion-body.open {
          display: block;
        }
        .accordion-body p {
          margin: 4px 0;
        }
        .accordion-chevron {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          transition: transform 0.15s;
          color: var(--text-secondary, #999);
        }
        .accordion-chevron.open {
          transform: rotate(90deg);
        }
        .create-btn-wrap {
          padding: 12px;
        }
        .create-btn-wrap button {
          padding: 8px 16px;
          font-size: 13px;
          border: 1px dashed var(--divider, #333);
          border-radius: 4px;
          cursor: pointer;
          background: transparent;
          color: var(--text-secondary, #999);
          width: 100%;
        }
        .create-btn-wrap button:hover {
          background: var(--bg-hover, #2a2a2a);
          color: var(--text-primary, #ccc);
          border-style: solid;
        }
        .empty-state {
          padding: 40px 24px;
          text-align: center;
          color: var(--text-secondary, #999);
          font-size: 14px;
        }
      </style>
      <div class="workspaces-wrap">
        <!-- Header bar -->
        <div class="workspaces-header">
          <button @click=${() => this._showCreateInput()}>+ New</button>
        </div>
        <!-- Inline create input -->
        ${this._showNewInput ? html`
          <div class="new-input-row">
            <input
              type="text"
              placeholder="Workspace name..."
              .value=${this._newName}
              @input=${(e: InputEvent) => { this._newName = (e.target as HTMLInputElement).value; }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter") this._confirmCreate();
                if (e.key === "Escape") this._cancelCreate();
              }}
            />
            <button class="primary" @click=${() => this._confirmCreate()}>Create</button>
            <button @click=${() => this._cancelCreate()}>Cancel</button>
          </div>
        ` : ''}
        ${this._workspaces.length === 0 && !this._showNewInput
          ? html`<div class="empty-state">No workspaces yet.</div>`
          : html`
              <div class="workspaces-accordion">
                ${this._workspaces.map((ws) => this._renderAccordionItem(ws, activeName))}
              </div>
            `}
      </div>
    `;
  }

  private _renderAccordionItem(ws: WorkspaceInfo, activeName?: string): TemplateResult {
    const isExpanded = this._expanded.has(ws.name);

    return html`
      <div class="accordion-item">
        <div
          class="accordion-header"
          @click=${() => this._toggleExpanded(ws.name)}
        >
          <svg class="accordion-chevron ${isExpanded ? 'open' : ''}" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
          <span class="accordion-name">${ws.draft ? 'draft' : ws.name}</span>
          ${ws.isActive ? html`<span class="accordion-badge">active</span>` : ''}
          <div class="accordion-actions" @click=${(e: MouseEvent) => e.stopPropagation()}>
            ${ws.name !== activeName
              ? html`<button class="activate-btn" @click=${() => this._activate(ws.name)}>Activate</button>`
              : ''}
            <button class="delete-btn" @click=${() => this._delete(ws.name)} title="Delete">
              <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor">
                <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="accordion-body ${isExpanded ? 'open' : ''}">
          ${ws.draft ? html`<p>Draft workspace — save it to make permanent.</p>` : ''}
          ${ws.createdAt ? html`<p>Created: ${new Date(ws.createdAt).toLocaleDateString()}</p>` : ''}
          ${ws.updatedAt ? html`<p>Updated: ${new Date(ws.updatedAt).toLocaleDateString()}</p>` : ''}
        </div>
      </div>
    `;
  }

  private async _activate(name: string): Promise<void> {
    try {
      await window.openp41ge.project.switchTo(name);
      // Reload to update active state
      await this._loadWorkspaces();
      this._requestUpdate();
    } catch (err) {
      console.error("Failed to activate workspace:", err);
    }
  }

  private async _delete(name: string): Promise<void> {
    try {
      await window.openp41ge.project.delete(name);
      // Reload the list
      this._workspaces = this._workspaces.filter((w) => w.name !== name);
      this._expanded.delete(name);
      this._requestUpdate();
    } catch (err) {
      console.error("Failed to delete workspace:", err);
    }
  }

  private _showCreateInput(): void {
    this._showNewInput = true;
    this._newName = "";
    this._requestUpdate();
    // Focus the input after render
    requestAnimationFrame(() => {
      const input = document.querySelector(".new-input-row input") as HTMLInputElement | null;
      input?.focus();
    });
  }

  private _cancelCreate(): void {
    this._showNewInput = false;
    this._newName = "";
    this._requestUpdate();
  }

  private async _confirmCreate(): Promise<void> {
    const name = this._newName.trim();
    if (!name) return;
    this._showNewInput = false;
    this._newName = "";
    try {
      const created = await window.openp41ge.project.create(name);
      if (created) {
        await this._loadWorkspaces();
        this._requestUpdate();
      }
    } catch (err) {
      console.error("Failed to create workspace:", err);
    }
  }
}
