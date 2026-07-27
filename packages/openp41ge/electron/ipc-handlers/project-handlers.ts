/**
 * Project IPC handlers — renderer <-> main process bridge for project operations.
 *
 * IPC channels:
 *   project:list       — List all project names
 *   project:exists     — Check if a project exists
 *   project:create     — Create a new project
 *   project:delete     — Delete a project
 *   project:workspaceStatePath — Get the workspace state file path for a project
 *   project:reposDir   — Get the repositories directory for a project
 */

import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import type { WorkspaceStateStore } from "../../src/main/services/workspace-state-store";
import type { ProjectStore } from "../../src/main/services/project-store";
import type { OperationDispatcher } from "../../src/main/services/operation-dispatcher";
import type { WorkspaceService } from "../../src/main/services/workspace-service";
import type { NodeGitService } from "../../src/main/services/node-git-service";
import { createWorkspace } from "../../src/layout/types.js";
import { setSidebarViewOp } from "../../src/layout/window-operations.js";

export function registerProjectHandlers(
  projectStore: ProjectStore,
  workspaceStateStore: WorkspaceStateStore,
  dispatcher: OperationDispatcher,
  workspaceService: WorkspaceService,
  gitService: NodeGitService,
  currentProjectName: () => string | null,
  setCurrentProjectName: (name: string | null) => void,
): void {
  ipcMain.handle("project:list", () => {
    return projectStore.list();
  });

  /** List all projects with their full config info (name, dates, draft status). */
  ipcMain.handle("project:listWithInfo", () => {
    return projectStore.list().map((name) => ({
      name,
      config: projectStore.readConfig(name),
    }));
  });

  ipcMain.handle("project:exists", (_event, name: string) => {
    return projectStore.exists(name);
  });

  ipcMain.handle("project:create", (_event, name: string) => {
    return projectStore.create(name);
  });

  ipcMain.handle("project:delete", (_event, name: string) => {
    return projectStore.delete(name);
  });

  ipcMain.handle("project:workspaceStatePath", (_event, name: string) => {
    return projectStore.workspaceStatePath(name);
  });

  ipcMain.handle("project:reposDir", (_event, name: string) => {
    return projectStore.reposDir(name);
  });

  /**
   * List repos for a given project, each with their worktrees.
   * Walks the repos directory tree recursively and returns repo paths
   * relative to the repos dir (e.g. "github.com/owner/repo").
   * For each repo, runs git worktree list to find worktree branches.
   */
  ipcMain.handle("project:listRepos", (_event, name: string) => {
    const reposDir = projectStore.reposDir(name);
    try {
      if (!fs.existsSync(reposDir)) return [];

      interface RepoEntry {
        name: string;
        worktrees: string[];
      }

      const repos: RepoEntry[] = [];
      const walk = (dir: string) => {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const fullPath = path.join(dir, entry.name);
          const gitDir = path.join(fullPath, ".git");
          if (fs.existsSync(gitDir)) {
            const repoName = path.relative(reposDir, fullPath);
            const worktrees = _getWorktreeBranches(gitDir);
            repos.push({ name: repoName, worktrees });
          }
          walk(fullPath);
        }
      };

      walk(reposDir);
      repos.sort((a, b) => a.name.localeCompare(b.name));
      return repos;
    } catch {
      return [];
    }
  });

  /**
   * Run git worktree list --porcelain and extract branch names.
   * Returns an array of branch names (or "(detached HEAD)" for detached worktrees).
   */
  function _getWorktreeBranches(gitDir: string): string[] {
    try {
      const output = execSync(`git --git-dir="${gitDir}" worktree list --porcelain`, {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "ignore"],
      });
      const worktrees: string[] = [];
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.startsWith("branch ")) {
          const ref = line.slice(7).trim(); // "refs/heads/branch-name"
          const branch = ref.replace("refs/heads/", "");
          worktrees.push(branch);
        }
        if (line.startsWith("HEAD ") && !lines.some((l) => l.startsWith("branch "))) {
          worktrees.push("(detached HEAD)");
        }
      }
      return worktrees.filter((b, i, arr) => arr.indexOf(b) === i); // deduplicate
    } catch {
      return [];
    }
  }

  ipcMain.handle("project:current", () => {
    return currentProjectName();
  });

  ipcMain.handle("project:saveDraftAs", async (_event, draftName: string, newName: string) => {
    return projectStore.saveDraftAs(draftName, newName);
  });

  ipcMain.handle("project:isDraft", async (_event, name: string) => {
    return projectStore.isDraft(name);
  });

  ipcMain.handle("project:gcDrafts", async () => {
    return projectStore.gcDrafts();
  });

  /**
   * Switch the current project — called from the renderer project picker.
   * Loads the project's workspace state into the dispatcher, updates the
   * repos directory to the project-scoped path, and broadcasts to all windows.
   */
  ipcMain.handle("project:switch", async (_event, name: string) => {
    // Ensure the project exists
    if (!projectStore.exists(name)) {
      return { success: false, error: `Project "${name}" does not exist` };
    }

    // Update the current project name so project:current returns the right value
    setCurrentProjectName(name);

    // Point the git and workspace services to the project-scoped repos directory
    const projectReposDir = projectStore.reposDir(name);
    gitService.setReposDir(projectReposDir);
    workspaceService.setReposDir(projectReposDir);

    // Load the project's workspace state
    const statePath = projectStore.workspaceStatePath(name);
    const saved = workspaceStateStore.load(statePath);
    if (saved) {
      // Load the saved state as-is, preserving the sidebar state
      // (open/closed) from the previous session.
      dispatcher.setWorkspace(saved);
    } else {
      // No saved state for this project — start with a fresh empty workspace
      // and open the explorer sidebar by default (like VS Code).
      const fresh = createWorkspace("ws1");
      const withExplorer = setSidebarViewOp(fresh, fresh.windows[0].id, "explorer");
      dispatcher.setWorkspace(withExplorer);
    }

    // Broadcast the updated state to all windows
    dispatcher.broadcast();

    return { success: true };
  });
}
