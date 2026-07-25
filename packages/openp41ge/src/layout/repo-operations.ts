/**
 * Repository operations — manage repoRefs at the window level.
 *
 * Each window has its own list of repoRefs that determine which repos
 * are shown in the worktree explorer for that window.
 * Visibility toggles have been removed — all repos in the list are visible.
 */

import type { Workspace } from "./types.js";
import { mapWindow } from "./common.js";

export function addRepoRef(
  workspace: Workspace,
  windowId: string,
  name: string,
  url: string,
  worktrees?: string[],
): Workspace {
  return mapWindow(workspace, windowId, (win) => {
    if (win.repoRefs.some((r) => r.name === name)) return win;
    return {
      ...win,
      repoRefs: [...win.repoRefs, { name, url, worktrees: worktrees ?? [] }],
    };
  });
}

export function removeRepoRef(workspace: Workspace, windowId: string, name: string): Workspace {
  return mapWindow(workspace, windowId, (win) => ({
    ...win,
    repoRefs: win.repoRefs.filter((r) => r.name !== name),
  }));
}

export function addWorktreeToRepoRef(
  workspace: Workspace,
  windowId: string,
  repoName: string,
  branch: string,
): Workspace {
  return mapWindow(workspace, windowId, (win) => ({
    ...win,
    repoRefs: win.repoRefs.map((r) => {
      if (r.name !== repoName) return r;
      if (r.worktrees.includes(branch)) return r;
      return { ...r, worktrees: [...r.worktrees, branch] };
    }),
  }));
}

export function hasRepoInWindow(workspace: Workspace, windowId: string, repoName: string): boolean {
  const win = workspace.windows.find((w) => w.id === windowId);
  if (!win) return false;
  return win.repoRefs.some((r) => r.name === repoName);
}
