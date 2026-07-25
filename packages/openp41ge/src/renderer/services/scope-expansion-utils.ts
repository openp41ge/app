/**
 * Scope expansion utilities — resolve file references from tab configs
 * and determine if they're visible in a destination workset's worktree explorer.
 *
 * Used by the drag system to detect when a cross-openp41ge tab move would
 * leave the tab's referenced files invisible in the target openp41ge's explorer.
 */

import type { Tab, RepoRef } from "../../layout/types";

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Resolve file path references from a tab's config.
 *
 * Each app type stores file references differently:
 *   - "file-viewer"     → config.filePath (single file)
 *   - "agent-chat"      → config.scopeRoots (array) or config.scopeRoot (single)
 *   - "git-repository"  → config.repoPath (repo directory)
 *
 * Returns an array of directory paths that should be visible in the
 * worktree explorer for the tab to function properly.
 */
export function resolveFileReferences(tab: Tab): string[] {
  const config = tab.config ?? {};
  const appType = tab.appType;
  const paths: string[] = [];

  if (appType === "file-viewer" || appType === "openp41ge-file-viewer") {
    if (typeof config.filePath === "string" && config.filePath) {
      paths.push(config.filePath);
    }
  }

  if (appType === "agent-chat") {
    if (Array.isArray(config.scopeRoots)) {
      for (const root of config.scopeRoots) {
        if (typeof root === "string" && root) {
          paths.push(root);
        }
      }
    } else if (typeof config.scopeRoot === "string" && config.scopeRoot) {
      paths.push(config.scopeRoot);
    }
  }

  if (appType === "git-repository") {
    if (typeof config.repoPath === "string" && config.repoPath) {
      paths.push(config.repoPath);
    }
  }

  return paths;
}

/**
 * Check if a tab is "file-scoped" — whether it references any files on disk
 * that would benefit from worktree explorer visibility.
 */
export function isFileScopedTab(tab: Tab): boolean {
  return resolveFileReferences(tab).length > 0;
}

/**
 * Given a set of referenced paths and the destination workset's repo refs,
 * determine which paths are NOT visible in the destination workset.
 *
 * A path is "visible" if it is a descendant of any visible repo worktree
 * in the destination workset.
 */
export function getUncoveredPaths(referencedPaths: string[], repoRefs: RepoRef[]): string[] {
  if (referencedPaths.length === 0) return [];

  // Collect all worktree paths for the destination window
  const visibleRoots: string[] = [];
  for (const repoRef of repoRefs) {
    for (const wt of repoRef.worktrees) {
      visibleRoots.push(wt.replace(/\/$/, ""));
    }
  }

  // For each referenced path, check if it's covered by any visible root
  const uncovered: string[] = [];
  for (const refPath of referencedPaths) {
    const normalizedRef = refPath.replace(/\/$/, "");
    const isCovered = visibleRoots.some((root) => {
      // The referenced path either starts with the visible root,
      // or the visible root starts with the referenced path.
      // Both mean the files are accessible in the explorer.
      return (
        normalizedRef.startsWith(root + "/") ||
        normalizedRef === root ||
        root.startsWith(normalizedRef + "/") ||
        root === normalizedRef
      );
    });
    if (!isCovered) {
      uncovered.push(normalizedRef);
    }
  }

  return uncovered;
}

/**
 * Determine the "parent directory" from a file path for worktree visibility.
 * If the path is a file (has an extension), returns the parent directory.
 * If it's already a directory-like path, returns as-is.
 */
export function parentDirForVisibility(filePath: string): string {
  const normalized = filePath.replace(/\/$/, "");
  // If it looks like a file (has extension after last /), get its parent dir
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash > 0) {
    const basename = normalized.slice(lastSlash + 1);
    if (basename.includes(".") && !basename.includes("/")) {
      return normalized.slice(0, lastSlash);
    }
  }
  return normalized;
}

// ─── Types ──────────────────────────────────────────────────────────────
