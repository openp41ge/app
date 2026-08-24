/**
 * Workspace IPC handlers — cloning, repos, worktrees, app reset.
 *
 * The workspace store (createWorkspace, addRepo, etc.) has been removed
 * — it was superseded by the project system (~/.openp41ge/<project>/).
 * Git operations delegate to WorkspaceService → NodeGitService.
 */

import { ipcMain } from "electron";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import type { WorkspaceService } from "../../src/main/services/workspace-service.js";
import type { OperationDispatcher } from "../../src/main/services/operation-dispatcher.js";
import { createWorkspace } from "../../src/layout/types.js";

/**
 * Encode a repo URL into a filesystem-safe directory name.
 */
function encodeRepoUrl(url: string): string {
  return url.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Get the workspace data directory.
 */
function getWorkspaceDataDir(): string {
  return path.join(os.homedir(), ".openp41ge", "workspaces-data");
}

/**
 * Get the bare repo directory for a given URL.
 */
function getRepoDir(url: string): string {
  return path.join(getWorkspaceDataDir(), encodeRepoUrl(url), ".git");
}

/**
 * Get the worktrees directory for a given URL.
 */
function getWorktreesDir(url: string): string {
  return path.join(getWorkspaceDataDir(), encodeRepoUrl(url), "worktrees");
}

/**
 * Run a git command and return { stdout, stderr } or throw on non-zero exit.
 */
function runGit(args: string[], cwd?: string, timeout = 30_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Check if a repo is already cloned (bare repo exists).
 */
function repoAlreadyCloned(url: string): boolean {
  const gitDir = getRepoDir(url);
  return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
}

// ── Workspace-data remote verification helpers ───────────────────────────

/**
 * Check if a remote URL is accessible via git ls-remote.
 * Returns { ok: true } or { ok: false, error: string }.
 */
async function checkRepoAccess(url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await runGit(["ls-remote", "--heads", url]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Check a worktree branch for existence and divergence.
 *
 * If the repo isn't cloned yet, checks via ls-remote.
 * If cloned, fetches then checks local/remote divergence.
 *
 * Returns:
 *   { status: "success", warning? } | { status: "failure", error } | { status: "diverged", error } | { status: "needs-sync", error }
 */
async function checkWorktreeBranch(wsDir: string, url: string, branch: string, _isDetail = false): Promise<{
  status: "success" | "failure" | "diverged" | "needs-sync";
  error?: string;
  warning?: string;
}> {
  const gitDir = getRepoDir(url);
  const cloned = fs.existsSync(gitDir);

  if (!cloned) {
    // Repo not cloned yet — check if branch exists on remote via ls-remote
    try {
      const { stdout } = await runGit(["ls-remote", "--heads", url, "refs/heads/" + branch]);
      if (stdout.trim()) {
        return { status: "success" };
      }
      // Also check if the ref is the default branch (HEAD)
      const { stdout: headStdout } = await runGit(["ls-remote", "--symref", url, "HEAD"]);
      const headMatch = headStdout.match(/ref: refs\/heads\/(\S+)\tHEAD/);
      if (headMatch && headMatch[1] === branch) {
        return { status: "success" };
      }
      return { status: "success", warning: `Branch "${branch}" not found on remote — will be created locally` };
    } catch (e) {
      return { status: "failure", error: (e as Error).message };
    }
  }

  // Repo is cloned — fetch to get latest remote state
  try {
    await runGit(["fetch", "origin", "--quiet"], gitDir);
  } catch {
    // Fetch is best-effort — proceed with what we have
  }

  // Check if branch exists locally
  try {
    const { stdout: localBranches } = await runGit(["branch", "--list", branch], gitDir);
    const existsLocally = localBranches.trim().length > 0;

    // Check if branch exists on remote
    let existsRemotely = false;
    try {
      const { stdout: remoteBranches } = await runGit(["branch", "--list", "-r", "origin/" + branch], gitDir);
      existsRemotely = remoteBranches.trim().length > 0;
    } catch {
      // If remote check fails, proceed with local-only check
    }

    if (!existsLocally && !existsRemotely) {
      return { status: "success", warning: `Branch "${branch}" does not exist yet — will be created locally on checkout` };
    }

    if (existsLocally && existsRemotely) {
      // Check divergence: git rev-list --left-right --count
      try {
        const { stdout: counts } = await runGit(
          ["rev-list", "--left-right", "--count", `origin/${branch}...${branch}`],
          gitDir,
        );
        const trimmed = counts.trim();
        const parts = trimmed.split(/\s+/);
        if (parts.length === 2) {
          const behindRemote = parseInt(parts[0], 10);
          const aheadRemote = parseInt(parts[1], 10);
          if (behindRemote > 0 && aheadRemote > 0) {
            return {
              status: "diverged",
              error: `Local and remote branches have diverged (${aheadRemote} ahead, ${behindRemote} behind). Resolve before checking out.`,
            };
          }
          if (behindRemote > 0 || aheadRemote > 0) {
            return {
              status: "needs-sync",
              error: `Branch is ${aheadRemote > 0 ? aheadRemote + " ahead" : ""}${aheadRemote > 0 && behindRemote > 0 ? ", " : ""}${behindRemote > 0 ? behindRemote + " behind" : ""} remote. Sync to continue.`,
            };
          }
        }
      } catch {
        // Divergence check is best-effort
      }
    }

    return { status: "success" };
  } catch (e) {
    return { status: "failure", error: (e as Error).message };
  }
}

/**
 * Clone a bare repo into the workspace data directory.
 */
async function cloneBareRepo(url: string): Promise<{ ok: boolean; error?: string }> {
  const repoParentDir = path.dirname(getRepoDir(url));
  const gitDir = getRepoDir(url);

  if (fs.existsSync(gitDir)) {
    return { ok: true }; // Already exists
  }

  try {
    fs.mkdirSync(repoParentDir, { recursive: true });
    await runGit(["clone", "--bare", url, gitDir]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Checkout a worktree for a given repo URL and branch.
 */
async function checkoutWorktreeBranch(url: string, branch: string): Promise<{ ok: boolean; error?: string }> {
  const gitDir = getRepoDir(url);
  const wtDir = path.join(getWorktreesDir(url), branch.replace(/\//g, "--"));

  if (!fs.existsSync(gitDir)) {
    return { ok: false, error: "Repository not cloned yet. Clone before checking out worktrees." };
  }

  if (fs.existsSync(wtDir)) {
    return { ok: true }; // Already exists
  }

  try {
    fs.mkdirSync(path.dirname(wtDir), { recursive: true });
    await runGit(["worktree", "add", wtDir, branch], gitDir);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
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

  /**
   * Check if a repo URL is accessible (git ls-remote).
   */
  ipcMain.handle("workspaceData:checkRepoAccess", async (_event, url: string) => {
    try {
      const result = await checkRepoAccess(url);
      return result;
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  /**
   * Check if a worktree branch exists and check divergence.
   * wsDir param is unused but kept for backward compatibility.
   */
  ipcMain.handle("workspaceData:checkWorktreeBranch", async (_event, _wsDir: string, url: string, branch: string) => {
    return checkWorktreeBranch(_wsDir, url, branch);
  });

  /**
   * Check if a repo is already cloned for the given URL.
   */
  ipcMain.handle("workspaceData:repoAlreadyCloned", async (_event, url: string) => {
    return repoAlreadyCloned(url);
  });

  /**
   * Clone a bare repo into workspace-data for the given URL.
   * Returns { ok: true } or { ok: false, error }.
   */
  ipcMain.handle("workspaceData:cloneBareRepo", async (_event, url: string) => {
    return cloneBareRepo(url);
  });

  /**
   * Checkout a worktree branch for a given URL.
   * Returns { ok: true } or { ok: false, error }.
   */
  ipcMain.handle("workspaceData:checkoutWorktree", async (_event, url: string, branch: string) => {
    return checkoutWorktreeBranch(url, branch);
  });

  /**
   * Encode a repo URL into a filesystem-safe directory name.
   * Useful for the renderer to compute display paths.
   */
  ipcMain.handle("workspaceData:encodeRepoUrl", async (_event, url: string) => {
    return encodeRepoUrl(url);
  });

  /**
   * Get the workspace-data directory path.
   */
  ipcMain.handle("workspaceData:getDir", async () => {
    return getWorkspaceDataDir();
  });
}
