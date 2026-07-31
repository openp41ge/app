/**
 * WorkspacesSystemTab — editor-area system tab that shows the active
 * .openp41ge-workspace file settings.
 *
 * Shows the workspace ID, file/data dir action buttons, and repos list.
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

    return html`
      <style>
        .ws-wrap { display:flex; flex-direction:column; height:100%; overflow-y:auto; }
        .ws-section { display:flex; flex-direction:column; padding:6px 14px; }
        .ws-row { display:flex; align-items:center; gap:12px; min-height:28px; }
        .ws-label { font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-secondary,#999); flex-shrink:0; width:110px; }
        .ws-value { font-size:13px; color:var(--text-primary,#ccc); flex:1 1 auto; min-width:0; text-align:right; }
        .ws-value.mono { font-family:monospace; font-size:12px; }
        .ws-path {
          font-family:monospace; font-size:12px; color:var(--text-secondary,#999);
          text-align:right; word-break:break-all; padding:0 0 2px 122px;
        }
        .ws-act-btn {
          padding:2px 6px; font-size:12px; border:none; border-radius:3px;
          cursor:pointer; background:transparent; color:var(--text-secondary,#999);
          transition:background .1s;
        }
        .ws-act-btn:hover { background:var(--bg-hover,rgba(128,128,128,.15)); color:var(--text-primary,#ccc); }
        .ws-repo-item { display:flex; align-items:center; gap:6px; padding:4px 0; font-size:13px; color:var(--text-primary,#ccc); }
        .ws-repo-item::before { content:"•"; color:var(--text-secondary,#999); }
        .ws-worktrees { font-size:12px; color:var(--text-secondary,#999); }
        .ws-empty { color:var(--text-secondary,#999); font-size:13px; }
      </style>
      <div class="ws-wrap">
        <div class="ws-section">
          <div class="ws-row">
            <div class="ws-label">Workspace ID</div>
            <div class="ws-value mono">${data.id}</div>
          </div>
        </div>
        <div class="ws-section">
          <div class="ws-row">
            <div class="ws-label">File</div>
            <div class="ws-value">
              <button class="ws-act-btn" @click=${() => this._onSaveAs()}>Edit</button>
            </div>
          </div>
          <div class="ws-path">${filePath ?? "(not saved)"}</div>
        </div>
        <div class="ws-section">
          <div class="ws-row">
            <div class="ws-label">Data Dir</div>
            <div class="ws-value">
              <button class="ws-act-btn" @click=${() => this._onChangeDataDir()}>Edit</button>
            </div>
          </div>
          <div class="ws-path">${data.dataDir}</div>
        </div>
        <div class="ws-section">
          <div class="ws-label">Repos (${data.repos.length})</div>
          <div class="ws-value">
            ${data.repos.length === 0
              ? html`<span class="ws-empty">None</span>`
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
      </div>
    `;
  }
}
