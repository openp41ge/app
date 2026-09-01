/**
 * <openp41ge-window-manager> — thin Window Manager window.
 *
 * Hosted by a window-manager window (windowType === "window-manager"). Shows a
 * draggable top bar and the list of open workspaces; selecting "Open" creates a
 * new workspace-bound window for that workspace.
 */

import { html, type TemplateResult } from "lit";
import { LitElement } from "lit";
import { state } from "lit/decorators.js";
import type { WorkspaceFileData } from "../../layout/types";
import { workspaceFileService } from "../services/workspace-file-service";

const isMac = (() => {
  try {
    return window.openp41ge?.platform === "darwin" || navigator.platform.startsWith("Mac");
  } catch {
    return false;
  }
})();

class Openp41geWindowManager extends LitElement {
  @state() private _workspaces: Array<{ filePath: string; data: WorkspaceFileData }> = [];
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
    this._loaded = true;
  }

  private _open(filePath: string): void {
    window.openp41ge.windowManager.openWorkspaceWindow(filePath);
  }

  render(): TemplateResult {
    return html`
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: var(--bg, #1e1e1e);
          color: var(--text-primary, #ddd);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        /* Draggable top bar (native drag region) with a macOS traffic-light spacer. */
        .wm-titlebar {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          height: 32px;
          padding-left: ${isMac ? 85 : 12}px;
          box-sizing: border-box;
          -webkit-app-region: drag;
          user-select: none;
          background: var(--bg-secondary, #252526);
          border-bottom: 1px solid var(--divider, #333);
        }
        .wm-title {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: var(--text-secondary, #999);
        }
        .wm-body {
          display: flex;
          flex: 1;
          flex-direction: column;
          padding: 20px;
          max-width: 640px;
          width: 100%;
          margin: 0 auto;
          box-sizing: border-box;
          overflow-y: auto;
        }
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
        .empty { color: var(--text-secondary, #777); font-size: 13px; }
      </style>
      <div class="wm-titlebar">
        <span class="wm-title">Workspaces</span>
      </div>
      <div class="wm-body">
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
