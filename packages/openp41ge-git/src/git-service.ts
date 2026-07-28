import type { GitAdapter } from "./git-adapter";
import { CloneSession } from "./clone-session";
import type { RepoInfo, WorktreeInfo, BranchEntry, CommitEntry, DiffStatEntry } from "./types";

const CLONE_URL_RE = /^(https?:\/\/|git@|ssh:\/\/)/;

/**
 * Shared service for all git operations. Consumers inject an adapter
 * (IpcGitAdapter in production, TestGitAdapter in tests).
 */
export class GitService {
  constructor(private _adapter: GitAdapter) {}

  // ── Clone ──

  /**
   * Clone a repository from the given URL. Returns a CloneSession with
   * progress tracking and abort capability.
   * Throws if the URL format is invalid.
   */
  clone(url: string): CloneSession {
    const trimmed = url.trim();
    if (!CLONE_URL_RE.test(trimmed)) {
      throw new Error("Invalid URL format. Use https://, git@, or ssh://");
    }
    const raw = this._adapter.clone(trimmed);
    return new CloneSession(raw.promise, raw.onProgress, raw.destroy);
  }

  // ── Repos ──

  async listRepos(): Promise<RepoInfo[]> {
    return this._adapter.listRepos();
  }

  async getRepo(name: string): Promise<RepoInfo | null> {
    return this._adapter.getRepo(name);
  }

  async removeRepo(repoName: string): Promise<void> {
    return this._adapter.removeRepo(repoName);
  }

  // ── Worktrees ──

  async listWorktrees(repoName: string): Promise<WorktreeInfo[]> {
    return this._adapter.listWorktrees(repoName);
  }

  async checkoutWorktree(repoName: string, branch: string): Promise<WorktreeInfo> {
    return this._adapter.checkoutWorktree(repoName, branch);
  }

  async addWorktree(repoName: string, branch: string): Promise<WorktreeInfo> {
    return this._adapter.addWorktree(repoName, branch);
  }

  async deleteWorktree(repoName: string, branch: string): Promise<void> {
    return this._adapter.deleteWorktree(repoName, branch);
  }

  // ── Branch operations ──

  async listBranches(repoName: string): Promise<string[]> {
    return this._adapter.listBranches(repoName);
  }

  async getDefaultBranch(repoName: string): Promise<string | null> {
    return this._adapter.getDefaultBranch(repoName);
  }

  async pullBranch(repoName: string, branch: string): Promise<void> {
    return this._adapter.pullBranch(repoName, branch);
  }

  async fetch(repoName: string): Promise<void> {
    return this._adapter.fetch(repoName);
  }

  async deleteLocalBranch(repoName: string, branchName: string, force?: boolean): Promise<void> {
    return this._adapter.deleteLocalBranch(repoName, branchName, force);
  }

  // ── Commit log & diff ──

  async getCommitLog(
    repoName: string,
    branch: string,
    options?: { maxCount?: number; after?: string },
  ): Promise<CommitEntry[]> {
    return this._adapter.getCommitLog(repoName, branch, options);
  }

  async getBranches(repoName: string): Promise<BranchEntry[]> {
    return this._adapter.getBranches(repoName);
  }

  async getDiffStat(repoName: string, commitHash?: string): Promise<DiffStatEntry[]> {
    return this._adapter.getDiffStat(repoName, commitHash);
  }

  async getUntrackedFiles(repoName: string): Promise<string[]> {
    return this._adapter.getUntrackedFiles(repoName);
  }

  // ── Openp41ge repoRefs ──

  async worksetAddRepo(name: string, url: string, worktrees?: string[]): Promise<boolean> {
    return this._adapter.worksetAddRepo(name, url, worktrees);
  }

  async worksetRemoveRepo(name: string): Promise<boolean> {
    return this._adapter.worksetRemoveRepo(name);
  }

  async worksetHasRepo(name: string): Promise<boolean> {
    return this._adapter.worksetHasRepo(name);
  }

  async worksetAddWorktreeToRepo(repoName: string, branch: string): Promise<boolean> {
    return this._adapter.worksetAddWorktreeToRepo(repoName, branch);
  }

  async worksetGetRepoRefs(): Promise<string> {
    return this._adapter.worksetGetRepoRefs();
  }

  onWorksetRepoRefsChanged(callback: () => void): () => void {
    return this._adapter.onWorksetRepoRefsChanged(callback);
  }
}
