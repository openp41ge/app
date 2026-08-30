export {};

declare global {
  interface Window {
    openp41ge: {
      platform: string;
      isDev: () => boolean;
      isTest: boolean;
      /** Show a native context menu. Returns the id of the clicked item, or null if dismissed. */
      showContextMenu: (items: Array<{ label: string; id: string }>) => Promise<string | null>;
      window: {
        minimize: () => void;
        maximize: () => void;
        maximizeAnimated: () => void;
        startDrag: () => void;
        dragMove: (x: number, y: number) => void;
        endDrag: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
        getBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
        openDevTools: () => void;
      };
      workspace: {
        getState: () => Promise<string>;
        dispatch: (fn: string, ...args: unknown[]) => void;
        onStateUpdate: (callback: (stateJson: string) => void) => () => void;
        getWindowId: () => string | null;
        waitForInit: () => Promise<void>;
        detachPane: (windowId: string, paneId: string, bounds?: { x: number; y: number; width: number; height: number }) => void;
        detachTab: (
          windowId: string,
          tabId: string,
          bounds?: { x: number; y: number; width: number; height: number },
          dropScreenX?: number,
          dropScreenY?: number,
        ) => void;
        cmdNewWindow: () => void;
        cmdNewPage: () => void;
        cmdNewTab: () => void;
        cmdCloseTab: () => void;
        cmdNewColumn: () => void;
        confirmRemoveTab: (windowId: string, tabId: string) => Promise<boolean>;
        onConfirm: (callback: (optionsJson: string) => void) => void;
        confirmResponse: (result: boolean) => void;
        reset: () => void;
        onReset: (callback: () => void) => () => void;
      };
      drag: {
        start: (label: string, screenX: number, screenY: number, emoji?: string, tabId?: string, winId?: string, worksetId?: string, tabWidth?: number, tabHeight?: number, offsetX?: number, offsetY?: number, dragType?: string, filePath?: string, captureRect?: { x: number; y: number; width: number; height: number }, inset?: number, openTabData?: { appType?: string; tabConfig?: Record<string, unknown> }) => void;
        move: (screenX: number, screenY: number) => void;
        end: () => void;
        activate: () => void;
        ghostForward: (screenX: number, screenY: number) => void;
        check: (screenX: number, screenY: number, dragData?: string) => Promise<{ target: Record<string, unknown> | null; windowId: string } | null>;
        getActive: () => Promise<{
          sourceWinId: string;
          label: string;
          dragData:
            | { tabId: string; winId: string; worksetId: string; type: "tab"; title?: string }
            | { type: "file"; filePath: string; fileName?: string }
            | { type: "open-tab"; appType: string; title?: string; tabConfig?: Record<string, unknown> };
        } | null>;
        endSession: () => void;
        onEndSession: (callback: () => void) => () => void;
        ghostShow: (targetWinId: string, screenX: number, screenY: number, label: string) => void;
        ghostHide: (targetWinId: string) => void;
        onGhostShow: (callback: (data: { screenX: number; screenY: number; label: string }) => void) => void;
        onGhostHide: (callback: () => void) => void;
        onDragState: (callback: (state: { active: boolean; type: string | null }) => void) => void;
      };

      terminal: {
        spawn: (paneId: string) => void;
        write: (paneId: string, data: string) => void;
        resize: (paneId: string, cols: number, rows: number) => void;
        kill: (paneId: string) => void;
        onData: (paneId: string, callback: (data: string) => void) => () => void;
        onExit: (paneId: string, callback: (code: number | null) => void) => () => void;
      };

      workspaceController: {
        clone: (url: string) => {
          promise: Promise<{ success: boolean; path?: string; error?: string }>;
          onProgress: (fn: (progress: { percent: number; message: string }) => void) => () => void;
          destroy: () => void;
        };
        listRepos: () => Promise<Array<{ path: string; name: string; url: string }>>;
        getRepo: (name: string) => Promise<{ path: string; name: string; url: string } | null>;
        listWorktrees: (repoName: string) => Promise<Array<{ branch: string; path: string; exists: boolean }>>;
        checkoutWorktree: (repoName: string, branch: string) => Promise<{ branch: string; path: string; exists: boolean }>;
        deleteWorktree: (repoName: string, branch: string) => Promise<void>;
        fetch: (repoName: string) => Promise<void>;
        /** Pull latest changes for a branch and update its worktree. */
        pullBranch: (repoName: string, branch: string) => Promise<void>;
        listBranches: (repoName: string) => Promise<string[]>;
        getDefaultBranch: (repoName: string) => Promise<string | null>;
        /** Get commit log for a branch with hash-based pagination. */
        getCommitLog: (repoName: string, branch: string, options?: { maxCount?: number; after?: string }) => Promise<CommitEntry[]>;
        /** Get all branches with ahead/behind tracking. */
        getBranches: (repoName: string) => Promise<BranchEntry[]>;
        /** Get diff stat for a commit or working tree. */
        getDiffStat: (repoName: string, commitHash?: string) => Promise<DiffStatEntry[]>;
        /** Get a single commit's full data (incl. complete message) by hash, or null. */
        getCommitMessage: (repoName: string, hash: string) => Promise<CommitEntry | null>;
        /** Lazy content-search helper: hunks of one commit+file containing the query. */
        getCommitFileHunks: (
          repoName: string,
          hash: string,
          path: string,
          query: string,
          options: Pick<CommitSearchOptions, "regex" | "caseSensitive">,
        ) => Promise<SearchHunk[]>;
        /** Delete a local branch. */
        deleteLocalBranch: (repoName: string, branchName: string, force?: boolean) => Promise<void>;

        /** Get untracked file paths for a repository. */
        getUntrackedFiles: (repoName: string) => Promise<string[]>;

        /** Search commit history (repoName null = across all repos). */
        searchCommits: (
          repoNames: string[] | null,
          options: CommitSearchOptions,
        ) => Promise<SearchResultCommit[]>;
      };

      dialog: {
        /** Open native file picker for .openp41ge-workspace files. Returns { filePath, data } or null. */
        openWorkspaceFile: () => Promise<{ filePath: string; data: import("../../layout/types").WorkspaceFileData } | null>;

        /** Open native save dialog for .openp41ge-workspace files. Returns path or null. */
        saveWorkspaceFile: (data: import("../../layout/types").WorkspaceFileData, defaultPath?: string) => Promise<string | null>;

        /** Open native folder picker. Returns path or null. */
        pickFolder: () => Promise<string | null>;

        /** Read a .openp41ge-workspace file at a known path (no dialog). */
        readWorkspaceFile: (filePath: string) => Promise<{ filePath: string; data: import("../../layout/types").WorkspaceFileData } | null>;

        /** Write a .openp41ge-workspace file to a known path (no dialog). */
        writeWorkspaceFile: (filePath: string, data: import("../../layout/types").WorkspaceFileData) => Promise<boolean>;

        /** Ensure a directory exists. */
        ensureDir: (dirPath: string) => Promise<boolean>;

        /** Reveal a file/folder in the native file manager (Finder). */
        revealInFinder: (filePath: string) => Promise<boolean>;

        /** List all .openp41ge-workspace files in ~/.openp41ge/workspaces/. */
        listWorkspaces: () => Promise<Array<{ filePath: string; data: import("../../layout/types").WorkspaceFileData }>>;

        /** Delete a workspace file; optionally also remove its data dir when deleteData is true. */
        deleteWorkspaceFile: (filePath: string, deleteData?: boolean) => Promise<boolean>;
      };

      /** Workspace manager git operations (workspace-data/ directory). */
      workspaceData: {
        /** Check if a repo URL is accessible via git ls-remote. */
        checkRepoAccess: (url: string) => Promise<{ ok: boolean; error?: string }>;
        /** Check branch existence and divergence for a worktree. */
        checkWorktreeBranch: (wsDir: string, url: string, branch: string) => Promise<{
          status: "success" | "failure" | "diverged" | "needs-sync" | "missing";
          error?: string;
          warning?: string;
        }>;
        /** Check if a bare repo already exists for the given URL. */
        repoAlreadyCloned: (url: string) => Promise<boolean>;
        /** Clone a bare repo into workspace-data for the given URL. */
        cloneBareRepo: (url: string) => Promise<{ ok: boolean; error?: string }>;
        /** Resync a worktree branch to match its remote (fetch + reset to origin/<branch>). */
        syncWorktree: (url: string, branch: string) => Promise<{ ok: boolean; error?: string }>;
        /** Checkout a worktree branch. */
        checkoutWorktree: (url: string, branch: string) => Promise<{ ok: boolean; error?: string }>;
        /** Encode a repo URL into a filesystem-safe directory name. */
        encodeRepoUrl: (url: string) => Promise<string>;
        /** Get the workspace-data directory path. */
        getDir: () => Promise<string>;
        /** Aggregate working-tree change stats (edits) for a saved workspace's worktrees. */
        getWorkspaceStats: (repos: Array<{ url: string; worktrees?: string[] }>) => Promise<{
          filesChanged: number;
          added: number;
          deleted: number;
          untracked: number;
        }>;
      };

      lifecycle: {
        /** Notify the main process that the renderer's first render completed. */
        notifyReady: () => void;
        /** Subscribe to main-process error reports forwarded for display. */
        onError: (callback: (error: { message: string; source?: string; stack?: string }) => void) => () => void;
      };

      file: {
        readdir: (dirPath: string) => Promise<FileEntry[]>;
        stat: (filePath: string) => Promise<FileEntry | null>;
        readRange: (filePath: string, offset: number, length: number) => Promise<{ data: string; totalSize: number }>;
        readChunked: (filePath: string) => {
          promise: Promise<{ data: string; totalSize: number }>;
          onProgress: (fn: (progress: { loaded: number; total: number; chunk: string }) => void) => () => void;
          destroy: () => void;
        };
        search: (query: string, rootPaths: string[]) => Promise<FileSearchResult[]>;
        getScope: () => Promise<string[]>;
        addScope: (dirPath: string) => Promise<boolean>;
        removeScope: (dirPath: string) => Promise<boolean>;
        pickFolder: () => Promise<string | null>;
        listRecent: (rootPaths: string[]) => Promise<{ path: string; name: string; dir: string }[]>;
        gitBranch: (dirPath: string) => Promise<string | null>;
        writeFile: (filePath: string, content: string) => Promise<{ success: boolean }>;
      };

      /** Persistent log bus → main process (files under ~/.openp41ge/logs). */
      logs: {
        /** Forward a batch of captured log entries to disk. */
        append: (entries: Array<Record<string, unknown>>) => void;
        /** Session debug toggle → also lower the main process capture level. */
        setDebug: (enabled: boolean) => void;
        /** Query persisted log history. Returns [] when none. */
        query: (filter?: LogQueryFilter) => Promise<PersistedLogEntryShape[]>;
        /** Get the logs directory path. */
        getPath: () => Promise<{ logsDir: string }>;
        /** List log files (name, size, mtime). */
        listFiles: () => Promise<Array<{ name: string; sizeBytes: number; mtimeMs: number }>>;
      };

      onZoomIn: (callback: () => void) => () => void;
      onZoomOut: (callback: () => void) => () => void;
      onZoomReset: (callback: () => void) => () => void;

      /** Listen for File > New Workspace... menu action. */
      onNewWorkspace: (callback: () => void) => () => void;
      /** Listen for File > Open Workspace... menu action. */
      onOpenWorkspace: (callback: () => void) => () => void;
      /** Listen for File > Save Workspace As... menu action. */
      onSaveWorkspaceAs: (callback: () => void) => () => void;
      /** Listen for View > Workspaces… menu action (opens the system overlay). */
      onOpenWorkspaces: (callback: () => void) => () => void;
      /** Listen for View > Logs… menu action (opens the system overlay Logs tab). */
      onOpenLogs: (callback: () => void) => () => void;

      config: {
        get: (key?: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
        getAll: () => Promise<Record<string, any>>;
      };

    };

    // @deprecated — no longer consumed by FileEditorController. The file path is now
    // passed through tab.config.filePath via restore() before mount().
    __pendingFilePath?: string | null;
    // @deprecated — no longer consumed. Kept for migration compat.
    __pendingFileName?: string;
    __pendingGitRepo?: string | null;

    __openp41geReady?: boolean;
  }

  interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    modifiedAt: number;
  }

  interface FileSearchResult {
    path: string;
    name: string;
    dir: string;
  }

  interface CommitEntry {
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

  interface BranchEntry {
    name: string;
    shortName: string;
    isLocal: boolean;
    isCurrent: boolean;
    tracking?: string;
    ahead: number;
    behind: number;
    lastCommit: CommitEntry | null;
  }

  interface DiffStatEntry {
    filePath: string;
    added: number;
    deleted: number;
    status: "added" | "modified" | "deleted" | "renamed";
  }

  /** What part of the commit history to match against (Git sidebar search). */
  interface SearchResultFile {
    path: string;
    additions: number;
    deletions: number;
  }

  interface SearchResultCommit {
    repoName: string;
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
    relativeDate: string;
    files: SearchResultFile[];
  }

  type CommitSearchScope = "message" | "files" | "all";

  interface CommitSearchOptions {
    query: string;
    in: CommitSearchScope;
    limit?: number;
    offset?: number;
  }

  /** Filters for window.openp41ge.logs.query(). */
  interface LogQueryFilter {
    source?: string | string[];
    minLevel?: number;
    maxLevel?: number;
    since?: number;
    before?: number;
    limit?: number;
    search?: string;
    process?: "main" | "renderer";
    winId?: string;
  }

  /** A persisted log entry returned by window.openp41ge.logs.query(). */
  interface PersistedLogEntryShape {
    timestamp: number;
    level: number;
    levelLabel: string;
    source: string;
    message: string;
    data?: Record<string, unknown>;
    process: "main" | "renderer";
    winId?: string;
  }
}
