/**
 * Workspace IPC handlers — cloning, repos, worktrees, app reset.
 *
 * The workspace store (createWorkspace, addRepo, etc.) has been removed
 * — it was superseded by the project system (~/.openp41ge/<project>/).
 *
 * Git operations for the Workspaces overlay (workspaceData:*) delegate to
 * WorktreeStore — the single repositories layout shared with the Explorer
 * (NodeGitService), so repos added/edited in the overlay act on the SAME
 * on-disk store the Explorer reads (repos belong to the workspace; one store).
 */

import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import type { WorkspaceService } from "../../src/main/services/workspace-service.js";
import type { OperationDispatcher } from "../../src/main/services/operation-dispatcher.js";
import { createWorkspace } from "../../src/layout/types.js";
import {
  createWorktreeStore,
  runGit,
  type WorktreeStore,
} from "../../src/main/services/worktree-store.js";

/**
 * Default on-disk repositories store (~/.openp41ge/repositories), matching
 * NodeGitService.reposDir so the Workspaces overlay and Explorer share the
 * same layout (bare .git/ + sibling worktree folders).
 */
const store: WorktreeStore = createWorktreeStore(
  path.join(os.homedir(), ".openp41ge", "repositories"),
);

/**
 * Encode a repo URL into a filesystem-safe directory name (legacy).
 * Kept only for `workspaceData:getDir`; repo operations use the
 * repositories store (see WorktreeStore).
 */
function encodeRepoUrl(url: string): string {
  return url
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Legacy workspaces-data base dir (only used by workspaceData:getDir; the
 * per-repo clones here were superseded by the repositories store).
 */
function getWorkspaceDataDir(): string {
  return path.join(os.homedir(), ".openp41ge", "workspaces-data");
}

/**
 * Aggregate working-tree change stats across a saved workspace's repos/worktrees.
 * Best-effort: repos without a local clone or worktrees that don't exist are skipped.
 */
async function getWorkspaceStats(
  repos: Array<{ url: string; worktrees?: string[] }>,
): Promise<{ filesChanged: number; added: number; deleted: number; untracked: number }> {
  let filesChanged = 0;
  let added = 0;
  let deleted = 0;
  let untracked = 0;
  for (const repo of repos ?? []) {
    for (const branch of repo.worktrees ?? []) {
      const wtDir = store.getWorktreePath(repo.url, branch);
      if (!fs.existsSync(wtDir)) continue;
      try {
        const numstat = await runGit(["diff", "HEAD", "--numstat"], wtDir);
        for (const line of numstat.stdout.trim().split("\n")) {
          if (!line) continue;
          const parts = line.split("\t");
          const a = parseInt(parts[0], 10);
          const d = parseInt(parts[1], 10);
          if (!Number.isNaN(a)) added += a;
          if (!Number.isNaN(d)) deleted += d;
        }
      } catch {
        // Worktree may not be a git repo — skip.
      }
      try {
        const status = await runGit(["status", "--porcelain"], wtDir);
        const lines = status.stdout.split("\n").filter((l) => l.trim().length > 0);
        filesChanged += lines.length;
        untracked += lines.filter((l) => l.startsWith("??")).length;
      } catch {
        // ignore
      }
    }
  }
  return { filesChanged, added, deleted, untracked };
}

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

  // ── Workspace-data git operations (used by workspace manager) ────────────

  /** Check if a repo URL is accessible (git ls-remote). */
  ipcMain.handle("workspaceData:checkRepoAccess", async (_event, url: string) => {
    try {
      return await store.checkRepoAccess(url);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  /**
   * Check if a worktree branch exists and check divergence.
   * wsDir param is unused but kept for backward compatibility.
   */
  ipcMain.handle(
    "workspaceData:checkWorktreeBranch",
    async (_event, _wsDir: string, url: string, branch: string) => {
      return store.checkWorktreeBranch(_wsDir, url, branch);
    },
  );

  /** Check if a repo is already cloned for the given URL. */
  ipcMain.handle("workspaceData:repoAlreadyCloned", async (_event, url: string) => {
    return store.repoAlreadyCloned(url);
  });

  /** Resync a worktree branch to its remote. Returns { ok, error? }. */
  ipcMain.handle("workspaceData:syncWorktree", async (_event, url: string, branch: string) => {
    return store.syncWorktreeBranch(url, branch);
  });

  /** Clone a bare repo for the given URL. Returns { ok, error? }. */
  ipcMain.handle("workspaceData:cloneBareRepo", async (_event, url: string) => {
    return store.cloneBareRepo(url);
  });

  /**
   * Checkout (create or re-create) a worktree for a given URL + branch.
   * Returns { ok: true } or { ok: false, error }.
   */
  ipcMain.handle("workspaceData:checkoutWorktree", async (_event, url: string, branch: string) => {
    return store.checkoutWorktreeBranch(url, branch);
  });

  /** Encode a repo URL into a filesystem-safe directory name. */
  ipcMain.handle("workspaceData:encodeRepoUrl", async (_event, url: string) => {
    return encodeRepoUrl(url);
  });

  /** Get the workspace-data directory path. */
  ipcMain.handle("workspaceData:getDir", async () => {
    return getWorkspaceDataDir();
  });

  /** Aggregate working-tree change stats (edits) for a saved workspace's worktrees. */
  ipcMain.handle(
    "workspaceData:getWorkspaceStats",
    async (_event, repos: Array<{ url: string; worktrees?: string[] }>) => {
      try {
        return await getWorkspaceStats(repos);
      } catch {
        return { filesChanged: 0, added: 0, deleted: 0, untracked: 0 };
      }
    },
  );
}
