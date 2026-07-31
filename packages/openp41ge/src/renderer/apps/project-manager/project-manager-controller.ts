/**
 * ProjectManagerController — pane controller that renders project details,
 * repo tree, worktrees, and project management actions inside a tab.
 *
 * This replaces the right panel of the old modal project picker.
 * The left panel (project list + search) becomes the sidebar view.
 *
 * Data flow:
 *   mount() → loads project info → loads repos → renders repo tree
 *   Inline add-repo → clone with progress → reload
 *   Inline add-worktree → gitService.addWorktree → reload
 *   Rename → project.rename IPC → dispatch project:changed
 *   Delete → confirm modal → project.delete IPC → close tab
 *   Save Draft → project.saveDraftAs IPC → dispatch project:changed
 */

import { BaseController } from "../../controllers/base-controller";
import type { TabController } from "../../controllers/types";
import { GitService, IpcGitAdapter } from "openp41ge-git";
import { createLogger } from "openp41ge-logger";
import { toastService } from "../../components/openp41ge-toast";
import { showConfirmModal } from "../../components/openp41ge-confirm-modal";
import { emitEvent } from "../../app";

const log = createLogger("project-manager-controller");

interface RepoEntry {
  name: string;
  url: string;
  worktrees: Array<{ branch: string; path: string; exists: boolean }>;
}

export class ProjectManagerController extends BaseController implements TabController {
  private _gitService = new GitService(new IpcGitAdapter());
  private _projectName = "";
  private _repos: RepoEntry[] = [];
  private _loadingRepos = false;
  private _renaming = false;
  private _addRepoUrl = "";
  private _cloning = false;
  private _clonePercent = 0;
  private _cloneError = "";
  private _isDraft = false;
  private _detailProject: {
    name: string;
    createdAt: number;
    modifiedAt: number;
  } | null = null;
  private _disconnected = false;

  constructor(tabId: string, appType: string) {
    super(tabId, appType);
    // One-time style injection for CSS custom property driven dynamic values
    if (!document.getElementById("openp41ge-pm-styles")) {
      const s = document.createElement("style");
      s.id = "openp41ge-pm-styles";
      s.textContent = [
        ".pm-repo-color { color:var(--repo-col); }",
        ".pm-wt-color { color:var(--wt-col); }",
        ".pm-clone-bar { width:var(--clone-w); }",
        ".pm-hidden { display:none; }",
      ].join("\n");
      document.head.appendChild(s);
    }
  }

  mount(container: HTMLElement): void {
    this.container = container;
    container.style.cssText =
      "width:100%;height:100%;overflow:hidden;background:var(--bg-primary);display:flex;flex-direction:column;";

    this._disconnected = false;
    this._loadProjectInfo();
  }

  unmount(): void {
    this._disconnected = true;
    this.container = null;
  }

  setVisible(_visible: boolean): void {
    // no special handling
  }

  snapshot(): Record<string, unknown> {
    return { projectName: this._projectName };
  }

  restore(state: Record<string, unknown>): void {
    if (typeof state.projectName === "string") {
      this._projectName = state.projectName;
    }
  }

