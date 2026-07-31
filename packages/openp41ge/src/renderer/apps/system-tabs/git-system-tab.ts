/**
 * GitSystemTabController — system tab controller for the Git panel.
 *
 * Wraps GitSidebarView as a SystemTabController. Mounts the repo/worktree
 * list in the sidebar content area.
 */

import type { SystemTabController } from "../../controllers/types";

export class GitSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "git";
  private _viewElement: HTMLElement | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  async mount(container: HTMLElement): Promise<void> {
    const wrapper = document.createElement("div");
    wrapper.className = "flex-1 min-h-0 flex flex-col w-full overflow-hidden";

    // Header
    const header = document.createElement("side-header");
    header.setAttribute("title", "REPOSITORIES");
    wrapper.appendChild(header);

    // List container
    const list = document.createElement("div");
    list.className =
      "git-sidebar-list flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col";
    const loading = document.createElement("div");
    loading.textContent = "Loading...";
    loading.className = "p-2 text-muted text-xs italic";
    list.appendChild(loading);
    wrapper.appendChild(list);

    container.appendChild(wrapper);
    this._viewElement = wrapper;

    // Load data
    await this._loadData(list);
  }

  unmount(): void {
    if (this._viewElement && this._viewElement.parentNode) {
      this._viewElement.remove();
      this._viewElement = null;
    }
  }

  private async _loadData(list: HTMLElement): Promise<void> {
    list.innerHTML = "";

    try {
      const repos = await window.openp41ge.workspaceController.listRepos();
      if (repos.length === 0) {
        list.innerHTML = `<div class="p-2 text-muted text-xs italic">No repositories</div>`;
        return;
      }

      for (const repo of repos) {
        const repoRow = document.createElement("repo-row");
        repoRow.setAttribute("name", repo.name);
        list.appendChild(repoRow);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      list.innerHTML = `<div class="p-2 text-error text-xs">Failed to load: ${msg}</div>`;
    }
  }
}
