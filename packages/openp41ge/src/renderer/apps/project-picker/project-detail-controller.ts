/**
 * ProjectDetailController — tab controller that renders a project detail card
 * inside the editor grid. Shows project metadata and an "Activate" button.
 *
 * Opened as a preview (unpinned) tab when clicking a project in the sidebar
 * project list. Gets replaced when another project is clicked.
 */

import { html, LitElement, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import { createLogger } from "openp41ge-logger";

const log = createLogger("project-detail-controller");

/* ── Web Component ─────────────────────────────────────────────────────── */

interface RepoItem {
  name: string;
  worktrees: string[];
}

export class Openp41geProjectDetail extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false }) projectName = "";

  private _isActive = false;
  private _projectConfig: Record<string, unknown> | null = null;
  private _repos: RepoItem[] = [];
  private _disconnected = false;

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    if (this.projectName) {
      await this._loadProjectInfo();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._disconnected = true;
  }

  private async _loadProjectInfo(): Promise<void> {
    try {
      const [allProjects, currentName, repos] = await Promise.all([
        window.openp41ge.project.listWithInfo(),
        window.openp41ge.project.current(),
        window.openp41ge.project.listRepos(this.projectName),
      ]);
      if (this._disconnected) return;
      const info = allProjects.find((p) => p.name === this.projectName);
      this._projectConfig = info?.config as Record<string, unknown> | null;
      this._isActive = currentName === this.projectName;
      this._repos = repos;
    } catch (err) {
      log.error("Failed to load project info:", err);
    }
    this.requestUpdate();
  }

  private _activate(): void {
    if (this._disconnected) return;
    window.openp41ge.project.switchTo(this.projectName);
  }

  private _delete(): void {
    if (this._disconnected) return;
    if (!confirm(`Delete project "${this.projectName}"?`)) return;
    window.openp41ge.project.delete(this.projectName).catch((err: Error) => {
      log.error("Failed to delete project:", err);
    });
  }

  // ── Swap reorder (up/down arrows) ─────────────────────────────────

  private _swap(idx: number, direction: -1 | 1): void {
    const target = idx + direction;
    if (target < 0 || target >= this._repos.length) return;
    const reordered = [...this._repos];
    const tmp = reordered[idx];
    reordered[idx] = reordered[target];
    reordered[target] = tmp;
    this._repos = reordered;
    this.requestUpdate();
    const order = this._repos.map((r) => r.name);
    window.openp41ge.project.setRepoOrder(this.projectName, order).catch((err) => {
      log.error("Failed to persist repo order:", err);
    });
  }

  private _moveUp(idx: number): void {
    this._swap(idx, -1);
  }

  private _moveDown(idx: number): void {
    this._swap(idx, 1);
  }

  private _renderRepoItems(): TemplateResult[] {
    return this._repos.map((repo, i) => {
      const canUp = i > 0;
      const canDown = i < this._repos.length - 1;
      return html`
        <li class="repo-card">
          <div class="repo-card-body">
            <div class="repo-card-content">
              <div class="repo-card-header">
                <span class="repo-name">${repo.name}</span>
                <span class="worktree-count">${repo.worktrees.length}</span>
              </div>
              ${repo.worktrees.length > 0
                ? html`<ul class="worktree-list">${repo.worktrees.map((wt) => html`<li class="worktree-item">${wt}</li>`)}</ul>`
                : ""}
            </div>
            <div class="repo-card-arrows">
              <button
                class="swap-btn"
                title="Move up"
                ?disabled=${!canUp}
                @click=${() => this._moveUp(i)}
              >&#x25B2;</button>
              <button
                class="swap-btn"
                title="Move down"
                ?disabled=${!canDown}
                @click=${() => this._moveDown(i)}
              >&#x25BC;</button>
            </div>
          </div>
        </li>
      `;
    });
  }

  render(): TemplateResult {
    const config = this._projectConfig;
    const created = config?.createdAt
      ? new Date(config.createdAt as string).toLocaleDateString()
      : null;
    const updated = config?.updatedAt
      ? new Date(config.updatedAt as string).toLocaleDateString()
      : null;
    const isDraft = config?.draft === true;

    return html`
      <style>
        .detail-wrapper {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          background: var(--bg-primary, #1e1e1e);
          box-sizing: border-box;
          overflow-y: auto;
        }
        /* ── Header row ─────────────────────────────── */
        .header-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 20px;
          border-bottom: 1px solid var(--border-divider, #333);
        }
        .project-name {
          flex: 1;
          min-width: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary, #e0e0e0);
          word-break: break-word;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .btn-activate {
          padding: 6px 16px;
          border-radius: 4px;
          border: none;
          font-size: 12px;
          line-height: 1;
          font-weight: 500;
          cursor: pointer;
          background: transparent;
          transition: background 0.1s;
          outline: none;
          flex-shrink: 0;
        }
        .btn-activate:focus-visible {
          outline: 2px solid var(--accent-color, #4a9eff);
          outline-offset: 2px;
        }
        .btn-activate.inactive {
          color: var(--accent-color, #4a9eff);
        }
        .btn-activate.inactive:hover {
          background: rgba(74, 158, 255, 0.12);
        }
        .btn-activate.active-project {
          color: var(--text-muted, #888);
          cursor: default;
        }
        .btn-delete {
          padding: 4px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
          background: transparent;
          color: var(--text-muted, #888);
          transition: color 0.1s, background 0.1s;
          outline: none;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-delete svg {
          fill: currentColor;
        }
        .btn-delete:hover {
          color: #e06c75;
          background: rgba(224, 108, 117, 0.12);
        }
        /* ── Metadata rows ──────────────────────────── */
        .meta-section {
          padding: 6px 20px;
          display: flex;
          gap: 24px;
          font-size: 12px;
          color: var(--text-muted, #888);
          border-bottom: 1px solid var(--border-divider, #333);
          flex-wrap: wrap;
        }
        .meta-item {
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .meta-item .label {
          color: var(--text-secondary, #aaa);
        }
        .draft-badge {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 3px;
          background: rgba(229, 192, 123, 0.15);
          color: #e5c07b;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        /* ── Repositories ───────────────────────────── */
        .repo-section {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 8px 16px;
        }
        .repo-header {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-muted, #888);
          padding: 4px 4px 8px 4px;
        }
        .repo-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: stretch;
        }
        .repo-card {
          background: var(--bg-secondary, #252526);
          border: 1px solid var(--border-divider, #333);
          border-radius: 6px;
          cursor: default;
          transition: background 0.1s, border-color 0.1s;
          user-select: none;
        }
        .repo-card:hover {
          border-color: rgba(128,128,128,0.3);
        }
        .repo-card-body {
          display: flex;
          align-items: stretch;
        }
        .repo-card-content {
          flex: 1;
          min-width: 0;
          padding: 10px 12px;
        }
        .repo-card-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .repo-name {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 15px;
          line-height: 22px;
          color: var(--text-primary, #e0e0e0);
        }
        .worktree-count {
          font-size: 10px;
          color: var(--text-muted, #888);
          flex-shrink: 0;
          padding: 1px 5px;
          border-radius: 3px;
          background: rgba(128,128,128,0.1);
        }
        .repo-card-arrows {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 0;
          flex-shrink: 0;
          border-left: 1px solid var(--border-divider, #333);
          padding: 4px;
        }
        .swap-btn {
          background: none;
          border: none;
          color: var(--text-muted, #666);
          cursor: pointer;
          padding: 4px;
          font-size: 10px;
          line-height: 1;
          border-radius: 4px;
          transition: color 0.1s, background 0.1s;
        }
        .swap-btn:hover {
          background: rgba(128,128,128,0.2);
        }
        .swap-btn:hover:not(:disabled) {
          color: var(--text-primary, #e0e0e0);
          background: rgba(128,128,128,0.3);
        }
        .swap-btn:disabled {
          color: var(--text-muted, #555);
          cursor: not-allowed;
          opacity: 0.35;
        }
        .worktree-list {
          margin: 6px 0 0 20px;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .worktree-item {
          font-size: 12px;
          color: var(--text-secondary, #aaa);
          padding: 2px 0;
          padding-left: 8px;
          border-left: 2px solid var(--border-divider, #333);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .no-repos {
          padding: 8px 4px;
          font-size: 12px;
          color: var(--text-muted, #888);
        }
      </style>

      <div class="detail-wrapper">
        <!-- Header: title + activate button -->
        <div class="header-row">
          <div class="project-name">${this.projectName}</div>
          <button
            class="btn-activate ${this._isActive
              ? "active-project"
              : "inactive"}"
            ?disabled=${this._isActive}
            @click=${this._activate}
          >
            ${this._isActive ? "Active" : "Activate"}
          </button>
          <button
            class="btn-delete"
            title="Delete project"
            @click=${this._delete}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
          </button>
        </div>

        <!-- Metadata -->
        <div class="meta-section">
          ${isDraft ? html`<span class="draft-badge">Draft</span>` : ""}
          ${created ? html`<div class="meta-item"><span class="label">Created</span><span>${created}</span></div>` : ""}
          ${updated ? html`<div class="meta-item"><span class="label">Modified</span><span>${updated}</span></div>` : ""}
          ${!created && !updated
            ? html`<span style="color:var(--text-muted,#888);font-size:12px;">Loading metadata...</span>`
            : ""}
        </div>

        <!-- Repositories -->
        <div class="repo-section">
          <div class="repo-header">Repositories</div>
          ${this._repos.length > 0
            ? html`
                <ul class="repo-list">
                  ${this._renderRepoItems()}
                </ul>
              `
            : html`<div class="no-repos">No repositories found.</div>`}
        </div>
      </div>
    `;
  }
}

