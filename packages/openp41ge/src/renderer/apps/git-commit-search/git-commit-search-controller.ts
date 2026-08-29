/**
 * GitCommitSearchController — app type `"git-commit-search"` placeholder.
 *
 * Opened by dragging a commit-search result row onto the grid (open-tab drag
 * with appType git-commit-search). The eventual component here is the commit
 * search RESULT UI for one commit/repo; currently this is a stub panel so the
 * end-to-end flow (drag → pending context → placeholder pane) is verifiable
 * before the real UI lands.
 *
 * Repo + hash arrive two ways (mirrors GitRepositoryController):
 *   - first mount:  window.__pendingGitCommitSearch set by the grid-open-tab /
 *                   cross-window drop handler
 *   - re-mount:     restore() gets the serialised tab config — for this app the
 *                   config slot is a JSON string `{ repoName, hash }`
 */

import { BaseController } from "../../controllers/base-controller";

interface CommitSearchResultContext {
  repoName?: string;
  hash?: string;
}

export class GitCommitSearchController extends BaseController {
  private _repoName = "";
  private _hash = "";

  mount(container: HTMLElement): void {
    this.container = container;

    // Fresh mount: a drop set the pending context on this window.
    const pending = (window as unknown as Record<string, unknown>).__pendingGitCommitSearch as
      CommitSearchResultContext | undefined;
    if (pending?.repoName && pending.hash && !this._repoName && !this._hash) {
      this._repoName = pending.repoName;
      this._hash = pending.hash;
      (window as unknown as Record<string, unknown>).__pendingGitCommitSearch = null;
    }

    container.style.cssText = "width:100%;height:100%;overflow:hidden;background:#121212;";

    const shortHash = this._hash ? this._hash.slice(0, 7) : "";
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;width:100%;height:100%;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 10px;height:28px;border-bottom:1px solid #333;font-size:11px;color:#999;flex-shrink:0;">
          <span>Commit search result</span>
          <span>${shortHash || ""}</span>
        </div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:12px;color:#777;font-style:italic;padding:0 16px;text-align:center;">
          ${
            this._repoName
              ? `Git commit search result UI — placeholder
            (${this._repoName} @ ${shortHash || "…"})`
              : "Git commit search result panel"
          }
        </div>
      </div>
    `;
  }

  unmount(): void {
    this.container = null;
  }

  snapshot(): Record<string, unknown> {
    return { ...this.state, repoName: this._repoName, hash: this._hash };
  }

  restore(state: Record<string, unknown>): void {
    this.state = { ...state };
    const parsed =
      typeof state.filePath === "string" && state.filePath.trim().startsWith("{")
        ? (safeParse(state.filePath) as CommitSearchResultContext)
        : undefined;
    this._repoName = (state.repoName as string) || parsed?.repoName || "";
    this._hash = (state.hash as string) || parsed?.hash || "";
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
