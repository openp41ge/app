/**
 * WorkspacesSystemTab — editor-area system tab that shows the active
 * .openp41ge-workspace file settings.
 *
 * Shows workspace ID, Edit/Reveal/Copy action buttons, and repos list.
 */

import { html, type TemplateResult } from "lit";
import type { EditorSystemTabController } from "../../controllers/types";
import { workspaceFileService } from "../../services/workspace-file-service";

export class WorkspacesSystemTab implements EditorSystemTabController {
  readonly id: string;
  readonly appType = "workspace-manager";
  readonly title = "Workspaces";

  /** Tracks which paths have been revealed by the user. */
  private _revealedPaths = new Set<string>();

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

  private _toggleReveal(key: string): void {
    if (this._revealedPaths.has(key)) {
      this._revealedPaths.delete(key);
    } else {
      this._revealedPaths.add(key);
    }
    this._emitUpdate();
  }

  private async _onCopy(e: MouseEvent, path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
      this._showButtonToast(e.target as HTMLElement, "Copied");
    } catch {
      // ignore
    }
  }

  /** Show a small toast element anchored to a button, auto-fades after 1.5s. */
  private _showButtonToast(anchor: HTMLElement, text: string): void {
    const rect = anchor.getBoundingClientRect();
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = `
      position:fixed;
      left:${rect.left + rect.width / 2}px;
      top:${rect.top}px;
      transform:translate(-50%,0);
      z-index:2147483646;
      padding:2px 8px;
      border-radius:4px;
      background:var(--bg-secondary,#1e1e1e);
      color:var(--text-primary,#ccc);
      font-size:11px;
      white-space:nowrap;
      opacity:0;
      transition:opacity .2s ease, transform .2s ease;
      pointer-events:none;
    `;
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translate(-50%,-28px)";
    });

    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translate(-50%,-20px)";
      setTimeout(() => el.remove(), 200);
    }, 1500);
  }

  render(): TemplateResult {
    const data = workspaceFileService.activeData;
    const filePath = workspaceFileService.activeFilePath;

    if (!data) return html`<div class="ws-wrap"></div>`;

    return html`
      <style>
        .ws-wrap { display:flex; flex-direction:column; height:100%; overflow-y:auto; padding:8px 0; }
        .ws-section { padding:6px 10px; margin:4px 8px; border-radius:6px; background:var(--bg-secondary,rgba(255,255,255,.04)); }
        .ws-row { display:flex; align-items:center; gap:12px; min-height:28px; }
        .ws-label { font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-secondary,#999); flex-shrink:0; width:110px; }
        .ws-value { font-size:13px; color:var(--text-primary,#ccc); flex:1 1 auto; min-width:0; text-align:right; }
        .ws-value.mono { font-family:monospace; font-size:12px; }
        .ws-actions { display:inline-flex; gap:2px; }
        .ws-path {
          font-family:monospace; font-size:12px; color:var(--text-secondary,#999);
          text-align:left; word-break:break-all; padding:2px 0 0;
        }
        .ws-path.hidden { display:none; }
        .ws-act-btn {
          padding:2px 6px; font-size:12px; border:none; border-radius:3px;
          cursor:pointer; background:transparent; color:var(--text-secondary,#999);
          transition:background .1s;
        }
        .ws-act-btn:hover { background:var(--bg-hover,rgba(128,128,128,.15)); color:var(--text-primary,#ccc); }
        .ws-act-btn.revealed { color:var(--accent,#007acc); }
        .ws-repo-item { display:flex; align-items:center; gap:6px; padding:4px 0; font-size:13px; color:var(--text-primary,#ccc); }
        .ws-repo-item::before { content:"•"; color:var(--text-secondary,#999); }
        .ws-worktrees { font-size:12px; color:var(--text-secondary,#999); }
        .ws-empty { color:var(--text-secondary,#999); font-size:13px; }
      </style>
      <div class="ws-wrap">
        <div class="ws-section">
          <div class="ws-row">
            <div class="ws-label">Workspace ID</div>
            <div class="ws-value">
              <span class="ws-actions">
                <button class="ws-act-btn" @click=${(e: MouseEvent) => this._onCopy(e, data.id)}>Copy</button>
              </span>
            </div>
          </div>
          <div class="ws-path">${data.id}</div>
        <div class="ws-section">
          <div class="ws-row">
            <div class="ws-label">File</div>
            <div class="ws-value">
              <span class="ws-actions">
                <button class="ws-act-btn" @click=${() => this._onSaveAs()}>Edit</button>
                <button class="ws-act-btn ${this._revealedPaths.has('file') ? 'revealed' : ''}" @click=${() => this._toggleReveal('file')}>Reveal</button>
                <button class="ws-act-btn" @click=${(e: MouseEvent) => this._onCopy(e, filePath ?? '')}>Copy</button>
              </span>
            </div>
          </div>
          <div class="ws-path ${this._revealedPaths.has('file') ? '' : 'hidden'}">${filePath ?? "(not saved)"}</div>
        </div>
        <div class="ws-section">
          <div class="ws-row">
            <div class="ws-label">Data Dir</div>
            <div class="ws-value">
              <span class="ws-actions">
                <button class="ws-act-btn" @click=${() => this._onChangeDataDir()}>Edit</button>
                <button class="ws-act-btn ${this._revealedPaths.has('dataDir') ? 'revealed' : ''}" @click=${() => this._toggleReveal('dataDir')}>Reveal</button>
                <button class="ws-act-btn" @click=${(e: MouseEvent) => this._onCopy(e, data.dataDir)}>Copy</button>
              </span>
            </div>
          </div>
          <div class="ws-path ${this._revealedPaths.has('dataDir') ? '' : 'hidden'}">${data.dataDir}</div>
        </div>
        <div class="ws-section">
          <div class="ws-row">
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
      </div>
    `;
  }
}
