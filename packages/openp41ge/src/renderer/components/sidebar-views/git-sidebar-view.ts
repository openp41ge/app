/**
 * GitSidebarView — wraps repo/worktree list using openp41ge-components.
 *
 * Shows repositories and their worktrees, similar to the explorer but
 * without the file-tree. Uses repo-row and worktree-row from the
 * components library.
 *
 * All visual styles use Tailwind utility classes (injected globally).
 */

import type { SidebarView } from "./sidebar-view";
import { RepoRow, WorktreeRow, SideHeader } from "openp41ge-components";

interface RepoEntry {
  name: string;
  worktrees: { branch: string; path: string }[];
}

export class GitSidebarView implements SidebarView {
  readonly id = "git";
  readonly label = "Git";
  private _element: HTMLElement | null = null;
  private _worksetId: string;
  private _repos: RepoEntry[] = [];
  private _expandedRepos = new Set<string>();
  private _loading = false;

  constructor(worksetId: string) {
    this._worksetId = worksetId;
  }

  setWorksetId(worksetId: string): void {
    this._worksetId = worksetId;
  }

  async mount(container: HTMLElement): Promise<void> {
    const wrapper = document.createElement("div");
    wrapper.className = "flex-1 min-h-0 flex flex-col w-full overflow-hidden";

    wrapper.appendChild(this._createHeader());
    wrapper.appendChild(this._createList());

    container.appendChild(wrapper);
    this._element = wrapper;

    await this._loadData();
  }

  unmount(): void {
    if (this._element && this._element.parentNode) {
      this._element.remove();
      this._element = null;
    }
  }

  getTitle(): string {
    return "Git";
  }

  private _createHeader(): HTMLElement {
    const header = document.createElement("side-header");
    header.setAttribute("title", "REPOSITORIES");

    const refreshFn = () => this._loadData();
    (header as any).onRefresh = refreshFn;

    return header;
  }

  private _createList(): HTMLElement {
    const list = document.createElement("div");
    list.className =
      "git-sidebar-list flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col";

    const loading = document.createElement("div");
    loading.textContent = "Loading...";
    loading.className = "p-2 text-muted text-xs italic";
    list.appendChild(loading);

    return list;
  }

  private async _loadData(): Promise<void> {
    const list = this._element?.querySelector(".git-sidebar-list") as HTMLElement | null;
    if (!list) return;

    this._loading = true;

    list.innerHTML = "";

    try {
      const repos = await window.openp41ge.workspaceController.listRepos();
      const entries: RepoEntry[] = [];

      for (const repo of repos) {
        try {
          const worktrees = await window.openp41ge.workspaceController.listWorktrees(repo.name);
          entries.push({
            name: repo.name,
            worktrees: worktrees.map((wt) => ({ branch: wt.branch, path: wt.path })),
          });
        } catch {
          entries.push({ name: repo.name, worktrees: [] });
        }
      }

      this._repos = entries;
      this._renderList(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      list.innerHTML = `<div class="p-2 text-error text-xs">Failed to load: ${this._escapeHtml(msg)}</div>`;
    }

    this._loading = false;
  }

  private _renderList(list: HTMLElement): void {
    list.innerHTML = "";

    if (this._repos.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No repositories";
      empty.className = "p-2 text-muted text-xs italic";
      list.appendChild(empty);
      return;
    }

    for (const repo of this._repos) {
      const expanded = this._expandedRepos.has(repo.name);
      const shortName = repo.name.split("/").pop() || repo.name;

      // Repo row
      const repoRow = document.createElement("repo-row");
      repoRow.setAttribute("name", shortName);
      repoRow.setAttribute("worktreeCount", String(repo.worktrees.length));
      if (expanded) repoRow.setAttribute("expanded", "");
      (repoRow as any).onToggle = () => {
        if (this._expandedRepos.has(repo.name)) {
          this._expandedRepos.delete(repo.name);
        } else {
          this._expandedRepos.add(repo.name);
        }
        const l = this._element?.querySelector(".git-sidebar-list") as HTMLElement | null;
        if (l) this._renderList(l);
      };
      list.appendChild(repoRow);

      // Worktree sub-rows
      if (expanded) {
        if (repo.worktrees.length === 0) {
          const empty = document.createElement("div");
          empty.textContent = "No worktrees";
          empty.className = "pl-4 pr-2 py-0.5 text-muted text-xs italic";
          list.appendChild(empty);
        } else {
          for (const wt of repo.worktrees) {
            const wtRow = document.createElement("worktree-row");
            wtRow.setAttribute("branch", wt.branch);
            list.appendChild(wtRow);
          }
        }
      }
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
