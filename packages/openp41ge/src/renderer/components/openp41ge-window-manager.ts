/**
 * <openp41ge-window-manager> — thin Window Manager window.
 *
 * Hosted by a window-manager window (windowType === "window-manager"). Lists the
 * open workspaces (from the workspace-file service) and the currently open
 * browser windows (from the main process). Selecting "Open" creates a new
 * workspace-bound window for that workspace.
 */

import { html, type TemplateResult } from "lit";
import { LitElement } from "lit";
import { state } from "lit/decorators.js";
import type { WorkspaceFileData } from "../../layout/types";
import { workspaceFileService } from "../services/workspace-file-service";

interface OpenWindowSummary {
  windowId: string;
  windowType: "workspace" | "window-manager";
  workspacePath: string | null;
}

class Openp41geWindowManager extends LitElement {
  @state() private _workspaces: Array<{ filePath: string; data: WorkspaceFileData }> = [];
  @state() private _openWindows: OpenWindowSummary[] = [];
  @state() private _loaded = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this._load();
  }

  private async _load(): Promise<void> {
    try {
      this._workspaces = await workspaceFileService.listWorkspaces();
    } catch {
      this._workspaces = [];
    }
    try {
      this._openWindows = await window.openp41ge.windowManager.openWindowSummaries();
    } catch {
      this._openWindows = [];
    }
    this._loaded = true;
  }

  private _open(filePath: string): void {
    window.openp41ge.windowManager.openWorkspaceWindow(filePath);
  }

  render(): TemplateResult {
    const workspaceWindows = this._openWindows.filter((w) => w.windowType === "workspace");
    const managerWindows = this._openWindows.filter((w) => w.windowType === "window-manager");

    return html`
      <style>
        :host {
          display: flex;
          height: 100vh;
          background: var(--bg, #1e1e1e);
          color: var(--text-primary, #ddd);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .wm-root {
          display: flex;
          flex: 1;
          flex-direction: column;
          padding: 20px;
          max-width: 720px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        h1 { font-size: 18px; margin: 0 0 18px; }
        h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-secondary, #999); margin: 22px 0 8px; }
        ul { list-style: none; margin: 0; padding: 0; }
        li.ws-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          margin-bottom: 6px;
          background: var(--bg-hover, #2a2d2e);
          border: 1px solid var(--divider, #333);
          border-radius: 6px;
        }
        .ws-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ws-meta { color: var(--text-secondary, #999); font-size: 12px; }
        button.wm-open {
          flex-shrink: 0;
          border: none;
          border-radius: 4px;
          background: var(--accent, #007acc);
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          cursor: pointer;
        }
        button.wm-open:hover { filter: brightness(1.1); }
        .win-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 12px; color: var(--text-secondary, #999); }
        .win-kind { text-transform: uppercase; font-size: 10px; color: var(--text-secondary, #777); }
        .empty { color: var(--text-secondary, #777); font-size: 13px; }
      </style>
      <div class="wm-root">
        <h1>Openp41ge — Workspaces</h1>

        <h2>Open windows${this._loaded ? "" : "…"}</h2>
        ${this._loaded && this._openWindows.length === 0
          ? html`<p class="empty">No windows open.</p>`
          : html`
              <ul>
                ${this._openWindows.map(
                  (w) => html`
                    <li class="win-row">
                      <span class="win-kind">${w.windowType}</span>
                      <span>${w.workspacePath ?? "(unbound)"}</span>
                    </li>
                  `,
                )}
              </ul>
            `}
        ${workspaceWindows.length
          ? html`<p class="empty">${workspaceWindows.length} workspace window(s), ${managerWindows.length} window manager.</p>`
          : ""}

        <h2>Workspaces</h2>
        ${this._loaded && this._workspaces.length === 0
          ? html`<p class="empty">No workspaces yet. Create one from an open workspace window.</p>`
          : html`
              <ul>
                ${this._workspaces.map((w) => {
                  const name = w.data.name?.trim() || "Unnamed";
                  const repos = w.data.repos?.length ?? 0;
                  return html`
                    <li class="ws-row">
                      <span class="ws-name">${name}</span>
                      <span class="ws-meta">${repos} ${repos === 1 ? "repo" : "repos"}</span>
                      <button class="wm-open" @click=${() => this._open(w.filePath)}>Open</button>
                    </li>
                  `;
                })}
              </ul>
            `}
      </div>
    `;
  }
}

customElements.define("openp41ge-window-manager", Openp41geWindowManager);
