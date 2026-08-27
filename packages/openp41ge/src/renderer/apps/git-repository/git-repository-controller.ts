/**
 * GitRepositoryController — pane controller that renders the git repo browser.
 *
 * Uses the <git-repository-panel> Lit web component from openp41ge-uikit.
 * Data flow (events-up / data-down):
 *   1. Fetches git data via window.openp41ge.workspaceController
 *   2. Sets data on the component's `data` property
 *   3. Listens for events from the component
 *   4. On each event, performs the action via workspaceController, fetches
 *      updated data, and pushes it back to the component
 */

import { BaseController } from "../../controllers/base-controller";
import type { TabController } from "../../controllers/types";
import type { GitRepositoryPanel, GitBrowserData, GitBranchContextMenuDetail } from "openp41ge-uikit";
import {
  GIT_SELECT_BRANCH,
  GIT_SELECT_COMMIT,
  GIT_REFRESH_BRANCHES,
  GIT_REFRESH_COMMITS,
  GIT_REFRESH_FILES,
  GIT_LOAD_MORE_COMMITS,
  GIT_CLOSE,
  GIT_CHECKOUT_WORKTREE,
  GIT_BRANCH_CONTEXT_MENU,
  GIT_FILE_ROW_CLICK,
} from "openp41ge-uikit";
import { toastService } from "../../components/openp41ge-toast";
import { createOpenp41geContextMenu } from "../../interfaces/element-guards";
import type { CommitEntry } from "openp41ge-git";

export class GitRepositoryController extends BaseController implements TabController {
  /** The repo name being displayed. */
  repoName: string = "";

  /**
   * When set, this tab is a WORKTREE-scoped browser: only Commits + Files
   * changed for this branch (no Branches section), titled by the branch.
   */
  branch: string = "";

  /** The git repository panel component instance. */
  private _panel: GitRepositoryPanel | null = null;

  /** Current git data (maintained between renders). */
  private _data: GitBrowserData | null = null;

  /** Bound event handlers — stored so we can remove them on unmount. */
  private _boundHandlers: Array<{ type: string; handler: EventListener }> = [];

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

    // Worktree-scoped drop: pick up the pending branch (set by the tab drop
    // handler alongside __pendingGitRepo).
    const pendingWorktree = (window as unknown as Record<string, unknown>)
      .__pendingGitWorktree as string | undefined;
    if (pendingWorktree && !this.branch) {
      this.branch = pendingWorktree;
    }
    if (pendingWorktree !== undefined) {
      (window as unknown as Record<string, unknown>).__pendingGitWorktree = null;
    }

    container.style.cssText = "width:100%;height:100%;overflow:hidden;background:#121212;";

