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
          flex-direction: column;
          gap: 4px;
          padding: 8px 10px;
          margin-bottom: 6px;
          background: var(--bg-hover, #2a2d2e);
          border: 1px solid var(--divider, #333);
          border-radius: 6px;
        }
        .ws-top {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
        }
        .ws-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ws-meta { color: var(--text-secondary, #999); font-size: 12px; text-align: left; }
        button.wm-open {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border: none;
          border-radius: 5px;
          background: transparent;
          padding: 0;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.12s ease, background 0.12s ease;
        }
        /* Show the open icon only when the row is hovered; grey square chip on hover. */
        .ws-row:hover .wm-open,
        .wm-open:focus-visible { opacity: 1; }
        button.wm-open:hover { background: var(--bg-active, #37373d); }
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
                      <div class="ws-top">
                        <span class="ws-name">${name}</span>
                        <button class="wm-open" @click=${() => this._open(w.filePath)} aria-label="Open workspace" title="Open workspace">
                          <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="#e3e3e3"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z"/></svg>
                        </button>
                      </div>
                      <div class="ws-meta">${repos} ${repos === 1 ? "repo" : "repos"}</div>
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
