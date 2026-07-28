import type { GitAdapter } from "./git-adapter";
import type {
  RepoInfo,
  WorktreeInfo,
  BranchEntry,
  CommitEntry,
  DiffStatEntry,
  CloneResult,
  CloneProgress,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Openp41geWindow extends Window {}

interface WorkspaceController {
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
  worksetAddRepo(name: string, url: string, worktrees?: string[]): Promise<boolean>;
  worksetRemoveRepo(name: string): Promise<boolean>;
  worksetHasRepo(name: string): Promise<boolean>;
  worksetAddWorktreeToRepo(repoName: string, branch: string): Promise<boolean>;
  worksetGetRepoRefs(): Promise<string>;
  onWorksetRepoRefsChanged(callback: () => void): () => void;
}

function getWC(): WorkspaceController {
  const wc = (
    window as unknown as Openp41geWindow & {
      openp41ge?: { workspaceController?: WorkspaceController };
    }
  ).openp41ge?.workspaceController;
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

  async addWorktree(_repoName: string, _branch: string): Promise<WorktreeInfo> {
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
