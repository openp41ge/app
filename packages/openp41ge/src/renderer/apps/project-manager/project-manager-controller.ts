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
import { dispatch } from "../../app";

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
    container.innerHTML = `<div class="pm-loading" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">Loading project...</div>`;

    try {
      // Determine the project name — either from snapshot or current project
      if (!this._projectName) {
        this._projectName = window.__openp41geProjectName ?? "";
      }

      if (!this._projectName) {
        container.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">No project selected</div>';
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
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">Failed to load project</div>';
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
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">Project not found</div>';
      return;
    }

    const created = new Date(d.createdAt).toLocaleDateString();
    const modified = new Date(d.modifiedAt).toLocaleDateString();

    // Determine colors for repo/worktree text
    const repoColor = "#f0f0f0";
    const wtColor = "#888";

    container.innerHTML = `
      <div class="pm-scroll" style="flex:1;overflow-y:auto;padding:16px;">
        <!-- Header -->
        <div class="pm-header" style="margin-bottom:16px;">
          <div class="pm-name-row" style="display:flex;align-items:center;gap:8px;">
            <span class="pm-name" style="font-size:16px;font-weight:600;color:#eee;">${this._escapeHtml(d.name)}</span>
            ${
              this._renaming
                ? `
              <div class="pm-rename" style="display:flex;align-items:center;gap:4px;">
                <input id="pm-rename-input" type="text" value="${this._escapeHtml(d.name)}"
                  style="font-size:13px;padding:2px 6px;background:var(--bg-gutter);border:1px solid #4a9eff;border-radius:3px;color:#eee;outline:none;width:200px;" />
                <span id="pm-rename-confirm" style="cursor:pointer;color:#4a9eff;font-size:14px;font-weight:bold;">\u2713</span>
                <span id="pm-rename-cancel" style="cursor:pointer;color:#888;font-size:14px;">\u2715</span>
              </div>`
                : `<span id="pm-rename-btn" style="cursor:pointer;color:#888;font-size:13px;" title="Rename">\u270E</span>`
            }
            ${this._isDraft ? '<span style="font-size:11px;padding:1px 6px;border-radius:3px;background:#2a2a2a;color:#888;">draft</span>' : ""}
          </div>
          <div style="font-size:11px;color:#666;margin-top:4px;">
            Created ${created} &middot; Modified ${modified}
          </div>
        </div>

        <!-- Actions -->
        <div class="pm-actions" style="display:flex;gap:8px;margin-bottom:16px;">
          ${
            this._isDraft
              ? `<button id="pm-save-btn" style="padding:4px 12px;font-size:12px;border:none;border-radius:4px;background:#4a9eff;color:#fff;cursor:pointer;">Save Project</button>`
              : ""
          }
          <button id="pm-delete-btn" style="padding:4px 12px;font-size:12px;border:none;border-radius:4px;background:transparent;color:#e06c75;cursor:pointer;">Delete Project</button>
        </div>

        <!-- Repos -->
        <div class="pm-repos" style="margin-bottom:8px;">
          <div style="font-size:12px;font-weight:600;color:#ccc;margin-bottom:8px;">Repositories</div>
          ${this._repos.length === 0 && !this._loadingRepos ? '<div style="font-size:12px;color:#666;padding:8px 0;">No repositories cloned for this project.</div>' : ""}
          ${this._repos
            .map(
              (repo, ri) => `
            <div class="pm-repo-group" style="background:var(--bg-gutter);border-radius:6px;margin-bottom:8px;overflow:hidden;">
              <div class="pm-repo-header" style="display:flex;align-items:center;height:32px;padding:0 12px;gap:8px;cursor:pointer;user-select:none;"
                data-repo-index="${ri}">
                <span style="width:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4L8 1L14 4V12L8 15L2 12V4Z" stroke="currentColor" stroke-width="1.2" fill="none"/>
                    <circle cx="8" cy="4" r="1.5" fill="#4a9eff"/>
                  </svg>
                </span>
                <span style="flex:1;font-size:13px;color:${repoColor};">${this._escapeHtml(repo.name)}</span>
                <span style="font-size:11px;color:#666;">${repo.worktrees.length} worktrees</span>
              </div>
              <!-- Worktrees -->
              <div class="pm-worktree-list" style="padding-left:12px;">
                ${repo.worktrees
                  .map(
                    (wt) => `
                  <div class="pm-wt-item" style="display:flex;align-items:center;height:28px;padding-left:28px;padding-right:12px;font-size:13px;color:${wtColor};gap:8px;">
                    <span style="flex:1;">${this._escapeHtml(wt.branch)}</span>
                    <span style="font-size:11px;color:#555;">${this._escapeHtml(wt.path)}</span>
                  </div>
                `,
                  )
                  .join("")}
                <!-- Add worktree inline -->
                <div class="pm-add-wt-row" data-repo="${this._escapeHtml(repo.name)}" style="display:flex;align-items:center;height:28px;padding-left:28px;padding-right:12px;cursor:pointer;font-size:12px;color:var(--accent-hover);"
                  @click=\${showAddWt}>
                  <span style="margin-right:4px;">+</span>
                  <span>add worktree</span>
                </div>
                <div class="pm-add-wt-input" style="display:none;align-items:center;height:28px;padding-left:28px;padding-right:12px;gap:4px;">
                  <input type="text" placeholder="branch name" style="flex:1;height:20px;font-size:12px;background:transparent;border:1px solid #444;border-radius:3px;color:#eee;padding:0 4px;outline:none;" />
                  <span class="pm-add-wt-confirm" style="cursor:pointer;color:#4a9eff;font-size:12px;">\u2713</span>
                  <span class="pm-add-wt-cancel" style="cursor:pointer;color:#888;font-size:12px;">\u2715</span>
                </div>
              </div>
            </div>
          `,
            )
            .join("")}
          ${this._loadingRepos ? '<div style="font-size:12px;color:#666;padding:8px 0;">Loading repos...</div>' : ""}
        </div>

        <!-- Add repo -->
        <div class="pm-add-repo" style="margin-top:8px;">
          ${
            this._cloning
              ? `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-gutter);border-radius:6px;">
              <span class="pm-spinner" style="width:14px;height:14px;border:2px solid #444;border-top-color:#4a9eff;border-radius:50%;flex-shrink:0;"></span>
              <span style="font-size:12px;color:#aaa;">Cloning... ${this._clonePercent}%</span>
              <div style="flex:1;height:4px;background:#333;border-radius:2px;overflow:hidden;">
                <div style="height:100%;width:${this._clonePercent}%;background:#4a9eff;border-radius:2px;transition:width 0.3s;"></div>
              </div>
            </div>`
              : `
            <div class="pm-add-repo-row" style="display:flex;align-items:center;height:32px;padding:0 12px;gap:8px;cursor:pointer;"
              id="pm-add-repo-row">
              <span style="font-size:12px;color:var(--accent-hover);">+ add repository</span>
            </div>
            <div class="pm-add-repo-input" style="display:none;align-items:center;height:32px;padding:0 12px;gap:4px;">
              <input id="pm-add-repo-url" type="text" placeholder="git clone URL" style="flex:1;height:22px;font-size:12px;background:var(--bg-gutter);border:1px solid #4a9eff;border-radius:3px;color:#eee;padding:0 6px;outline:none;" />
              <span id="pm-add-repo-confirm" style="cursor:pointer;color:#4a9eff;font-size:14px;font-weight:bold;">\u2713</span>
              <span id="pm-add-repo-cancel" style="cursor:pointer;color:#888;font-size:14px;">\u2715</span>
            </div>`
          }
          ${this._cloneError ? `<div style="font-size:11px;color:#e06c75;padding:4px 12px;">${this._escapeHtml(this._cloneError)}</div>` : ""}
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
        row.style.display = "none";
        const inputRow = container.querySelector(".pm-add-repo-input") as HTMLElement;
        if (inputRow) inputRow.style.display = "flex";
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
        row.style.display = "none";
        const inputRow = row.nextElementSibling as HTMLElement;
        if (inputRow) inputRow.style.display = "flex";
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
          inputRow.style.display = "none";
          if (row) row.style.display = "flex";
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
        dispatch("removeColumnTab", winId, this.tabId);
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
