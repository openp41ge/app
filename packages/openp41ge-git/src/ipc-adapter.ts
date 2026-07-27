import type { GitAdapter } from "./git-adapter";
import type {
  RepoInfo,
  WorktreeInfo,
  BranchEntry,
  CommitEntry,
  DiffStatEntry,
} from "./types";

// Access workspaceController via the runtime API. The actual type is
// declared in the main app's global.d.ts — here we use a minimal cast
// to keep the package self-contained.
function getWC(): any {
  const wc = (window as any).openp41ge?.workspaceController;
  if (!wc) throw new Error("workspaceController not available");
  return wc;
}

export class IpcGitAdapter implements GitAdapter {
  clone(url: string) {
    return getWC().clone(url);
  }

  async listRepos(): Promise<RepoInfo[]> {
    return getWC().listRepos();
  }

  async getRepo(name: string): Promise<RepoInfo | null> {
    return getWC().getRepo(name);
  }

  async removeRepo(repoName: string): Promise<void> {
    return getWC().removeRepo(repoName);
  }

  async listWorktrees(repoName: string): Promise<WorktreeInfo[]> {
    return getWC().listWorktrees(repoName);
  }

  async checkoutWorktree(repoName: string, branch: string): Promise<WorktreeInfo> {
    return getWC().checkoutWorktree(repoName, branch);
  }

  async addWorktree(repoName: string, branch: string): Promise<WorktreeInfo> {
    throw new Error("addWorktree not available via workspaceController");
  }

  async deleteWorktree(repoName: string, branch: string): Promise<void> {
    return getWC().deleteWorktree(repoName, branch);
  }

  async listBranches(repoName: string): Promise<string[]> {
    return getWC().listBranches(repoName);
  }

  async getDefaultBranch(repoName: string): Promise<string | null> {
    return getWC().getDefaultBranch(repoName);
  }

  async pullBranch(repoName: string, branch: string): Promise<void> {
    return getWC().pullBranch(repoName, branch);
  }

  async fetch(repoName: string): Promise<void> {
    return getWC().fetch(repoName);
  }

  async getCommitLog(
    repoName: string,
    branch: string,
    options?: { maxCount?: number; after?: string },
  ): Promise<CommitEntry[]> {
    return getWC().getCommitLog(repoName, branch, options);
  }

  async getBranches(repoName: string): Promise<BranchEntry[]> {
    return getWC().getBranches(repoName);
  }

  async getDiffStat(repoName: string, commitHash?: string): Promise<DiffStatEntry[]> {
    return getWC().getDiffStat(repoName, commitHash);
  }

  async deleteLocalBranch(repoName: string, branchName: string, force?: boolean): Promise<void> {
    return getWC().deleteLocalBranch(repoName, branchName, force);
  }

  async getUntrackedFiles(repoName: string): Promise<string[]> {
    return getWC().getUntrackedFiles(repoName);
  }

  async worksetAddRepo(name: string, url: string, worktrees?: string[]): Promise<boolean> {
    return getWC().worksetAddRepo(name, url, worktrees);
  }

  async worksetRemoveRepo(name: string): Promise<boolean> {
    return getWC().worksetRemoveRepo(name);
  }

  async worksetHasRepo(name: string): Promise<boolean> {
    return getWC().worksetHasRepo(name);
  }

  async worksetAddWorktreeToRepo(repoName: string, branch: string): Promise<boolean> {
    return getWC().worksetAddWorktreeToRepo(repoName, branch);
  }

  async worksetGetRepoRefs(): Promise<string> {
    return getWC().worksetGetRepoRefs();
  }

  onWorksetRepoRefsChanged(callback: () => void): () => void {
    return getWC().onWorksetRepoRefsChanged(callback);
  }
}
