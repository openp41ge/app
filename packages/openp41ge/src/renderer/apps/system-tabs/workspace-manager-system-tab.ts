/**
 * WorkspacesSystemTab — editor-area system tab that shows the active
 * .openp41ge-workspace file settings.
 *
 * Shows the file path, data directory (with a Change... button), repos list,
 * and Open/Save/Reload actions.
 */

import { html, type TemplateResult } from "lit";
import type { EditorSystemTabController } from "../../controllers/types";
import { workspaceFileService } from "../../services/workspace-file-service";
import { appState } from "../../services/app-state";

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

  private async _onOpen(): Promise<void> {
    await workspaceFileService.openDialog();
    this._emitUpdate();
  }

  private async _onSave(): Promise<void> {
    await workspaceFileService.save();
    this._emitUpdate();
  }

  private async _onSaveAs(): Promise<void> {
    await workspaceFileService.saveAs();
    this._emitUpdate();
  }

  private async _onReload(): Promise<void> {
    if (workspaceFileService.activeFilePath) {
      await workspaceFileService.loadPath(workspaceFileService.activeFilePath);
    }
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
          <button class="ws-btn primary" @click=${() => this._onOpen()}>Open Workspace</button>
        </div>
      `;
    }

    const hasWorkspaceFile = !!appState.activeWorkspaceFilePath;

    return html`
      <style>
        .ws-wrap { display:flex; flex-direction:column; height:100%; overflow-y:auto; }
        .ws-section { padding:10px 14px; border-bottom:1px solid var(--divider,#333); }
        .ws-label { font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-secondary,#999); margin-bottom:4px; }
        .ws-value { font-size:13px; color:var(--text-primary,#ccc); word-break:break-all; }
        .ws-value.mono { font-family:monospace; font-size:12px; }
        .ws-row { display:flex; align-items:center; gap:8px; }
        .ws-row .ws-value { flex:1; min-width:0; }
        .ws-btn { padding:3px 10px; font-size:12px; border:1px solid var(--divider,#333); border-radius:3px; cursor:pointer; background:var(--bg-secondary,#1e1e1e); color:var(--text-primary,#ccc); white-space:nowrap; flex-shrink:0; }
        .ws-btn:hover { background:var(--bg-hover,#2a2a2a); }
        .ws-btn.primary { border-color:var(--accent,#007acc); color:var(--accent,#007acc); }
        .ws-btn.primary:hover { background:var(--accent,#007acc); color:#fff; }
        .ws-actions { display:flex; gap:6px; padding:10px 14px; flex-wrap:wrap; }
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
          <div class="ws-value mono">${filePath ?? "(not saved)"}</div>
        </div>
        <div class="ws-section">
          <div class="ws-label">Data Directory</div>
          <div class="ws-row">
            <div class="ws-value mono">${data.dataDir}</div>
            <button class="ws-btn" @click=${() => this._onChangeDataDir()}>Change...</button>
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
        <div class="ws-actions">
          ${hasWorkspaceFile
            ? html`
                <button class="ws-btn" @click=${() => this._onOpen()}>Open...</button>
                <button class="ws-btn primary" @click=${() => this._onSave()}>Save</button>
                <button class="ws-btn" @click=${() => this._onReload()}>Reload</button>
                <button class="ws-btn" @click=${() => this._onSaveAs()}>Save As...</button>
              `
            : html`
                <button class="ws-btn primary" @click=${() => this._onOpen()}>Open Workspace</button>
              `}
        </div>
      </div>
    `;
  }
}
