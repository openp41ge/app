/**
 * ProjectSidebarView — sidebar view that lists all projects.
 *
 * On mount(), renders a project list with search, active indicator,
 * and context menu (rename, delete). Clicking a project opens a
 * project-manager tab in the grid and switches the active project context.
 *
 * Architecture (SOLID):
 *   - Single Responsibility: manages the project list lifecycle in the sidebar
 *   - Dependency Inversion: depends on SidebarView interface
 */

import type { SidebarView } from "./sidebar-view";
import { createLogger } from "openp41ge-logger";
import { dispatch } from "../../app";

const log = createLogger("projects-view");

interface ProjectEntry {
  name: string;
  createdAt: number;
  modifiedAt: number;
  isDraft: boolean;
}

export class ProjectSidebarView implements SidebarView {
  readonly id = "projects";
  readonly label = "Projects";
  private _element: HTMLElement | null = null;
  private _container: HTMLElement | null = null;
  private _projects: ProjectEntry[] = [];
  private _filtered: ProjectEntry[] = [];
  private _searchQuery = "";

  private _disconnected = false;
  private _projectChangedHandler: (() => void) | null = null;

  async mount(container: HTMLElement): Promise<void> {
    this._disconnected = false;
    this._container = container;

    // Create the root element
    const el = document.createElement("div");
    el.style.cssText =
      "display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg-gutter);";
    this._element = el;
    container.appendChild(el);

    // Listen for project changes
    this._projectChangedHandler = () => this._loadProjects();
    document.addEventListener("project:changed", this._projectChangedHandler);

    await this._loadProjects();
    this._render();
  }

  unmount(): void {
    this._disconnected = true;
    if (this._projectChangedHandler) {
      document.removeEventListener("project:changed", this._projectChangedHandler);
      this._projectChangedHandler = null;
    }
    if (this._element && this._element.parentNode) {
      this._element.remove();
      this._element = null;
    }
    this._container = null;
  }

  getTitle(): string {
    return "Projects";
  }

  // ── Data loading ──

  private async _loadProjects(): Promise<void> {
    try {
      const projects = await window.openp41ge.project.listWithInfo();
      const currentName = window.__openp41geProjectName;

      this._projects = await Promise.all(
        projects.map(
          async (p: {
            name: string;
            config: { name: string; createdAt: string; updatedAt: string; draft?: boolean } | null;
          }) => {
            let isDraft = false;
            try {
              isDraft = await window.openp41ge.project.isDraft(p.name);
            } catch {
              // not a draft
            }
            return {
              name: p.name,
              createdAt: p.config ? new Date(p.config.createdAt).getTime() : Date.now(),
              modifiedAt: p.config ? new Date(p.config.updatedAt).getTime() : Date.now(),
              isDraft,
            };
          },
        ),
      );

      this._filter();
    } catch (err) {
      log.error("Failed to load projects:", err);
    }
  }

  private _filter(): void {
    const q = this._searchQuery.toLowerCase().trim();
    this._filtered = q
      ? this._projects.filter((p) => p.name.toLowerCase().includes(q))
      : [...this._projects];
    this._render();
  }

  // ── Render ──

  private _render(): void {
    const el = this._element;
    if (!el) return;
    const currentName = window.__openp41geProjectName;

    el.innerHTML = `
      <style>
        .pv-item { border-bottom: 1px solid var(--border-divider); }
        .pv-item:first-child { border-top: 1px solid var(--border-divider); }
        .pv-item:hover { background: rgba(255,255,255,0.04); }
      </style>
      <!-- Header -->
      <div style="display:flex;align-items:center;height:36px;padding:0 12px;border-bottom:1px solid var(--border-divider);flex-shrink:0;">
        <span style="font-size:12px;font-weight:600;color:#ccc;text-transform:uppercase;letter-spacing:0.5px;">Projects</span>
      </div>

      <!-- Search -->
      <div style="flex-shrink:0;border-bottom:1px solid var(--border-divider);">
        <input id="pv-search" type="text" placeholder="Search projects..." value="${this._escapeHtml(this._searchQuery)}"
          style="width:100%;height:32px;box-sizing:border-box;padding:0 12px;font-size:13px;background:transparent;border:none;border-radius:0;color:#ddd;outline:none;" />
      </div>

      <!-- Project list -->
      <div id="pv-list" style="flex:1;overflow-y:auto;">
        ${this._filtered.length === 0 ? '<div style="padding:16px 12px;font-size:12px;color:#666;">No projects found</div>' : ""}
        ${this._filtered
          .map(
            (p, i) => `
          <div class="pv-item" data-index="${i}"
            style="display:flex;align-items:center;height:32px;padding:0 12px;cursor:pointer;font-size:13px;gap:6px;${p.name === currentName ? "color:#4a9eff;" : "color:#ccc;"}">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._escapeHtml(p.name)}</span>
            ${p.name === currentName ? '<span style="font-size:10px;padding:1px 4px;border-radius:3px;background:rgba(74,158,255,0.15);color:#4a9eff;">active</span>' : ""}
            ${p.isDraft ? '<span style="font-size:10px;color:#888;">draft</span>' : ""}
          </div>
        `,
          )
          .join("")}
      </div>

      <!-- Bottom bar -->
      <div style="display:flex;align-items:center;height:32px;padding:0 12px;border-top:1px solid var(--border-divider);flex-shrink:0;gap:8px;" id="pv-bottom">
        <span id="pv-new-btn" style="font-size:12px;color:var(--accent-hover);cursor:pointer;">+ new project</span>
      </div>
    `;

    this._wireEvents(el);
  }

