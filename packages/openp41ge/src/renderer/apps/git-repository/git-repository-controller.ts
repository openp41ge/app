/**
 * GitRepositoryController — pane controller that renders the git repo browser.
 *
 * Uses the GitBrowserRenderer from openp41ge-git-repository to render the
 * accordion-style UI (branches, commits, files) inside a pane tab.
 *
 * Data flow:
 *   mount() → reads window.__pendingGitRepo → fetches git data → renders
 *   onSelectBranch → re-fetches commits + diff stat → re-renders
 *   onSelectCommit → fetches commit-specific diff stat → re-renders
 *   onRefresh* → fetches from remote → replaces single section
 *   onLoadMoreCommits → reveals more or fetches from backend
 *   onClose → dispatches removeColumnTab to close the pane
 */

import { BaseController } from "../../controllers/base-controller";
import type { TabController } from "../../controllers/types";
import {
  gitBrowserRenderer,
  type GitBrowserData,
  type GitBrowserCallbacks,
} from "openp41ge-uikit";
import { toastService } from "../../components/openp41ge-toast";
import { createOpenp41geContextMenu } from "../../interfaces/element-guards";

export class GitRepositoryController extends BaseController implements TabController {
  /** The repo name being displayed. */
  repoName: string = "";

  /** Current git data (maintained between renders). */
  private _data: GitBrowserData | null = null;

  constructor(tabId: string, appType: string) {
    super(tabId, appType);
  }

