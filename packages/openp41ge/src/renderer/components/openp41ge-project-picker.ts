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
import { appServices } from "../app";

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
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: var(--openp41ge-muted-text, #888);
      font-size: 14px;
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
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--openp41ge-accent-color, #4a9eff);
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.1s;
    }

    .detail-card .switch-btn:hover {
      background: rgba(74, 158, 255, 0.12);
    }

    .detail-card .active-badge {
      padding: 6px 12px;
      border: 1px solid var(--openp41ge-accent-color, #4a9eff);
      border-radius: 4px;
      background: transparent;
      color: var(--openp41ge-accent-color, #4a9eff);
      font-size: 12px;
      white-space: nowrap;
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

    .detail-card .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--openp41ge-muted-text, #888);
      margin: 20px 0 8px 0;
    }

    .detail-card .repo-tree {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .detail-card .repo-group {
      background: var(--openp41ge-hover-bg, #2a2a2a);
      border-radius: 6px;
      margin-bottom: 6px;
      padding: 6px 0;
    }

    .detail-card .repo-group:last-child {
      margin-bottom: 0;
    }

    .detail-card .repo-group .repo-header {
      font-size: 13px;
      color: var(--openp41ge-text-color, #f0f0f0);
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px 2px 10px;
    }

    .detail-card .repo-group .repo-icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      color: var(--openp41ge-accent-color, #4a9eff);
    }

    .detail-card .repo-group .worktree-list {
      list-style: none;
      margin: 0;
      padding: 2px 0 0 0;
    }

    .detail-card .repo-group .worktree-list li {
      position: relative;
      padding: 3px 0 3px 31px;
      font-size: 13px;
      color: var(--openp41ge-muted-text, #888);
    }

    /* Tree connector: vertical line */
    .detail-card .repo-group .worktree-list li::before {
      content: "";
      position: absolute;
      left: 17px;
      top: 0;
      bottom: 50%;
      width: 1px;
      background: var(--openp41ge-border-color, #444);
    }

    /* Tree connector: horizontal line */
    .detail-card .repo-group .worktree-list li::after {
      content: "";
      position: absolute;
      left: 17px;
      top: 50%;
      width: 10px;
      height: 1px;
      background: var(--openp41ge-border-color, #444);
    }

    /* Last worktree: vertical line stops at midpoint */
    .detail-card .repo-group .worktree-list li:last-child::before {
      bottom: 50%;
    }

    /* Only child: no vertical line */
    .detail-card .repo-group .worktree-list li:only-child::before {
      display: none;
    }

    /* First worktree when it's also the only one: no connector */
    .detail-card .repo-group .worktree-list li:first-child::before {
      top: 0;
    }

    .detail-card .repo-group .worktree-list .add-wt-item {
      cursor: pointer;
      color: var(--openp41ge-accent-color, #4a9eff);
      transition: background 0.1s;
      border-radius: 3px;
      display: inline-block;
      padding: 2px 4px;
      margin: 2px 0 2px 10px;
      font-size: 13px;
    }

    .detail-card .repo-group .worktree-list .add-wt-item::before,
    .detail-card .repo-group .worktree-list .add-wt-item::after {
      display: none;
    }

    .detail-card .repo-group .worktree-list .add-wt-item:hover {
      background: rgba(74, 158, 255, 0.12);
    }

    .detail-card .repo-tree .loading-text {
      color: var(--openp41ge-muted-text, #888);
      font-size: 12px;
    }

    .detail-card .add-repo-row {
      margin-top: 6px;
    }

    .detail-card .add-repo-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 6px;
      background: var(--openp41ge-hover-bg, #2a2a2a);
      color: var(--openp41ge-accent-color, #4a9eff);
      font-size: 13px;
      cursor: pointer;
      transition: background 0.1s;
    }

    .detail-card .add-repo-btn:hover {
      background: rgba(74, 158, 255, 0.15);
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
  @state() private _detailRepos: Array<{ name: string; worktrees: string[] }> | null = null;
  @state() private _loadingRepos = false;
  @state() private _searchText = "";
  @state() private _activeProjectName: string | null = null;
  @state() private _renaming = false;
  @state() private _renameValue = "";
  @state() private _loading = true;
  private _disconnected = false;

  connectedCallback(): void {
    super.connectedCallback();
    appServices.keyboardManager.pushModal();
    this._loadProjects();
    this.addEventListener("keydown", this._onKeyDown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    appServices.keyboardManager.popModal();
    this._disconnected = true;
    this.removeEventListener("keydown", this._onKeyDown);
    this._cleanupRename();
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
        this._loadingRepos = true;
        window.openp41ge.project.listRepos(currentProj.name).then((repos) => {
          if (!this._disconnected && this._detailProject?.name === currentProj.name) {
            this._detailRepos = repos;
            this._loadingRepos = false;
          }
        });
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

  private async _showDetails(project: ProjectInfo): Promise<void> {
    this._detailProject = project;
    this._detailRepos = null;
    this._loadingRepos = true;
    try {
      const repos = await window.openp41ge.project.listRepos(project.name);
      if (this._disconnected || this._detailProject?.name !== project.name) return;
      this._detailRepos = repos;
    } catch (err) {
      log.error("Failed to load repos:", err);
    }
    if (this._disconnected || this._detailProject?.name !== project.name) return;
    this._loadingRepos = false;
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

  private _addWorktree(repoName: string): void {
    if (!this._detailProject) return;
    log.info(`Add worktree to repo "${repoName}" in project "${this._detailProject.name}"`);
    this.dispatchEvent(
      new CustomEvent("project:add-worktree", {
        bubbles: true,
        composed: true,
        detail: { projectName: this._detailProject.name, repoName },
      }),
    );
  }

  private _addRepository(): void {
    if (!this._detailProject) return;
    log.info(`Add repository to project: ${this._detailProject.name}`);
    // Close the picker first, then signal the parent to handle repo addition
    this.dispatchEvent(
      new CustomEvent("project:add-repo", {
        bubbles: true,
        composed: true,
        detail: { name: this._detailProject.name },
      }),
    );
  }

  private _startRename(): void {
    if (!this._detailProject) return;
    this._renameValue = this._detailProject.name;
    this._renaming = true;
    // Focus the input after render
    requestAnimationFrame(() => {
      const input = this.shadowRoot?.querySelector(".rename-input") as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
      }
      // Listen for clicks outside the rename container
      const container = this.shadowRoot?.querySelector(".rename-container") as HTMLElement | null;
      if (container) {
        const onOutsideClick = (e: MouseEvent) => {
          if (!container.contains(e.target as Node)) {
            document.removeEventListener("mousedown", onOutsideClick, true);
            this._cancelRename();
          }
        };
        document.addEventListener("mousedown", onOutsideClick, true);
        // Store the cleanup function
        (this as any).__renameCleanup = () => document.removeEventListener("mousedown", onOutsideClick, true);
      }
    });
  }

  private async _confirmRename(): Promise<void> {
    if (!this._detailProject) return;
    const trimmed = this._renameValue.trim();
    if (!trimmed || trimmed === this._detailProject.name) {
      this._renaming = false;
      this._cleanupRename();
      return;
    }
    const result = await window.openp41ge.project.rename(this._detailProject.name, trimmed);
    if (result) {
      log.info(`Project renamed to "${trimmed}"`);
      // Update local state
      this._detailProject = { ...this._detailProject, name: trimmed, config: this._detailProject.config ? { ...this._detailProject.config, name: trimmed } : null };
      this._activeProjectName = this._activeProjectName === this._detailProject.name ? trimmed : this._activeProjectName;
      this._renaming = false;
      // Reload project list
      this._loadProjects();
      // Dispatch event so titlebar etc refresh
      document.dispatchEvent(new CustomEvent("project:changed", { bubbles: true, detail: { name: trimmed } }));
    } else {
      log.error(`Failed to rename project`);
    }
  }

  private _cancelRename(): void {
    this._renaming = false;
    this._cleanupRename();
  }

  private _cleanupRename(): void {
    const fn = (this as any).__renameCleanup;
    if (fn) {
      fn();
      (this as any).__renameCleanup = null;
    }
  }

  private _onRenameInput(e: Event): void {
    this._renameValue = (e.target as HTMLInputElement).value;
  }

  private _onRenameKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      this._confirmRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      this._cancelRename();
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
                      ${
                        this._renaming
                          ? html`
                              <div class="rename-container" style="display:flex;align-items:center;flex:1;gap:4px;padding:0 4px 0 8px;margin:-1px 0 0 -8px;box-shadow:0 0 0 1px var(--openp41ge-accent-color,#4a9eff);border-radius:4px;background:var(--openp41ge-input-bg,#2a2a2a);">
                                <input
                                  class="rename-input"
                                  type="text"
                                  .value=${this._renameValue}
                                  @input=${this._onRenameInput}
                                  @keydown=${this._onRenameKeyDown}
                                  style="flex:1;border:none;outline:none;background:transparent;color:var(--openp41ge-text-color,#e0e0e0);font-size:20px;font-weight:600;font-family:inherit;line-height:1.2;padding:4px 0;margin:-3px 0;"
                                />
                                <button
                                  title="Confirm"
                                  style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:4px;background:transparent;color:var(--openp41ge-accent-color,#4a9eff);cursor:pointer;transition:background 0.1s;"
                                  @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "rgba(74,158,255,0.12)"; }}
                                  @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                  @click=${this._confirmRename}
                                >
                                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
                                </button>
                                <button
                                  title="Cancel"
                                  style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:4px;background:transparent;color:var(--openp41ge-muted-text,#888);cursor:pointer;transition:background 0.1s;"
                                  @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
                                  @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                  @click=${this._cancelRename}
                                >
                                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 0 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06z"/></svg>
                                </button>
                              </div>
                            `
                          : html`
                              <div
                                style="display:flex;align-items:center;gap:4px;cursor:pointer;border-radius:4px;padding:2px 4px 2px 8px;margin-left:-8px;transition:background 0.1s;"
                                @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "var(--openp41ge-hover-bg,#333)"; }}
                                @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                @click=${this._startRename}
                                title="Rename project"
                              >
                                <h2 style="margin:0;font-size:20px;font-weight:600;line-height:1.2;color:var(--openp41ge-text-color,#e0e0e0);">${this._detailProject.name}</h2>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--openp41ge-muted-text,#888)" style="flex-shrink:0;">
                                  <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25a1.75 1.75 0 0 1 .445-.758l8.61-8.61zm1.414 1.06a.25.25 0 0 0-.354 0L3.245 11.315a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064l8.61-8.61a.25.25 0 0 0 0-.353l-1.086-1.086z"/>
                                </svg>
                              </div>
                            `
                      }
                      ${
                        !this._renaming && this._detailProject.name === this._activeProjectName
                          ? html`<span class="active-badge">Active</span>`
                          : !this._renaming ? html`
                              <button class="switch-btn" @click=${() => this._selectProject(this._detailProject!.name)}>
                                Switch to Project
                                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor" style="vertical-align:middle;margin-left:4px;"><path d="M280-160 80-360l200-200 56 57-103 103h287v80H233l103 103-56 57Zm400-240-56-57 103-103H440v-80h287L624-743l56-57 200 200-200 200Z"/></svg>
                              </button>
                            ` : ""
                      }
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

                    <div class="section-title">Repositories</div>
                    ${
                      this._loadingRepos
                        ? html`<div class="loading-text">Loading...</div>`
                        : this._detailRepos && this._detailRepos.length > 0
                          ? html`
                              <ul class="repo-tree">
                                ${this._detailRepos.map(
                                  (repo) => html`
                                    <li class="repo-group">
                                      <div class="repo-header">
                                        <svg class="repo-icon" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:middle;position:relative;top:-1px;">
                                          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                                        </svg>
                                        ${repo.name}
                                      </div>
                                      ${
                                        html`
                                          <ul class="worktree-list">
                                            ${repo.worktrees.map(
                                              (wt) => html`
                                                <li>${wt}</li>
                                              `,
                                            )}
                                            <li class="add-wt-item" @click=${() => this._addWorktree(repo.name)}>
                                              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:middle;margin-right:2px;position:relative;top:-1px;">
                                                <path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
                                              </svg>
                                              add worktree
                                            </li>
                                          </ul>
                                        `
                                      }
                                    </li>
                                  `,
                                )}
                              </ul>
                            `
                          : html`<div class="loading-text">No repositories</div>`
                    }

                    <div class="add-repo-row">
                      <div class="add-repo-btn" @click=${() => this._addRepository()}>
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:middle;margin-left:4px;position:relative;top:0;">
                          <path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
                        </svg>
                        add repository
                      </div>
                    </div>
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