    if (!this.repoName) {
      // No repo — show a placeholder
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">
          Select a repository to view git information
        </div>
      `;
      return;
    }

    // Create the panel component
    const panel = document.createElement("git-repository-panel") as GitRepositoryPanel;
    (panel as GitRepositoryPanel & { branchOnly?: boolean }).branchOnly = !!this.branch;
    this._panel = panel;
    container.appendChild(panel);

    // Wire events
    this._wireEvents(panel);

    // Kick off initial data fetch
    this._fetchAndSetData();
  }

  unmount(): void {
    // Remove event listeners
    if (this._panel) {
      for (const { type, handler } of this._boundHandlers) {
        this._panel.removeEventListener(type, handler);
      }
    }
    this._boundHandlers = [];
    this._panel = null;
    this._data = null;
    this.container = null;
  }

  setVisible(_visible: boolean): void {
    // No special handling needed
  }

  snapshot(): Record<string, unknown> {
    return this.branch
      ? { repoName: this.repoName, worktreeBranch: this.branch }
      : { repoName: this.repoName };
  }

  restore(state: Record<string, unknown>): void {
    const name = state.repoName || state.filePath;
    if (name && typeof name === "string") {
      this.repoName = name;
    }
    const wt = state.worktreeBranch;
    if (wt && typeof wt === "string") {
      this.branch = wt;
    }
  }

  // ─── Event wiring ──────────────────────────────────────────────────────

  private _wireEvents(panel: GitRepositoryPanel): void {
    const add = (type: string, handler: EventListener) => {
      panel.addEventListener(type, handler);
      this._boundHandlers.push({ type, handler });
    };

    add(GIT_SELECT_BRANCH, this._onSelectBranch as EventListener);
    add(GIT_SELECT_COMMIT, this._onSelectCommit as EventListener);
    add(GIT_REFRESH_BRANCHES, this._onRefreshBranches as EventListener);
    add(GIT_REFRESH_COMMITS, this._onRefreshCommits as EventListener);
    add(GIT_REFRESH_FILES, this._onRefreshFiles as EventListener);
    add(GIT_LOAD_MORE_COMMITS, this._onLoadMoreCommits as EventListener);
    add(GIT_CLOSE, this._onClose as EventListener);
    add(GIT_CHECKOUT_WORKTREE, this._onCheckoutWorktree as EventListener);
    add(GIT_BRANCH_CONTEXT_MENU, this._onBranchContextMenu as EventListener);
    add(GIT_FILE_ROW_CLICK, this._onFileRowClick as EventListener);
  }

  /** Push current _data to the panel component. */
  private _pushData(): void {
    if (this._panel && this._data) {
      this._panel.data = this._data;
    }
  }

  // ─── Data fetching ────────────────────────────────────────────────────

  /**
   * Data that still resolves every section (accordion structure is known in
   * advance, so the panel renders immediately with per-section skeletons).
   */
  private _loadingData(repoName: string): GitBrowserData {
    return {
      repoName,
      branches: [],
      selectedBranch: this.branch,
      commits: [],
      filesChanged: [],
      loadingBranches: true,
      loadingCommits: true,
      loadingFiles: true,
      commitSkipCount: 0,
      hasMoreCommits: false,
      visibleCommitCount: 0,
      selectedCommit: null,
      hideBranches: !!this.branch,
    };
  }

  private _errorData(repoName: string, msg: string): GitBrowserData {
    return {
      ...this._loadingData(repoName),
      loadingBranches: false,
      loadingCommits: false,
      loadingFiles: false,
      error: msg,
    };
  }

  private async _fetchAndSetData(): Promise<void> {
    const repoName = this.repoName;
    if (!repoName) return;

    // Show the accordion (Branches/Commits/Files) with per-section skeletons
    // IMMEDIATELY — the structure is known before any data arrives.
    this._data = this._loadingData(repoName);
    this._pushData();

    // Fetch latest from remote first (optional — skeleton is already showing).
    try {
      await window.openp41ge.workspaceController.fetch(repoName);
    } catch {
      // Non-fatal
    }
    if (repoName !== this.repoName) return;

    // ── Worktree mode: NO Branches section — this tab is scoped to a
    //    single branch. Commits load for that branch; the Files section is
    //    driven purely by the selected commit (the working-tree diff is the
    //    MAIN checkout's and is never shown here). ────────────────────────
    if (this.branch) {
      this._data = {
        ...this._data,
        loadingBranches: false,
        selectedBranch: this.branch,
        loadingFiles: false,
        filesChanged: [],
        filesEmptyMessage: "Select a commit to view its changes",
      };
      this._pushData();
      void this._loadCommits(repoName, this.branch);
      return;
    }

    // ── Branches ────────────────────────────────────────────────────────
    let branches: GitBrowserData["branches"] = [];
    try {
      branches = (await window.openp41ge.workspaceController.getBranches(
        repoName,
      )) as GitBrowserData["branches"];
    } catch (err: unknown) {
      if (repoName !== this.repoName) return;
      const msg = err instanceof Error ? err.message : String(err);
      this._data = this._errorData(repoName, msg);
      this._pushData();
      toastService.show("Failed to load git data: " + msg, "error", 5000);
      return;
    }
    if (repoName !== this.repoName) return;

    const selectedBranch = branches.length > 0 ? branches[0].name : "";
    this._data = { ...this._data, branches, selectedBranch, loadingBranches: false };
    this._pushData();

    // ── Commits + Files changed — resolve independently so each section's
    //    skeleton is replaced as soon as its own data arrives. ─────────
    void this._loadCommits(repoName, selectedBranch);
    void this._loadFiles(repoName);
  }

  private async _loadCommits(repoName: string, selectedBranch: string): Promise<void> {
    let commits: CommitEntry[] = [];
    let hasMoreCommits = false;
    if (selectedBranch) {
      try {
        const commitLog = (await window.openp41ge.workspaceController.getCommitLog(
          repoName,
          selectedBranch,
          { maxCount: 50 },
        )) as CommitEntry[];
        if (repoName !== this.repoName) return;
        commits = commitLog;
        hasMoreCommits = commitLog.length >= 50;
      } catch {
        if (repoName !== this.repoName) return;
      }
    }
    if (repoName !== this.repoName || !this._data) return;
    this._data = {
      ...this._data,
      commits,
      hasMoreCommits,
      visibleCommitCount: 10,
      loadingCommits: false,
    };
    this._pushData();
  }

  private async _loadFiles(repoName: string): Promise<void> {
    let filesChanged: GitBrowserData["filesChanged"] = [];
    try {
      filesChanged = (await window.openp41ge.workspaceController.getDiffStat(
        repoName,
      )) as GitBrowserData["filesChanged"];
    } catch {
      if (repoName !== this.repoName) return;
    }
    if (repoName !== this.repoName || !this._data) return;
    this._data = { ...this._data, filesChanged, loadingFiles: false };
    this._pushData();
  }

  /**
   * Map a local branch name to its remote-tracking counterpart.
   */
  private _resolveBranchRef(branchName: string): string {
    if (!this._data) return branchName;
    const remoteRef = `origin/${branchName}`;
    if (this._data.branches.some((b) => b.name === remoteRef)) {
      return remoteRef;
    }
    return branchName;
  }

  /** Re-fetch branches, commits, and diff stat for the current state. */
  private async _refreshAll(): Promise<void> {
    if (!this._data || !this.repoName) return;
    const repoName = this.repoName;
    const isWorktreeMode = !!this.branch;

    try {
      await window.openp41ge.workspaceController.fetch(repoName);
    } catch {
      // Ignore
    }
    if (repoName !== this.repoName || !this._data) return;

    const commitRef =
      this._resolveBranchRef(this._data.selectedBranch) || this.branch || "";
    try {
      const [branches, commitLog] = await Promise.all([
        isWorktreeMode
          ? Promise.resolve([] as GitBrowserData["branches"])
          : window.openp41ge.workspaceController.getBranches(repoName),
        commitRef
          ? window.openp41ge.workspaceController.getCommitLog(repoName, commitRef, { maxCount: 50 })
          : Promise.resolve([]),
      ]);
      if (repoName !== this.repoName || !this._data) return;

      // Files changed: worktree mode never fetches the working-tree diff
      // (it is the MAIN checkout's) — only a selected commit's diff.
      const showWorkingTree = isWorktreeMode ? !!this._data.selectedCommit : true;
      const diffStat = showWorkingTree
        ? await window.openp41ge.workspaceController.getDiffStat(
            repoName,
            this._data.selectedCommit ?? undefined,
          )
        : [];
      if (repoName !== this.repoName || !this._data) return;

      this._data = {
        ...this._data,
        branches,
        commits: commitLog,
        filesChanged: diffStat,
        filesEmptyMessage:
          isWorktreeMode && !this._data.selectedCommit
            ? "Select a commit to view its changes"
            : undefined,
        loadingBranches: false,
        loadingCommits: false,
        loadingFiles: false,
        commitSkipCount: 0,
        hasMoreCommits: commitLog.length >= 50,
        visibleCommitCount: 10,
      };
      this._pushData();
    } catch {
      if (this._data) {
        this._data = {
          ...this._data,
          loadingBranches: false,
          loadingCommits: false,
          loadingFiles: false,
        };
        this._pushData();
      }
    }
  }

  // ─── Event handlers ───────────────────────────────────────────────────

  private _onSelectBranch = async (e: Event): Promise<void> => {
    if (!this._data || !this.repoName) return;
    const { branchName } = (e as CustomEvent).detail as { branchName: string };
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
      loadingFiles: true,
    };
    this._pushData();

    try {
      const repoName = this.repoName;
      const commits = await window.openp41ge.workspaceController.getCommitLog(
        repoName,
        commitRef,
        { maxCount: 50 },
      );
      if (repoName !== this.repoName || !this._data) return;

      const diffStat = await window.openp41ge.workspaceController.getDiffStat(repoName);
      if (repoName !== this.repoName || !this._data) return;

      this._data = {
        ...this._data,
        loadingCommits: false,
        commits,
        commitSkipCount: 0,
        hasMoreCommits: commits.length >= 50,
        loadingFiles: false,
        filesChanged: diffStat,
      };
      this._pushData();
    } catch {
      if (this._data) {
        this._data = { ...this._data, loadingCommits: false, loadingFiles: false };
        this._pushData();
      }
    }
  };

  private _onSelectCommit = async (e: Event): Promise<void> => {
    if (!this._data || !this.repoName) return;
    const { commitHash } = (e as CustomEvent).detail as { commitHash: string | null };
    const isWorktreeMode = !!this.branch;

    // Worktree mode: a deselected commit returns to the empty hint — the
    // working-tree diff is never shown (it belongs to the main checkout).
    if (isWorktreeMode && !commitHash) {
      this._data = {
        ...this._data,
        selectedCommit: null,
        loadingFiles: false,
        filesChanged: [],
        filesEmptyMessage: "Select a commit to view its changes",
      };
      this._pushData();
      return;
    }

    this._data = { ...this._data, selectedCommit: commitHash, loadingFiles: !!commitHash };
    this._pushData();

    try {
      const repoName = this.repoName;
      const diffStat = await window.openp41ge.workspaceController.getDiffStat(
        repoName,
        commitHash ?? undefined,
      );
      if (repoName !== this.repoName || !this._data) return;
      this._data = { ...this._data, loadingFiles: false, filesChanged: diffStat };
      this._pushData();
    } catch {
      if (this._data) {
        this._data = { ...this._data, loadingFiles: false };
        this._pushData();
      }
    }
  };

  private _onRefreshBranches = async (): Promise<void> => {
    if (!this._data || !this.repoName) return;
    this._data = { ...this._data, loadingBranches: true };
    this._pushData();

    try {
      await this._refreshAll();
    } catch {
      if (this._data) {
        this._data = { ...this._data, loadingBranches: false };
        this._pushData();
      }
    }
  };

  private _onRefreshCommits = async (): Promise<void> => {
    if (!this._data || !this.repoName) return;
    this._data = { ...this._data, loadingCommits: true };
    this._pushData();

    try {
      await this._refreshAll();
    } catch {
      if (this._data) {
        this._data = { ...this._data, loadingCommits: false };
        this._pushData();
      }
    }
  };

  private _onRefreshFiles = async (): Promise<void> => {
    if (!this._data || !this.repoName) return;
    this._data = { ...this._data, loadingFiles: true };
    this._pushData();

    try {
      await this._refreshAll();
    } catch {
      if (this._data) {
        this._data = { ...this._data, loadingFiles: false };
        this._pushData();
      }
    }
  };

  private _onLoadMoreCommits = async (): Promise<void> => {
    if (!this._data || !this.repoName) return;

    // If more commits are loaded than visible, reveal more
    if (this._data.visibleCommitCount < this._data.commits.length) {
      this._data = {
        ...this._data,
        visibleCommitCount: Math.min(
          this._data.visibleCommitCount + 10,
          this._data.commits.length,
        ),
      };
      this._pushData();
      return;
    }

    const skip = this._data.commitSkipCount + this._data.commits.length;
    if (!this._data.hasMoreCommits) return;

    this._data = { ...this._data, loadingCommits: true };
    this._pushData();

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
      this._pushData();
    } catch {
      if (this._data) {
        this._data = { ...this._data, loadingCommits: false };
        this._pushData();
      }
    }
  };

  private _onClose = (): void => {
    const ws = window.openp41ge.workspace;
    if (ws && typeof ws.dispatch === "function") {
      ws.dispatch("removeColumnTab", this.tabId);
    }
  };

  private _onCheckoutWorktree = async (e: Event): Promise<void> => {
    const { branchName } = (e as CustomEvent).detail as { branchName: string };
    const repoName = this.repoName;
    if (!repoName) return;
    try {
      await window.openp41ge.workspaceController.checkoutWorktree(repoName, branchName);
      toastService.show(`Worktree "${branchName}" created`, "success");
    } catch {
      toastService.show(`Failed to create worktree for "${branchName}"`, "error", 5000);
    }
  };

  private _onBranchContextMenu = (e: Event): void => {
    const { branchName, x, y } = (e as CustomEvent<GitBranchContextMenuDetail>).detail;
    const repoName = this.repoName;
    if (!repoName) return;

    document.querySelectorAll("openp41ge-contextmenu").forEach((el) => el.remove());

    const ctx = createOpenp41geContextMenu({
      x,
      y,
      items: [
        {
          label: "Checkout as worktree",
          action: async () => {
            try {
              await window.openp41ge.workspaceController.checkoutWorktree(repoName, branchName);
              toastService.show(`Worktree "${branchName}" created`, "success");
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
            if (this._data) {
              this._onSelectBranch(
                new CustomEvent(GIT_SELECT_BRANCH, { detail: { branchName } }),
              );
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
  };

  private _onFileRowClick = (_e: Event): void => {
    // File selection/highlight only — no navigation (deferred)
  };
}
