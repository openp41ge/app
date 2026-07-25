/**
 * WorktreePersistence — handles save/load of worktree UI state to localStorage.
 *
 * Responsible for:
 * - Expanded repo/worktree/directory state
 * - Drawer width
 * - Persistence key management
 *
 * Extracted from module-level mutable state in openp41ge-worktree-tree.ts.
 */

const STORAGE_KEY = "openp41ge-worktree-tree-state";
const EDIT_MODE_KEY = "openp41ge-worktree-edit-mode";

export interface PersistedState {
  drawerWidth: number;
  treeColumnWidth?: number;
  expandedRepos: string[];
  expandedWorktrees: string[];
  expandedDirs: string[];
}

export interface WorktreeState {
  expandedRepos: Set<string>;
  expandedWorktrees: Set<string>;
  expandedDirs: Set<string>;
  drawerWidth: number;
}

export class WorktreePersistence {
  load(): WorktreeState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const saved: PersistedState = JSON.parse(raw);
      return {
        drawerWidth: saved.treeColumnWidth ?? saved.drawerWidth ?? 280,
        expandedRepos: new Set(saved.expandedRepos ?? []),
        expandedWorktrees: new Set(saved.expandedWorktrees ?? []),
        expandedDirs: new Set(saved.expandedDirs ?? []),
      };
    } catch {
      return null;
    }
  }

  save(state: WorktreeState): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          treeColumnWidth: state.drawerWidth,
          expandedRepos: Array.from(state.expandedRepos),
          expandedWorktrees: Array.from(state.expandedWorktrees),
          expandedDirs: Array.from(state.expandedDirs),
        }),
      );
    } catch {
      /* ignore quota errors */
    }
  }

  loadEditMode(): boolean {
    try {
      return localStorage.getItem(EDIT_MODE_KEY) === "true";
    } catch {
      return false;
    }
  }

  saveEditMode(enabled: boolean): void {
    try {
      localStorage.setItem(EDIT_MODE_KEY, enabled ? "true" : "false");
    } catch {
      /* ignore */
    }
  }

  /**
   * Migrate legacy edit-mode state from the old localStorage key format.
   */
  static migrateLegacy(): void {
    try {
      const oldVal = localStorage.getItem("wt-edit-mode");
      if (oldVal !== null && localStorage.getItem(EDIT_MODE_KEY) === null) {
        localStorage.setItem(EDIT_MODE_KEY, oldVal);
        localStorage.removeItem("wt-edit-mode");
      }
    } catch {
      /* ignore */
    }
  }
}

/** Singleton persistence instance. */
export const worktreePersistence = new WorktreePersistence();
