/**
 * Integration tests for GitRepositoryController's WORKTREE mode.
 *
 * A worktree drop opens a commit+files tab scoped to one branch:
 *   - skips getBranches entirely (no Branches section),
 *   - loads commits for the worktree's branch,
 *   - never fetches the repo working-tree diff (getDiffStat without a
 *     commit) — Files changed is driven purely by the selected commit,
 *   - persists the branch via snapshot/restore.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitRepositoryController } from "../../src/renderer/apps/git-repository/git-repository-controller";

// The controller imports only event-name constants from the uikit barrel;
// mock it so the real dist barrel (and its openp41ge-tabs transitive
// imports) never load in this test environment.
vi.mock("openp41ge-uikit", () => ({
  GIT_SELECT_BRANCH: "git-select-branch",
  GIT_SELECT_COMMIT: "git-select-commit",
  GIT_REFRESH_BRANCHES: "git-refresh-branches",
  GIT_REFRESH_COMMITS: "git-refresh-commits",
  GIT_REFRESH_FILES: "git-refresh-files",
  GIT_LOAD_MORE_COMMITS: "git-load-more-commits",
  GIT_CLOSE: "git-close",
  GIT_CHECKOUT_WORKTREE: "git-checkout-worktree",
  GIT_BRANCH_CONTEXT_MENU: "git-branch-context-menu",
  GIT_FILE_ROW_CLICK: "git-file-row-click",
}));

type AsyncMock = (() => Promise<unknown>) & ReturnType<typeof vi.fn>;

type MockBridge = {
  workspaceController: {
    fetch: AsyncMock;
    getBranches: AsyncMock;
    getCommitLog: AsyncMock;
    getDiffStat: AsyncMock;
  };
};

function bridge(): MockBridge {
  return (window as unknown as { openp41ge: MockBridge }).openp41ge;
}

function installBridge(): void {
  (window as unknown as { openp41ge: MockBridge }).openp41ge = {
    workspaceController: {
      fetch: vi.fn(async () => {}),
      getBranches: vi.fn(async () => []),
      getCommitLog: vi.fn(async () => []),
      getDiffStat: vi.fn(async () => []),
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 50));

describe("GitRepositoryController — worktree mode", () => {
  let host: HTMLElement;
  let controller: GitRepositoryController;

  beforeEach(() => {
    installBridge();
    host = document.createElement("div");
    document.body.appendChild(host);
    controller = new GitRepositoryController("wt-tab-1", "git-repository");
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
    (window as unknown as Record<string, unknown>).__pendingGitRepo = null;
    (window as unknown as Record<string, unknown>).__pendingGitWorktree = null;
  });

  it("mounts a branch-scoped tab: no branches, commits for the branch, no working-tree diff", async () => {
    bridge().workspaceController.getCommitLog.mockResolvedValue([
      { hash: "abc123", message: "fix", author: "rk" },
    ]);

    (window as unknown as Record<string, unknown>).__pendingGitRepo = "acme";
    (window as unknown as Record<string, unknown>).__pendingGitWorktree = "feature-x";

    controller.mount(host);
    await flush();

    // Never queries branches — there is no Branches section.
    expect(bridge().workspaceController.getBranches).not.toHaveBeenCalled();
    // Loads commits for the worktree's branch.
    expect(bridge().workspaceController.getCommitLog).toHaveBeenCalledWith(
      "acme",
      "feature-x",
      { maxCount: 50 },
    );
    // Never fetches the repo working-tree diff (no commit selected yet).
    expect(bridge().workspaceController.getDiffStat).not.toHaveBeenCalled();

    const panel = host.querySelector("git-repository-panel") as HTMLElement & {
      branchOnly?: boolean;
      data?: { hideBranches?: boolean; filesEmptyMessage?: string; selectedBranch?: string };
    };
    expect(panel).toBeTruthy();
    expect(panel.branchOnly).toBe(true);
    expect(panel.data?.hideBranches).toBe(true);
    expect(panel.data?.selectedBranch).toBe("feature-x");
    expect(panel.data?.filesEmptyMessage).toContain("Select a commit");
  });

  it("selecting a commit fetches its diff; deselecting in worktree mode shows the hint", async () => {
    bridge().workspaceController.getCommitLog.mockResolvedValue([
      { hash: "abc123", message: "fix", author: "rk" },
    ]);

    (window as unknown as Record<string, unknown>).__pendingGitRepo = "acme";
    (window as unknown as Record<string, unknown>).__pendingGitWorktree = "feature-x";

    controller.mount(host);
    await flush();

    const panel = host.querySelector("git-repository-panel") as HTMLElement;
    expect(panel).toBeTruthy();

    // Select a commit → diff for that commit only.
    panel.dispatchEvent(
      new CustomEvent("git-select-commit", { detail: { commitHash: "abc123" } }),
    );
    await flush();
    expect(bridge().workspaceController.getDiffStat).toHaveBeenCalledWith(
      "acme",
      "abc123",
    );

    // Deselect → back to the empty hint, never the working-tree diff.
    (bridge().workspaceController.getDiffStat as AsyncMock).mockClear();
    panel.dispatchEvent(
      new CustomEvent("git-select-commit", { detail: { commitHash: null } }),
    );
    await flush();
    expect(bridge().workspaceController.getDiffStat).not.toHaveBeenCalled();
    const data = (panel as { data?: { filesChanged?: unknown[]; selectedCommit?: string | null } })
      .data;
    expect(data?.selectedCommit).toBeNull();
    expect(data?.filesChanged).toEqual([]);
  });

  it("persists the worktree branch through snapshot/restore", () => {
    (window as unknown as Record<string, unknown>).__pendingGitRepo = "acme";
    (window as unknown as Record<string, unknown>).__pendingGitWorktree = "feature-x";

    controller.mount(host);

    const snap = controller.snapshot();
    expect(snap).toEqual({ repoName: "acme", worktreeBranch: "feature-x" });

    const restored = new GitRepositoryController("wt-tab-2", "git-repository");
    restored.restore(snap);
    expect(restored.repoName).toBe("acme");
    expect(restored.branch).toBe("feature-x");
  });
});
