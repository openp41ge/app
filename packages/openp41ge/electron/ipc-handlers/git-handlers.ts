/**
 * Git commit query IPC handlers.
 */

import { ipcMain } from "electron";
import type { NodeGitCommitService, NodeGitService } from "../../src/main/index.js";

export function registerGitHandlers(
  gitCommitService: NodeGitCommitService,
  gitService: NodeGitService,
): void {
  ipcMain.handle("workspace:getCommitLog", async (_event, repoName, branch, options) => {
    return gitCommitService.getCommitLog(repoName, branch, options);
  });

  ipcMain.handle("workspace:getBranches", async (_event, repoName) => {
    return gitCommitService.getBranches(repoName);
  });

  ipcMain.handle("workspace:getDiffStat", async (_event, repoName, commitHash) => {
    return gitCommitService.getDiffStat(repoName, commitHash);
  });

  ipcMain.handle("workspace:getUntrackedFiles", async (_event, repoName) => {
    return gitCommitService.getUntrackedFiles(repoName);
  });

  ipcMain.handle("workspace:searchCommits", async (_event, repoName, options) => {
    // repoName null → aggregate a cross-repo search over every repo in the
    // repos dir, isolating per-repo failures so one bad repo can't kill the
    // whole search.
    if (repoName && typeof repoName === "string") {
      return gitCommitService.searchCommits(repoName, options);
    }
    try {
      const repos = await gitService.listRepos();
      const out: unknown[] = [];
      for (const repo of repos) {
        try {
          const hits = await gitCommitService.searchCommits(repo.name, options);
          out.push(...hits);
        } catch {
          // Skip repos that fail (no clone on disk, permissions, …)
        }
      }
      return out;
    } catch {
      return [];
    }
  });

  ipcMain.handle("workspace:deleteLocalBranch", async (_event, repoName, branchName, force) => {
    // Remove the worktree first if the branch has one checked out
    try {
      await gitService.deleteWorktree(repoName, branchName);
    } catch {
      // Worktree removal is best-effort — may not exist
    }
    await gitCommitService.deleteLocalBranch(repoName, branchName, force);
  });
}
