/**
 * WorkspacesSystemTab — editor-area system tab for managing workspaces.
 *
 * Opens as a system tab in the editor area, overriding the grid.
 */

import { html, type TemplateResult } from "lit";
import type { EditorSystemTabController } from "../../controllers/types";

export class WorkspacesSystemTab implements EditorSystemTabController {
  readonly id: string;
  readonly appType = "workspace-manager";
  readonly title = "Workspaces";

  constructor(tabId: string) {
    this.id = tabId;
  }

  render(): TemplateResult {
    return html`
      <style>
        .workspace-manager {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 24px;
          overflow-y: auto;
          color: var(--text-primary, #ccc);
        }
        .workspace-manager h1 {
          font-size: 24px;
          font-weight: 300;
          margin: 0 0 24px 0;
          color: var(--text-primary, #ccc);
        }
        .workspace-manager p {
          color: var(--text-secondary, #999);
          margin: 0 0 16px 0;
        }
        .workspace-manager .actions {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
        }
        .workspace-manager button {
          padding: 8px 16px;
          border: 1px solid var(--divider, #333);
          background: var(--bg-secondary, #1e1e1e);
          color: var(--text-primary, #ccc);
          cursor: pointer;
          border-radius: 4px;
          font-size: 13px;
        }
        .workspace-manager button:hover {
          background: var(--bg-hover, #2a2a2a);
        }
        .workspace-manager .workspace-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .workspace-manager .workspace-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border: 1px solid var(--divider, #333);
          border-radius: 4px;
          background: var(--bg-secondary, #1e1e1e);
        }
        .workspace-manager .workspace-item:hover {
          background: var(--bg-hover, #2a2a2a);
        }
        .workspace-manager .workspace-name {
          font-size: 14px;
          font-weight: 500;
        }
      </style>
      <div class="workspace-manager">
        <h1>Workspaces</h1>
        <p>Manage your repositories and workspaces.</p>
        <div class="actions">
          <button @click=${this._onOpenProject}>Open Project</button>
          <button @click=${this._onCloneRepo}>Clone Repository</button>
        </div>
        <p>Recent projects will appear here.</p>
        <div class="workspace-list">
          <!-- Will be populated with workspace items -->
        </div>
      </div>
    `;
  }

  private async _onOpenProject(): Promise<void> {
    const path = await window.openp41ge.file.pickFolder();
    if (path) {
      // Could dispatch an event to open the folder
      const myWindowId = window.openp41ge.workspace.getWindowId();
      if (myWindowId) {
        window.openp41ge.workspace.dispatch("addScopedFolder", myWindowId, path);
      }
    }
  }

  private _onCloneRepo(): void {
    // Will implement clone dialog
    this.dispatchEvent(
      new CustomEvent("windowview:clone-repo", { bubbles: true, composed: true }),
    );
  }

  private dispatchEvent(event: CustomEvent): void {
    document.dispatchEvent(event);
  }
}
