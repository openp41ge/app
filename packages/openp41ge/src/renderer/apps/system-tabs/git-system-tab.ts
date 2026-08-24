/**
 * GitSystemTabController — system tab controller for the Git panel.
 *
 * Renders the workspace repository list with per-repo working-tree change
 * summary. Loads live data via the IPC bridge and refreshes on the
 * "git:refresh" event (fired on workspace changes).
 */

import type { SystemTabController } from "../../controllers/types";

interface RepoInfo {
  path: string;
  name: string;
  url: string;
}

interface ChangeCounts {
  filesChanged: number;
  added: number;
  deleted: number;
  untracked: number;
  known: boolean;
}

export class GitSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "git";

  private _viewElement: HTMLElement | null = null;
  private _list: HTMLElement | null = null;
  private _reloadToken = 0;
  private _onGitRefresh: (() => void) | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  async mount(container: HTMLElement): Promise<void> {
    const wrapper = document.createElement("div");
    wrapper.dataset.systemTab = "git";
    Object.assign(wrapper.style, {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    });

    const header = document.createElement("div");
    header.textContent = "REPOSITORIES";
    Object.assign(header.style, {
      padding: "8px 10px 6px",
      fontSize: "11px",
      fontWeight: 600,
      letterSpacing: "0.05em",
      color: "var(--text-secondary,#999)",
      flexShrink: "0",
    });
    wrapper.appendChild(header);

    const list = document.createElement("div");
    Object.assign(list.style, {
      flex: "1",
      minHeight: "0",
      overflowY: "auto",
      overflowX: "hidden",
    });
    wrapper.appendChild(list);

    container.appendChild(wrapper);
    this._viewElement = wrapper;
    this._list = list;

    this._onGitRefresh = () => {
      void this._reload();
    };
    document.addEventListener("git:refresh", this._onGitRefresh);

    await this._reload();
  }

  unmount(): void {
    if (this._onGitRefresh) {
      document.removeEventListener("git:refresh", this._onGitRefresh);
      this._onGitRefresh = null;
    }
    this._reloadToken += 1;
    if (this._viewElement && this._viewElement.parentNode) {
      this._viewElement.remove();
    }
    this._viewElement = null;
    this._list = null;
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  private async _reload(): Promise<void> {
    const list = this._list;
    if (!list) return;
    const token = ++this._reloadToken;

    list.replaceChildren(this._message("Loading…", "var(--text-secondary,#999)"));

    try {
      const repos = await window.openp41ge.workspaceController.listRepos();
      if (token !== this._reloadToken || !this._list) return;
      list.replaceChildren();
      if (repos.length === 0) {
        list.appendChild(this._message("No repositories", "var(--text-secondary,#999)"));
        return;
      }
      for (const repo of repos) {
        list.appendChild(await this._repoCard(repo));
      }
    } catch (err: unknown) {
      if (token !== this._reloadToken || !this._list) return;
      list.replaceChildren();
      const msg = err instanceof Error ? err.message : String(err);
      list.appendChild(this._message(`Failed to load: ${msg}`, "var(--error,#e53e3e)"));
    }
  }

  private _message(text: string, color: string): HTMLElement {
    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, {
      padding: "8px 10px",
      fontSize: "12px",
      fontStyle: "italic",
      color,
    });
    return el;
  }

  // ─── Repo card ────────────────────────────────────────────────────────────

  private async _repoCard(repo: RepoInfo): Promise<HTMLElement> {
    const card = document.createElement("div");
    card.dataset.repo = repo.name;
    Object.assign(card.style, {
      margin: "0 10px 8px",
      padding: "0 0 6px",
      borderBottom: "1px solid var(--divider,#333)",
    });

    // Repository header row.
    const head = document.createElement("div");
    Object.assign(head.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 0 2px",
    });

    const dot = document.createElement("span");
    dot.textContent = "\u25C9";
    Object.assign(dot.style, { fontSize: "12px", color: "var(--accent,#007acc)" });

    const name = document.createElement("span");
    name.textContent = repo.name;
    Object.assign(name.style, {
      flex: "1",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "12px",
      fontWeight: 500,
      color: "var(--text-primary,#ccc)",
    });

    head.appendChild(dot);
    head.appendChild(name);
    card.appendChild(head);

    // Path (secondary line).
    const path = document.createElement("div");
    path.textContent = repo.path;
    Object.assign(path.style, {
      fontSize: "11px",
      color: "var(--text-secondary,#777)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      margin: "0 0 2px 18px",
    });
    card.appendChild(path);

    // Async summary row.
    const summary = document.createElement("div");
    Object.assign(summary.style, {
      fontSize: "11px",
      color: "var(--text-secondary,#999)",
      margin: "2px 0 0 18px",
    });
    summary.textContent = "…";
    card.appendChild(summary);

    void this._loadSummary(repo, summary);

    // Worktree branches.
    const wtList = document.createElement("div");
    Object.assign(wtList.style, {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      margin: "4px 0 0 18px",
    });
    card.appendChild(wtList);
    void this._loadWorktrees(repo, wtList);

    return card;
  }

  private async _loadSummary(repo: RepoInfo, summary: HTMLElement): Promise<void> {
    const counts = await this._changeCounts(repo.name);
    if (!this._viewElement) return;

    if (!counts.known) {
      summary.textContent = "No local clone";
      return;
    }
    if (counts.filesChanged === 0) {
      summary.textContent = "Working tree clean";
      summary.style.color = "var(--text-secondary,#777)";
      return;
    }
    const parts: string[] = [];
    parts.push(`${counts.filesChanged} changed`);
    if (counts.added > 0) parts.push(`+${counts.added}`);
    if (counts.deleted > 0) parts.push(`\u2212${counts.deleted}`);
    if (counts.untracked > 0) parts.push(`${counts.untracked} untracked`);
    summary.textContent = parts.join("  \u00B7  ");
  }

  private async _changeCounts(repoName: string): Promise<ChangeCounts> {
    try {
      const [stat, untracked] = await Promise.all([
        window.openp41ge.workspaceController.getDiffStat(repoName),
        window.openp41ge.workspaceController.getUntrackedFiles(repoName).catch(() => [] as string[]),
      ]);
      let added = 0;
      let deleted = 0;
      for (const entry of stat ?? []) {
        added += entry.added ?? 0;
        deleted += entry.deleted ?? 0;
      }
      return {
        filesChanged: (stat?.length ?? 0) + untracked.length,
        added,
        deleted,
        untracked: untracked.length,
        known: true,
      };
    } catch {
      return { filesChanged: 0, added: 0, deleted: 0, untracked: 0, known: false };
    }
  }

  private async _loadWorktrees(repo: RepoInfo, container: HTMLElement): Promise<void> {
    let branches: Array<{ branch: string; exists: boolean }> = [];
    try {
      branches = (await window.openp41ge.workspaceController.listWorktrees(repo.name)) as unknown as Array<{
        branch: string;
        exists: boolean;
      }>;
    } catch {
      branches = [];
    }
    if (!this._viewElement) return;

    for (const wt of branches) {

      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "11px",
        color: "var(--text-secondary,#bbb)",
      });
      const caret = document.createElement("span");
      caret.textContent = "\u251C";
      caret.style.color = "var(--text-secondary,#666)";
      const label = document.createElement("span");
      label.textContent = wt.branch;
      Object.assign(label.style, {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      row.appendChild(caret);
      row.appendChild(label);
      container.appendChild(row);
    }
  }
}
