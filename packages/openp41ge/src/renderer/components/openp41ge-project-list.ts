/**
 * <openp41ge-project-list> — simplified project list for the sidebar.
 *
 * Shows a full-width search bar and a list of project names with an "Active"
 * pill on the currently active project. Clicking a project opens a detail
 * panel as an editor tab.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { createLogger } from "openp41ge-logger";
import { dispatch } from "../app";

const log = createLogger("openp41ge-project-list");

interface ProjectInfo {
  name: string;
  config: { name: string; createdAt: string; updatedAt: string; draft?: boolean } | null;
}

export class Openp41geProjectList extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @state() private _projects: ProjectInfo[] = [];
  @state() private _filteredProjects: ProjectInfo[] = [];
  @state() private _searchText = "";
  @state() private _activeProjectName: string | null = null;
  @state() private _loading = true;
  private _disconnected = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._loadProjects();
    document.addEventListener("project:changed", this._onProjectChanged);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._disconnected = true;
    document.removeEventListener("project:changed", this._onProjectChanged);
  }

  private _onProjectChanged = (): void => {
    this._loadProjects();
  };

  private async _loadProjects(): Promise<void> {
    try {
      const [projects, currentName] = await Promise.all([
        window.openp41ge.project.listWithInfo(),
        window.openp41ge.project.current(),
      ]);
      if (this._disconnected) return;
      this._projects = projects;
      this._activeProjectName = currentName;
      this._applyFilter();
    } catch (err) {
      log.error("Failed to load projects:", err);
    }
    if (this._disconnected) return;
    this._loading = false;
  }

  private _applyFilter(): void {
    const q = this._searchText.toLowerCase().trim();
    if (!q) {
      this._filteredProjects = [...this._projects];
    } else {
      this._filteredProjects = this._projects.filter((p) => p.name.toLowerCase().includes(q));
    }
  }

  private _onSearchInput(e: Event): void {
    this._searchText = (e.target as HTMLInputElement).value;
    this._applyFilter();
  }

  private _onProjectClick(projectName: string): void {
    // Open a detail tab in the editor grid as an unpinned (preview) tab
    const winId = window.openp41ge.workspace.getWindowId();
    if (winId) {
      dispatch("openTabInCell", winId, "project-detail", projectName, undefined, 0, false, {
        projectName,
      });
    }
  }

  render(): TemplateResult {
    const trimmed = this._searchText.trim();
    const exactMatch = trimmed.length > 0 && this._projects.some((p) => p.name === trimmed);
    const showCreateOption = trimmed.length > 0 && !exactMatch;

    return html`
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        .search-row {
          flex-shrink: 0;
        }
        .search-row input {
          width: 100%;
          padding: 8px 12px;
          border: none;
          border-bottom: 1px solid var(--border-divider, #333);
          background: var(--bg-primary, #1e1e1e);
          color: var(--text-primary, #e0e0e0);
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
        }
        .search-row input:focus {
          border-bottom-color: var(--accent-color, #4a9eff);
        }
        .search-row input::placeholder {
          color: var(--text-muted, #888);
        }
        .project-list {
          flex: 1;
          overflow-y: auto;
          padding: 4px 0;
        }
        .project-item {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          cursor: pointer;
          transition: background 0.1s;
          user-select: none;
          font-size: 13px;
        }
        .project-item:hover {
          background: var(--hover-bg, rgba(128,128,128,0.1));
        }
        .project-item .name {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-primary, #e0e0e0);
        }
        .active-pill {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 3px;
          background: rgba(74, 158, 255, 0.2);
          color: var(--accent-color, #4a9eff);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          flex-shrink: 0;
          margin-left: 8px;
        }
        .create-item {
          color: var(--accent-color, #4a9eff);
        }
        .draft-tag {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 3px;
          background: rgba(229, 192, 123, 0.15);
          color: #e5c07b;
          flex-shrink: 0;
          margin-left: 8px;
        }
        .empty-state {
          text-align: center;
          color: var(--text-muted, #888);
          padding: 24px 16px;
          font-size: 13px;
        }
      </style>

      <div class="search-row">
        <input
          type="text"
          placeholder="Search or create project..."
          .value=${this._searchText}
          @input=${this._onSearchInput}
        />
      </div>

      <div class="project-list">
        ${this._loading
          ? html`<div class="empty-state">Loading...</div>`
          : this._filteredProjects.length === 0 && !showCreateOption
            ? html`<div class="empty-state">No projects yet.</div>`
            : html`
                ${showCreateOption
                  ? html`
                      <div
                        class="project-item create-item"
                        @click=${() => this._onProjectClick(this._searchText.trim())}
                      >
                        <span class="name">Create "${trimmed}"</span>
                      </div>
                    `
                  : ""}
                ${this._filteredProjects.map((project) => {
                  const isDraft = project.config?.draft === true;
                  const isActive = project.name === this._activeProjectName;
                  return html`
                    <div
                      class="project-item"
                      @click=${() => this._onProjectClick(project.name)}
                    >
                      <span class="name">${project.name}</span>
                      ${isDraft ? html`<span class="draft-tag">Draft</span>` : ""}
                      ${isActive ? html`<span class="active-pill">Active</span>` : ""}
                    </div>
                  `;
                })}
              `}
      </div>
    `;
  }
}

customElements.define("openp41ge-project-list", Openp41geProjectList);
