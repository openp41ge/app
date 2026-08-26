/**
 * <git-repository-panel> — Lit web component for the git repository browser.
 *
 * Data-driven dumb component:
 *   - Receives `GitBrowserData` via the `data` property
 *   - Uses `gitBrowserRenderer` from `openp41ge-git` internally for DOM rendering
 *   - Fires bubbling CustomEvents for user interactions
 *   - No knowledge of IPC, workspace controllers, or git services
 *
 * Events (all bubble, composed: false):
 *   git-select-branch       { branchName: string }
 *   git-select-commit       { commitHash: string | null }
 *   git-refresh-branches    {}
 *   git-refresh-commits     {}
 *   git-refresh-files       {}
 *   git-load-more-commits   {}
 *   git-close               {}
 *   git-checkout-worktree   { branchName: string }
 *   git-branch-context-menu { branchName: string, x: number, y: number }
 *   git-file-row-click      { filePath: string }
 */

import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import {
  gitBrowserRenderer,
  type GitBrowserData,
} from "openp41ge-git";

// ─── Event names — exported for host app type safety ─────────────────────

export const GIT_SELECT_BRANCH = "git-select-branch";
export const GIT_SELECT_COMMIT = "git-select-commit";
export const GIT_REFRESH_BRANCHES = "git-refresh-branches";
export const GIT_REFRESH_COMMITS = "git-refresh-commits";
export const GIT_REFRESH_FILES = "git-refresh-files";
export const GIT_LOAD_MORE_COMMITS = "git-load-more-commits";
export const GIT_CLOSE = "git-close";
export const GIT_CHECKOUT_WORKTREE = "git-checkout-worktree";
export const GIT_BRANCH_CONTEXT_MENU = "git-branch-context-menu";
export const GIT_FILE_ROW_CLICK = "git-file-row-click";

// ─── Event detail types — exported for host app type safety ──────────────

export interface GitSelectBranchDetail {
  branchName: string;
}
export interface GitSelectCommitDetail {
  commitHash: string | null;
}
export interface GitCheckoutWorktreeDetail {
  branchName: string;
}
export interface GitBranchContextMenuDetail {
  branchName: string;
  x: number;
  y: number;
}
export interface GitFileRowClickDetail {
  filePath: string;
}

// ─── Component ──────────────────────────────────────────────────────────

export class GitRepositoryPanel extends LitElement {
  /** The full git data snapshot — component re-renders when this changes. */
  @property({ type: Object, attribute: false })
  data: GitBrowserData | null = null;

  override createRenderRoot(): HTMLElement | ShadowRoot {
    // Light DOM so the renderer's styles and event listeners work naturally
    return this;
  }

  override render() {
    return html`<div id="panel-container" style="width:100%;height:100%;overflow:hidden;"></div>`;
  }

  override updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has("data")) {
      this._updatePanel();
    }
  }

  private _getContainer(): HTMLElement | null {
    return this.querySelector("#panel-container");
  }

  private _updatePanel(): void {
    const container = this._getContainer();
    if (!container) return;

    // No data yet (fresh tab / initial fetch): show a shimmer skeleton so the
    // pane is never blank the moment it mounts.
    if (!this.data) {
      this._renderSkeleton(container);
      return;
    }
    const data = this.data;

    // Clear container
    container.innerHTML = "";

    if (data.error) {
      gitBrowserRenderer.renderError(container, data.error, () => {
        this._dispatchSimple(GIT_REFRESH_BRANCHES);
      });
      return;
    }

    const callbacks = this._createCallbacks();
    const panel = gitBrowserRenderer.renderGitPanel(data, callbacks);
    container.appendChild(panel);
  }

  /**
   * Shimmer skeleton shown while `data` is still null (loading the repo).
   * Mirrors the real panel's section structure: two collapsible sections
   * (branches, then commits) each with a few placeholder rows. Uses theme
   * --bg-hover so it matches dark and light themes.
   */
  private _renderSkeleton(container: HTMLElement): void {
    container.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = `
      .gsk {
        display: block;
        box-sizing: border-box;
        border-radius: 3px;
      }
      .gsk-title {
        width: 42%;
        max-width: 180px;
        height: 12px;
        margin: 10px 12px 8px;
      }
      .gsk-row {
        height: 22px;
        margin: 6px 12px;
      }
      .gsk-row.w60 { width: 60%; }
      .gsk-row.w72 { width: 72%; }
      .gsk-row.w45 { width: 45%; }
      .gsk-shimmer {
        background: linear-gradient(
          90deg,
          var(--bg-hover, rgba(255,255,255,0.05)) 25%,
          rgba(255,255,255,0.10) 50%,
          var(--bg-hover, rgba(255,255,255,0.05)) 75%
        );
        background-size: 200% 100%;
        animation: gsk-slide 1.4s ease-in-out infinite;
      }
      @keyframes gsk-slide {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `;
    container.appendChild(style);

    // Branches section
    container.appendChild(this._skeletonTitle("gsk gsk-title gsk-shimmer"));
    for (const w of ["w72", "w60", "w72"]) {
      container.appendChild(this._skeletonTitle(`gsk gsk-row gsk-shimmer ${w}`));
    }
    // Commits section
    container.appendChild(this._skeletonTitle("gsk gsk-title gsk-shimmer"));
    for (const w of ["w60", "w45", "w72"]) {
      container.appendChild(this._skeletonTitle(`gsk gsk-row gsk-shimmer ${w}`));
    }
  }

  private _skeletonTitle(className: string): HTMLElement {
    const el = document.createElement("div");
    el.className = className;
    return el;
  }

  private _createCallbacks() {
    return {
      onSelectBranch: (branchName: string) => {
        this._dispatch(GIT_SELECT_BRANCH, { branchName });
      },
      onSelectCommit: (commitHash: string | null) => {
        this._dispatch(GIT_SELECT_COMMIT, { commitHash });
      },
      onRefreshBranches: () => {
        this._dispatchSimple(GIT_REFRESH_BRANCHES);
      },
      onRefreshCommits: () => {
        this._dispatchSimple(GIT_REFRESH_COMMITS);
      },
      onRefreshFiles: () => {
        this._dispatchSimple(GIT_REFRESH_FILES);
      },
      onLoadMoreCommits: () => {
        this._dispatchSimple(GIT_LOAD_MORE_COMMITS);
      },
      onClose: () => {
        this._dispatchSimple(GIT_CLOSE);
      },
      onCheckoutWorktree: (branchName: string) => {
        this._dispatch(GIT_CHECKOUT_WORKTREE, { branchName });
      },
      onBranchContextMenu: (branchName: string, x: number, y: number) => {
        this._dispatch(GIT_BRANCH_CONTEXT_MENU, { branchName, x, y });
      },
      onFileRowClick: (filePath: string) => {
        this._dispatch(GIT_FILE_ROW_CLICK, { filePath });
      },
    };
  }

  private _dispatch<T>(type: string, detail: T): void {
    this.dispatchEvent(
      new CustomEvent<T>(type, { bubbles: true, composed: false, detail }),
    );
  }

  private _dispatchSimple(type: string): void {
    this.dispatchEvent(
      new CustomEvent(type, { bubbles: true, composed: false }),
    );
  }
}

customElements.define("git-repository-panel", GitRepositoryPanel);
