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
    const data = this.data;
    const container = this._getContainer();
    if (!data || !container) return;

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
