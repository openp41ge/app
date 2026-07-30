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

/** In-memory cache: projectName → repo name order. Populated by setRepoOrder,
 *  read by listRepos, survives across IPC calls within the same process lifetime. */
const _repoOrderCache = new Map<string, string[]>();
import type { WorkspaceStateStore } from "../../src/main/services/workspace-state-store";
import type { ProjectStore } from "../../src/main/services/project-store";
import type { OperationDispatcher } from "../../src/main/services/operation-dispatcher";
import type { WorkspaceService } from "../../src/main/services/workspace-service";
import type { NodeGitService } from "../../src/main/services/node-git-service";
import type { NodeGitCommitService } from "../../src/main/services/node-git-commit-service";
import { createWorkspace } from "../../src/layout/types.js";
import { setSidebarViewOp } from "../../src/layout/window-operations.js";
import { addColumnTabAt } from "../../src/layout/tab-operations.js";

export function registerProjectHandlers(
  projectStore: ProjectStore,
  workspaceStateStore: WorkspaceStateStore,
  dispatcher: OperationDispatcher,
  workspaceService: WorkspaceService,
  gitService: NodeGitService,
  gitCommitService: NodeGitCommitService,
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
   * Repos are sorted by the persisted order (if any), falling back to
   * alphabetical order.
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
            if (fs.statSync(gitDir).isDirectory()) {
              // Bare repo — add it and look for worktrees
              const repoName = path.relative(reposDir, fullPath);
              const worktrees = _getWorktreeBranches(gitDir);
              repos.push({ name: repoName, worktrees });
            }
            // Worktree subdirectory (.git is a file) — skip walking into it
            continue;
          }
          walk(fullPath);
        }
      };

      walk(reposDir);
      // Apply persisted order (check in-memory cache first, then file), fall back to alphabetical
      const order = _repoOrderCache.has(name)
        ? _repoOrderCache.get(name)!
        : projectStore.readRepoOrder(name);
      if (order) {
        const orderMap = new Map(order.map((n, i) => [n, i]));
        repos.sort((a, b) => {
          const ai = orderMap.get(a.name);
          const bi = orderMap.get(b.name);
          if (ai !== undefined && bi !== undefined) return ai - bi;
          if (ai !== undefined) return -1;
          if (bi !== undefined) return 1;
          return a.name.localeCompare(b.name);
        });
      } else {
        repos.sort((a, b) => a.name.localeCompare(b.name));
      }
      return repos;
    } catch {
      return [];
    }
  });

  /** Persist the repo display order for a project and update the in-memory cache. */
  ipcMain.handle("project:setRepoOrder", (_event, name: string, order: string[]) => {
    projectStore.writeRepoOrder(name, order);
    _repoOrderCache.set(name, order);
    return true;
  });

  /**
   * Find worktree branches for a repo.
   * Worktrees are subdirectories under the repo directory that contain
   * a .git file (pointer file to the bare repo).
   * The directory name is the branch name with '/' replaced by '--'.
   * We reverse that to show the original branch name.
   */
  function _getWorktreeBranches(gitDir: string): string[] {
    try {
      const repoDir = path.dirname(gitDir);
      const entries = fs.readdirSync(repoDir, { withFileTypes: true });
      const worktrees: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === ".git") continue;
        const fullPath = path.join(repoDir, entry.name);
        const gitFile = path.join(fullPath, ".git");
        if (fs.existsSync(gitFile)) {
          // Convert directory name back to branch name: "feature--branch" → "feature/branch"
          const branch = entry.name.replace(/--/g, "/");
          worktrees.push(branch);
        }
      }
      return worktrees.sort();
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

  ipcMain.handle("project:createDraft", async () => {
    const name = projectStore.createDraft();
    setCurrentProjectName(name);
    const projectReposDir = projectStore.reposDir(name);
    gitService.setReposDir(projectReposDir);
    gitCommitService.setReposDir(projectReposDir);
    workspaceService.setReposDir(projectReposDir);
    const statePath = projectStore.workspaceStatePath(name);
    const saved = workspaceStateStore.load(statePath);
    if (saved) {
      dispatcher.setWorkspace(saved);
    } else {
      const fresh = createWorkspace("ws1");
      const withExplorer = setSidebarViewOp(fresh, fresh.windows[0].id, "explorer");
      dispatcher.setWorkspace(withExplorer);
    }
    dispatcher.broadcast();
    return name;
  });

  ipcMain.handle("project:rename", async (_event, oldName: string, newName: string) => {
    return projectStore.rename(oldName, newName);
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
    gitCommitService.setReposDir(projectReposDir);
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

    // Re-add the project picker as an ephemeral tab in column 0 of
    // the first window — included directly in the broadcast so there is
    // no timing gap on the renderer side.
    const ws = dispatcher.getWorkspace();
    if (ws.windows.length > 0) {
      const firstWinId = ws.windows[0].id;
      const withPicker = addColumnTabAt(ws, firstWinId, "project-picker", "Project Switcher", "", 0, true);
      dispatcher.setWorkspace(withPicker);
    }

    // Broadcast the updated state to all windows
    dispatcher.broadcast();

    return { success: true };
  });
}
