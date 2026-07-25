/**
 * Shared git data types used by GitBrowserRenderer and downstream consumers.
 *
 * These mirror the main-process types in GitCommitService but are
 * re-declared here so this package has zero dependency on the main process.
 */

export interface CommitEntry {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  relativeDate: string;
  message: string;
  fullMessage: string;
  refs: string[];
  parents: string[];
}

export interface BranchEntry {
  name: string;
  shortName: string;
  isLocal: boolean;
  isCurrent: boolean;
  tracking?: string;
  ahead: number;
  behind: number;
  lastCommit: CommitEntry | null;
}

export interface DiffStatEntry {
  filePath: string;
  added: number;
  deleted: number;
  status: "added" | "modified" | "deleted" | "renamed";
}

export interface GitBrowserData {
  repoName: string;
  branches: BranchEntry[];
  selectedBranch: string;
  commits: CommitEntry[];
  filesChanged: DiffStatEntry[];
  loadingBranches: boolean;
  loadingCommits: boolean;
  loadingFiles: boolean;
  commitSkipCount: number;
  hasMoreCommits: boolean;
  visibleCommitCount: number;
  selectedCommit: string | null;
  error?: string;
}

export interface GitBrowserCallbacks {
  onSelectBranch: (branchName: string) => void;
  onSelectCommit: (commitHash: string | null) => void;
  onRefreshBranches: () => void;
  onRefreshCommits: () => void;
  onRefreshFiles: () => void;
  onLoadMoreCommits: () => void;
  onClose: () => void;
  onCheckoutWorktree: (branchName: string) => void;
  onBranchContextMenu: (branchName: string, x: number, y: number) => void;
  onFileRowClick: (filePath: string) => void;
}
