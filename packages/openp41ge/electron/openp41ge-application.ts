/**
 * Openp41geApplication — the Electron main process as a class.
 *
 * Encapsulates all startup logic in a single class with explicit ordering
 * instead of module-level side effects. This makes the startup sequence
 * deterministic, testable, and SOLID-compliant.
 */

import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "openp41ge-logger";

// ─── Service imports ─────────────────────────────────────────────────────
import {
  OperationDispatcher,
  TerminalManager,
  DragGhostManager,
  TabNameGenerator,
  NodeGitService,
  NodeGitCommitService,
  ElectronFileSystem,
  FileWorkspaceSessionStore,
  LogFileStore,
  ChatStoreService,
  ChatProviderRegistry,
  VllmChatProvider,
  ToolRegistry,
  registerBuiltinTools,
  AgentRuntime,
  type ChatProviderConfig,
  type ConnectedWorktree,
} from "../src/main/index.js";
import { WorkspaceService } from "../src/main/services/workspace-service.js";
import { ConfigService } from "../src/main/services/config-service.js";
import { resolveAppDataDir } from "../src/main/services/app-data-dir.js";
import { parseWorkspaceLaunchArg } from "../src/main/services/workspace-launch-arg.js";
import { ReposWatcher } from "./repos-watcher.js";

// ─── Window manager ──────────────────────────────────────────────────────
import {
  openp41geWindows,
  openp41geWindowMeta,
  setDispatcher,
  setTabNames,
  createOpenp41geWindow,
  promptQuit,
  openWindowManager,
  setOpenWorkspaceWindowHandler,
  setAppQuitting,
  focusWorkspaceWindow,
  type Openp41geWindowType,
} from "./window-manager.js";

// ─── IPC handler registrations ──────────────────────────────────────────
import { registerDispatchHandlers } from "./ipc-handlers/dispatch-handler.js";
import { registerFileHandlers } from "./ipc-handlers/file-handlers.js";
import { registerDialogHandlers } from "./ipc-handlers/dialog-handlers.js";
import { registerWindowHandlers } from "./ipc-handlers/window-handlers.js";
import { registerWindowManagerHandlers } from "./ipc-handlers/window-manager-handlers.js";
import { registerDragHandlers } from "./ipc-handlers/drag-handlers.js";
import { registerTerminalHandlers } from "./ipc-handlers/terminal-handlers.js";
import { registerWorkspaceHandlers } from "./ipc-handlers/workspace-handlers.js";
import { registerGitHandlers } from "./ipc-handlers/git-handlers.js";
import { registerConfigHandlers } from "./ipc-handlers/config-handlers.js";
import { registerWelcomeHandlers } from "./ipc-handlers/welcome-handlers.js";
import { registerLogHandlers } from "./ipc-handlers/log-handlers.js";
import { registerChatHandlers } from "./ipc-handlers/chat-handlers.js";

// ─── Lifecycle manager ──────────────────────────────────────────────────
import { LifecycleManager, registerLifecycleHandlers } from "./lifecycle-manager.js";

