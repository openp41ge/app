/**
 * openp41ge-filesystem — File system service layer.
 *
 * Provides async file/directory loading with caching (stale-while-revalidate),
 * untracked file tracking, and expanded-state persistence.
 */

export type { FileEntry, WorktreeData } from "./types";
export { WorktreeFileLoader } from "./worktree-file-loader";
export { DirPersistenceService } from "./dir-persistence-service";
