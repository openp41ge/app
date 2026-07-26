/**
 * Repository/worktree RPC handlers.
 *
 * These are used by both the production IPC handler and integration tests.
 * The handlers delegate to GitRepositoryService (the actual git logic).
 */

import type { RepoInfo, WorktreeInfo } from "../../src/trpc/types";

// ─── Handler interface (for testability) ─────────────────────────────────

export interface ReposService {
  listRepos(): Promise<RepoInfo[]>;
  getRepo(name: string): Promise<RepoInfo | null>;
  listWorktrees(repoName: string): Promise<WorktreeInfo[]>;
  checkoutWorktree(repoName: string, branch: string): Promise<WorktreeInfo>;
  deleteWorktree(repoName: string, branch: string): Promise<void>;
  pullBranch(repoName: string, branch: string): Promise<void>;
  fetch(repoName: string): Promise<void>;
  listBranches(repoName: string): Promise<string[]>;
  getDefaultBranch(name: string): Promise<string | null>;
}

// ─── Production handler (delegates to IPC) ───────────────────────────────

class ProductionReposService implements ReposService {
  async listRepos(): Promise<RepoInfo[]> {
    throw new Error("Not yet implemented — delegates to GitRepositoryService");
  }

  async getRepo(_name: string): Promise<RepoInfo | null> {
    throw new Error("Not yet implemented");
  }

  async listWorktrees(_repoName: string): Promise<WorktreeInfo[]> {
    throw new Error("Not yet implemented");
  }

  async checkoutWorktree(_repoName: string, _branch: string): Promise<WorktreeInfo> {
    throw new Error("Not yet implemented");
  }

  async deleteWorktree(_repoName: string, _branch: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async pullBranch(_repoName: string, _branch: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async fetch(_repoName: string): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async listBranches(_repoName: string): Promise<string[]> {
    throw new Error("Not yet implemented");
  }

  async getDefaultBranch(_name: string): Promise<string | null> {
    throw new Error("Not yet implemented");
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────

let _service: ReposService = new ProductionReposService();

/**
 * Set the repos service (used by tests to inject TestReposService).
 */
export function setReposService(service: ReposService): void {
  _service = service;
}

/**
 * Get the current repos service.
 */
export function getReposService(): ReposService {
  return _service;
}

// ─── Exported handler functions (called by tRPC router) ──────────────────

export const reposHandlers = {
  listRepos: () => _service.listRepos(),
  getRepo: (name: string) => _service.getRepo(name),
  listWorktrees: (repoName: string) => _service.listWorktrees(repoName),
  checkoutWorktree: (repoName: string, branch: string) =>
    _service.checkoutWorktree(repoName, branch),
  deleteWorktree: (repoName: string, branch: string) => _service.deleteWorktree(repoName, branch),
  pullBranch: (repoName: string, branch: string) => _service.pullBranch(repoName, branch),
  fetch: (repoName: string) => _service.fetch(repoName),
  listBranches: (repoName: string) => _service.listBranches(repoName),
  getDefaultBranch: (name: string) => _service.getDefaultBranch(name),
};
