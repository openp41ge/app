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
