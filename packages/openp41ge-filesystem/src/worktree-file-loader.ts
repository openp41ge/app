/**
 * WorktreeFileLoader — async data layer for worktree files and directory contents.
 *
 * Manages fetching, caching, and loading-state tracking for worktree file listings
 * and directory expansions. Independent of the DOM render cycle.
 *
 * Uses a stale-while-revalidate pattern: cached data is kept on collapse so that
 * re-expanding shows content immediately. Background refreshes update the cache
 * while showing a spinner indicator on the row.
 *
 * Supports a configurable `prefetchDepth`: when > 0, each directory read asks the
 * main process for a `DirSnapshot` that also lists the contents of subdirectories
 * down to that depth. Those nested listings are stored in the same `dirContents`
 * cache, so expanding the next level is a cache hit instead of a round trip.
 *
 * Also tracks untracked files per branch (loaded alongside worktree files).
 * Git paths are relative to repo root; FileEntry.path values are absolute,
 * so we store the worktree root and relativize when comparing.
 */

import type { FileEntry, WorktreeData, DirSnapshot } from "./types";

interface BranchUntrackedInfo {
  /** Root path of the worktree (e.g. /Users/foo/repo). */
  worktreeRoot: string;
  /** Set of untracked file paths relative to repo root (e.g. src/file.ts). */
  relativePaths: Set<string>;
}

export class WorktreeFileLoader {
  /** Cached file entries for each worktree branch. Kept across collapse/expand. */
  readonly worktreeFiles = new Map<string, FileEntry[]>();

  /** Untracked file info per branch (worktree root + relative paths from git). */
  private _untrackedInfo = new Map<string, BranchUntrackedInfo>();

  /** Branches currently loading (first load). */
  readonly loadingWorktreeFiles = new Set<string>();

  /** Branches currently refreshing (background revalidate). */
  readonly refreshingWorktreeFiles = new Set<string>();

  /** Cached directory contents keyed by absolute path. Kept across collapse/expand. */
  readonly dirContents = new Map<string, FileEntry[]>();

  /** Directory paths currently loading. */
  readonly loadingDirs = new Set<string>();

  /** Directory paths currently refreshing. */
  readonly refreshingDirs = new Set<string>();

  /**
   * How many levels of subdirectory listings to prefetch per read.
   * 0 disables prefetching (each level loads on demand).
   */
  prefetchDepth = 0;

  /**
   * Expand a worktree. If cached data exists, returns immediately and triggers
   * a background refresh. Otherwise loads fresh with a loading state.
   * Returns true if data is available (cached or just loaded).
   */
  async expandWorktreeFiles(
    branch: string,
    path: string,
    repoName: string,
    onUpdate?: () => void,
  ): Promise<boolean> {
    if (this.worktreeFiles.has(branch)) {
      // Stale data available — show immediately, refresh in background
      this._refreshWorktreeFiles(branch, path, repoName, onUpdate);
      return true;
    }

    // First load
    this.loadingWorktreeFiles.add(branch);
    onUpdate?.();
    try {
      await this._readDirTree(path, true, branch);
    } catch {
      this.worktreeFiles.set(branch, []);
    }

    // Fetch untracked files in the background
    await this._fetchUntracked(branch, path, repoName);

    this.loadingWorktreeFiles.delete(branch);
    onUpdate?.();
    return true;
  }

  /**
   * Collapse a worktree — keeps cached data for instant re-expand.
   */
  collapseWorktreeFiles(branch: string): void {
    this.loadingWorktreeFiles.delete(branch);
    this.refreshingWorktreeFiles.delete(branch);
  }

  /**
   * Background refresh of worktree files — updates cache while stale data is shown.
   */
  private async _refreshWorktreeFiles(
    branch: string,
    path: string,
    repoName: string,
    onUpdate?: () => void,
  ): Promise<void> {
    this.refreshingWorktreeFiles.add(branch);
    onUpdate?.();
    try {
      await this._readDirTree(path, true, branch);
    } catch {
      // Keep stale data on error
    }
    await this._fetchUntracked(branch, path, repoName);
    this.refreshingWorktreeFiles.delete(branch);
    onUpdate?.();
  }

