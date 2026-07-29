/**
 * GitSidebarView — wraps a repo/worktree list as a SidebarView.
 *
 * Shows repositories and their worktrees, similar to the explorer but
 * without the file-tree. On mount, it fetches repos and worktrees from
 * the workspace controller and renders them as a flat list.
 *
 * Architecture (SOLID):
 *   - Single Responsibility: manages lifecycle of the git repo list
 *     within the sidebar
 *   - Dependency Inversion: depends on SidebarView interface and
 *     window.openp41ge.workspaceController
 */

import { chevronRight, chevronDown } from "../../icons";
import type { SidebarView } from "./sidebar-view";

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
  private _container: HTMLElement | null = null;

  constructor(worksetId: string) {
    this._worksetId = worksetId;
  }

  setWorksetId(worksetId: string): void {
    this._worksetId = worksetId;
  }

  async mount(container: HTMLElement): Promise<void> {
    this._container = container;

    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "flex:1;min-height:0;display:flex;flex-direction:column;width:100%;overflow:hidden;";

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
    this._container = null;
  }

  getTitle(): string {
    return "Git";
  }

  private _createHeader(): HTMLElement {
    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;height:28px;padding:0 8px;gap:4px;flex-shrink:0;user-select:none;";

    const label = document.createElement("span");
    label.textContent = "REPOSITORIES";
    label.style.cssText = "color:#888;font-size:10px;font-weight:600;letter-spacing:0.5px;flex:1;";
    header.appendChild(label);

    // Refresh button
    const refreshBtn = document.createElement("span");
    refreshBtn.innerHTML = "\u21bb";
    refreshBtn.style.cssText =
      "width:18px;height:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px;color:#666;font-size:13px;flex-shrink:0;";
    refreshBtn.title = "Refresh repositories";
    refreshBtn.addEventListener("mouseenter", () => {
      refreshBtn.style.color = "#aaa";
      refreshBtn.style.background = "rgba(255,255,255,0.06)";
    });
    refreshBtn.addEventListener("mouseleave", () => {
      refreshBtn.style.color = "#666";
      refreshBtn.style.background = "transparent";
    });
    refreshBtn.addEventListener("click", () => this._loadData());
    header.appendChild(refreshBtn);

    return header;
  }

  private _createList(): HTMLElement {
    const list = document.createElement("div");
    list.className = "git-sidebar-list";
    list.style.cssText =
      "flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;";

    // Loading state
    const loading = document.createElement("div");
    loading.textContent = "Loading...";
    loading.style.cssText = "padding:8px;color:#555;font-size:11px;font-style:italic;";
    list.appendChild(loading);

    return list;
  }

  private async _loadData(): Promise<void> {
    const list = this._element?.querySelector(".git-sidebar-list") as HTMLElement | null;
    if (!list) return;

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
      list.innerHTML = `<div style="padding:8px;color:#c55;font-size:11px;">Failed to load: ${this._escapeHtml(msg)}</div>`;
    }
  }

  private _renderList(list: HTMLElement): void {
    list.innerHTML = "";

    if (this._repos.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No repositories";
      empty.style.cssText = "padding:8px;color:#555;font-size:11px;font-style:italic;";
      list.appendChild(empty);
      return;
    }

    for (const repo of this._repos) {
      const expanded = this._expandedRepos.has(repo.name);
      const repoRow = this._createRepoRow(repo, expanded);
      list.appendChild(repoRow);
    }
  }

  private _createRepoRow(repo: RepoEntry, expanded: boolean): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;flex-direction:column;";

    // Repo header row
    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;padding:4px 8px;cursor:pointer;user-select:none;transition:background 0.1s;";
    header.addEventListener("click", () => {
      if (this._expandedRepos.has(repo.name)) {
        this._expandedRepos.delete(repo.name);
      } else {
        this._expandedRepos.add(repo.name);
      }
      const list = this._element?.querySelector(".git-sidebar-list") as HTMLElement | null;
      if (list) this._renderList(list);
    });
    header.addEventListener("mouseenter", () => {
      header.style.background = "rgba(255,255,255,0.04)";
    });
    header.addEventListener("mouseleave", () => {
      header.style.background = "transparent";
    });

    // Chevron (same SVG size as explorer sidebar: 10px)
    const chevron = document.createElement("span");
    chevron.innerHTML = expanded ? chevronDown(10) : chevronRight(10);
    chevron.style.cssText =
      "width:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#888;";
    header.appendChild(chevron);

    // Repo name
    const name = document.createElement("span");
    const shortName = repo.name.split("/").pop() || repo.name;
    name.textContent = shortName;
    name.style.cssText =
      "color:#ccc;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-weight:500;";
    name.title = repo.name;
    header.appendChild(name);

    // Worktree count
    const count = document.createElement("span");
    count.textContent = String(repo.worktrees.length);
    count.style.cssText = "color:#666;font-size:10px;margin-left:4px;flex-shrink:0;";
    header.appendChild(count);

    wrapper.appendChild(header);

    // Worktree list (expanded)
    if (expanded) {
      const list = document.createElement("div");
      list.style.cssText = "display:flex;flex-direction:column;";

      if (repo.worktrees.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "No worktrees";
        empty.style.cssText =
          "padding:2px 8px 2px 24px;color:#555;font-size:11px;font-style:italic;";
        list.appendChild(empty);
      } else {
        for (const wt of repo.worktrees) {
          const wtRow = document.createElement("div");
          wtRow.style.cssText =
            "display:flex;align-items:center;padding:2px 8px 2px 24px;font-size:11px;color:#aaa;user-select:none;";

          const wtName = document.createElement("span");
          wtName.textContent = wt.branch;
          wtName.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;";
          wtRow.appendChild(wtName);

          list.appendChild(wtRow);
        }
      }

      wrapper.appendChild(list);
    }

    return wrapper;
  }

  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
