/**
 * Worktree sync-status classification.
 *
 * Shared logic for the workspace repos list, the Explorer sidebar, and the
 * Git sidebar: given a worktree branch's ahead/behind counters (relative to
 * its remote) and whether its folder is currently checked out, produce a
 * single state used to show a warning ("resync needed") on the row, and
 * aggregate the worst state across a repo's worktrees onto the repo row.
 */

export type WorktreeSyncState = "ok" | "needs-sync" | "diverged" | "missing" | "unknown";

export interface WorktreeSyncInfo {
  state: WorktreeSyncState;
  ahead: number;
  behind: number;
  /** True when the worktree folder is not present on disk / not cloned. */
  missing: boolean;
}

/** Amber warning colour used for sync-status indicators. */
export const WARNING_COLOR = "var(--text-warning,#e5a50a)";

/**
 * Classify a worktree from its ahead/behind counts and existence.
 * A missing folder trumps divergence which trumps being merely out of sync.
 */
export function classifyWorktree(
  ahead: number,
  behind: number,
  exists: boolean,
  known = true,
): WorktreeSyncInfo {
  const a = Math.max(0, ahead ?? 0);
  const b = Math.max(0, behind ?? 0);
  if (exists === false) return { state: "missing", ahead: a, behind: b, missing: true };
  if (!known) return { state: "unknown", ahead: a, behind: b, missing: false };
  if (a > 0 && b > 0) return { state: "diverged", ahead: a, behind: b, missing: false };
  if (a > 0 || b > 0) return { state: "needs-sync", ahead: a, behind: b, missing: false };
  return { state: "ok", ahead: 0, behind: 0, missing: false };
}

/**
 * Aggregate a set of worktree states onto a repo-level indicator.
 * Returns the worst (most urgent) state and the summed ahead/behind.
 */
export function worstOf(infos: readonly WorktreeSyncInfo[]): WorktreeSyncInfo {
  const priority: Record<WorktreeSyncState, number> = {
    missing: 4,
    diverged: 3,
    "needs-sync": 2,
    unknown: 1,
    ok: 0,
  };
  let ahead = 0;
  let behind = 0;
  const missingCount = infos.filter((i) => i.missing).length;
  let worst = infos[0] ?? { state: "ok" as const, ahead: 0, behind: 0, missing: false };
  for (const info of infos) {
    ahead += info.ahead;
    behind += info.behind;
    if (priority[info.state] > priority[worst.state]) worst = info;
  }
  return {
    state: infos.length === 0 ? "ok" : worst.state,
    ahead,
    behind,
    missing: missingCount > 0,
  };
}

/**
 * Human-readable tooltip/label for a sync state.
 */
export function worktreeStatusLabel(info: WorktreeSyncInfo): string {
  switch (info.state) {
    case "ok":
      return "In sync";
    case "missing":
      return "Folder not checked out — resync to create it";
    case "diverged":
      return `Diverged — ${info.ahead || 0} ahead, ${info.behind || 0} behind. Resolve before syncing`;
    case "needs-sync":
      return `${info.ahead || 0} ahead / ${info.behind || 0} behind — resync needed`;
    case "unknown":
      return "Sync status unknown";
  }
}
