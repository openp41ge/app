/**
 * GitEntryDragSource — drag source for dragging a repo or worktree row from
 * the explorer into the grid or over the explorer list.
 *
 * The visual ghost is a pixel-accurate bitmap of the source row captured by
 * the main process (webContents.capturePage) at drag threshold and rendered
 * in the transparent always-on-top DragGhostManager BrowserWindow — the only
 * thing that can follow the cursor OUTSIDE the app window. The in-DOM ghost
 * is therefore invisible (as with tab/file drags), and the source row is
 * left untouched so the captured bitmap is not faded.
 *
 * The ACTION is decided by drop location (resolved by the host):
 *   - over the grid   → open-tab → opens a git-repository pane for the repo
 *     (branch-scoped for a worktree row)
 *   - over the explorer list → the host fires explorer-reorder-repos
 */

import type { IDragSource, DragSourceData, DragResult } from "../../interfaces/drag-handler";

export interface GitEntryDragData {
  repoName: string;
  /** Present for worktree rows — opens a branch-scoped git browser. */
  branch?: string;
  /** Row label — used for the bitmap ghost caption fallback. */
  title: string;
}

export interface GitEntryDragSourceOptions {
  /** The row is a commit-search result — the drop opens the git-commit-search
   * app (placeholder) instead of the git-repository browser. */
  searchResult?: boolean;
  /** Full commit hash for search-result rows (carried in tabConfig). */
  hash?: string;
}

export class GitEntryDragSource implements IDragSource {
  readonly type = "open-tab";

  private _repoName: string;
  private _title: string;
  private _branch?: string;
  private _searchResult: boolean;
  private _hash?: string;
  /** Offset from cursor to element top-left, set via setOffset(). */
  private _offsetX = 0;
  private _offsetY = 0;
  private _ghost: HTMLElement | null = null;

  constructor(
    repoName: string,
    title: string,
    branch?: string,
    opts: GitEntryDragSourceOptions = {},
  ) {
    this._repoName = repoName;
    this._title = title;
    this._branch = branch;
    this._searchResult = opts.searchResult ?? false;
    this._hash = opts.hash;
  }

  getDragData(): DragSourceData {
    if (this._searchResult) {
      return {
        type: "open-tab",
        appType: "git-commit-search",
        title: this._title,
        tabConfig: { repoName: this._repoName, hash: this._hash },
      };
    }
    return {
      type: "open-tab",
      appType: "git-repository",
      title: this._title,
      tabConfig: this._branch
        ? { repoName: this._repoName, branch: this._branch }
        : { repoName: this._repoName },
    };
  }

  /** Set the cursor offset for the main-process ghost positioning. */
  setOffset(offsetX: number, offsetY: number): void {
    this._offsetX = offsetX;
    this._offsetY = offsetY;
  }

  get offsetX(): number {
    return this._offsetX;
  }

  get offsetY(): number {
    return this._offsetY;
  }

  /**
   * Create an invisible in-DOM ghost — the visible ghost is the main-process
   * BrowserWindow overlay (a captured bitmap of the source row), so we don't
   * render a second in-DOM element that would double up and be clipped to
   * this window.
   */
  createGhost(): HTMLElement {
    const ghost = document.createElement("div");
    ghost.style.cssText =
      "position:fixed;pointer-events:none;opacity:0;width:1px;height:1px;z-index:-1;";
    this._ghost = ghost;
    return ghost;
  }

  onDragStart(): void {
    // The source row is intentionally NOT dimmed here: the ghost bitmap is
    // captured from it via capturePage after this fires, so it must stay at
    // full opacity. The row itself remains in place until a drop/end.
  }

  onDragEnd(_result: DragResult): void {
    if (this._ghost && this._ghost.parentNode) {
      this._ghost.parentNode.removeChild(this._ghost);
    }
    this._ghost = null;
  }
}
