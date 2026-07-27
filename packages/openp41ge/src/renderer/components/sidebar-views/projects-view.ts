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
  private _addingProject = false;

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

    // Save and restore focus on the search input — re-render replaces the DOM
    const el = this._element;
    const prevSearchEl = el?.querySelector("#pv-search") as HTMLInputElement | null;
    const prevFocus = prevSearchEl === document.activeElement;
    const prevCaret = prevFocus ? prevSearchEl!.selectionStart : null;

    this._render();

    if (prevFocus) {
      const newSearchEl = this._element?.querySelector("#pv-search") as HTMLInputElement | null;
      if (newSearchEl) {
        newSearchEl.focus();
        if (prevCaret !== null) {
          newSearchEl.setSelectionRange(prevCaret, prevCaret);
        }
      }
    }
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
        .pv-add-row:hover { background: #1e1e1e; }
      </style>
      <!-- Search -->
      <div style="flex-shrink:0;">
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
        ${
          this._addingProject
            ? `
          <div class="pv-add-input-row" style="display:flex;align-items:center;height:30px;padding-left:12px;padding-right:8px;font-size:12px;border-bottom:1px solid var(--border-divider);outline:2px solid #2a6fd1;outline-offset:-2px;">
            <input id="pv-add-input" type="text" placeholder="new project name"
              style="flex:1;min-width:0;height:24px;background:transparent;border:none;border-radius:0;color:#e0e0e0;font-size:11px;padding:0 6px;outline:none;font-family:inherit;margin-left:8px;" />
            <span id="pv-add-confirm"
              style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;flex-shrink:0;margin-left:4px;color:var(--text-secondary);"
              title="Confirm">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,8 7,11 12,4" /></svg>
            </span>
            <span id="pv-add-cancel"
              style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;flex-shrink:0;color:var(--text-secondary);"
              title="Cancel">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
            </span>
          </div>`
            : `
          <div class="pv-add-row" id="pv-add-row" style="display:flex;align-items:center;height:30px;padding-left:12px;padding-right:8px;cursor:pointer;user-select:none;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--border-divider);">
            <span style="width:10px;height:30px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="transform:translateX(-1px);display:inline-flex;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg></span></span>
            <span class="pv-add-label" style="margin-left:4px;color:var(--text-muted);flex:1;">add project</span>
          </div>`
        }
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

    // Add project row
    const addRow = el.querySelector("#pv-add-row");
    if (addRow) {
      addRow.addEventListener("click", () => {
        this._addingProject = true;
        this._render();
        requestAnimationFrame(() => {
          const input = this._element?.querySelector("#pv-add-input") as HTMLInputElement | null;
          if (input) input.focus();
        });
      });
    }

    // Add project confirm
    const addConfirm = el.querySelector("#pv-add-confirm");
    if (addConfirm) {
      addConfirm.addEventListener("click", () => this._confirmAddProject());
    }

    // Add project cancel
    const addCancel = el.querySelector("#pv-add-cancel");
    if (addCancel) {
      addCancel.addEventListener("click", () => {
        this._addingProject = false;
        this._render();
      });
    }

    // Add project input keyboard
    const addInput = el.querySelector("#pv-add-input") as HTMLInputElement | null;
    if (addInput) {
      addInput.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this._confirmAddProject();
        } else if (e.key === "Escape") {
          e.preventDefault();
          this._addingProject = false;
          this._render();
        }
      });
      // Blur cancel with delay
      addInput.addEventListener("blur", () => {
        setTimeout(() => {
          if (this._addingProject) {
            this._addingProject = false;
            this._render();
          }
        }, 150);
      });
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

  private async _confirmAddProject(): Promise<void> {
    const el = this._element;
    if (!el) return;
    const input = el.querySelector("#pv-add-input") as HTMLInputElement | null;
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;

    this._addingProject = false;

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
      this._render();
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