customElements.define("openp41ge-project-detail", Openp41geProjectDetail);

/* ── Controller ────────────────────────────────────────────────────────── */

import { BaseController } from "../../controllers/base-controller";
import type { TabController } from "../../controllers/types";

export class ProjectDetailController extends BaseController implements TabController {
  private _element: Openp41geProjectDetail | null = null;
  private _pendingProjectName = "";

  constructor(tabId: string, appType: string) {
    super(tabId, appType);
  }

  mount(container: HTMLElement): void {
    this.container = container;
    container.style.cssText =
      "flex:1;min-height:0;overflow:hidden;background:var(--bg-primary,#1e1e1e);";

    const el = document.createElement("openp41ge-project-detail") as Openp41geProjectDetail;
    el.style.cssText = "width:100%;height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;";
    el.projectName = this._pendingProjectName || "";
    container.appendChild(el);
    this._element = el;
  }

  unmount(): void {
    if (this._element && this._element.parentNode) {
      this._element.remove();
    }
    this._element = null;
    this.container = null;
  }

  setVisible(_visible: boolean): void {
    // no special handling
  }

  snapshot(): Record<string, unknown> {
    return { projectName: this._element?.projectName ?? "" };
  }

  restore(state: Record<string, unknown>): void {
    const name = state?.projectName ? String(state.projectName) : "";
    this._pendingProjectName = name;
    if (this._element) {
      this._element.projectName = name;
    }
  }
}