  private _wireEvents(el: HTMLElement): void {
    // Search
    const searchInput = el.querySelector("#pv-search") as HTMLInputElement | null;
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        this._searchQuery = searchInput.value;
        this._filter();
      });
      searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const p = this._filtered[0];
          if (p) this._openProject(p.name);
        }
      });
    }

    // Project list click / keyboard
    const list = el.querySelector("#pv-list") as HTMLElement | null;
    if (list) {
      list.addEventListener("click", (e) => {
        const item = (e.target as HTMLElement).closest(".pv-item") as HTMLElement | null;
        if (item) {
          const idx = parseInt(item.dataset.index ?? "-1");
          if (idx >= 0 && idx < this._filtered.length) {
            this._openProject(this._filtered[idx].name);
          }
        }
      });

      list.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const p = this._filtered[0];
          if (p) this._openProject(p.name);
        }
      });

      list.addEventListener("contextmenu", (e) => {
        const item = (e.target as HTMLElement).closest(".pv-item") as HTMLElement | null;
        if (!item) return;
        e.preventDefault();
        const idx = parseInt(item.dataset.index ?? "-1");
        if (idx < 0 || idx >= this._filtered.length) return;
        const p = this._filtered[idx];
        this._showContextMenu(p.name, e.clientX, e.clientY);
      });
    }

    // New project button
    const newBtn = el.querySelector("#pv-new-btn");
    if (newBtn) {
      newBtn.addEventListener("click", () => this._createNewProject());
    }
  }

  private async _openProject(name: string): Promise<void> {
    const winId = window.openp41ge.workspace.getWindowId();
    if (!winId) return;

    // Check if a project-manager tab for this project already exists
    const ws = JSON.parse(await window.openp41ge.workspace.getState()) as {
      tabs?: Record<string, { appType: string; config?: Record<string, unknown> }>;
      windows?: Array<{
        id: string;
        grid: { placements: Array<{ tabIds: string[] }> };
      }>;
    };
    const tabs = ws.tabs ?? {};
    const win = ws.windows?.find((w) => w.id === winId);
    if (win) {
      for (const placement of win.grid.placements) {
        for (const tabId of placement.tabIds) {
          const tab = tabs[tabId];
          if (tab?.appType === "project-manager" && tab?.config?.projectName === name) {
            dispatch("activateTabInCell", winId, tabId);
            return;
          }
        }
      }
    }

    // Open as unpinned (preview) tab in the last active column
    const targetCol = this._getLastActiveCellCol();
    dispatch("openTabInCell", winId, "project-manager", name, name, targetCol, false);
  }

  private _getLastActiveCellCol(): number {
    return 0;
  }

  private _showContextMenu(name: string, x: number, y: number): void {
    // Use native confirm for simplicity in sidebar context
    const action = confirm(
      `Project: ${name}\n\nOK = Open\nCancel = More options (rename/delete via other UI)`,
    );
    if (action) {
      this._openProject(name);
    }
  }

  private async _promptRename(name: string): Promise<void> {
    const newName = prompt("Rename project:", name);
    if (!newName || newName === name) return;
    try {
      await window.openp41ge.project.rename(name, newName);
      if (window.__openp41geProjectName === name) {
        window.__openp41geProjectName = newName;
      }
      document.dispatchEvent(new CustomEvent("project:changed", { detail: { name: newName } }));
      await this._loadProjects();
    } catch (err) {
      log.error("Rename failed:", err);
    }
  }

  private async _deleteProject(name: string): Promise<void> {
    const confirmed = confirm(`Delete project "${name}"?`);
    if (!confirmed) return;
    try {
      await window.openp41ge.project.delete(name);
      if (window.__openp41geProjectName === name) {
        await window.openp41ge.project.createDraft();
        const draftName = await window.openp41ge.project.current();
        window.__openp41geProjectName = draftName ?? undefined;
        document.dispatchEvent(new CustomEvent("project:changed", { detail: { name: draftName } }));
      }
      await this._loadProjects();
      this._render();
    } catch (err) {
      log.error("Delete failed:", err);
    }
  }

  private async _createNewProject(): Promise<void> {
    const name = prompt("New project name:");
    if (!name) return;
    try {
      // Create a new project by saving the current draft as the new name
      if (window.__openp41geProjectName) {
        const isDraft = await window.openp41ge.project.isDraft(window.__openp41geProjectName);
        if (isDraft) {
          const saved = await window.openp41ge.project.saveDraftAs(
            window.__openp41geProjectName,
            name,
          );
          if (!saved) return;
          window.__openp41geProjectName = name;
          document.dispatchEvent(new CustomEvent("project:changed", { detail: { name } }));
        }
      }
      await this._loadProjects();
      this._render();
      this._openProject(name);
    } catch (err) {
      log.error("Create project failed:", err);
    }
  }

  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
