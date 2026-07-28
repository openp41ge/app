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
        close: () => void;
        isMaximized: () => Promise<boolean>;
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
        start: (label: string, screenX: number, screenY: number, emoji?: string, tabId?: string, winId?: string, worksetId?: string, tabWidth?: number, tabHeight?: number, offsetX?: number, offsetY?: number, dragType?: string, filePath?: string) => void;
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
            | { type: "file"; filePath: string; fileName?: string };
        } | null>;
        endSession: () => void;
        onEndSession: (callback: () => void) => () => void;
        ghostShow: (targetWinId: string, screenX: number, screenY: number, label: string) => void;
        ghostHide: (targetWinId: string) => void;
        onGhostShow: (callback: (data: { screenX: number; screenY: number; label: string }) => void) => void;
        onGhostHide: (callback: () => void) => void;
        onDragState: (callback: (active: boolean) => void) => void;
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
        /** Delete a local branch. */
        deleteLocalBranch: (repoName: string, branchName: string, force?: boolean) => Promise<void>;

        /** Get untracked file paths for a repository. */
        getUntrackedFiles: (repoName: string) => Promise<string[]>;

        // ── Openp41ge repoRefs API (per-openp41ge repo/worktree visibility) ──

        /** Add a repo to the active openp41ge's repoRefs. */
        worksetAddRepo: (name: string, url: string, worktrees?: string[]) => Promise<boolean>;

        /** Remove a repo from the active openp41ge's repoRefs. */
        worksetRemoveRepo: (name: string) => Promise<boolean>;

        /** Check if a repo is in the active openp41ge's repoRefs. */
        worksetHasRepo: (name: string) => Promise<boolean>;

        /** Add a worktree to a repo in the active openp41ge's repoRefs. */
        worksetAddWorktreeToRepo: (repoName: string, branch: string) => Promise<boolean>;

        /** Get the active openp41ge's repoRefs (JSON string). */
        worksetGetRepoRefs: () => Promise<string>;

        /** Subscribe to openp41ge repoRefs changes from other windows. */
        onWorksetRepoRefsChanged: (callback: () => void) => () => void;
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

      onZoomIn: (callback: () => void) => () => void;
      onZoomOut: (callback: () => void) => () => void;
      onZoomReset: (callback: () => void) => () => void;

      config: {
        get: (key?: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
        getAll: () => Promise<Record<string, any>>;
      };

      project: {
        list: () => Promise<string[]>;
        listWithInfo: () => Promise<Array<{ name: string; config: { name: string; createdAt: string; updatedAt: string; draft?: boolean } | null }>>;
        exists: (name: string) => Promise<boolean>;
        create: (name: string) => Promise<boolean>;
        delete: (name: string) => Promise<boolean>;
        workspaceStatePath: (name: string) => Promise<string>;
        reposDir: (name: string) => Promise<string>;
        listRepos: (name: string) => Promise<Array<{ name: string; worktrees: string[] }>>;
        current: () => Promise<string | null>;
        switchTo: (name: string) => Promise<{ success: boolean; error?: string }>;
        saveDraftAs: (draftName: string, newName: string) => Promise<boolean>;
        isDraft: (name: string) => Promise<boolean>;
        gcDrafts: () => Promise<number>;
        createDraft: () => Promise<string>;
        setRepoOrder: (name: string, order: string[]) => Promise<boolean>;
        rename: (oldName: string, newName: string) => Promise<boolean>;
        /** Register callback for File > Save Project As... menu item. Returns unsubscribe. */
        onShowSaveDraftDialog: (callback: () => void) => () => void;
        /** Register callback for File > Open Project... menu item. Returns unsubscribe. */
        onShowOpenProject: (callback: () => void) => () => void;
      };
    };

    // @deprecated — no longer consumed by FileEditorController. The file path is now
    // passed through tab.config.filePath via restore() before mount().
    __pendingFilePath?: string | null;
    // @deprecated — no longer consumed. Kept for migration compat.
    __pendingFileName?: string;
    __pendingGitRepo?: string | null;

    // Set by check-project step, consumed by fetch-initial-state step
    __openp41geProjectName?: string;

    // Set by signal-ready step, read by test framework
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
}