  private async _loadProjectInfo(): Promise<void> {
    const container = this.container;
    if (!container) return;

    // Show loading state
    container.innerHTML = `<div class="pm-loading flex items-center justify-center h-full text-muted text-xs">Loading project...</div>`;

    try {
      // Determine the project name — either from snapshot or current project
      if (!this._projectName) {
        this._projectName = window.__openp41geProjectName ?? "";
      }

      if (!this._projectName) {
        container.innerHTML =
          '<div class="flex items-center justify-center h-full text-muted text-xs">No project selected</div>';
        return;
      }

      // Check if it's a draft
      this._isDraft = await window.openp41ge.project.isDraft(this._projectName);

      // Load project info
      const projects = await window.openp41ge.project.listWithInfo();
      const proj = projects.find((p: { name: string }) => p.name === this._projectName);
      if (proj && proj.config) {
        this._detailProject = {
          name: proj.name,
          createdAt: new Date(proj.config.createdAt).getTime(),
          modifiedAt: new Date(proj.config.updatedAt).getTime(),
        };
      } else {
        this._detailProject = {
          name: this._projectName,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
      }

      // Load repos
      await this._loadRepos();
      this._render();
    } catch (err) {
      log.error("Failed to load project info:", err);
      if (container) {
        container.innerHTML =
          '<div class="flex items-center justify-center h-full text-muted text-xs">Failed to load project</div>';
      }
    }
  }

  private async _loadRepos(): Promise<void> {
    if (!this._projectName) return;
    this._loadingRepos = true;
    try {
      const repoModels = await window.openp41ge.project.listRepos(this._projectName);
      this._repos = await Promise.all(
        repoModels.map(async (rm: { name: string; worktrees: string[] }) => {
          let wts: Array<{ branch: string; path: string; exists: boolean }> = [];
          try {
            wts = await window.openp41ge.workspaceController.listWorktrees(rm.name);
          } catch {
            // no worktrees
          }
          return { name: rm.name, url: "", worktrees: wts };
        }),
      );
    } catch {
      this._repos = [];
    }
    this._loadingRepos = false;
  }

  // ── Render ──

  private _render(): void {
    const container = this.container;
    if (!container) return;
    const d = this._detailProject;
    if (!d) {
      container.innerHTML =
        '<div class="flex items-center justify-center h-full text-muted text-xs">Project not found</div>';
      return;
    }

    const created = new Date(d.createdAt).toLocaleDateString();
    const modified = new Date(d.modifiedAt).toLocaleDateString();

    // Determine colors for repo/worktree text
    const repoColor = "#f0f0f0";
    const wtColor = "#888";

    container.innerHTML = `
      <div class="pm-scroll flex-1 overflow-y-auto p-4">
        <!-- Header -->
        <div class="pm-header mb-4">
          <div class="pm-name-row flex items-center gap-2">
            <span class="pm-name text-base font-semibold text-[#eee]">${this._escapeHtml(d.name)}</span>
            ${
              this._renaming
                ? `
              <div class="pm-rename flex items-center gap-1">
                <input id="pm-rename-input" type="text" value="${this._escapeHtml(d.name)}"
                  class="text-13 px-1.5 py-0.5 bg-gutter border border-[#4a9eff] rounded text-[#eee] outline-none w-[200px]" />
                <span id="pm-rename-confirm" class="cursor-pointer text-[#4a9eff] text-sm font-bold">\u2713</span>
                <span id="pm-rename-cancel" class="cursor-pointer text-[#888] text-sm">\u2715</span>
              </div>`
                : `<span id="pm-rename-btn" class="cursor-pointer text-[#888] text-13" title="Rename">\u270E</span>`
            }
            ${this._isDraft ? '<span class="text-xs px-1.5 py-px rounded bg-[#2a2a2a] text-[#888]">draft</span>' : ""}
          </div>
          <div class="text-xs text-[#666] mt-1">
            Created ${created} &middot; Modified ${modified}
          </div>
        </div>

        <!-- Actions -->
        <div class="pm-actions flex gap-2 mb-4">
          ${
            this._isDraft
              ? `<button id="pm-save-btn" class="px-3 py-1 text-xs border-none rounded bg-[#4a9eff] text-white cursor-pointer">Save Project</button>`
              : ""
          }
          <button id="pm-delete-btn" class="px-3 py-1 text-xs border-none rounded bg-transparent text-[#e06c75] cursor-pointer">Delete Project</button>
        </div>

        <!-- Repos -->
        <div class="pm-repos mb-2">
          <div class="text-xs font-semibold text-[#ccc] mb-2">Repositories</div>
          ${this._repos.length === 0 && !this._loadingRepos ? '<div class="text-xs text-[#666] py-2">No repositories cloned for this project.</div>' : ""}
          ${this._repos
            .map(
              (repo, ri) => `
            <div class="pm-repo-group bg-gutter rounded mb-2 overflow-hidden">
              <div class="pm-repo-header flex items-center h-8 px-3 gap-2 cursor-pointer select-none"
                data-repo-index="${ri}">
                <span class="w-4 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4L8 1L14 4V12L8 15L2 12V4Z" stroke="currentColor" stroke-width="1.2" fill="none"/>
                    <circle cx="8" cy="4" r="1.5" fill="#4a9eff"/>
                  </svg>
                </span>
                <span class="pm-repo-color flex-1 text-13" style="--repo-col:${repoColor};">${this._escapeHtml(repo.name)}</span>
                <span class="text-xs text-[#666]">${repo.worktrees.length} worktrees</span>
              </div>
              <!-- Worktrees -->
              <div class="pm-worktree-list pl-3">
                ${repo.worktrees
                  .map(
                    (wt) => `
                  <div class="pm-wt-color pm-wt-item flex items-center h-7 pl-7 pr-3 text-13 gap-2" style="--wt-col:${wtColor};">
                    <span class="flex-1">${this._escapeHtml(wt.branch)}</span>
                    <span class="text-xs text-[#555]">${this._escapeHtml(wt.path)}</span>
                  </div>
                `,
                  )
                  .join("")}
                <!-- Add worktree inline -->
                <div class="pm-add-wt-row flex items-center h-7 pl-7 pr-3 cursor-pointer text-xs text-accent-hover" data-repo="${this._escapeHtml(repo.name)}"
                  @click=\${showAddWt}>
                  <span class="mr-1">+</span>
                  <span>add worktree</span>
                </div>
                <div class="pm-add-wt-input pm-hidden flex items-center h-7 pl-7 pr-3 gap-1"
                  <input type="text" placeholder="branch name" class="flex-1 h-5 text-xs bg-transparent border border-[#444] rounded text-[#eee] px-1 outline-none" />
                  <span class="pm-add-wt-confirm cursor-pointer text-[#4a9eff] text-xs">\u2713</span>
                  <span class="pm-add-wt-cancel cursor-pointer text-[#888] text-xs">\u2715</span>
                </div>
              </div>
            </div>
          `,
            )
            .join("")}
          ${this._loadingRepos ? '<div class="text-xs text-[#666] py-2">Loading repos...</div>' : ""}
        </div>

        <!-- Add repo -->
        <div class="pm-add-repo mt-2">
          ${
            this._cloning
              ? `
            <div class="flex items-center gap-2 px-3 py-2 bg-gutter rounded">
              <span class="pm-spinner w-[14px] h-[14px] border-2 border-[#444] border-t-[#4a9eff] rounded-full shrink-0 animate-[add-repo-spin_0.8s_linear_infinite]"></span>
              <span class="text-xs text-[#aaa]">Cloning... ${this._clonePercent}%</span>
              <div class="flex-1 h-1 bg-[#333] rounded overflow-hidden">
                <div class="pm-clone-bar h-full bg-[#4a9eff] rounded transition-[width] duration-300" style="--clone-w:${this._clonePercent}%;"></div>
              </div>
            </div>`
              : `
            <div class="pm-add-repo-row flex items-center h-8 px-3 gap-2 cursor-pointer"
              id="pm-add-repo-row">
              <span class="text-xs text-accent-hover">+ add repository</span>
            </div>
            <div class="pm-add-repo-input pm-hidden flex items-center h-8 px-3 gap-1"
              <input id="pm-add-repo-url" type="text" placeholder="git clone URL" class="flex-1 h-[22px] text-xs bg-gutter border border-[#4a9eff] rounded text-[#eee] px-1.5 outline-none" />
              <span id="pm-add-repo-confirm" class="cursor-pointer text-[#4a9eff] text-sm font-bold">\u2713</span>
              <span id="pm-add-repo-cancel" class="cursor-pointer text-[#888] text-sm">\u2715</span>
            </div>`
          }
          ${this._cloneError ? `<div class="text-xs text-[#e06c75] px-3 py-1">${this._escapeHtml(this._cloneError)}</div>` : ""}
        </div>
      </div>

      <!-- Inline spinner animation -->
      <style>
        @keyframes pm-spin { to { transform: rotate(360deg); } }
        .pm-spinner { animation: pm-spin 0.8s linear infinite; }
      </style>
    `;

    // Wire up events
    this._wireEvents(container);
  }

  private _wireEvents(container: HTMLElement): void {
    // Rename button
    const renameBtn = container.querySelector("#pm-rename-btn");
    if (renameBtn) {
      renameBtn.addEventListener("click", () => {
        this._renaming = true;
        this._render();
        // Focus the input after render
        requestAnimationFrame(() => {
          const input = container.querySelector("#pm-rename-input") as HTMLInputElement | null;
          if (input) {
            input.focus();
            input.select();
          }
        });
      });
    }

    // Rename confirm
    const renameConfirm = container.querySelector("#pm-rename-confirm");
    if (renameConfirm) {
      renameConfirm.addEventListener("click", () => this._confirmRename());
    }

    // Rename cancel
    const renameCancel = container.querySelector("#pm-rename-cancel");
    if (renameCancel) {
      renameCancel.addEventListener("click", () => {
        this._renaming = false;
        this._render();
      });
    }

    // Rename input Enter/Escape
    const renameInput = container.querySelector("#pm-rename-input") as HTMLInputElement | null;
    if (renameInput) {
      renameInput.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this._confirmRename();
        } else if (e.key === "Escape") {
          e.preventDefault();
          this._renaming = false;
          this._render();
        }
      });
    }

    // Save draft button
    const saveBtn = container.querySelector("#pm-save-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => this._saveDraft());
    }

    // Delete button
    const deleteBtn = container.querySelector("#pm-delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => this._deleteProject());
    }

    // Add repo row
    const addRepoRow = container.querySelector("#pm-add-repo-row");
    if (addRepoRow) {
      addRepoRow.addEventListener("click", () => {
        const row = addRepoRow as HTMLElement;
        row.classList.add("pm-hidden");
        const inputRow = container.querySelector(".pm-add-repo-input") as HTMLElement;
        if (inputRow) inputRow.classList.remove("pm-hidden");
        const input = container.querySelector("#pm-add-repo-url") as HTMLInputElement | null;
        if (input) setTimeout(() => input.focus(), 50);
      });
    }

    // Add repo confirm
    const addRepoConfirm = container.querySelector("#pm-add-repo-confirm");
    if (addRepoConfirm) {
      addRepoConfirm.addEventListener("click", () => this._confirmAddRepo());
    }

    // Add repo cancel
    const addRepoCancel = container.querySelector("#pm-add-repo-cancel");
    if (addRepoCancel) {
      addRepoCancel.addEventListener("click", () => {
        this._addRepoUrl = "";
        this._render();
      });
    }

    // Add repo URL Enter/Escape
    const addRepoInput = container.querySelector("#pm-add-repo-url") as HTMLInputElement | null;
    if (addRepoInput) {
      addRepoInput.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this._confirmAddRepo();
        } else if (e.key === "Escape") {
          e.preventDefault();
          this._addRepoUrl = "";
          this._render();
        }
      });
    }

    // Add worktree buttons (delegated)
    container.querySelectorAll(".pm-add-wt-row").forEach((el) => {
      el.addEventListener("click", (e) => {
        const row = e.currentTarget as HTMLElement;
        row.classList.add("pm-hidden");
        const inputRow = row.nextElementSibling as HTMLElement;
        if (inputRow) inputRow.classList.remove("pm-hidden");
        const input = inputRow.querySelector("input") as HTMLInputElement | null;
        if (input) setTimeout(() => input.focus(), 50);
      });
    });

    container.querySelectorAll(".pm-add-wt-confirm").forEach((el) => {
      el.addEventListener("click", (e) => {
        const inputRow = (e.currentTarget as HTMLElement).closest(
          ".pm-add-wt-input",
        ) as HTMLElement;
        const repoName = inputRow?.previousElementSibling?.getAttribute("data-repo") ?? "";
        const input = inputRow?.querySelector("input") as HTMLInputElement | null;
        const branch = input?.value?.trim() ?? "";
        if (branch && repoName) {
          this._doAddWorktree(repoName, branch);
        }
      });
    });

    container.querySelectorAll(".pm-add-wt-cancel").forEach((el) => {
      el.addEventListener("click", (e) => {
        const inputRow = (e.currentTarget as HTMLElement).closest(
          ".pm-add-wt-input",
        ) as HTMLElement;
        if (inputRow) {
          const row = inputRow.previousElementSibling as HTMLElement;
          inputRow.classList.add("pm-hidden");
          if (row) row.classList.remove("pm-hidden");
        }
      });
    });
  }

  // ── Actions ──

  private async _confirmRename(): Promise<void> {
    const container = this.container;
    if (!container) return;
    const input = container.querySelector("#pm-rename-input") as HTMLInputElement | null;
    if (!input) return;
    const newName = input.value.trim();
    if (!newName || newName === this._projectName) {
      this._renaming = false;
      this._render();
      return;
    }

    try {
      await window.openp41ge.project.rename(this._projectName, newName);
      this._projectName = newName;
      this._renaming = false;
      window.__openp41geProjectName = newName;
      document.dispatchEvent(new CustomEvent("project:changed", { detail: { name: newName } }));
      this._render();
    } catch (err) {
      log.error("Rename failed:", err);
      toastService.show("Failed to rename project", "error");
    }
  }

  private async _saveDraft(): Promise<void> {
    const container = this.container;
    if (!container) return;
    const input = container.querySelector("#pm-rename-input");
    let name = this._projectName;
    if (input) {
      const val = (input as HTMLInputElement).value.trim();
      if (val) name = val;
    }

    try {
      const success = await window.openp41ge.project.saveDraftAs(this._projectName, name);
      if (success) {
        this._isDraft = false;
        this._projectName = name;
        window.__openp41geProjectName = name;
        document.dispatchEvent(new CustomEvent("project:changed", { detail: { name } }));
        toastService.show(`Project saved as "${name}"`, "success");
        this._loadProjectInfo();
      } else {
        toastService.show("Failed to save project", "error");
      }
    } catch (err) {
      log.error("Save draft failed:", err);
      toastService.show("Failed to save project", "error");
    }
  }

  private async _deleteProject(): Promise<void> {
    const confirmed = await showConfirmModal({
      message: `Delete project "${this._projectName}"?`,
      detail: "This will remove the project configuration and close all associated tabs.",
      confirmLabel: "Delete",
      confirmStyle: "danger",
    });
    if (!confirmed) return;

    try {
      await window.openp41ge.project.delete(this._projectName);

      // If the deleted project was active, create a draft
      if (window.__openp41geProjectName === this._projectName) {
        await window.openp41ge.project.createDraft();
        const draftName = await window.openp41ge.project.current();
        window.__openp41geProjectName = draftName ?? undefined;
        document.dispatchEvent(new CustomEvent("project:changed", { detail: { name: draftName } }));
      }

      // Close this tab
      const winId = window.openp41ge.workspace.getWindowId();
      if (winId) {
        emitEvent("tab-remove-column", { windowId: winId, tabId: this.tabId });
      }
    } catch (err) {
      log.error("Delete project failed:", err);
      toastService.show("Failed to delete project", "error");
    }
  }

  private async _confirmAddRepo(): Promise<void> {
    const container = this.container;
    if (!container) return;
    const input = container.querySelector("#pm-add-repo-url") as HTMLInputElement | null;
    if (!input) return;
    const url = input.value.trim();
    if (!url) return;

    this._cloning = true;
    this._clonePercent = 0;
    this._cloneError = "";
    this._render();

    try {
      const session = this._gitService.clone(url);
      session.onProgress((p) => {
        this._clonePercent = p.percent;
        // Update progress bar without full re-render
        const bar = container.querySelector(".pm-add-repo > div > div > div") as HTMLElement | null;
        if (bar) bar.style.width = p.percent + "%";
      });
      const result = await session.promise;
      this._cloning = false;
      if (result.success) {
        toastService.show("Repository cloned", "success");
        await this._loadRepos();
        this._render();
      } else {
        this._cloneError = result.error ?? "Clone failed";
        this._render();
      }
    } catch (err) {
      this._cloning = false;
      this._cloneError = err instanceof Error ? err.message : String(err);
      this._render();
    }
  }

  private async _doAddWorktree(repoName: string, branch: string): Promise<void> {
    try {
      await this._gitService.addWorktree(repoName, branch);
      toastService.show(`Worktree "${branch}" created`, "success");
      await this._loadRepos();
      this._render();
    } catch (err) {
      toastService.show(err instanceof Error ? err.message : "Failed to create worktree", "error");
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
