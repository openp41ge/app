// ─── Service types (raw git data) ─────────────────────────────────────────

/** Result of a clone operation. */
export interface CloneResult {
  success: boolean;
  path?: string;
  error?: string;
}

/** Progress information during a clone. */
export interface CloneProgress {
  percent: number;
  message: string;
}

/** Info about a cloned repository. */
export interface RepoInfo {
  path: string;
  name: string;
  url: string;
}

/** Info about a worktree. */
export interface WorktreeInfo {
  branch: string;
  path: string;
  exists: boolean;
}

// ─── UI-oriented git data types (used by git-browser-renderer and consumers) ──

/** Branch entry with tracking info. */
export interface BranchEntry {
  name: string;
  /** Display-friendly short name (e.g. "main" instead of "refs/heads/main"). */
  shortName?: string;
  isLocal?: boolean;
  isCurrent?: boolean;
  tracking?: string;
  ahead: number;
  behind: number;
  lastCommit?: CommitEntry | null;
}

/** A single commit entry. */
export interface CommitEntry {
  hash: string;
  shortHash?: string;
  authorName?: string;
  authorEmail?: string;
  /** Backed by raw `author` from service. */
  author?: string;
  date: string;
  relativeDate?: string;
  message: string;
  fullMessage?: string;
  refs?: string[];
  parents?: string[];
}

/** Diff stat entry. */
export interface DiffStatEntry {
  filePath: string;
  added: number;
  deleted: number;
  status?: "added" | "modified" | "deleted" | "renamed";
  /** Backed by raw `file` from service. */
  file?: string;
  /** Backed by raw `additions` from service. */
  additions?: number;
  /** Backed by raw `deletions` from service. */
  deletions?: number;
}

/** Full data snapshot for the git repository panel. */
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

/** Callbacks for git browser renderer (legacy — will be replaced by events). */
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
