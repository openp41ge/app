const { contextBridge, ipcRenderer } = require("electron");

let _windowId = null;
let _isDev = false;
let _initResolve = null;
/** Promise that resolves once openp41ge:init IPC message is received. */
const _initPromise = new Promise((resolve) => {
  _initResolve = resolve;
});

// Listen for the init message from the main process
ipcRenderer.on("openp41ge:init", (_event, data) => {
  _windowId = data.windowId;
  _isDev = !!data.isDev;
  // Store initial workspace state for the renderer to pick up
  _initialState = data.workspace;
  if (_initResolve) {
    _initResolve();
    _initResolve = null;
  }
});

let _initialState = null;

// ── Native context menu handler ────────────────────────────────────────

let _contextMenuResolve = null;
ipcRenderer.on("native:contextMenuAction", (_event, id) => {
  if (_contextMenuResolve) {
    _contextMenuResolve(id);
    _contextMenuResolve = null;
  }
});

contextBridge.exposeInMainWorld("openp41ge", {
  platform: process.platform,
  isDev: () => _isDev,

  /** Show a native context menu. Returns the id of the clicked item, or null if dismissed. */
  showContextMenu: (items) => {
    return new Promise((resolve) => {
      _contextMenuResolve = resolve;
      ipcRenderer.invoke("native:showContextMenu", items).catch(() => {
        _contextMenuResolve = null;
        resolve(null);
      });
    });
  },
  isTest: !!process.env.OPENP41GE_E2E_TEST,

  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    openDevTools: () => ipcRenderer.send("window:open-dev-tools"),
  },

  workspace: {
    /** Reset the renderer state to fresh-start condition (for tests). */
    reset: () => ipcRenderer.send("workspace:reset"),
    /** Register callback for when the main process confirms reset. */
    onReset: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("workspace:do-reset", handler);
      return () => ipcRenderer.removeListener("workspace:do-reset", handler);
    },
    /** Get the full workspace state (JSON string). */
    getState: () => {
      // Return initial state if available, otherwise request fresh
      if (_initialState) {
        const s = _initialState;
        _initialState = null;
        return Promise.resolve(s);
      }
      return ipcRenderer.invoke("openp41ge:get-state");
    },

    /** Dispatch an action to the main process. */
    dispatch: (fn, ...args) => {
      ipcRenderer.send("openp41ge:dispatch", JSON.stringify({ fn, args }));
    },

    /** Subscribe to workspace state changes. Returns unsubscribe function. */
    onStateUpdate: (callback) => {
      const handler = (_event, serialized) => callback(serialized);
      ipcRenderer.on("openp41ge:state-update", handler);
      return () => ipcRenderer.removeListener("openp41ge:state-update", handler);
    },

    /** Get this window's Openp41ge window ID. */
    getWindowId: () => _windowId,

    /**
     * Wait for the openp41ge:init IPC message (which sets windowId and initial state).
     * Returns once the init message has been received.
     *
     * Needed because did-finish-load (where init is sent) fires AFTER deferred
     * module scripts execute. The renderer bootstrap must await this before
     * resolving its window ID, otherwise ws.windows[0].id is used as fallback
     * and the wrong window data is rendered.
     */
    waitForInit: () => _initPromise,

    /** Request creation of a new child window with a detached pane. */
    detachPane: (windowId, paneId, bounds) => {
      ipcRenderer.send(
        "openp41ge:create-window",
        JSON.stringify({
          type: "pane",
          windowId,
          paneId,
          bounds,
        }),
      );
    },
    /** Request creation of a new child window with a detached tab. */
    detachTab: (windowId, tabId, bounds, dropScreenX, dropScreenY) => {
      ipcRenderer.send(
        "openp41ge:create-window",
        JSON.stringify({
          type: "tab",
          windowId,
          tabId,
          bounds,
          dropScreenX,
          dropScreenY,
        }),
      );
    },

    /** Cmd+N — create a new window */
    cmdNewWindow: () => ipcRenderer.send("openp41ge:new-window"),

    /** Cmd+T — create a new tab */
    cmdNewTab: () => ipcRenderer.send("openp41ge:new-tab"),

    /** Cmd+W — close the current tab */
    cmdCloseTab: () => ipcRenderer.send("openp41ge:close-tab"),

    /** Cmd+P — add a new pane (and column if needed) */
    cmdNewColumn: () => ipcRenderer.send("openp41ge:add-column"),

    /** Close a tab with confirmation if it has panes */
    confirmRemoveTab: (windowId, tabId) => {
      return ipcRenderer.invoke(
        "openp41ge:confirm-remove-tab",
        JSON.stringify({ windowId, tabId }),
      );
    },

    onConfirm: (callback) => {
      ipcRenderer.on("openp41ge:show-confirm", (_event, optionsJson) => callback(optionsJson));
    },
    confirmResponse: (result) => {
      ipcRenderer.send("openp41ge:confirm-response", result);
    },
  },

  drag: {
    start: (
      label,
      screenX,
      screenY,
      emoji,
      tabId,
      winId,
      worksetId,
      tabWidth,
      tabHeight,
      offsetX,
      offsetY,
      dragType,
      filePath,
    ) => {
      ipcRenderer.send(
        "openp41ge:drag-start",
        JSON.stringify({
          label,
          screenX,
          screenY,
          emoji,
          tabId,
          winId,
          worksetId,
          tabWidth,
          tabHeight,
          offsetX,
          offsetY,
          dragType,
          filePath,
        }),
      );
    },
    move: (screenX, screenY) => {
      ipcRenderer.send("openp41ge:drag-move", JSON.stringify({ screenX, screenY }));
    },
    end: () => {
      ipcRenderer.send("openp41ge:drag-end");
    },
    /**
     * Called when the drag threshold is met (actual drag starts, not just mousedown).
     * Broadcasts drag-active state to other windows.
     */
    activate: () => {
      ipcRenderer.send("openp41ge:drag-activate");
    },
    /** Forward cursor position from source window to all others for ghost preview. */
    ghostForward: (screenX, screenY) => {
      ipcRenderer.send("openp41ge:drag-ghost-forward", JSON.stringify({ screenX, screenY }));
    },
    check: (screenX, screenY, dragData) => {
      return ipcRenderer.invoke(
        "openp41ge:drag-check",
        JSON.stringify({ screenX, screenY, dragData }),
      );
    },

    /** Query the main process for the current active drag session (cross-window). */
    getActive: () => {
      return ipcRenderer.invoke("openp41ge:drag-get-active");
    },

    /** End the current drag session and clean up the source window (cross-window). */
    endSession: () => {
      ipcRenderer.send("openp41ge:drag-end-session");
    },

    /** Register callback for when source window tells us to end the drag session. */
    onEndSession: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("openp41ge:drag-end-session", handler);
      return () => ipcRenderer.removeListener("openp41ge:drag-end-session", handler);
    },

    /** Send ghost preview data to another window for rendering. */
    ghostShow: (targetWinId, screenX, screenY, label) => {
      ipcRenderer.send(
        "openp41ge:drag-ghost-show",
        JSON.stringify({ targetWinId, screenX, screenY, label }),
      );
    },
    /** Hide ghost in another window. */
    ghostHide: (targetWinId) => {
      ipcRenderer.send("openp41ge:drag-ghost-hide", JSON.stringify({ targetWinId }));
    },
    /** Register callback for when another window sends us ghost data. */
    onGhostShow: (callback) => {
      const handler = (_event, data) => callback(JSON.parse(data));
      ipcRenderer.on("openp41ge:drag-ghost", handler);
    },
    /** Register callback for when another window hides its ghost. */
    onGhostHide: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("openp41ge:drag-ghost-hide", handler);
    },

    /**
     * Register callback for drag-state changes broadcast by the main process.
     * Called with true when a drag starts in another window, false when it ends.
     */
    onDragState: (callback) => {
      const handler = (_event, active) => callback(active);
      ipcRenderer.on("openp41ge:drag-state", handler);
    },
  },

  terminal: {
    /** Spawn a shell for the given pane ID. */
    spawn: (paneId) => {
      ipcRenderer.send("terminal:spawn", paneId);
    },

    /** Write data to the shell's stdin. */
    write: (paneId, data) => {
      ipcRenderer.send("terminal:write", JSON.stringify({ paneId, data }));
    },

    /** Resize the terminal (cols, rows). */
    resize: (paneId, cols, rows) => {
      ipcRenderer.send("terminal:resize", JSON.stringify({ paneId, cols, rows }));
    },

    /** Kill the shell process for the given pane ID. */
    kill: (paneId) => {
      ipcRenderer.send("terminal:kill", paneId);
    },

    /** Subscribe to shell output for a specific pane. Returns unsubscribe. */
    onData: (paneId, callback) => {
      const handler = (_event, payload) => {
        const parsed = JSON.parse(payload);
        if (parsed.paneId === paneId) callback(parsed.data);
      };
      ipcRenderer.on("terminal:data", handler);
      return () => ipcRenderer.removeListener("terminal:data", handler);
    },

    /** Subscribe to shell exit for a specific pane. Returns unsubscribe. */
    onExit: (paneId, callback) => {
      const handler = (_event, payload) => {
        const parsed = JSON.parse(payload);
        if (parsed.paneId === paneId) callback(parsed.code);
      };
      ipcRenderer.on("terminal:exit", handler);
      return () => ipcRenderer.removeListener("terminal:exit", handler);
    },
  },

  workspaceController: {
    clone: (url) => {
      const handlers = new Set();
      const progressHandler = (_event, data) => {
        for (const h of handlers) h(data);
      };
      ipcRenderer.on("workspace:clone-progress", progressHandler);
      const promise = ipcRenderer.invoke("workspace:clone", url);
      return {
        promise,
        onProgress: (fn) => {
          handlers.add(fn);
          return () => handlers.delete(fn);
        },
        destroy: () => {
          ipcRenderer.removeListener("workspace:clone-progress", progressHandler);
          handlers.clear();
        },
      };
    },
    listRepos: () => ipcRenderer.invoke("workspace:listRepos"),
    getRepo: (name) => ipcRenderer.invoke("workspace:getRepo", name),
    listWorktrees: (repoName) => ipcRenderer.invoke("workspace:listWorktrees", repoName),
    checkoutWorktree: (repoName, branch) =>
      ipcRenderer.invoke("workspace:checkoutWorktree", repoName, branch),
    deleteWorktree: (repoName, branch) =>
      ipcRenderer.invoke("workspace:deleteWorktree", repoName, branch),
    fetch: (repoName) => ipcRenderer.invoke("workspace:fetch", repoName),
    pullBranch: (repoName, branch) => ipcRenderer.invoke("workspace:pullBranch", repoName, branch),
    listBranches: (repoName) => ipcRenderer.invoke("workspace:listBranches", repoName),
    getDefaultBranch: (repoName) => ipcRenderer.invoke("workspace:getDefaultBranch", repoName),
    /** Get commit log for a branch with hash-based pagination. */
    getCommitLog: (repoName, branch, options) =>
      ipcRenderer.invoke("workspace:getCommitLog", repoName, branch, options),
    /** Get all branches with ahead/behind tracking. */
    getBranches: (repoName) => ipcRenderer.invoke("workspace:getBranches", repoName),
    /** Get diff stat for a commit or working tree. */
    getDiffStat: (repoName, commitHash) =>
      ipcRenderer.invoke("workspace:getDiffStat", repoName, commitHash),
    deleteLocalBranch: (repoName, branchName, force) =>
      ipcRenderer.invoke("workspace:deleteLocalBranch", repoName, branchName, force),

    /** Get untracked file paths for a repository. */
    getUntrackedFiles: (repoName) => ipcRenderer.invoke("workspace:getUntrackedFiles", repoName),

    // ── Openp41ge repoRefs API (per-openp41ge repo/worktree visibility) ──

    /** Add a repo to the active openp41ge's repoRefs. */
    worksetAddRepo: (name, url, worktrees) =>
      ipcRenderer.invoke("workset:addRepo", JSON.stringify({ name, url, worktrees })),

    /** Remove a repo from the active openp41ge's repoRefs. */
    worksetRemoveRepo: (name) => ipcRenderer.invoke("workset:removeRepo", JSON.stringify({ name })),

    /** Check if a repo is in the active openp41ge's repoRefs. */
    worksetHasRepo: (name) => ipcRenderer.invoke("workset:hasRepo", JSON.stringify({ name })),

    /** Add a worktree to a repo in the active openp41ge's repoRefs. */
    worksetAddWorktreeToRepo: (repoName, branch) =>
      ipcRenderer.invoke("workset:addWorktreeToRepo", JSON.stringify({ repoName, branch })),

    /** Get the active openp41ge's repoRefs (JSON string). */
    worksetGetRepoRefs: () => ipcRenderer.invoke("workset:getRepoRefs"),

    /** Subscribe to openp41ge repoRefs changes from other windows. */
    onWorksetRepoRefsChanged: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("workset:repo-refs-changed", handler);
      return () => ipcRenderer.removeListener("workset:repo-refs-changed", handler);
    },
  },

  file: {
    /** List entries in a directory. Returns FileEntry[]. */
    readdir: (dirPath) => ipcRenderer.invoke("file:readdir", dirPath),

    /** Stat a file or directory. Returns FileEntry | null. */
    stat: (filePath) => ipcRenderer.invoke("file:stat", filePath),

    /** Read a range of bytes from a file (for virtualized viewing). */
    readRange: (filePath, offset, length) =>
      ipcRenderer.invoke("file:readRange", filePath, offset, length),

    /**
     * Read a file in chunks, receiving progress events as each chunk arrives.
     * Returns an object with:
     *   promise  – resolves to { data, totalSize } when the full file is read
     *   onProgress – subscribe to { loaded, total, chunk } callbacks, returns unsubscribe
     *   destroy  – removes all listeners and cancels
     */
    readChunked: (filePath) => {
      const handlers = new Set();
      const progressHandler = (_event, data) => {
        for (const h of handlers) h(data);
      };
      ipcRenderer.on("file:chunkProgress", progressHandler);
      const promise = ipcRenderer.invoke("file:startChunkedRead", filePath);
      return {
        promise,
        onProgress: (fn) => {
          handlers.add(fn);
          return () => handlers.delete(fn);
        },
        destroy: () => {
          ipcRenderer.removeListener("file:chunkProgress", progressHandler);
          handlers.clear();
        },
      };
    },

    /** Write content to a file. Returns { success: boolean }. */
    writeFile: (filePath, content) => ipcRenderer.invoke("file:writeFile", filePath, content),

    /** Search for files matching a query within the given root paths. */
    search: (query, rootPaths) => ipcRenderer.invoke("file:search", query, rootPaths),

    /** Get current scoped folder paths. */
    getScope: () => ipcRenderer.invoke("file:getScope"),

    /** List recent files from scoped folders, sorted by preference then mtime. */
    listRecent: (rootPaths) => ipcRenderer.invoke("file:listRecent", rootPaths),

    /** Add a folder to workspace scope. Returns boolean success. */
    addScope: (dirPath) => ipcRenderer.invoke("file:addScope", dirPath),

    /** Remove a folder from workspace scope. Returns boolean success. */
    removeScope: (dirPath) => ipcRenderer.invoke("file:removeScope", dirPath),

    /** Open native folder picker. Returns path or null. */
    pickFolder: () => ipcRenderer.invoke("file:pickFolder"),
    gitBranch: (dirPath) => ipcRenderer.invoke("file:gitBranch", dirPath),
  },

  /** Listen for zoom IPC from main process (triggered by menu bar). */
  onZoomIn: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("zoom:in", handler);
    return () => ipcRenderer.removeListener("zoom:in", handler);
  },
  onZoomOut: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("zoom:out", handler);
    return () => ipcRenderer.removeListener("zoom:out", handler);
  },
  onZoomReset: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("zoom:reset", handler);
    return () => ipcRenderer.removeListener("zoom:reset", handler);
  },

  lifecycle: {
    /** Notify the main process that the renderer's first render is complete. */
    notifyReady: () => ipcRenderer.send("lifecycle:renderer-ready"),

    /** Subscribe to main-process error reports forwarded for display. */
    onError: (callback) => {
      const handler = (_event, data) => {
        try {
          callback(JSON.parse(data));
        } catch {
          callback({ message: data });
        }
      };
      ipcRenderer.on("openp41ge:error", handler);
      return () => ipcRenderer.removeListener("openp41ge:error", handler);
    },
  },

  config: {
    get: (key) => ipcRenderer.invoke("config:get", key),
    set: (key, value) => ipcRenderer.invoke("config:set", key, value),
    getAll: () => ipcRenderer.invoke("config:get-all"),
  },

  recentProjects: {
    list: () => ipcRenderer.invoke("recentProjects:list"),
    add: (name) => ipcRenderer.invoke("recentProjects:add", name),
    remove: (name) => ipcRenderer.invoke("recentProjects:remove", name),
  },

  project: {
    list: () => ipcRenderer.invoke("project:list"),
    listWithInfo: () => ipcRenderer.invoke("project:listWithInfo"),
    exists: (name) => ipcRenderer.invoke("project:exists", name),
    create: (name) => ipcRenderer.invoke("project:create", name),
    delete: (name) => ipcRenderer.invoke("project:delete", name),
    workspaceStatePath: (name) => ipcRenderer.invoke("project:workspaceStatePath", name),
    reposDir: (name) => ipcRenderer.invoke("project:reposDir", name),
    listRepos: (name) => ipcRenderer.invoke("project:listRepos", name),
    current: () => ipcRenderer.invoke("project:current"),
    switchTo: (name) => ipcRenderer.invoke("project:switch", name),
    saveDraftAs: (draftName, newName) =>
      ipcRenderer.invoke("project:saveDraftAs", draftName, newName),
    isDraft: (name) => ipcRenderer.invoke("project:isDraft", name),
    gcDrafts: () => ipcRenderer.invoke("project:gcDrafts"),
    createDraft: () => ipcRenderer.invoke("project:createDraft"),
    setRepoOrder: (name, order) => ipcRenderer.invoke("project:setRepoOrder", name, order),
    rename: (oldName, newName) => ipcRenderer.invoke("project:rename", oldName, newName),
  },
});
