/**
 * WorkspacesSystemTab — editor-area system tab that shows the active
 * .openp41ge-workspace file settings.
 *
 * Shows the workspace ID, file path (clickable to save as), data directory
 * (clickable to pick a new folder), and repos list.
 */

import { html, type TemplateResult } from "lit";
import type { EditorSystemTabController } from "../../controllers/types";
import { workspaceFileService } from "../../services/workspace-file-service";

export class WorkspacesSystemTab implements EditorSystemTabController {
  readonly id: string;
  readonly appType = "workspace-manager";
  readonly title = "Workspaces";

  constructor(tabId: string) {
    this.id = tabId;
  }

  private _emitUpdate(): void {
    document.dispatchEvent(new CustomEvent("workspaces-tab:update", { bubbles: true }));
  }

  private async _onSaveAs(): Promise<void> {
    // Ensure draft exists before Save As
    if (!workspaceFileService.activeData) {
      await workspaceFileService.ensureDraftExists();
    }
    await workspaceFileService.saveAs();
    this._emitUpdate();
  }

  private async _onChangeDataDir(): Promise<void> {
    const folder = await window.openp41ge.dialog.pickFolder();
    if (!folder) return;
    workspaceFileService.changeDataDir(folder);
    this._emitUpdate();
  }

  render(): TemplateResult {
    const data = workspaceFileService.activeData;
    const filePath = workspaceFileService.activeFilePath;

    if (!data) {
      return html`
        <div class="ws-wrap">
          <style>
            .ws-wrap { display:flex; flex-direction:column; height:100%; align-items:center; justify-content:center; gap:16px; padding:40px; }
            .ws-title { font-size:16px; font-weight:600; color:var(--text-primary,#ccc); }
            .ws-btn { padding:8px 20px; font-size:13px; border:1px solid var(--divider,#333); border-radius:4px; cursor:pointer; background:var(--bg-secondary,#1e1e1e); color:var(--text-primary,#ccc); }
            .ws-btn:hover { background:var(--bg-hover,#2a2a2a); }
            .ws-btn.primary { border-color:var(--accent,#007acc); color:var(--accent,#007acc); }
            .ws-btn.primary:hover { background:var(--accent,#007acc); color:#fff; }
          </style>
          <div class="ws-title">No workspace loaded</div>
          <button class="ws-btn primary" @click=${() => this._onSaveAs()}>New Workspace</button>
        </div>
      `;
    }

    const pencil = html`
      <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" style="flex-shrink:0;opacity:.5;">
        <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t27 18l55 56q12 12 17.5 26.5T792-600q0 15-5.5 29.5T769-544L242-17H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/>
      </svg>
    `;

    return html`
      <style>
        .ws-wrap { display:flex; flex-direction:column; height:100%; overflow-y:auto; }
        .ws-section { padding:10px 14px; }
        .ws-label { font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-secondary,#999); margin-bottom:4px; }
        .ws-value { font-size:13px; color:var(--text-primary,#ccc); word-break:break-all; }
        .ws-value.mono { font-family:monospace; font-size:12px; }
        .ws-clickable {
          display:inline-flex; align-items:center; gap:6px; padding:2px 6px; border-radius:4px;
          cursor:pointer; transition:background .1s;
        }
        .ws-clickable:hover { background:var(--bg-hover,rgba(128,128,128,.15)); }
        .ws-repo-item { display:flex; align-items:center; gap:6px; padding:4px 0; font-size:13px; color:var(--text-primary,#ccc); }
        .ws-repo-item::before { content:"•"; color:var(--text-secondary,#999); }
        .ws-worktrees { font-size:12px; color:var(--text-secondary,#999); }
        .ws-empty { padding:20px 14px; text-align:center; color:var(--text-secondary,#999); font-size:13px; }
      </style>
      <div class="ws-wrap">
        <div class="ws-section">
          <div class="ws-label">Workspace ID</div>
          <div class="ws-value mono">${data.id}</div>
        </div>
        <div class="ws-section">
          <div class="ws-label">File</div>
          <div class="ws-clickable ws-value mono" @click=${() => this._onSaveAs()} title="Save to a new location">
            ${filePath ?? "(not saved)"}
            ${pencil}
          </div>
        </div>
        <div class="ws-section">
          <div class="ws-label">Data Directory</div>
          <div class="ws-clickable ws-value mono" @click=${() => this._onChangeDataDir()} title="Choose a new data directory">
            ${data.dataDir}
            ${pencil}
          </div>
        </div>
        <div class="ws-section">
          <div class="ws-label">Repos (${data.repos.length})</div>
          ${data.repos.length === 0
            ? html`<div class="ws-empty">No repos configured.</div>`
            : data.repos.map(
                (r) => html`
                  <div class="ws-repo-item">
                    <span>${r.url}</span>
                    ${r.worktrees.length > 0
                      ? html`<span class="ws-worktrees">(${r.worktrees.join(", ")})</span>`
                      : ""}
                  </div>
                `,
              )}
        </div>
      </div>
    `;
  }
}
