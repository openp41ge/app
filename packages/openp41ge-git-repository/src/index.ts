/**
 * openp41ge-git-repository — Pure renderer for git repository data.
 *
 * Exports the gitBrowserRenderer utility and types for commit/file/diff
 * data structures. No web components, no DOM dependencies.
 */

export { gitBrowserRenderer } from "./git-browser-renderer";
export type {
  CommitEntry,
  BranchEntry,
  DiffStatEntry,
  GitBrowserData,
  GitBrowserCallbacks,
} from "./types";
