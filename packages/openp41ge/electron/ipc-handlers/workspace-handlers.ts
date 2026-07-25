/**
 * Workspace IPC handlers — cloning, repos, worktrees, app reset.
 *
 * The workspace store (createWorkspace, addRepo, etc.) has been removed
 * — it was superseded by the project system (~/.openp41ge/<project>/).
 * Git operations delegate to WorkspaceService → NodeGitService.
 */

import { ipcMain } from "electron";
import type { WorkspaceService } from "../../src/main/services/workspace-service.js";
import type { OperationDispatcher } from "../../src/main/services/operation-dispatcher.js";
import { createWorkspace } from "../../src/layout/types.js";

export function registerWorkspaceHandlers(
  workspaceService: WorkspaceService,
  dispatcher?: OperationDispatcher,
): void {
  ipcMain.handle("workspace:clone", async (event, url: string) => {
    const session = workspaceService.clone(url);
    session.onProgress((progress: { percent: number; message: string }) => {
      event.sender.send("workspace:clone-progress", progress);
    });
    return session.promise;
  });

  ipcMain.handle("workspace:listRepos", async () => {
    return workspaceService.listRepos();
  });

  ipcMain.handle("workspace:getRepo", async (_event, name: string) => {
    return workspaceService.getRepo(name);
  });

  ipcMain.handle("workspace:listWorktrees", async (_event, repoName: string) => {
    return workspaceService.listWorktrees(repoName);
  });

  ipcMain.handle("workspace:checkoutWorktree", async (_event, repoName: string, branch: string) => {
    return workspaceService.checkoutWorktree(repoName, branch);
  });

  ipcMain.handle("workspace:deleteWorktree", async (_event, repoName: string, branch: string) => {
    await workspaceService.deleteWorktree(repoName, branch);
  });

  ipcMain.handle("workspace:fetch", async (_event, repoName: string) => {
    await workspaceService.fetch(repoName);
  });

  ipcMain.handle("workspace:pullBranch", async (_event, repoName: string, branch: string) => {
    await workspaceService.pullBranch(repoName, branch);
  });

  ipcMain.handle("workspace:listBranches", async (_event, repoName: string) => {
    return workspaceService.listBranches(repoName);
  });

  ipcMain.handle("workspace:getDefaultBranch", async (_event, repoName: string) => {
    return workspaceService.getDefaultBranch(repoName);
  });

  // ── App state reset (for test fast-reset) ──────────────────────────────────

  ipcMain.on("workspace:reset", (event) => {
    if (dispatcher) {
      const ws = createWorkspace("ws1");
      dispatcher.setWorkspace(ws);
      dispatcher.broadcast();
    }
    event.sender.send("workspace:do-reset");
  });
}
