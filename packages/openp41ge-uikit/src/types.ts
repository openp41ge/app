import type { IconName } from "./icons/registry";

export type { IconName };

/** A sidebar-view-level data entry (repo or worktree). */
export interface RepoEntry {
  name: string;
  worktrees: WorktreeEntry[];
}

export interface WorktreeEntry {
  branch: string;
  path: string;
}
