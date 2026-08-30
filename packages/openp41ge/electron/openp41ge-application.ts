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
  WorkspaceStateStore,
  LogFileStore,
} from "../src/main/index.js";
import { WorkspaceService } from "../src/main/services/workspace-service.js";
import { ConfigService } from "../src/main/services/config-service.js";
import { parseWorkspaceLaunchArg } from "../src/main/services/workspace-launch-arg.js";

// ─── Window manager ──────────────────────────────────────────────────────
import {
  openp41geWindows,
  setDispatcher,
  setTabNames,
  createOpenp41geWindow,
  promptQuit,
} from "./window-manager.js";

// ─── IPC handler registrations ──────────────────────────────────────────
import { registerDispatchHandlers } from "./ipc-handlers/dispatch-handler.js";
import { registerFileHandlers } from "./ipc-handlers/file-handlers.js";
import { registerDialogHandlers } from "./ipc-handlers/dialog-handlers.js";
import { registerWindowHandlers } from "./ipc-handlers/window-handlers.js";
import { registerDragHandlers } from "./ipc-handlers/drag-handlers.js";
import { registerTerminalHandlers } from "./ipc-handlers/terminal-handlers.js";
import { registerWorkspaceHandlers } from "./ipc-handlers/workspace-handlers.js";
import { registerGitHandlers } from "./ipc-handlers/git-handlers.js";
import { registerConfigHandlers } from "./ipc-handlers/config-handlers.js";
import { registerLogHandlers } from "./ipc-handlers/log-handlers.js";

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
  private workspaceStateStore!: WorkspaceStateStore;
  private logStore!: LogFileStore;
  private openp41geDir!: string;

  /** Repos live in their own subdirectory of the app data dir. */
  private get reposDir(): string {
    return path.join(this.openp41geDir, "repositories");
  }

  /** The single workspace-state file for this app (persistence is always on). */
  private get workspaceStatePath(): string {
    return path.join(this.openp41geDir, "workspace.json");
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
  }

  // ── Step 1: Error handlers ────────────────────────────────────────────

  private _registerErrorHandlers(): void {
    const log = createLogger("main-process");
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
    this.openp41geDir =
      process.env.OPENP41GE_E2E_DIR ||
      process.env.OPENP41GE_DIR ||
      path.join(process.env.HOME || process.env.USERPROFILE || "", ".openp41ge");
  }

  private _initChromeFlags(): void {
    app.setName("openp41ge");
    app.commandLine.appendSwitch("disable-features", "FontationsFontBackend");
    app.commandLine.appendSwitch("enable-gpu-rasterization");
    if (!process.env.OPENP41GE_E2E_TEST) {
      app.commandLine.appendSwitch("remote-debugging-port", "9222");
    }
  }

  // ── Step 3: Config ────────────────────────────────────────────────────

  private _initConfig(): void {
    this.configService = new ConfigService();
    this.configService.init();
  }

  // ── Step 4: Services ──────────────────────────────────────────────────

  private _initServices(): void {
    // Fixed app-data root — the per-project store was removed with the
    // project system. Repos live under ~/.openp41ge/repositories.
    const reposDir = this.reposDir;

    this.dispatcher = new OperationDispatcher();
    this.terminalManager = new TerminalManager();
    this.dragGhost = new DragGhostManager(BrowserWindow);
    this.tabNames = new TabNameGenerator();
    this.gitService = new NodeGitService(reposDir);
    this.gitCommitService = new NodeGitCommitService(reposDir);
    this.fileSystem = new ElectronFileSystem();
    this.workspaceService = new WorkspaceService(this.gitService, this.fileSystem, reposDir);
    this.workspaceStateStore = new WorkspaceStateStore(this.openp41geDir);
    this.logStore = new LogFileStore(this.openp41geDir);
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
    // Wire workspace state persistence: save after every mutation.
    this.dispatcher.setSaveHandler((ws) => {
      this.workspaceStateStore.save(ws, this.workspaceStatePath);
    });

    setDispatcher(this.dispatcher);
    setTabNames(this.tabNames);
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
    if (!parseWorkspaceLaunchArg(process.argv)) return;
    const saved = this.workspaceStateStore.load(this.workspaceStatePath);
    if (saved) {
      this.dispatcher.setWorkspace(saved);
    }
  }

  // ── Step 6: IPC handlers ──────────────────────────────────────────────

  private _registerIpcHandlers(): void {
    registerDispatchHandlers(this.dispatcher);
    registerFileHandlers(this.fileSystem, this.gitService, this.dispatcher);
    registerWindowHandlers(this.dispatcher, this.tabNames);
    registerDragHandlers(this.dragGhost);
    registerTerminalHandlers(this.terminalManager);
    registerWorkspaceHandlers(this.workspaceService, this.dispatcher);
    registerGitHandlers(this.gitCommitService, this.gitService);
    registerConfigHandlers(this.configService);
    registerLogHandlers(this.logStore);
    registerLifecycleHandlers(this.lifecycle);
    registerDialogHandlers();
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

  private _createInitialWindow(): void {
    const ws = this.dispatcher.getWorkspace();
    createOpenp41geWindow(ws.windows[0].id, true);
  }

  private _setupMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      // Application menu — this is the macOS app menu labelled app.name
      // (without it, Electron shows a default "Electron" app menu). Settings
      // lives here (Cmd+,) instead of the in-window bottom bar.
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
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
        label: "File",
        submenu: [
          {
            label: "New Window",
            accelerator: "CmdOrCtrl+N",
            click: () => {
              this.dispatcher.apply("newWindow", []);
              const ws = this.dispatcher.getWorkspace();
              const newWin = ws.windows[ws.windows.length - 1];
              if (newWin) {
                this.dispatcher.broadcast();
                const src = BrowserWindow.getFocusedWindow() ?? undefined;
                createOpenp41geWindow(newWin.id, false, src);
              }
            },
          },
          { type: "separator" },
          {
            label: "New Workspace...",
            accelerator: "CmdOrCtrl+Shift+N",
            click: () => {
              BrowserWindow.getFocusedWindow()?.webContents.send("menu:new-workspace");
            },
          },
          {
            label: "Open Workspace...",
            accelerator: "CmdOrCtrl+Shift+O",
            click: () => {
              BrowserWindow.getFocusedWindow()?.webContents.send("menu:open-workspace");
            },
          },
          {
            label: "Save Workspace As...",
            accelerator: "CmdOrCtrl+Shift+S",
            click: () => {
              BrowserWindow.getFocusedWindow()?.webContents.send("menu:save-workspace-as");
            },
          },
          { type: "separator" },
          {
            label: "Quit",
            accelerator: "CmdOrCtrl+Q",
            click: () => promptQuit(BrowserWindow.getFocusedWindow() ?? undefined),
          },
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
          { type: "separator" },
          {
            label: "Workspaces…",
            click: () => {
              BrowserWindow.getFocusedWindow()?.webContents.send("menu:open-workspaces");
            },
          },
          {
            label: "Logs…",
            click: () => {
              BrowserWindow.getFocusedWindow()?.webContents.send("menu:open-logs");
            },
          },
        ],
      },
    ];

    // Window menu — includes dev items (Reload, Devtools) only in dev mode
    template.push({
      label: "Window",
      submenu: [
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

  // ── Step 9: App events ────────────────────────────────────────────────

  private _registerAppEvents(): void {
    app.on("window-all-closed", () => {
      if (process.env.OPENP41GE_E2E_TEST) {
        app.quit();
      } else if (process.platform !== "darwin") {
        promptQuit();
      }
    });

    app.on("activate", () => {
      if (openp41geWindows.size === 0) {
        const ws = this.dispatcher.getWorkspace();
        createOpenp41geWindow(ws.windows[0].id, true);
      }
    });
  }
}
