/**
 * openp41ge-git-repository — Git repository browser as a standalone package.
 *
 * Provides:
 * - GitBrowserRenderer — pure DOM rendering for the accordion UI
 * - Shared types (BranchEntry, CommitEntry, DiffStatEntry, GitBrowserData, GitBrowserCallbacks)
 */

export { gitBrowserRenderer } from "./services/git-browser-renderer";
export type {
  GitBrowserData,
  GitBrowserCallbacks,
  BranchEntry,
  CommitEntry,
  DiffStatEntry,
} from "./services/types";
