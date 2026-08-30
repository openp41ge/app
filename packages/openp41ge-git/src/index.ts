export { GitService } from "./git-service";
export { CloneSession } from "./clone-session";
export { IpcGitAdapter } from "./ipc-adapter";
export { TestGitAdapter } from "./test-adapter";
export type { GitAdapter } from "./git-adapter";

// Service types
export type { CloneResult, CloneProgress, RepoInfo, WorktreeInfo } from "./types";

// UI data types (shared with git-browser-renderer)
export type {
  BranchEntry,
  CommitEntry,
  DiffStatEntry,
  GitBrowserData,
  GitBrowserCallbacks,
  // Commit search (Git sidebar — commit search UI)
  SearchResultFile,
  SearchResultCommit,
  CommitSearchScope,
  CommitSearchOptions,
  SearchHunk,
  DiffLine,
  DiffDocument,
} from "./types";

// Commit-file diff view conversion
// git hunks → VS Code-style diff document for the read-only file editor.
export {
  hunksToDiffDocument,
} from "./hunks-to-diff-document";

// Git browser DOM renderer
export { gitBrowserRenderer } from "./git-browser-renderer";
