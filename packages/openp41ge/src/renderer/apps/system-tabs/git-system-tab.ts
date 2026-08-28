/**
 * GitSystemTabController — system tab controller for the Git panel.
 *
 * Renders the repository/worktree row list (chevron rows with expandable
 * worktree sub-rows). Repo rows AND worktree rows are draggable into the
 * central tab system: dragging one onto the grid opens a pinned
 * git-repository tab for that repo (the grid already understands the
 * payload — see tab-grid.ts native drop handling).
 *
 * Loads live data via the IPC bridge and refreshes on the "git:refresh"
 * event (fired on workspace changes).
 */

import type { SystemTabController } from "../../controllers/types";

interface RepoInfo {
  path: string;
  name: string;
  url: string;
}

interface WorktreeInfo {
  branch: string;
  path: string;
  exists: boolean;
}

/** Drag payload MIME — same one the Explorer's repo rows use. */
const REPO_DRAG_TYPE = "application/x-openp41ge-repo";

/**
 * Worktree-row drag MIME. Value is "<repoName>\u0000<branch>" (NUL is
 * unambiguous — neither repo nor branch names contain NUL).
 */
const WORKTREE_DRAG_TYPE = "application/x-openp41ge-worktree";

export class GitSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "git";

  private _viewElement: HTMLElement | null = null;
  private _list: HTMLElement | null = null;
  private _reloadToken = 0;
  private _onGitRefresh: (() => void) | null = null;
  private _repos: Array<{ info: RepoInfo; worktrees: WorktreeInfo[] }> = [];
  private _expanded = new Set<string>();

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

    // Empty bottom bar (placeholder for now — sidebar tabs own their footer).
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      flexShrink: "0",
      height: "24px",
      display: "flex",
      alignItems: "center",
      padding: "0 8px",
      borderTop: "1px solid var(--divider,#333)",
      fontSize: "12px",
      color: "var(--text-secondary,#999)",
      background: "var(--bg-secondary,#252526)",
    });
    wrapper.appendChild(footer);
    container.appendChild(wrapper);
    this._viewElement = wrapper;
    this._list = list;

    this._onGitRefresh = () => {
      if (this._suspended) {
        // Keep alive: a refresh while hidden just marks the tab dirty; it is
        // applied in place the next time the tab is shown.
        this._suspendDirty = true;
        return;
      }
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

  // ─── Keep-alive (SystemTabController.setVisible) ──────────────────────

  private _suspended = false;
  private _suspendDirty = false;

  /** Pause background reloads while hidden; reload on show only if data
   * changed meanwhile (dirty flag). The rows stay cached for instant return. */
  setVisible(visible: boolean): void {
    this._suspended = !visible;
    if (visible && this._suspendDirty) {
      this._suspendDirty = false;
      void this._reload();
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────

  private async _reload(): Promise<void> {
    const list = this._list;
    if (!list) return;
    const token = ++this._reloadToken;

    list.replaceChildren(this._message("Loading…", "var(--text-secondary,#999)"));

    try {
      const repos = (await window.openp41ge.workspaceController.listRepos()) as RepoInfo[];
      if (token !== this._reloadToken || !this._list) return;

      const items: Array<{ info: RepoInfo; worktrees: WorktreeInfo[] }> = [];
      for (const info of repos) {
        let worktrees: WorktreeInfo[] = [];
        try {
          worktrees = (await window.openp41ge.workspaceController.listWorktrees(
            info.name,
          )) as WorktreeInfo[];
        } catch {
          worktrees = [];
        }
        if (token !== this._reloadToken || !this._list) return;
        items.push({ info, worktrees });
      }

      this._repos = items;
      this._renderList(list);
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

  // ─── Rendering ──────────────────────────────────────────────────────────

  private _renderList(list: HTMLElement): void {
    list.replaceChildren();

    if (this._repos.length === 0) {
      list.appendChild(this._message("No repositories", "var(--text-secondary,#999)"));
      return;
    }

    for (const item of this._repos) {
      list.appendChild(this._repoRow(item.info, item.worktrees));
      if (this._expanded.has(item.info.name)) {
        for (const sub of this._worktreeSubRows(item.info, item.worktrees)) {
          list.appendChild(sub);
        }
      }
    }
  }

  /** Rebuild the list (e.g. after expand/collapse) without a reload. */
  private _rerender(): void {
    const list = this._list;
    if (!list) return;
    this._renderList(list);
  }

  /** Set the drag payload shared by repo + worktree rows. */
  private _setupDrag(e: DragEvent, repoName: string): void {
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.setData(REPO_DRAG_TYPE, repoName);
    dt.effectAllowed = "move";
    dt.dropEffect = "move";
  }

  /** Set the worktree-row drag payload: repo + branch, distinct MIME. */
  private _setupWorktreeDrag(e: DragEvent, repoName: string, branch: string): void {
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.setData(WORKTREE_DRAG_TYPE, repoName + "\u0000" + branch);
    dt.effectAllowed = "move";
    dt.dropEffect = "move";
  }

  private _hoverable(row: HTMLElement, on: boolean): void {
    row.style.background = on ? "var(--bg-hover,rgba(255,255,255,0.06))" : "transparent";
  }

  private _repoRow(info: RepoInfo, worktrees: WorktreeInfo[]): HTMLElement {
    const short = info.name.split("/").pop() || info.name;
    const expanded = this._expanded.has(info.name);

    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      cursor: "pointer",
      userSelect: "none",
      height: "28px",
      padding: "0 10px",
      fontSize: "12px",
      color: "var(--text-primary,#ccc)",
    });
    row.addEventListener("mouseenter", () => this._hoverable(row, true));
    row.addEventListener("mouseleave", () => this._hoverable(row, false));
    row.addEventListener("click", () => {
      if (this._expanded.has(info.name)) this._expanded.delete(info.name);
      else this._expanded.add(info.name);
      this._rerender();
    });
    row.draggable = true;
    row.addEventListener("dragstart", (e: DragEvent) => this._setupDrag(e, info.name));

    const chevron = document.createElement("span");
    chevron.textContent = expanded ? "\u25BE" : "\u25B8";
    Object.assign(chevron.style, {
      width: "16px",
      flexShrink: "0",
      fontSize: "10px",
      color: "var(--text-secondary,#888)",
    });
    row.appendChild(chevron);

    const label = document.createElement("span");
    label.textContent = short;
    label.dataset.repoRow = info.name;
    Object.assign(label.style, {
      flex: "1",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    row.appendChild(label);

    const count = document.createElement("span");
    count.textContent = String(worktrees.length);
    Object.assign(count.style, {
      flexShrink: "0",
      fontSize: "10px",
      color: "var(--text-secondary,#666)",
    });
    row.appendChild(count);

    return row;
  }

  private _worktreeRow(wt: WorktreeInfo, repoName: string): HTMLElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      cursor: "grab",
      userSelect: "none",
      height: "24px",
      padding: "0 10px 0 26px",
      fontSize: "11px",
      color: wt.exists ? "var(--text-secondary,#aaa)" : "var(--text-muted,#666)",
    });
    row.addEventListener("mouseenter", () => this._hoverable(row, true));
    row.addEventListener("mouseleave", () => this._hoverable(row, false));
    row.draggable = true;
    row.addEventListener("dragstart", (e: DragEvent) =>
      this._setupWorktreeDrag(e, repoName, wt.branch),
    );

    const label = document.createElement("span");
    label.textContent = wt.branch;
    label.dataset.worktreeRow = wt.branch;
    Object.assign(label.style, {
      flex: "1",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    row.appendChild(label);

    return row;
  }

  private _worktreeSubRows(info: RepoInfo, worktrees: WorktreeInfo[]): HTMLElement[] {
    const rows: HTMLElement[] = [];
    if (worktrees.length === 0) {
      const empty = this._message("No worktrees", "var(--text-secondary,#777)");
      Object.assign(empty.style, {
        padding: "2px 10px 2px 26px",
        fontSize: "11px",
      });
      rows.push(empty);
      return rows;
    }
    for (const wt of worktrees) {
      rows.push(this._worktreeRow(wt, info.name));
    }
    return rows;
  }
}
