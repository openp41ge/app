/**
 * <openp41ge-project-picker> — full-size modal for selecting or creating a project.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │  Projects                          [✕]      │  ← top bar
 *   ├──────────────────┬───────────────────────────┤
 *   │  🔍 Search...    │                           │
 *   │                   │   Project Details         │
 *   │  ┌─────────────┐  │   ─────────────           │
 *   │  │ Project A   │  │   Name: Project A        │
 *   │  │ Project B   │  │   Created: Jan 1, 2025   │
 *   │  │ Project C   │  │   Modified: Jan 15, 2025 │
 *   │  └─────────────┘  │                           │
 *   │                   │                           │
 *   ├──────────────────┴───────────────────────────┤
 *   │  [Create "xxx"]                      [Delete] │
 *   └──────────────────────────────────────────────┘
 *
 * Dispatches:
 *   CustomEvent('project:selected', { detail: { name: string } }) — bubbles
 *   CustomEvent('project:dismissed') — when Escape is pressed or close clicked
 */

import { LitElement, html, css, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge-project-picker");

interface ProjectInfo {
  name: string;
  config: { name: string; createdAt: string; updatedAt: string; draft?: boolean } | null;
}

export class Openp41geProjectPicker extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      background: var(--openp41ge-bg-color, #1e1e1e);
      font-family: var(
        --openp41ge-font-family,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        sans-serif
      );
      color: var(--openp41ge-text-color, #e0e0e0);
    }

    /* ── Top bar ────────────────────────────────── */
    .topbar {
      display: flex;
      align-items: center;
      height: 35px;
      background: var(--bg-gutter, #252526);
      border-bottom: 1px solid var(--border-divider, #333);
      flex-shrink: 0;
      padding: 0 16px;
      -webkit-app-region: drag;
    }

    .close-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: var(--openp41ge-muted-text, #888);
      font-size: 18px;
      cursor: pointer;
      border-radius: 4px;
      -webkit-app-region: no-drag;
      transition:
        background 0.1s,
        color 0.1s;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--openp41ge-text-color, #e0e0e0);
    }

    /* ── Body: two columns ──────────────────────── */
    .body {
      flex: 1;
      display: flex;
      min-height: 0;
    }

    /* ── Left column: search + list ─────────────── */
    .left-panel {
      width: 340px;
      min-width: 280px;
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--border-divider, #333);
      background: var(--openp41ge-bg-color, #1e1e1e);
    }

    .search-row {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-divider, #333);
    }

    .search-row input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--openp41ge-border-color, #444);
      border-radius: 4px;
      background: var(--openp41ge-input-bg, #2a2a2a);
      color: var(--openp41ge-text-color, #e0e0e0);
      font-size: 13px;
      outline: none;
      box-sizing: border-box;
    }

    .search-row input:focus {
      border-color: var(--openp41ge-accent-color, #4a9eff);
    }

    .project-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px;
    }

    .project-item {
      display: flex;
      align-items: center;
      padding: 12px 12px;
      margin-bottom: 4px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.1s;
      user-select: none;
    }

    .project-item:last-child {
      margin-bottom: 0;
    }

    .project-item:hover {
      background: var(--openp41ge-hover-bg, #333);
      outline: 1px solid var(--openp41ge-accent-color, #4a9eff);
      outline-offset: -1px;
    }

    .project-item.selected {
      background: var(--openp41ge-hover-bg, #333);
    }

    .project-item.active {
      border-left: 3px solid var(--openp41ge-accent-color, #4a9eff);
      padding-left: 9px;
    }

    .project-item .name {
      flex: 1;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .project-item .icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .project-item .icon.folder {
      color: var(--openp41ge-accent-color, #4a9eff);
    }

    .project-item .icon.draft {
      color: #e5c07b;
    }

    .project-item .delete-btn {
      visibility: hidden;
      background: none;
      border: none;
      color: var(--openp41ge-muted-text, #888);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
      transition:
        color 0.1s,
        background 0.1s;
      user-select: none;
      flex-shrink: 0;
    }

    .project-item:hover .delete-btn {
      visibility: visible;
    }

    .project-item .delete-btn:hover {
      color: #e06c75;
      background: rgba(224, 108, 117, 0.15);
    }

    .project-item .draft-tag {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      background: rgba(229, 192, 123, 0.15);
      color: #e5c07b;
      flex-shrink: 0;
    }

    .create-item {
      color: var(--openp41ge-accent-color, #4a9eff);
    }

    .create-item .icon.create {
      color: #e5c07b;
    }

    /* ── Right column: details ──────────────────── */
    .right-panel {
      flex: 1;
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
      padding: 24px;
      background: var(--openp41ge-bg-color, #1e1e1e);
    }

    .detail-card {
      max-width: 400px;
      width: 100%;
    }

    .detail-card .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .detail-card .title-row h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--openp41ge-text-color, #e0e0e0);
    }

    .detail-card .switch-btn {
      padding: 6px 16px;
      border: none;
      border-radius: 4px;
      background: var(--openp41ge-accent-color, #4a9eff);
      color: #fff;
      font-size: 13px;
      cursor: pointer;
      transition: opacity 0.1s;
      white-space: nowrap;
    }

    .detail-card .switch-btn:hover {
      opacity: 0.9;
    }

    .detail-card .draft-badge {
      display: inline-block;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(229, 192, 123, 0.15);
      color: #e5c07b;
      margin-bottom: 16px;
    }

    .detail-card .detail-row {
      display: flex;
      align-items: baseline;
      padding: 5px 0;
      font-size: 13px;
    }

    .detail-card .detail-label {
      width: 90px;
      color: var(--openp41ge-muted-text, #888);
      flex-shrink: 0;
    }

    .detail-card .detail-value {
      color: var(--openp41ge-text-color, #e0e0e0);
    }

    .detail-card .empty-hint {
      color: var(--openp41ge-muted-text, #888);
      font-size: 14px;
    }

    /* ── Empty state ────────────────────────────── */
    .empty-state {
      text-align: center;
      color: var(--openp41ge-muted-text, #888);
      padding: 40px 16px;
      font-size: 13px;
    }
  `;

  @state() private _projects: ProjectInfo[] = [];
  @state() private _filteredProjects: ProjectInfo[] = [];
  @state() private _selectedIndex = 0;
  @state() private _detailProject: ProjectInfo | null = null;
  @state() private _searchText = "";
  @state() private _activeProjectName: string | null = null;
  @state() private _loading = true;
  private _disconnected = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._loadProjects();
    this.addEventListener("keydown", this._onKeyDown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._disconnected = true;
    this.removeEventListener("keydown", this._onKeyDown);
  }

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
      // Highlight the currently active project, or first if none matches
      const currentIdx = projects.findIndex((p) => p.name === currentName);
      this._selectedIndex = currentIdx >= 0 ? currentIdx : 0;
      // Show current project details by default
      const currentProj = projects.find((p) => p.name === currentName);
      if (currentProj) {
        this._detailProject = currentProj;
      }
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
      this._filteredProjects = this._projects.filter((p) =>
        p.name.toLowerCase().includes(q),
      );
    }
  }

  private get _listLength(): number {
    return this._searchText.trim() ? this._filteredProjects.length + 1 : this._filteredProjects.length;
  }

  private _onKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this._selectedIndex = Math.min(this._selectedIndex + 1, this._listLength - 1);
        this._scrollToSelected();
        break;
      case "ArrowUp":
        e.preventDefault();
        this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
        this._scrollToSelected();
        break;
      case "Enter":
        e.preventDefault();
        if (this._searchText.trim() && this._selectedIndex === 0) {
          this._createAndSelect(this._searchText.trim());
        } else {
          const idx = this._searchText.trim() ? this._selectedIndex - 1 : this._selectedIndex;
          const project = this._filteredProjects[idx];
          if (project) {
            this._selectProject(project.name);
          }
        }
        break;
      case "Escape":
        e.preventDefault();
        this._dismiss();
        break;
    }
  }

  private _showDetails(project: ProjectInfo): void {
    this._detailProject = project;
  }

  private _scrollToSelected(): void {
    requestAnimationFrame(() => {
      const items = this.shadowRoot?.querySelectorAll(".project-item");
      if (items && items[this._selectedIndex]) {
        items[this._selectedIndex].scrollIntoView({ block: "nearest" });
      }
    });
  }

  private _onInputKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (this._searchText.trim()) {
        this._createAndSelect(this._searchText.trim());
      }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Escape") {
      this._onKeyDown(e);
    }
  }

  private async _createAndSelect(name: string): Promise<void> {
    const exists = await window.openp41ge.project.exists(name);
    if (exists) {
      this._selectProject(name);
      return;
    }
    const created = await window.openp41ge.project.create(name);
    if (created) {
      this._selectProject(name);
    } else {
      log.error(`Failed to create project "${name}"`);
    }
  }

  private _selectProject(name: string): void {
    log.info(`Project selected: ${name}`);
    this.dispatchEvent(
      new CustomEvent("project:selected", {
        bubbles: true,
        composed: true,
        detail: { name },
      }),
    );
  }

  private async _deleteProject(e: Event, name: string): Promise<void> {
    e.stopPropagation();

    // Import and show the confirm modal
    await import("./openp41ge-confirm-modal");
    const modal = document.createElement("openp41ge-confirm-modal") as any;
    modal.title = "Delete Project";
    modal.message = `Delete "${name}"?`;
    modal.detail = "All project data including repositories and workspace state will be permanently deleted. This cannot be undone.";
    modal.confirmLabel = "Delete";
    modal._confirmStyle =
      "background:#e06c75;border:none;border-radius:4px;color:#fff;font-size:12px;padding:6px 16px;cursor:pointer;";
    document.body.appendChild(modal);

    const confirmed = await modal.waitForResult();
    modal.remove();
    if (!confirmed) return;

    const deleted = await window.openp41ge.project.delete(name);
    if (this._disconnected) return;
    if (deleted) {
      this._projects = this._projects.filter((p) => p.name !== name);
      this._applyFilter();
      if (this._detailProject?.name === name) {
        this._detailProject = null;
      }
      if (this._selectedIndex >= this._listLength) {
        this._selectedIndex = Math.max(0, this._listLength - 1);
      }
    } else {
      log.error(`Failed to delete project "${name}"`);
    }
  }

  private _dismiss(): void {
    this.dispatchEvent(
      new CustomEvent("project:dismissed", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onSearchInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    this._searchText = input.value;
    this._applyFilter();
    this._selectedIndex = 0;
  }

  private _formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  render(): TemplateResult {
    const showCreateOption = this._searchText.trim().length > 0;
    const createLabel = showCreateOption ? `Create "${this._searchText.trim()}"` : "";
    const listItems = this._filteredProjects;

    return html`
      <!-- Top bar -->
      <div class="topbar">
        <div style="flex:1;"></div>
        <button class="close-btn" @click=${this._dismiss} title="Close (Esc)">✕</button>
      </div>

      <!-- Body -->
      <div class="body">
        <!-- Left panel -->
        <div class="left-panel">
          <div class="search-row">
            <input
              type="text"
              placeholder="Search or create project..."
              .value=${this._searchText}
              @input=${this._onSearchInput}
              @keydown=${this._onInputKeyDown}
              autofocus
            />
          </div>

          <div class="project-list">
            ${
              this._loading
                ? html`<div class="empty-state">Loading...</div>`
                : listItems.length === 0 && !showCreateOption
                  ? html`<div class="empty-state">
                      No projects yet. Type a name above to create one.
                    </div>`
                  : html`
                      ${
                        showCreateOption
                          ? html`
                              <div
                                class="project-item create-item ${this._selectedIndex === 0 ? "selected" : ""}"
                                @click=${() => this._createAndSelect(this._searchText.trim())}

                              >
                                <span class="name">
                                  <svg
                                    class="icon create"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.5"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                  >
                                    <line x1="8" y1="2" x2="8" y2="14" />
                                    <line x1="2" y1="8" x2="14" y2="8" />
                                  </svg>
                                  ${createLabel}
                                </span>
                              </div>
                            `
                          : ""
                      }
                      ${listItems.map(
                        (project, i) => {
                          const idx = showCreateOption ? i + 1 : i;
                          const isDraft = project.config?.draft === true;
                          const isActive = project.name === this._activeProjectName;
                          return html`
                            <div
                              class="project-item ${this._selectedIndex === idx ? "selected" : ""} ${isActive ? "active" : ""}"
                              @click=${(e: Event) => { e.stopPropagation(); this._showDetails(project); }}
                            >
                              <span class="name">
                                <svg
                                  class="icon ${isDraft ? "draft" : "folder"}"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="1.5"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                >
                                  ${
                                    isDraft
                                      ? html`<path d="M8 2v12M2 8h12" stroke-linecap="round" />` /* plus icon for draft */
                                      : html`<path d="M2 4.5C2 3.67 2.67 3 3.5 3h2.59c.4 0 .78.16 1.06.44l.91.91c.28.28.67.44 1.06.44H14a1 1 0 011 1v5.7a1 1 0 01-1 1H3.5A1.5 1.5 0 012 11V4.5z" />`
                                  }
                                </svg>
                                ${project.name}
                              </span>
                              ${isDraft ? html`<span class="draft-tag">Draft</span>` : ""}
                              <button
                                class="delete-btn"
                                title="Delete project"
                                @click=${(e: Event) => this._deleteProject(e, project.name)}
                              >
                                ×
                              </button>
                            </div>
                          `;
                        },
                      )}
                    `
            }
          </div>
        </div>

        <!-- Right panel: project details -->
        <div class="right-panel">
          ${
            this._detailProject
              ? html`
                  <div class="detail-card">
                    <div class="title-row">
                      <h2>${this._detailProject.name}</h2>
                      <button class="switch-btn" @click=${() => this._selectProject(this._detailProject!.name)}>
                        Switch to Project
                      </button>
                    </div>
                    ${
                      this._detailProject.config?.draft
                        ? html`<div class="draft-badge">Draft</div>`
                        : ""
                    }
                    ${
                      this._detailProject.config
                        ? html`
                            <div class="detail-row">
                              <span class="detail-label">Created</span>
                              <span class="detail-value">${this._formatDate(this._detailProject.config.createdAt)}</span>
                            </div>
                            <div class="detail-row">
                              <span class="detail-label">Modified</span>
                              <span class="detail-value">${this._formatDate(this._detailProject.config.updatedAt)}</span>
                            </div>
                          `
                        : ""
                    }
                  </div>
                `
              : html`
                  <div class="empty-hint">
                    ${this._projects.length > 0
                      ? "Click a project to see details"
                      : ""}
                  </div>
                `
          }
        </div>
      </div>
    `;
  }
}

customElements.define("openp41ge-project-picker", Openp41geProjectPicker);
