import type {
  CloneResult,
  CloneProgress,
  RepoInfo,
  WorktreeInfo,
  BranchEntry,
  CommitEntry,
  DiffStatEntry,
} from "./types";

/**
 * Abstraction over git operations. Two implementations:
 * - IpcGitAdapter — delegates to window.openp41ge.workspaceController.* in production
 * - TestGitAdapter — pure in-memory for unit tests
 */
export interface GitAdapter {
  clone(url: string): {
    promise: Promise<CloneResult>;
    onProgress: (fn: (progress: CloneProgress) => void) => () => void;
    destroy: () => void;
  };

  listRepos(): Promise<RepoInfo[]>;
  getRepo(name: string): Promise<RepoInfo | null>;
  removeRepo(repoName: string): Promise<void>;

  listWorktrees(repoName: string): Promise<WorktreeInfo[]>;
  checkoutWorktree(repoName: string, branch: string): Promise<WorktreeInfo>;
  addWorktree(repoName: string, branch: string): Promise<WorktreeInfo>;
  deleteWorktree(repoName: string, branch: string): Promise<void>;

  listBranches(repoName: string): Promise<string[]>;
  getDefaultBranch(repoName: string): Promise<string | null>;
  pullBranch(repoName: string, branch: string): Promise<void>;
  fetch(repoName: string): Promise<void>;

  getCommitLog(
    repoName: string,
    branch: string,
    options?: { maxCount?: number; after?: string },
  ): Promise<CommitEntry[]>;
  getBranches(repoName: string): Promise<BranchEntry[]>;
  getDiffStat(repoName: string, commitHash?: string): Promise<DiffStatEntry[]>;
  deleteLocalBranch(repoName: string, branchName: string, force?: boolean): Promise<void>;
  getUntrackedFiles(repoName: string): Promise<string[]>;

  // Openp41ge repoRefs API
  worksetAddRepo(name: string, url: string, worktrees?: string[]): Promise<boolean>;
  worksetRemoveRepo(name: string): Promise<boolean>;
  worksetHasRepo(name: string): Promise<boolean>;
  worksetAddWorktreeToRepo(repoName: string, branch: string): Promise<boolean>;
  worksetGetRepoRefs(): Promise<string>;
  onWorksetRepoRefsChanged(callback: () => void): () => void;
}