  private async _fetchUntracked(
    branch: string,
    worktreeRoot: string,
    repoName: string,
  ): Promise<void> {
    if (!repoName) return;
    try {
      const untracked = await window.openp41ge.workspaceController.getUntrackedFiles(repoName);
      this._untrackedInfo.set(branch, {
        worktreeRoot,
        relativePaths: new Set(untracked),
      });
    } catch {
      // Non-fatal
    }
  }

  /**
   * Check if a file path is untracked in the given branch.
   *
   * `filePath` is absolute (from FileEntry). We strip the worktree root
   * prefix, then prepend the worktree directory name to build a
   * repo-relative path matching git ls-files output.
   */
  isUntracked(branch: string, filePath: string): boolean {
    const info = this._untrackedInfo.get(branch);
    if (!info) return false;

    const root = info.worktreeRoot.endsWith("/") ? info.worktreeRoot : info.worktreeRoot + "/";
    if (!filePath.startsWith(root)) return false;
    const worktreeRelative = filePath.slice(root.length);

    const dirName = info.worktreeRoot.split("/").filter(Boolean).pop()!;
    const repoRelative = dirName + "/" + worktreeRelative;

    return info.relativePaths.has(repoRelative);
  }

  /**
   * Expand a directory. If cached, shows immediately and refreshes in background.
   * Otherwise loads fresh. Returns true if data is available.
   */
  async expandDir(branch: string, dirPath: string, onUpdate?: () => void): Promise<boolean> {
    if (this.dirContents.has(dirPath)) {
      // Stale data available — refresh in background
      this._refreshDir(dirPath, onUpdate);
      return true;
    }

    this.loadingDirs.add(dirPath);
    onUpdate?.();
    try {
      await this._readDirTree(dirPath, false);
    } catch {
      this.dirContents.set(dirPath, []);
    }
    this.loadingDirs.delete(dirPath);
    onUpdate?.();
    return true;
  }

  /**
   * Collapse a directory — keeps cached data for instant re-expand.
   */
  collapseDir(branch: string, dirPath: string): void {
    this.loadingDirs.delete(dirPath);
    this.refreshingDirs.delete(dirPath);
  }

  private async _refreshDir(dirPath: string, onUpdate?: () => void): Promise<void> {
    this.refreshingDirs.add(dirPath);
    onUpdate?.();
    try {
      await this._readDirTree(dirPath, false);
    } catch {
      // Keep stale data on error
    }
    this.refreshingDirs.delete(dirPath);
    onUpdate?.();
  }

  /**
   * Read a directory (and, when `prefetchDepth > 0`, its subdirectory listings
   * down to that depth) and store the results in the relevant cache.
   *
   * `isWorktreeRoot` routes the node's own entries to `worktreeFiles[branch]`
   * (for the worktree root) or to `dirContents[path]` (for a subdirectory).
   * Every nested snapshot is stored in `dirContents` regardless.
   */
  private async _readDirTree(
    rootPath: string,
    isWorktreeRoot: boolean,
    branch?: string,
  ): Promise<void> {
    if (this.prefetchDepth > 0 && typeof window.openp41ge.file.readTree === "function") {
      // Prefetch the nested listings. If the main process is a build that
      // predates the `file:readTree` channel (or the read otherwise fails),
      // fall back to a flat readdir so the worktree never ends up empty.
      try {
        const snapshot = await window.openp41ge.file.readTree(rootPath, this.prefetchDepth);
        this._applySnapshot(snapshot, isWorktreeRoot, branch);
        return;
      } catch {
        // Fall through to the flat readdir below.
      }
    }
    const entries = await window.openp41ge.file.readdir(rootPath);
    if (isWorktreeRoot && branch) this.worktreeFiles.set(branch, entries);
    else this.dirContents.set(rootPath, entries);
  }

  /** Flatten a `DirSnapshot` into the per-path caches. */
  private _applySnapshot(snapshot: DirSnapshot, isWorktreeRoot: boolean, branch?: string): void {
    if (isWorktreeRoot && branch) {
      this.worktreeFiles.set(branch, snapshot.entries);
    } else {
      this.dirContents.set(snapshot.path, snapshot.entries);
    }
    for (const child of snapshot.children) {
      this._applySnapshot(child, false);
    }
  }

