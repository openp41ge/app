/**
 * <openp41ge-workspace-search> — title-bar workspace switcher (VS Code style).
 *
 * Inactive: a pill showing the current workspace name — one glance lets you see
 * what's active. Click: the pill becomes a filter-as-you-type search over saved
 * workspaces; selecting one activates it. Handles workspaces only.
 */

import { LitElement, html, type nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { workspaceFileService } from "../services/workspace-file-service";
import type { WorkspaceFileData } from "../../layout/types";

interface WorkspaceEntry {
  filePath: string;
  data: WorkspaceFileData;
}

const BAR_H = 26;
const WORKSPACE_CHANGED_EVENT = "workspace-file-changed";

class Openp41geWorkspaceSearch extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @state() private _open = false;
  @state() private _query = "";
  @state() private _all: WorkspaceEntry[] = [];
  @state() private _results: WorkspaceEntry[] = [];
  @state() private _selectedIndex = -1;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener(WORKSPACE_CHANGED_EVENT, this._onWorkspaceChanged);
    document.addEventListener("pointerdown", this._onPointerDownOutside, true);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener(WORKSPACE_CHANGED_EVENT, this._onWorkspaceChanged);
    document.removeEventListener("pointerdown", this._onPointerDownOutside, true);
  }

  private _onWorkspaceChanged = (): void => {
    this.requestUpdate();
  };

  private _onPointerDownOutside = (e: Event): void => {
    if (!this._open) return;
    if (e.target instanceof Node && this.contains(e.target)) return;
    this._close();
  };

  private async _openSearch(): Promise<void> {
    if (this._all.length === 0) {
      let all: WorkspaceEntry[] = [];
      try {
        all = await workspaceFileService.listWorkspaces();
      } catch {
        all = [];
      }
      this._all = all;
    }
    this._query = "";
    this._results = this._filter(this._all, "");
    this._selectedIndex = this._results.length > 0 ? 0 : -1;
    this._open = true;
  }

  private _close(): void {
    this._open = false;
    this._query = "";
    this._selectedIndex = -1;
  }

  private _filter(all: WorkspaceEntry[], q: string): WorkspaceEntry[] {
    const query = q.trim().toLowerCase();
    if (!query) return all;
    return all.filter((e) => {
      const name = (e.data.name ?? "").toLowerCase();
      return name.includes(query) || e.filePath.toLowerCase().includes(query);
    });
  }

  private _displayName(entry: WorkspaceEntry): string {
    const name = entry.data.name?.trim();
    if (name) return name;
    const base = entry.filePath.split(/[\\/]/).pop() ?? entry.filePath;
    return base.replace(/\.openp41ge-workspace$/i, "").trim() || "Unnamed workspace";
  }

  private _onInput(e: InputEvent): void {
    const q = (e.target as HTMLInputElement).value;
    this._query = q;
    this._results = this._filter(this._all, q);
    this._selectedIndex = this._results.length > 0 ? 0 : -1;
  }

  private _onKeydown(e: KeyboardEvent): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (this._results.length > 0) {
        this._selectedIndex = (this._selectedIndex + 1) % this._results.length;
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (this._results.length > 0) {
        this._selectedIndex =
          (this._selectedIndex - 1 + this._results.length) % this._results.length;
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      this._activate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      this._close();
    }
  }

  private _activate(): void {
    const entry = this._results[this._selectedIndex];
    if (!entry) return;
    // Emits workspace-file-changed — the global bootstrap listener opens the
    // default sidebar tabs (Explorer/Git) as usual for any activation.
    workspaceFileService.activateWorkspace(entry);
    this._close();
  }

  updated(changed: Map<string | number | symbol, unknown>): void {
    if (changed.has("_open") && this._open) {
      const input = this.renderRoot.querySelector("input");
      input?.focus();
      input?.select();
    }
  }

  render(): TemplateResult | typeof nothing {
    return this._open ? this._renderActive() : this._renderInactive();
  }

  private _renderInactive(): TemplateResult {
    const name = workspaceFileService.activeWorkspaceName;
    return html`
      <div
        style="display:flex;align-items:center;gap:6px;height:${BAR_H}px;max-width:280px;padding:0 8px;box-sizing:border-box;border:1px solid var(--border-divider,#2d2d2d);border-radius:4px;background:var(--bg-secondary,#252526);cursor:pointer;user-select:none;white-space:nowrap;-webkit-app-region:no-drag;"
        title="Switch workspace"
        @click=${() => this._openSearch()}
      >
        <svg width="13" height="13" viewBox="0 -960 960 960" fill="currentColor" style="flex-shrink:0;color:var(--text-secondary,#999)">
          <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Z"/>
        </svg>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--text-primary,#ccc);">${name}</span>
        <svg width="11" height="11" viewBox="0 -960 960 960" fill="currentColor" style="flex-shrink:0;color:var(--text-secondary,#999)">
          <path d="M480-360 280-560h400l-200 200Z"/>
        </svg>
      </div>
    `;
  }

  private _renderActive(): TemplateResult {
    return html`
      <div style="position:relative;-webkit-app-region:no-drag;">
        <input
          style="width:280px;height:${BAR_H}px;box-sizing:border-box;border:1px solid var(--accent,#007acc);border-radius:4px;background:var(--bg-secondary,#252526);color:var(--text-primary,#ccc);font-size:12px;padding:0 8px;outline:none;"
          placeholder="Search workspaces…"
          .value=${this._query}
          @input=${this._onInput}
          @keydown=${this._onKeydown}
        />
        <div
          style="position:absolute;top:calc(100% + 4px);left:0;width:280px;max-height:320px;overflow-y:auto;background:var(--bg-primary,#1e1e1e);border:1px solid var(--border-divider,#2d2d2d);border-radius:4px;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:1000;"
        >
          ${this._results.length === 0
            ? html`<div style="padding:10px;font-size:12px;color:var(--text-secondary,#999);">No workspaces found</div>`
            : this._results.map(
                (entry, i) => html`
                  <div
                    style="display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;font-size:12px;background:${i === this._selectedIndex
                      ? "rgba(74,158,255,0.12)"
                      : "transparent"};color:${i === this._selectedIndex
                      ? "var(--text-primary,#ccc)"
                      : "var(--text-secondary,#999)"};"
                    @mouseenter=${() => {
                      this._selectedIndex = i;
                    }}
                    @click=${() => {
                      this._selectedIndex = i;
                      this._activate();
                    }}
                  >
                    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._displayName(entry)}</span>
                    <span style="flex-shrink:0;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--text-secondary,#777);">${entry.filePath}</span>
                  </div>
                `,
              )}
        </div>
      </div>
    `;
  }
}

customElements.define("openp41ge-workspace-search", Openp41geWorkspaceSearch);