// ─── Path helpers ────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Openp41geApplication {
  // ── Public ────────────────────────────────────────────────────────────
  readonly lifecycle = new LifecycleManager();

  // ── Private service instances ─────────────────────────────────────────
  private configService!: ConfigService;
  private dispatcher!: OperationDispatcher;
  private terminalManager!: TerminalManager;
  private dragGhost!: DragGhostManager;
  private tabNames!: TabNameGenerator;
  private gitService!: NodeGitService;
  private gitCommitService!: NodeGitCommitService;
  private fileSystem!: ElectronFileSystem;
  private workspaceService!: WorkspaceService;
  private workspaceSessionStore!: FileWorkspaceSessionStore;
  private logStore!: LogFileStore;
  private chatStore!: ChatStoreService;
  private chatProviders!: ChatProviderRegistry;
  private chatTools!: ToolRegistry;
  private agentRuntime!: AgentRuntime;
  private openp41geDir!: string;
  /** Watches the repositories dir so the Explorer auto-updates on external changes. */
  private reposWatcher!: ReposWatcher;

  /** Repos live in their own subdirectory of the app data dir. */
  private get reposDir(): string {
    return path.join(this.openp41geDir, "repositories");
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────

  /**
   * Start the application in a deterministic order:
   *   1. Error handlers (EPIPE, unhandled rejections)
   *   2. Paths and Chrome flags
   *   3. Config service
   *   4. All services
   *   5. Wire cross-service dependencies
   *   6. Register IPC handlers
   *   7. Wait for Electron ready
   *   8. Create window + menu
   *   9. Register app event handlers
   */
  async start(): Promise<void> {
    this._registerErrorHandlers();
    this._initPaths();
    this._initChromeFlags();
    this._initConfig();
    this._initServices();
    this._maybeLoadState();
    this._wireServices();
    this._registerIpcHandlers();
    this._registerContextMenuHandler();

    // Wait for Electron to be ready, then create the UI
    await app.whenReady();
    this.lifecycle.notifyElectronReady();

    this._createInitialWindow();
    this._setupMenu();
    this._registerAppEvents();
    // Watch the repositories dir once the app is up, so the explorer reflects
    // external file changes (deletes/creates outside the app).
    this.reposWatcher.start();
  }

  // ── Step 1: Error handlers ────────────────────────────────────────────

  private _registerErrorHandlers(): void {
    const log = createLogger("openp41ge", "main-process");
    const isEpipe = (err: unknown): boolean => {
      if (!err || typeof err !== "object") return false;
      const e = err as { code?: string; message?: string };
      return e.code === "EPIPE" || (typeof e.message === "string" && e.message.includes("EPIPE"));
    };

    // Forward errors to all renderer windows so they appear in the DOM overlay
    const forwardError = (message: string, source?: string, stack?: string) => {
      const payload = JSON.stringify({ message, source, stack });
      for (const [, bw] of openp41geWindows) {
        try {
          bw.webContents.send("openp41ge:error", payload);
        } catch {
          /* window might be closing */
        }
      }
    };

    process.on("uncaughtException", (err) => {
      if (isEpipe(err)) return;
      log.error("Uncaught Exception:", err);
      forwardError(err.message, "main-process", err.stack);
      // Don't exit — let the app continue if possible
    });
    process.on("unhandledRejection", (reason) => {
      if (isEpipe(reason)) return;
      const msg = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : "";
      log.error("Unhandled Rejection:", reason);
      forwardError(msg, "main-process", stack);
    });

    // Also intercept console.error in main process.
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      const msg = args.map((a) => (typeof a === "object" ? String(a) : String(a))).join(" ");
      // Don't forward pure Node diagnostics to the renderers — they are
      // not application errors and would otherwise freeze every window
      // in the blocking overlay. Real uncaught exceptions / rejections /
      // app-level console.error are handled below and still forwarded.
      const isNodeWarning =
        (/^\(node:\d+\)\s*Warning:/i.test(msg.trim()) ||
          msg.includes("Closing file descriptor") ||
          msg.includes("MaxListenersExceededWarning") ||
          msg.includes("DeprecationWarning")) &&
        !msg.toLowerCase().includes("error");
      if (!isNodeWarning && msg.trim().length > 0) {
        forwardError(msg, "main-process");
      }
      origError.apply(console, args);
    };
  }

  // ── Step 2: Paths and Chrome flags ────────────────────────────────────

  private _initPaths(): void {
    // Single source of truth for the app-data root (dev vs release folder).
    this.openp41geDir = resolveAppDataDir(app.isPackaged);
  }

  private _initChromeFlags(): void {
    app.setName("OpenP41ge");
    app.commandLine.appendSwitch("disable-features", "FontationsFontBackend");
    app.commandLine.appendSwitch("enable-gpu-rasterization");
    if (!process.env.OPENP41GE_E2E_TEST) {
      app.commandLine.appendSwitch("remote-debugging-port", "9222");
    }
  }

  // ── Step 3: Config ────────────────────────────────────────────────────

  private _initConfig(): void {
    this.configService = new ConfigService(this.openp41geDir);
    this.configService.init();
  }

  // ── Step 4: Services ──────────────────────────────────────────────────

  private _initServices(): void {
    // Fixed app-data root — the per-project store was removed with the
    // project system. Repos live under the app-data root/repositories.
    const reposDir = this.reposDir;

    this.dispatcher = new OperationDispatcher();
    this.terminalManager = new TerminalManager();
    this.dragGhost = new DragGhostManager(BrowserWindow);
    this.tabNames = new TabNameGenerator();
    this.gitService = new NodeGitService(reposDir);
    this.gitCommitService = new NodeGitCommitService(reposDir);
    this.fileSystem = new ElectronFileSystem();
    this.workspaceService = new WorkspaceService(this.gitService, this.fileSystem, reposDir);
    this.workspaceSessionStore = new FileWorkspaceSessionStore();
    this.logStore = new LogFileStore(this.openp41geDir);
    this.reposWatcher = new ReposWatcher(reposDir, (changedPath) => {
      this._broadcastTreeChanged(changedPath);
    });

    // ── Chat / agent ──────────────────────────────────────────────────
    this.chatStore = new ChatStoreService(this.openp41geDir);
    this.chatStore.init();
    this.chatProviders = new ChatProviderRegistry();
    this.chatProviders.register({
      id: "vllm",
      label: "vLLM",
      create: (cfg: ChatProviderConfig) => new VllmChatProvider(cfg),
    });
    this.chatTools = new ToolRegistry();
    registerBuiltinTools(this.chatTools);
  }

  /** Broadcast a filesystem change under the repositories dir to every window. */
  private _broadcastTreeChanged(changedPath: string): void {
    const payload = { path: changedPath };
    for (const [, bw] of openp41geWindows) {
      try {
        bw.webContents.send("file:tree-changed", payload);
      } catch {
        // window might be closing
      }
    }
  }

  // ── Step 5: Wire cross-service dependencies ───────────────────────────

  private _wireServices(): void {
    this.dispatcher.setTerminalCleanup((paneId: string) =>
      this.terminalManager.killByPaneId(paneId),
    );
    this.dispatcher.setBroadcast((serialized: string) => {
      for (const [, bw] of openp41geWindows) {
        try {
          bw.webContents.send("openp41ge:state-update", serialized);
        } catch {
          // window might be closing
        }
      }
    });
    // Wire workspace state persistence: save after every mutation. Saves go to
    // the bound workspace's `.openp41ge-workspace` file (no global workspace.json).
    this.dispatcher.setSaveHandler((ws) => {
      if (this.workspaceSessionStore.getCurrentWorkspacePath()) {
        this.workspaceSessionStore.save(ws);
      }
    });

    setDispatcher(this.dispatcher);
    setTabNames(this.tabNames);

    // ── Agent runtime ─────────────────────────────────────────────────
    this.agentRuntime = new AgentRuntime(
      this.chatStore,
      this.chatProviders,
      this.chatTools,
      {
        sendToWindow: (winId: string, event: string, payload: unknown) => {
          const bw = openp41geWindows.get(winId);
          if (!bw || bw.isDestroyed()) return;
          try {
            bw.webContents.send(event, JSON.stringify(payload));
          } catch {
            // window may be closing
          }
        },
        broadcast: (event: string, payload: unknown) => {
          for (const [, bw] of openp41geWindows) {
            try {
              bw.webContents.send(event, JSON.stringify(payload));
            } catch {
              // window may be closing
            }
          }
        },
      },
      {
        getProviderConfig: (providerId: string): ChatProviderConfig | null => {
          const cfg = this.configService.get(`agent.providers.${providerId}`);
          if (!cfg) return null;
          return cfg as ChatProviderConfig;
        },
        // Agent file tools may only touch worktrees that are visible in the
        // explorer (materialized worktrees of the repos under the store). The
        // bare repo dirs and any other path are out of scope. The structured
        // list also feeds the system prompt so the model knows its scope and
        // can target a specific worktree or a group of them.
        getConnectedWorktrees: async (): Promise<ConnectedWorktree[]> => {
          try {
            const repos = await this.gitService.listRepos();
            const out: ConnectedWorktree[] = [];
            for (const repo of repos) {
              const worktrees = await this.gitService.listWorktrees(repo.name);
              for (const wt of worktrees) {
                if (wt.exists) out.push({ repo: repo.name, branch: wt.branch, path: wt.path });
              }
            }
            return out;
          } catch {
            return [];
          }
        },
      },
    );

    // Window-manager workspace windows are opened with a workspace binding. Bind
    // the store to that path so mutations save to its file, and restore the
    // workspace's saved session (windows/grids/sidebars) when it has one.
    setOpenWorkspaceWindowHandler((workspacePath, source) => {
      this._openWorkspaceSession(workspacePath, source);
    });
  }

  // ── Step 5b: Load saved state ───────────────────────────────────────

  /**
   * Load saved workspace state at startup, but ONLY when a workspace was
   * explicitly provided as a launch argument (future CLI seam — see
   * parseWorkspaceLaunchArg). A normal launch starts fresh: the dispatcher
   * keeps its default createWorkspace("ws1") so a previous session's tabs
   * are not reinstated without context (e.g. sidebar tabs with no active
   * workspace).
   */
  private _maybeLoadState(): void {
    const workspaceArg = parseWorkspaceLaunchArg(process.argv);
    if (!workspaceArg) return;
    // Restore the layout session from the workspace's own file.
    const restored = this.workspaceSessionStore.load(workspaceArg);
    if (restored) {
      this.workspaceSessionStore.setCurrentWorkspacePath(workspaceArg);
      this.dispatcher.setWorkspace(restored);
    }
  }

  // ── Step 6: IPC handlers ──────────────────────────────────────────────

  private _registerIpcHandlers(): void {
    registerDispatchHandlers(this.dispatcher);
    registerFileHandlers(this.fileSystem, this.gitService, this.dispatcher);
    registerWindowHandlers(this.dispatcher, this.tabNames);
    registerWindowManagerHandlers();
    registerDragHandlers(this.dragGhost);
    registerTerminalHandlers(this.terminalManager);
    registerWorkspaceHandlers(this.workspaceService, this.dispatcher, this.openp41geDir);
    registerGitHandlers(this.gitCommitService, this.gitService);
    registerConfigHandlers(this.configService);
    registerWelcomeHandlers(
      this.openp41geDir,
      !app.isPackaged && !process.env.OPENP41GE_E2E_TEST,
    );
    registerLogHandlers(this.logStore);
    registerChatHandlers(this.chatStore, this.agentRuntime, this.chatProviders, this.configService);
    registerLifecycleHandlers(this.lifecycle);
    registerDialogHandlers(this.openp41geDir);
  }

  private _registerContextMenuHandler(): void {
    ipcMain.handle(
      "native:showContextMenu",
      async (_event, items: Array<{ label: string; id: string }>) => {
        const webContents = _event.sender;

        if (process.env.OPENP41GE_E2E_TEST) {
          (global as any).__lastContextMenuTemplate = items.map((item) => ({
            label: item.label,
            id: item.id,
          }));
          webContents.send("native:contextMenuAction", "");
          return;
        }

        let resolved = false;
        const template = items.map((item) => ({
          label: item.label,
          click: () => {
            resolved = true;
            webContents.send("native:contextMenuAction", item.id);
          },
        }));
        (global as any).__lastContextMenuTemplate = template;
        const menu = Menu.buildFromTemplate(template);
        menu.popup({
          window: BrowserWindow.fromWebContents(webContents) ?? undefined,
          callback: () => {
            if (!resolved) {
              webContents.send("native:contextMenuAction", "");
            }
          },
        });
      },
    );
  }

  // ── Step 7-8: Window + Menu (after app.whenReady) ─────────────────────

  // ── Step 7-8: Window + Menu (after app.whenReady) ─────────────────────

  /**
   * Open a workspace: load its session (windows/grids/sidebars) into the
   * dispatcher and create a bound window for each restored window. Falls back
   * to a single fresh workspace window when the file has no session.
   */
  private _openWorkspaceSession(workspacePath: string, source?: BrowserWindow): void {
    this.workspaceSessionStore.setCurrentWorkspacePath(workspacePath);
    // If a workspace window for this path is already open, focus it rather than
    // re-creating every window in the file. Unconditional re-creation produced
    // duplicate BrowserWindows (same id, map overwrite) and left stale windows
    // in the file desynced from the live set — e.g. a window id shared across
    // two workspace files, or a window in the file with no live BrowserWindow.
    if (focusWorkspaceWindow(workspacePath)) {
      return;
    }
    const restored = this.workspaceSessionStore.load(workspacePath);
    if (restored && restored.windows.length > 0) {
      this.dispatcher.setWorkspace(restored);
      this.dispatcher.broadcast();
      for (const win of restored.windows) {
        createOpenp41geWindow(win.id, false, undefined, undefined, undefined, {
          windowType: "workspace",
          workspacePath,
        });
      }
    } else {
      // Fresh workspace window bound to the path.
      this.dispatcher.apply("newWindow", []);
      const ws = this.dispatcher.getWorkspace();
      const newWin = ws.windows[ws.windows.length - 1];
      if (newWin) {
        this.dispatcher.broadcast();
        createOpenp41geWindow(newWin.id, false, source, undefined, undefined, {
          windowType: "workspace",
          workspacePath,
        });
      }
    }
  }

  private _createInitialWindow(): void {
    const workspaceArg = parseWorkspaceLaunchArg(process.argv);
    if (workspaceArg) {
      this._openWorkspaceSession(workspaceArg);
    } else {
      // No workspace argument — start at the Window Manager so the user picks
      // or creates a workspace.
      openWindowManager();
    }
  }

  private _setupMenu(): void {
    // The menu varies with the focused window: the compact Window Manager
    // has no workspace to add a window to and no Logs tab, so those entries
    // are omitted while it is focused.
    const isWindowManager = this._focusedWindowType() === "window-manager";
    const template: Electron.MenuItemConstructorOptions[] = [
      // Application menu — this is the macOS app menu labelled app.name
      // (without it, Electron shows a default "Electron" app menu). Settings
      // lives here (Cmd+,) instead of the in-window bottom bar.
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          // The compact Window Manager doubles as an app-level Settings window,
          // so Workspaces and Settings both open it with the matching tab.
          {
            label: "Workspaces",
            click: () => openWindowManager(BrowserWindow.getFocusedWindow() ?? undefined, "workspaces"),
          },
          {
            label: "Releases",
            click: () => openWindowManager(BrowserWindow.getFocusedWindow() ?? undefined, "releases"),
          },
          {
            label: "Settings…",
            accelerator: "CmdOrCtrl+,",
            click: () => openWindowManager(BrowserWindow.getFocusedWindow() ?? undefined, "settings"),
          },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          {
            label: "Quit",
            accelerator: "CmdOrCtrl+Q",
            click: () => promptQuit(BrowserWindow.getFocusedWindow() ?? undefined),
          },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          {
            label: "Zoom In",
            accelerator: "CmdOrCtrl++",
            click: () => BrowserWindow.getFocusedWindow()?.webContents.send("zoom:in"),
          },
          {
            label: "Zoom Out",
            accelerator: "CmdOrCtrl+-",
            click: () => BrowserWindow.getFocusedWindow()?.webContents.send("zoom:out"),
          },
          {
            label: "Reset Zoom",
            accelerator: "CmdOrCtrl+0",
            click: () => BrowserWindow.getFocusedWindow()?.webContents.send("zoom:reset"),
          },
          // Logs lives in the system overlay, which only exists in a workspace
          // window — the compact Window Manager has no Logs tab, so omit it.
          ...(isWindowManager
            ? []
            : [
                { type: "separator" as const },
                {
                  label: "Logs…",
                  click: () => {
                    BrowserWindow.getFocusedWindow()?.webContents.send("menu:open-logs");
                  },
                },
              ]),
        ],
      },
    ];

    // Window menu — includes dev items (Reload, Devtools) only in dev mode.
    // "Add Workspace Window" is pinned at the TOP of this menu with a separator
    // below it. It binds the new window to the focused window's workspace — the
    // Window Manager has no workspace to add a window to, so it (and its
    // separator) are omitted there.
    template.push({
      label: "Window",
      submenu: [
        ...(isWindowManager
          ? []
          : [
              {
                label: "Add Workspace Window",
                click: () => this._addWorkspaceWindow(),
              },
              { type: "separator" as const },
            ]),
        ...(!app.isPackaged
          ? [
              {
                label: "Reload",
                accelerator: "CmdOrCtrl+R",
                click: () => {
                  BrowserWindow.getFocusedWindow()?.webContents.reload();
                },
              },
              {
                label: "Devtools",
                accelerator: "Alt+CmdOrCtrl+I",
                click: () => {
                  BrowserWindow.getFocusedWindow()?.webContents.openDevTools({ mode: "detach" });
                },
              },
              { type: "separator" as const },
            ]
          : []),
        { role: "minimize" as const },
        { role: "close" as const },
      ],
    });

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  /** The type of the currently focused window, or null if none is focused. */
  private _focusedWindowType(): Openp41geWindowType | null {
    const bw = BrowserWindow.getFocusedWindow();
    if (!bw || bw.isDestroyed()) return null;
    for (const [id, win] of openp41geWindows) {
      if (win === bw) return openp41geWindowMeta.get(id)?.windowType ?? null;
    }
    return null;
  }

  /** Window menu > Add Workspace Window — bind a new window to the focused workspace. */
  private _addWorkspaceWindow(): void {
    const src = BrowserWindow.getFocusedWindow() ?? undefined;
    // Bind the new window to the focused window's workspace binding
    // (fresh central grid — a workspace window of the same workspace).
    let workspacePath: string | null = null;
    if (src) {
      for (const [id, bw] of openp41geWindows) {
        if (bw === src) {
          workspacePath = openp41geWindowMeta.get(id)?.workspacePath ?? null;
          break;
        }
      }
    }
    this.workspaceSessionStore.setCurrentWorkspacePath(workspacePath);
    this.dispatcher.apply("newWindow", []);
    const ws = this.dispatcher.getWorkspace();
    const newWin = ws.windows[ws.windows.length - 1];
    if (newWin) {
      this.dispatcher.broadcast();
      createOpenp41geWindow(newWin.id, false, src, undefined, undefined, {
        windowType: "workspace",
        workspacePath,
      });
    }
  }

  // ── Step 9: App events ────────────────────────────────────────────────

  private _registerAppEvents(): void {
    // Preserve open workspace windows across a full app quit so reopening the
    // workspace restores them (see setAppQuitting). Persist the layout (with all
    // live windows) so closing every window at once saves the full multi-window
    // state for the skeleton to render on relaunch.
    app.on("before-quit", () => {
      setAppQuitting(true);
      this.dispatcher.persist();
      this.reposWatcher.stop();
    });

    app.on("window-all-closed", () => {
      // macOS: keep the app resident in the dock when the last window closes,
      // so clicking the dock icon (the 'activate' handler) reopens the Window
      // Manager. On other platforms, exit when the last window closes.
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    // Rebuild the application menu when the focused window changes so it
    // reflects the focused window's type (e.g. the Window Manager omits
    // "Add Workspace Window" and "Logs…").
    app.on("browser-window-focus", () => this._setupMenu());
    app.on("browser-window-blur", () => this._setupMenu());

    app.on("activate", () => {
      if (openp41geWindows.size > 0) return;
      const workspaceArg = parseWorkspaceLaunchArg(process.argv);
      if (workspaceArg) {
        this._openWorkspaceSession(workspaceArg);
      } else {
        openWindowManager();
      }
    });
  }
}