  /**
   * Get cached entries for a worktree branch or subdirectory.
   */
  getEntries(branch: string, parentPath?: string): FileEntry[] {
    if (parentPath) {
      return this.dirContents.get(parentPath) ?? [];
    }
    return this.worktreeFiles.get(branch) ?? [];
  }

  isLoadingWorktree(branch: string): boolean {
    return this.loadingWorktreeFiles.has(branch);
  }

  isRefreshingWorktree(branch: string): boolean {
    return this.refreshingWorktreeFiles.has(branch);
  }

  isLoadingDir(dirPath: string): boolean {
    return this.loadingDirs.has(dirPath);
  }

  isRefreshingDir(dirPath: string): boolean {
    return this.refreshingDirs.has(dirPath);
  }

  isWorktreeLoaded(branch: string): boolean {
    return this.worktreeFiles.has(branch);
  }

  /**
   * Whether the given directory is cached (either from a direct read or as a
   * prefetched subdirectory of a deeper read).
   */
  hasDir(dirPath: string): boolean {
    return this.dirContents.has(dirPath);
  }

  /**
   * Load restored files for all expanded worktrees and directories.
   * Idempotent — no-ops once files are already cached.
   */
  async loadRestoredFiles(
    expandedWorktrees: Set<string>,
    expandedDirs: Map<string, Set<string>>,
    worktrees: WorktreeData[],
    repoName: string,
    onUpdate?: () => void,
  ): Promise<void> {
    const worktreeRoots = new Map<string, string>();

    for (const wt of worktrees) {
      if (!expandedWorktrees.has(wt.branch)) continue;
      const path = wt.path || `${repoName}/${wt.branch}`;
      worktreeRoots.set(wt.branch, path);

      if (this.worktreeFiles.has(wt.branch)) {
        // Already cached — refresh in background
        this._refreshWorktreeFiles(wt.branch, path, repoName, onUpdate);
        continue;
      }
      this.loadingWorktreeFiles.add(path);
      onUpdate?.();
      try {
        await this._readDirTree(path, true, wt.branch);
      } catch {
        this.worktreeFiles.set(wt.branch, []);
      }
      this.loadingWorktreeFiles.delete(path);
      onUpdate?.();
    }

    // Also fetch untracked files for restored worktrees
    if (repoName && expandedWorktrees.size > 0) {
      try {
        const untracked = await window.openp41ge.workspaceController.getUntrackedFiles(repoName);
        for (const [branch, rootPath] of worktreeRoots) {
          this._untrackedInfo.set(branch, {
            worktreeRoot: rootPath,
            relativePaths: new Set(untracked),
          });
        }
      } catch {
        // Non-fatal
      }
    }

    for (const [, dirs] of expandedDirs) {
      for (const dirPath of dirs) {
        if (this.dirContents.has(dirPath)) {
          // Already cached — refresh in background
          this._refreshDir(dirPath, onUpdate);
          continue;
        }
        this.loadingDirs.add(dirPath);
        onUpdate?.();
        try {
          await this._readDirTree(dirPath, false);
        } catch {
          this.dirContents.set(dirPath, []);
        }
        this.loadingDirs.delete(dirPath);
        onUpdate?.();
      }
    }
  }

  clearWorktreeFiles(branch: string): void {
    this.worktreeFiles.delete(branch);
    this._untrackedInfo.delete(branch);
    this.loadingWorktreeFiles.delete(branch);
    this.refreshingWorktreeFiles.delete(branch);
  }

  /**
   * Clear the cached entries for a directory and everything nested below it
   * (including prefetched subdirectory listings).
   */
  clearDirContents(branch: string, dirPath: string): void {
    this._deleteDirTree(dirPath);
  }

  private _deleteDirTree(dirPath: string): void {
    this.dirContents.delete(dirPath);
    this.loadingDirs.delete(dirPath);
    this.refreshingDirs.delete(dirPath);
    const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
    for (const [key] of this.dirContents) {
      if (key.startsWith(prefix)) {
        this.dirContents.delete(key);
        this.loadingDirs.delete(key);
        this.refreshingDirs.delete(key);
      }
    }
  }

  /**
   * Clear every cached directory under a worktree root (used by worktree/subtree
   * refreshes and by external-change invalidation).
   */
  clearWorktreeDirs(worktreeRoot: string): void {
    this._deleteDirTree(worktreeRoot);
  }
}
