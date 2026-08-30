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
} from "./types";

// Commit-file diff view conversion
// git hunks + full file content → ONE inline-diff document loaded into the
// file editor as a real buffer with additions/deletions decorated in place
// (green adds / red deleted lines, real gutter numbers — no @@ headers).
export {
  buildInlineDiffFile,
  type InlineDiffRow,
  type InlineDiffFile,
} from "./build-inline-diff-file";

// Git browser DOM renderer
export { gitBrowserRenderer } from "./git-browser-renderer";