  mount(container: HTMLElement): void {
    this.container = container;

    // Use the pending repo name if set (from "Show git info" context menu)
    const pendingRepo = (window as unknown as Record<string, unknown>).__pendingGitRepo as
      string | undefined;
    if (pendingRepo && !this.repoName) {
      this.repoName = pendingRepo;
      (window as unknown as Record<string, unknown>).__pendingGitRepo = null;
    }

    container.style.cssText = "width:100%;height:100%;overflow:hidden;background:#121212;";

    if (this.repoName) {
      this._fetchAndRender(container);

      // Cross-window refresh is handled by workspace state updates
    } else {
      // No repo — show a placeholder
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">
          Select a repository to view git information
        </div>
      `;
    }
  }

  unmount(): void {
    // Unsubscribe from store reload events
    if (this._storeUnsub) {
      this._storeUnsub();
      this._storeUnsub = null;
    }
    this.container = null;
  }

  setVisible(_visible: boolean): void {
    // No special handling needed
  }

  snapshot(): Record<string, unknown> {
    return { repoName: this.repoName };
  }

  restore(state: Record<string, unknown>): void {
    // repoName is set by snapshot(); filePath is the tab config key
    // used by actionOpenFile/openTabInCell (passed from the drag-drop flow).
    const name = state.repoName || state.filePath;
    if (name && typeof name === "string") {
      this.repoName = name;
    }
  }

  private async _fetchAndRender(container: HTMLElement): Promise<void> {
    const repoName = this.repoName;
    if (!repoName) return;

    // Show loading indicator
    gitBrowserRenderer.renderLoading(container);

    // Fetch latest from remote first so remote-tracking refs are fresh
    try {
      await window.openp41ge.workspaceController.fetch(repoName);
    } catch {
      // Non-fatal — show stale data if fetch fails
    }
    if (repoName !== this.repoName) return;

    try {
      // Fetch branches and diff stat in parallel
      const [branches, diffStat] = await Promise.all([
        window.openp41ge.workspaceController.getBranches(repoName),
        window.openp41ge.workspaceController.getDiffStat(repoName),
      ]);

      if (repoName !== this.repoName) return; // stale

      const selectedBranch = branches.length > 0 ? branches[0].name : "";

      let commits: CommitEntry[] = [];
      let hasMoreCommits = false;
      if (selectedBranch) {
        const commitLog = await window.openp41ge.workspaceController.getCommitLog(
          repoName,
          selectedBranch,
          { maxCount: 50 },
        );
        if (repoName !== this.repoName) return;
        commits = commitLog;
        hasMoreCommits = commitLog.length >= 50;
      }

      this._data = {
        repoName,
        branches,
        selectedBranch,
        commits,
        filesChanged: diffStat,
        loadingBranches: false,
        loadingCommits: false,
        loadingFiles: false,
        commitSkipCount: 0,
        hasMoreCommits,
        visibleCommitCount: 10,
        selectedCommit: null,
      };

      const callbacks = this._createCallbacks();
      container.innerHTML = "";
      const rendered = gitBrowserRenderer.renderGitPanel(this._data, callbacks);
      container.appendChild(rendered);
    } catch (err: unknown) {
      if (repoName !== this.repoName) return;
      const msg = err instanceof Error ? err.message : String(err);
      container.innerHTML = "";
      gitBrowserRenderer.renderError(container, msg, () => {
        this._fetchAndRender(container);
      });
      toastService.show("Failed to load git data: " + msg, "error", 5000);
    }
  }

  /** Re-render the full panel with current _data and new callbacks. */
  private _reRender(): void {
    if (!this.container || !this._data) return;
    const callbacks = this._createCallbacks();
    this.container.innerHTML = "";
    const rendered = gitBrowserRenderer.renderGitPanel(this._data, callbacks);
    this.container.appendChild(rendered);
  }

  /**
   * Map a local branch name to its remote-tracking counterpart so we show the
   * latest fetched data (fetch only updates refs/remotes/origin/*).
   */
  private _resolveBranchRef(branchName: string): string {
    const data = this._data;
    if (!data) return branchName;
    // If the branch has a remote variant, show commits from the remote ref
    const remoteRef = `origin/${branchName}`;
    if (data.branches.some((b) => b.name === remoteRef)) {
      return remoteRef;
    }
    return branchName;
  }

  private _createCallbacks(): GitBrowserCallbacks {
    return {
      onSelectBranch: async (branchName: string) => {
        if (!this._data || !this.container || !this.repoName) return;
        // Show commits from the remote-tracking ref when available (fetch
        // only updates refs/remotes/origin/*, not refs/heads/*).
        const commitRef = this._resolveBranchRef(branchName);
        this._data = {
          ...this._data,
          selectedBranch: commitRef,
          loadingCommits: true,
          commits: [],
          commitSkipCount: 0,
          hasMoreCommits: false,
          visibleCommitCount: 10,
          selectedCommit: null,
        };
        this._reRender();

        try {
          const repoName = this.repoName;
          const commits = await window.openp41ge.workspaceController.getCommitLog(
            repoName,
            commitRef,
            { maxCount: 50 },
          );
          if (repoName !== this.repoName || !this._data) return;
          this._data = {
            ...this._data,
            loadingCommits: false,
            commits,
            commitSkipCount: 0,
            hasMoreCommits: commits.length >= 50,
            loadingFiles: true,
          };

          const diffStat = await window.openp41ge.workspaceController.getDiffStat(repoName);
          if (repoName !== this.repoName || !this._data) return;
          this._data = {
            ...this._data,
            loadingFiles: false,
            filesChanged: diffStat,
          };
          this._reRender();
        } catch {
          if (!this._data) return;
          this._data = { ...this._data, loadingCommits: false, loadingFiles: false };
          this._reRender();
        }
      },

      onSelectCommit: async (commitHash: string | null) => {
        if (!this._data || !this.container || !this.repoName) return;
        this._data = {
          ...this._data,
          selectedCommit: commitHash,
          loadingFiles: !!commitHash,
        };
        this._reRender();

        if (commitHash) {
          try {
            const repoName = this.repoName;
            const diffStat = await window.openp41ge.workspaceController.getDiffStat(
              repoName,
              commitHash,
            );
            if (repoName !== this.repoName || !this._data) return;
            this._data = { ...this._data, loadingFiles: false, filesChanged: diffStat };
            this._reRender();
          } catch {
            if (!this._data) return;
            this._data = { ...this._data, loadingFiles: false };
            this._reRender();
          }
        } else {
          // Restore working tree diff
          try {
            const repoName = this.repoName;
            const diffStat = await window.openp41ge.workspaceController.getDiffStat(repoName);
            if (repoName !== this.repoName || !this._data) return;
            this._data = { ...this._data, filesChanged: diffStat };
            this._reRender();
          } catch {
            // Ignore
          }
        }
      },

      onRefreshBranches: async () => {
        const repoName = this.repoName;
        if (!repoName || !this._data || !this.container) return;

        try {
          await window.openp41ge.workspaceController.fetch(repoName);
        } catch {
          // Ignore fetch errors
        }
        if (repoName !== this.repoName) return;

        this._data = { ...this._data, loadingBranches: true };
        const panel = this.container.querySelector("div") as HTMLElement | null;
        if (panel) {
          gitBrowserRenderer.replaceSection(panel, "branches", this._data, this._createCallbacks());
        }

        try {
          const branches = await window.openp41ge.workspaceController.getBranches(repoName);
          if (repoName !== this.repoName || !this._data) return;
          this._data = { ...this._data, branches, loadingBranches: false };
          if (panel) {
            gitBrowserRenderer.replaceSection(
              panel,
              "branches",
              this._data,
              this._createCallbacks(),
            );
          }
        } catch {
          if (this._data) {
            this._data = { ...this._data, loadingBranches: false };
          }
        }
      },

      onRefreshCommits: async () => {
        const repoName = this.repoName;
        if (!repoName || !this._data || !this.container) return;

        try {
          await window.openp41ge.workspaceController.fetch(repoName);
        } catch {
          // Ignore
        }
        if (repoName !== this.repoName) return;

        this._data = { ...this._data, loadingCommits: true };
        const panel = this.container.querySelector("div") as HTMLElement | null;
        if (panel) {
          gitBrowserRenderer.replaceSection(panel, "commits", this._data, this._createCallbacks());
        }

        try {
          const selectedBranch = this._data.selectedBranch;
          if (!selectedBranch) return;
          const commitLog = await window.openp41ge.workspaceController.getCommitLog(
            repoName,
            selectedBranch,
            { maxCount: 50 },
          );
          if (repoName !== this.repoName || !this._data) return;
          this._data = {
            ...this._data,
            loadingCommits: false,
            commits: commitLog,
            commitSkipCount: 0,
            hasMoreCommits: commitLog.length >= 50,
            visibleCommitCount: 10,
          };
          if (panel) {
            gitBrowserRenderer.replaceSection(
              panel,
              "commits",
              this._data,
              this._createCallbacks(),
            );
          }
        } catch {
          if (this._data) {
            this._data = { ...this._data, loadingCommits: false };
          }
        }
      },

      onRefreshFiles: async () => {
        const repoName = this.repoName;
        if (!repoName || !this._data || !this.container) return;

        try {
          await window.openp41ge.workspaceController.fetch(repoName);
        } catch {
          // Ignore
        }
        if (repoName !== this.repoName) return;

        this._data = { ...this._data, loadingFiles: true };
        const panel = this.container.querySelector("div") as HTMLElement | null;
        if (panel) {
          gitBrowserRenderer.replaceSection(panel, "files", this._data, this._createCallbacks());
        }

        try {
          const diffStat = await window.openp41ge.workspaceController.getDiffStat(
            repoName,
            this._data.selectedCommit ?? undefined,
          );
          if (repoName !== this.repoName || !this._data) return;
          this._data = { ...this._data, loadingFiles: false, filesChanged: diffStat };
          if (panel) {
            gitBrowserRenderer.replaceSection(panel, "files", this._data, this._createCallbacks());
          }
        } catch {
          if (this._data) {
            this._data = { ...this._data, loadingFiles: false };
          }
        }
      },

      onLoadMoreCommits: async () => {
        if (!this._data || !this.repoName || !this.container) return;

        const panel = this.container.querySelector("div") as HTMLElement | null;
        if (!panel) return;
        const callbacks = this._createCallbacks();

        // If more commits are loaded than visible, reveal more
        if (this._data.visibleCommitCount < this._data.commits.length) {
          this._data = {
            ...this._data,
            visibleCommitCount: Math.min(
              this._data.visibleCommitCount + 10,
              this._data.commits.length,
            ),
          };
          gitBrowserRenderer.replaceSection(panel, "commits", this._data, callbacks);
          return;
        }

        const skip = this._data.commitSkipCount + this._data.commits.length;
        if (!this._data.hasMoreCommits) return;

        this._data = { ...this._data, loadingCommits: true };
        gitBrowserRenderer.replaceSection(panel, "commits", this._data, callbacks);

        try {
          const repoName = this.repoName;
          const moreCommits = await window.openp41ge.workspaceController.getCommitLog(
            repoName,
            this._data.selectedBranch,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { maxCount: 50, skip } as any,
          );
          if (repoName !== this.repoName || !this._data) return;
          this._data = {
            ...this._data,
            loadingCommits: false,
            commits: [...this._data.commits, ...moreCommits],
            commitSkipCount: skip,
            hasMoreCommits: moreCommits.length >= 50,
          };
          gitBrowserRenderer.replaceSection(panel, "commits", this._data, callbacks);
        } catch {
          if (this._data) {
            this._data = { ...this._data, loadingCommits: false };
          }
          gitBrowserRenderer.replaceSection(panel, "commits", this._data, callbacks);
        }
      },

      onClose: () => {
        // Close the pane
        const ws = window.openp41ge.workspace;
        if (ws && typeof ws.dispatch === "function") {
          ws.dispatch("removeColumnTab", this.tabId);
        }
      },

      onCheckoutWorktree: async (branchName: string) => {
        const repoName = this.repoName;
        if (!repoName) return;
        try {
          await window.openp41ge.workspaceController.checkoutWorktree(repoName, branchName);
          toastService.show(`Worktree "${branchName}" created`, "success");
        } catch {
          toastService.show(`Failed to create worktree for "${branchName}"`, "error", 5000);
        }
      },

      onBranchContextMenu: (branchName: string, x: number, y: number) => {
        // Remove any existing context menus
        document.querySelectorAll("openp41ge-contextmenu").forEach((el) => el.remove());

        const ctx = createOpenp41geContextMenu({
          x,
          y,
          items: [
            {
              label: "Checkout as worktree",
              action: async () => {
                const repoName = this.repoName;
                if (!repoName) return;
                try {
                  await window.openp41ge.workspaceController.checkoutWorktree(repoName, branchName);
                  toastService.show(`Worktree "${branchName}" created`, "success");
                  // Refresh the worktree tree so the new worktree appears
                  const wt = document.querySelector("openp41ge-worktree-tree") as Element & {
                    _loadRepos?: () => Promise<void>;
                  };
                  if (wt && typeof wt._loadRepos === "function") {
                    wt._loadRepos();
                  }
                } catch {
                  toastService.show(`Failed to create worktree for "${branchName}"`, "error", 5000);
                }
              },
            },
            {
              label: "Fetch",
              action: async () => {
                const repoName = this.repoName;
                if (!repoName) return;
                try {
                  await window.openp41ge.workspaceController.fetch(repoName);
                  toastService.show(`Fetched "${branchName}"`, "success");
                } catch {
                  toastService.show(`Failed to fetch "${branchName}"`, "error", 5000);
                }
              },
            },
            {
              label: "Show commits",
              action: () => {
                // Select the branch, which triggers commits section to load for it
                if (this._data && this.container) {
                  this._createCallbacks().onSelectBranch(branchName);
                }
              },
            },
            {
              label: "Copy branch name",
              action: () => {
                navigator.clipboard.writeText(branchName);
                toastService.show("Branch name copied", "info", 2000);
              },
            },
          ],
          onclose: () => {},
        });

        document.body.appendChild(ctx);
      },

      onFileRowClick: (_filePath: string) => {
        // File selection/highlight only — no navigation (deferred)
      },
    };
  }
}
