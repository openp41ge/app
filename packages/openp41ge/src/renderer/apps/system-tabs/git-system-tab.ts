/**
 * GitSystemTabController — system tab controller for the Git panel.
 *
 * Renders the workspace repository list with per-repo working-tree change
 * summary. Loads live data via the IPC bridge and refreshes on the
 * "git:refresh" event (fired on workspace changes).
 */

import type { SystemTabController } from "../../controllers/types";
import {
  classifyWorktree,
  worstOf,
  worktreeStatusLabel,
  WARNING_COLOR,
} from "../../services/worktree-status";

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

    const headStatus = document.createElement("span");
    Object.assign(headStatus.style, {
      display: "flex",
      alignItems: "center",
      flexShrink: "0",
    });
    head.appendChild(headStatus);

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
    void this._loadWorktrees(repo, wtList, headStatus);

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

  private async _loadWorktrees(
    repo: RepoInfo,
    container: HTMLElement,
    headStatus: HTMLElement,
  ): Promise<void> {
    let branches: Array<{ branch: string; exists: boolean }> = [];
    let branchMap = new Map<string, { ahead: number; behind: number }>();
    try {
      const raw = (await window.openp41ge.workspaceController.listWorktrees(repo.name)) as unknown as Array<{
        branch: string;
        exists: boolean;
      }>;
      branches = Array.isArray(raw) ? raw : [];
    } catch {
      branches = [];
    }
    try {
      const entries = (await window.openp41ge.workspaceController.getBranches(repo.name)) as unknown as Array<{
        shortName?: string;
        name?: string;
        ahead?: number;
        behind?: number;
      }>;
      for (const e of entries ?? []) {
        branchMap.set(e.shortName ?? e.name ?? "", {
          ahead: e.ahead ?? 0,
          behind: e.behind ?? 0,
        });
      }
    } catch {
      branchMap = new Map();
    }
    if (!this._viewElement) return;

    const infos = [];
    for (const wt of branches) {
      const has = branchMap.has(wt.branch);
      const counts = has
        ? (branchMap.get(wt.branch) ?? { ahead: 0, behind: 0 })
        : { ahead: 0, behind: 0 };
      const info = classifyWorktree(counts.ahead, counts.behind, wt.exists, has);
      infos.push(info);

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

      if (info.state !== "ok" && info.state !== "unknown") {
        const warn = document.createElement("span");
        warn.style.cssText = "display:flex;align-items:center;margin-left:1px;";
        const icon = document.createElement("openp41ge-inline-icon");
        icon.setAttribute("name", "warning");
        icon.setAttribute("size", "11");
        icon.setAttribute("icon-color", WARNING_COLOR);
        icon.setAttribute("no-hover", "");
        icon.setAttribute("title", worktreeStatusLabel(info));
        warn.appendChild(icon);
        row.appendChild(warn);
      }

      container.appendChild(row);
    }

    const worst = worstOf(infos);
    if (infos.length > 0 && worst.state !== "ok" && worst.state !== "unknown") {
      const icon = document.createElement("openp41ge-inline-icon");
      icon.setAttribute("name", "warning");
      icon.setAttribute("size", "12");
      icon.setAttribute("icon-color", WARNING_COLOR);
      icon.setAttribute("no-hover", "");
      icon.setAttribute("title", `${infos.length} worktree(s): ${worktreeStatusLabel(worst)}`);
      headStatus.replaceChildren(icon);
    } else if (infos.length > 0) {
      const icon = document.createElement("openp41ge-inline-icon");
      icon.setAttribute("name", "check-circle");
      icon.setAttribute("size", "12");
      icon.setAttribute("icon-color", "var(--accent,#007acc)");
      icon.setAttribute("no-hover", "");
      icon.setAttribute("title", "All worktrees in sync");
      headStatus.replaceChildren(icon);
    }
  }
}
