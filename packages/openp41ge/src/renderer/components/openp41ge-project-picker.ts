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

import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { createLogger } from "openp41ge-logger";
import { GitService, IpcGitAdapter } from "openp41ge-git";
import { appServices } from "../app";

const log = createLogger("openp41ge-project-picker");
const gitService = new GitService(new IpcGitAdapter());

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

    .close-btn:focus {
      outline: none;
    }

    .close-btn:focus-visible {
      outline: 2px solid var(--openp41ge-accent-color, #4a9eff);
      outline-offset: 2px;
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
      position: relative;
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

    .project-list:focus {
      outline: none;
    }

    .project-list:focus-visible {
      outline: 2px solid var(--openp41ge-accent-color, #4a9eff);
      outline-offset: -2px;
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

    .project-item .active-tag {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(74, 158, 255, 0.2);
      color: var(--openp41ge-accent-color, #4a9eff);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex-shrink: 0;
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

    .detail-card .detail-delete-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--openp41ge-muted-text, #888);
      cursor: pointer;
      transition:
        color 0.1s,
        background 0.1s;
    }

    .detail-card .detail-delete-btn:focus {
      outline: none;
    }

    .detail-card .detail-delete-btn:focus-visible {
      outline: 2px solid var(--openp41ge-accent-color, #4a9eff);
      outline-offset: 2px;
    }

    .detail-card .detail-delete-btn:hover {
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

    .detail-card .switch-btn:focus {
      outline: none;
    }

    .detail-card .switch-btn:focus-visible {
      outline: 2px solid var(--openp41ge-accent-color, #4a9eff);
      outline-offset: 2px;
    }

    .detail-card .switch-btn:hover {
      background: rgba(74, 158, 255, 0.12);
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

    .detail-card .repo-group .worktree-list .add-wt-item:focus {
      outline: none;
    }

    .detail-card .repo-group .worktree-list .add-wt-item:focus-visible {
      outline: 2px solid var(--openp41ge-accent-color, #4a9eff);
      outline-offset: 2px;
      border-radius: 3px;
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
      display: inline-flex;
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

    .detail-card .add-repo-btn:focus {
      outline: none;
    }

    .detail-card .add-repo-btn:focus-visible {
      outline: 2px solid var(--openp41ge-accent-color, #4a9eff);
      outline-offset: -2px;
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

    @keyframes spinner-rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;

  @state() private _projects: ProjectInfo[] = [];
  @state() private _filteredProjects: ProjectInfo[] = [];
  @state() private _selectedIndex = 0;
  @state() private _detailProject: ProjectInfo | null = null;
  @state() private _detailRepos: Array<{ name: string; worktrees: string[] }> | null = null;
  @state() private _detailReposDropIndex: number = -1;
  @state() private _loadingRepos = false;
  @state() private _searchText = "";
  @state() private _activeProjectName: string | null = null;
  @state() private _renaming = false;
  @state() private _renameValue = "";
  @state() private _addingRepo = false;
  @state() private _repoUrl = "";
  @state() private _cloning = false;
  @state() private _clonePercent = 0;
  @state() private _loading = true;
  private _disconnected = false;

  connectedCallback(): void {
    super.connectedCallback();
    appServices.keyboardManager.pushModal();
    this._loadProjects();
    this.addEventListener("keydown", this._onKeyDown);
  }

  firstUpdated(): void {
    // Focus the search input on open
    requestAnimationFrame(() => {
      const input = this.shadowRoot?.querySelector(".search-row input") as HTMLInputElement | null;
      if (input) input.focus();
    });
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
      // Highlight the currently active project, or none if no active project
      const currentIdx = projects.findIndex((p) => p.name === currentName);
      this._selectedIndex = currentIdx >= 0 ? currentIdx : -1;
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
        this._showSelectedDetails();
        break;
      case "ArrowUp":
        e.preventDefault();
        this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
        this._scrollToSelected();
        this._showSelectedDetails();
        break;
      case "Enter":
        // If focus is inside a button or input, let the browser fire its click event
        const target = e.composedPath()[0] as HTMLElement;
        if (target?.closest?.("button, input")) return;
        e.preventDefault();
        if (this._searchText.trim() && this._selectedIndex === 0) {
          this._createAndSelect(this._searchText.trim());
        } else {
          const idx = this._searchText.trim() ? this._selectedIndex - 1 : this._selectedIndex;
          const project = this._filteredProjects[idx];
          if (project) {
            this._showDetails(project);
          }
        }
        break;
      case "Tab":
        if (this._shouldTrapFocus(e.shiftKey)) {
          e.preventDefault();
          this._trapFocus(e.shiftKey);
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

  private _showSelectedDetails(): void {
    // Skip the create-item (index 0 when search is non-empty)
    const idx = this._searchText.trim() ? this._selectedIndex - 1 : this._selectedIndex;
    const project = this._filteredProjects[idx];
    if (project && project.name !== this._detailProject?.name) {
      this._showDetails(project);
    }
  }

  private _getFocusable(): NodeListOf<HTMLElement> {
    const root = this.shadowRoot;
    if (!root) return document.createDocumentFragment().querySelectorAll('*') as any;
    return root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
  }

  private _shouldTrapFocus(shiftKey: boolean): boolean {
    const focusable = this._getFocusable();
    if (focusable.length === 0) return false;
    const active = this.shadowRoot?.activeElement;
    if (shiftKey) {
      return active === focusable[0];
    }
    return active === focusable[focusable.length - 1];
  }

  private _trapFocus(shiftKey: boolean): void {
    const focusable = this._getFocusable();
    if (focusable.length === 0) return;
    if (shiftKey) {
      focusable[focusable.length - 1].focus();
    } else {
      focusable[0].focus();
    }
  }

  private _scrollToSelected(): void {
    requestAnimationFrame(() => {
      const items = this.shadowRoot?.querySelectorAll(".project-item");
      if (items && items[this._selectedIndex]) {
        const el = items[this._selectedIndex] as HTMLElement;
        el.scrollIntoView({ block: "nearest" });
        el.focus({ preventScroll: true });
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

  private _clearSearch(): void {
    this._searchText = "";
    this._applyFilter();
    this._selectedIndex = this._activeProjectName ? 0 : -1;
  }

  private async _createAndSelect(name: string): Promise<void> {
    const exists = await window.openp41ge.project.exists(name);
    if (exists) {
      await this._activateProject(name);
      this._clearSearch();
      return;
    }
    const created = await window.openp41ge.project.create(name);
    if (created) {
      await this._activateProject(name);
      this._clearSearch();
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

  private async _activateProject(name: string): Promise<void> {
    log.info(`Activating project: ${name}`);
    const result = await window.openp41ge.project.switchTo(name);
    if (result.success) {
      window.__openp41geProjectName = name;
      this._activeProjectName = name;
      document.dispatchEvent(
        new CustomEvent("project:changed", {
          bubbles: true,
          detail: { name },
        }),
      );
      // Reload project list to reflect the new active state
      this._loadProjects();
    } else {
      log.error(`Failed to activate project "${name}": ${result.error}`);
    }
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
      // If the deleted project was active, switch back to a draft
      if (name === this._activeProjectName) {
        this._activeProjectName = null;
        this._selectedIndex = -1;
        window.__openp41geProjectName = undefined;
        await window.openp41ge.project.createDraft();
        document.dispatchEvent(new CustomEvent("project:changed", { bubbles: true, detail: { name: null } }));
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

  private _startAddRepo(): void {
    if (!this._detailProject) return;
    this._repoUrl = "";
    this._addingRepo = true;
    requestAnimationFrame(() => {
      const input = this.shadowRoot?.querySelector(".add-repo-input") as HTMLInputElement | null;
      if (input) {
        input.focus();
      }
    });
  }

  private async _confirmAddRepo(): Promise<void> {
    if (!this._detailProject) return;
    const url = this._repoUrl.trim();
    if (!url) return;

    this._cloning = true;
    this._clonePercent = 0;
    this._repoUrl = "";
    try {
      const session = gitService.clone(url);
      session.onProgress((progress) => {
        this._clonePercent = progress.percent;
      });
      const result = await session.promise;
      this._cloning = false;
      if (result.success) {
        log.info(`Repository cloned from ${url}`);
        // Reload repos in the detail panel
        if (this._detailProject) {
          const projName = this._detailProject.name;
          this._loadingRepos = true;
          window.openp41ge.project.listRepos(projName).then((repos) => {
            if (!this._disconnected && this._detailProject?.name === projName) {
              this._detailRepos = repos;
              this._loadingRepos = false;
            }
          });
        }
      } else {
        log.error(`Failed to clone: ${result.error}`);
      }
    } catch (err) {
      log.error("Clone failed:", err);
      this._cloning = false;
    }
  }

  private _cancelClone(): void {
    this._cloning = false;
    this._clonePercent = 0;
  }

  private _cancelAddRepo(): void {
    this._addingRepo = false;
    this._repoUrl = "";
  }

  private _onRepoUrlKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      this._confirmAddRepo();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this._cancelAddRepo();
    }
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
      e.stopPropagation();
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
    this._selectedIndex = this._activeProjectName ? 0 : -1;
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
    const trimmed = this._searchText.trim();
    const exactMatch = trimmed.length > 0 && this._projects.some((p) => p.name === trimmed);
    const showCreateOption = trimmed.length > 0 && !exactMatch;
    const createLabel = showCreateOption ? `Create "${trimmed}"` : "";
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

          <div class="project-list" tabindex="0">
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
                              ${isActive ? html`<span class="active-tag">Active</span>` : ""}
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
                              <div class="rename-container" style="display:flex;align-items:center;flex:1;gap:4px;padding:0 4px 0 8px;margin:0 0 0 -8px;box-shadow:0 0 0 1px var(--openp41ge-accent-color,#4a9eff);border-radius:4px;background:var(--openp41ge-input-bg,#2a2a2a);">
                                <input
                                  class="rename-input"
                                  type="text"
                                  .value=${this._renameValue}
                                  @input=${this._onRenameInput}
                                  @keydown=${this._onRenameKeyDown}
                                  style="flex:1;border:none;outline:none;background:transparent;color:var(--openp41ge-text-color,#e0e0e0);font-size:20px;font-weight:600;font-family:inherit;line-height:1.2;padding:2px 0;"
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
                        this._renaming ? ""
                          : html`
                              <div style="display:flex;align-items:center;gap:8px;">
                                ${
                                  this._detailProject.name !== this._activeProjectName
                                    ? html`
                                        <button class="switch-btn" @click=${() => this._activateProject(this._detailProject!.name)}>
                                          Activate
                                          <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor" style="vertical-align:middle;margin-left:4px;"><path d="M280-160 80-360l200-200 56 57-103 103h287v80H233l103 103-56 57Zm400-240-56-57 103-103H440v-80h287L624-743l56-57 200 200-200 200Z"/></svg>
                                        </button>
                                      ` : ""
                                }
                                <button
                                  class="detail-delete-btn"
                                  title="Delete project"
                                @click=${(e: Event) => this._deleteProject(e, this._detailProject!.name)}
                                >
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M2 4a1 1 0 0 1 1-1h2.5a1 1 0 0 1 .8-.4h3.4a1 1 0 0 1 .8.4H13a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a1 1 0 0 1-1-1V4zm2 1v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V5H4zm-1-1h10V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z"/></svg>
                                </button>
                              </div>
                            `
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
                              <ul class="repo-tree" style="position:relative;"
                                @dragenter=${(e: DragEvent) => {
                                  if (e.dataTransfer?.types.includes("application/x-openp41ge-project-repo")) e.preventDefault();
                                }}
                                @dragover=${(e: DragEvent) => {
                                  if (!e.dataTransfer?.types.includes("application/x-openp41ge-project-repo")) return;
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = "move";
                                  const items = this.shadowRoot?.querySelectorAll(".repo-tree .repo-group");
                                  let idx = this._detailRepos?.length ?? 0;
                                  if (items) {
                                    for (let i = 0; i < items.length; i++) {
                                      const rect = items[i].getBoundingClientRect();
                                      if (e.clientY < rect.top + rect.height / 2) { idx = i; break; }
                                    }
                                  }
                                  this._detailReposDropIndex = idx;
                                }}
                                @dragleave=${(e: DragEvent) => {
                                  const t = e.currentTarget as HTMLElement;
                                  const r = e.relatedTarget as Node | null;
                                  if (r && t.contains(r)) return;
                                  this._detailReposDropIndex = -1;
                                }}
                                @drop=${(e: DragEvent) => {
                                  this._detailReposDropIndex = -1;
                                  const dragName = e.dataTransfer?.getData("application/x-openp41ge-project-repo");
                                  if (!dragName || !this._detailRepos) return;
                                  e.preventDefault();
                                  const repos = [...this._detailRepos];
                                  const fromIdx = repos.findIndex((r) => r.name === dragName);
                                  if (fromIdx === -1) return;
                                  const items = this.shadowRoot?.querySelectorAll(".repo-tree .repo-group");
                                  let dropIndex = repos.length;
                                  if (items) {
                                    for (let i = 0; i < items.length; i++) {
                                      const rect = items[i].getBoundingClientRect();
                                      if (e.clientY < rect.top + rect.height / 2) { dropIndex = i; break; }
                                    }
                                  }
                                  if (fromIdx === dropIndex || dropIndex === fromIdx + 1) return;
                                  const [moved] = repos.splice(fromIdx, 1);
                                  repos.splice(dropIndex > fromIdx ? dropIndex - 1 : dropIndex, 0, moved);
                                  this._detailRepos = repos;
                                }}
                              >
                                ${this._detailRepos.map(
                                  (repo, idx) => html`
                                    <li class="repo-group" style="position:relative;">
                                      ${this._detailReposDropIndex === idx
                                        ? html`<div style="position:absolute;top:-4px;left:0;right:0;height:2px;background:#4a9eff;pointer-events:none;z-index:1;"></div>`
                                        : nothing}
                                      <div class="repo-header"
                                        draggable="true"
                                        @dragstart=${(e: DragEvent) => {
                                          e.dataTransfer!.setData("application/x-openp41ge-project-repo", repo.name);
                                          e.dataTransfer!.effectAllowed = "move";
                                        }}>
                                        <span style="display:inline-flex;align-items:center;color:#555;cursor:grab;margin-right:4px;">
                                          <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor">
                                            <path d="M360-160q-33 0-56.5-23.5T280-240q0-33 23.5-56.5T360-320q33 0 56.5 23.5T440-240q0 33-23.5 56.5T360-160Zm240 0q-33 0-56.5-23.5T520-240q0-33 23.5-56.5T600-320q33 0 56.5 23.5T680-240q0 33-23.5 56.5T600-160ZM360-400q-33 0-56.5-23.5T280-480q0-33 23.5-56.5T360-560q33 0 56.5 23.5T440-480q0 33-23.5 56.5T360-400Zm240 0q-33 0-56.5-23.5T520-480q0-33 23.5-56.5T600-560q33 0 56.5 23.5T680-480q0 33-23.5 56.5T600-400ZM360-640q-33 0-56.5-23.5T280-720q0-33 23.5-56.5T360-800q33 0 56.5 23.5T440-720q0 33-23.5 56.5T360-640Zm240 0q-33 0-56.5-23.5T520-720q0-33 23.5-56.5T600-800q33 0 56.5 23.5T680-720q0 33-23.5 56.5T600-640Z"/>
                                          </svg>
                                        </span>
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
                                            <li class="add-wt-item" tabindex="0" @click=${() => this._addWorktree(repo.name)} @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") { e.stopPropagation(); this._addWorktree(repo.name); } }}>
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
                              ${this._detailReposDropIndex === (this._detailRepos?.length ?? 0)
                                ? html`<li style="position:absolute;bottom:-4px;left:0;right:0;height:2px;background:#4a9eff;list-style:none;padding:0;margin:0;pointer-events:none;z-index:1;"></li>`
                                : nothing}
                              </ul>
                            `
                          : html`<div class="loading-text">No repositories</div>`
                    }

                    <div class="add-repo-row">
                      ${
                        this._cloning
                          ? html`
                              <div style="display:flex;align-items:center;height:32px;padding:0 10px;border-radius:6px;background:var(--openp41ge-hover-bg,#2a2a2a);font-size:12px;color:var(--openp41ge-muted-text,#888);gap:8px;">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="animation:spinner-rotate 0.8s linear infinite;">
                                  <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="28" stroke-dashoffset="10" stroke-linecap="round"/>
                                </svg>
                                <span style="flex:1;">Cloning... ${this._clonePercent > 0 ? html`${this._clonePercent}%` : ""}</span>
                                <span
                                  style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;flex-shrink:0;color:var(--openp41ge-muted-text,#888);"
                                  @click=${this._cancelClone}
                                  title="Cancel"
                                >✕</span>
                              </div>
                            `
                          : this._addingRepo
                            ? html`
                                <div style="display:flex;align-items:center;height:32px;padding:0 10px;border-radius:6px;background:var(--openp41ge-hover-bg,#2a2a2a);outline:2px solid var(--openp41ge-accent-color,#4a9eff);outline-offset:-2px;">
                                  <input
                                    class="add-repo-input"
                                    type="text"
                                    placeholder="git clone URL"
                                    .value=${this._repoUrl}
                                    @input=${(e: Event) => { this._repoUrl = (e.target as HTMLInputElement).value; }}
                                    @keydown=${this._onRepoUrlKeydown}
                                    style="flex:1;min-width:0;height:24px;background:transparent;border:none;color:var(--openp41ge-text-color,#e0e0e0);font-size:12px;outline:none;font-family:inherit;"
                                  />
                                  <span
                                    style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;flex-shrink:0;margin-left:4px;color:var(--openp41ge-accent-color,#4a9eff);"
                                    @click=${this._confirmAddRepo}
                                    @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "rgba(74,158,255,0.12)"; }}
                                    @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                    title="Confirm"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,8 7,11 12,4"/></svg>
                                  </span>
                                  <span
                                    style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;flex-shrink:0;color:var(--openp41ge-muted-text,#888);"
                                    @click=${this._cancelAddRepo}
                                    @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                                    @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                    title="Cancel"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>
                                  </span>
                                </div>
                              `
                            : html`
                                <div class="add-repo-btn" tabindex="0" @click=${this._startAddRepo} @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") { e.stopPropagation(); this._startAddRepo(); } }}>
                                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:middle;margin-left:4px;position:relative;top:0;">
                                    <path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
                                  </svg>
                                  add repository
                                </div>
                              `
                      }
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
