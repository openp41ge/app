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
} from "../src/main/index.js";
import { WorkspaceService } from "../src/main/services/workspace-service.js";
import { ConfigService } from "../src/main/services/config-service.js";
import { RecentProjectsModel } from "../src/main/services/recent-projects-model.js";

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
import { registerRepoRefHandlers } from "./ipc-handlers/repo-ref-handlers.js";
import { registerConfigHandlers } from "./ipc-handlers/config-handlers.js";
import { registerProjectHandlers } from "./ipc-handlers/project-handlers.js";
import { registerRecentProjectsHandlers } from "./ipc-handlers/recent-projects-handlers.js";
import { ProjectStore } from "../src/main/services/project-store.js";

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
  private projectStore!: ProjectStore;
  private recentProjects!: RecentProjectsModel;
  private openp41geDir!: string;
  private projectName: string | null = null;

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
      forwardError(err.message, "main-process", err.stack);
      console.error("Uncaught Exception:", err);
      // Don't exit — let the app continue if possible
    });
    process.on("unhandledRejection", (reason) => {
      if (isEpipe(reason)) return;
      const msg = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : "";
      forwardError(msg, "main-process", stack);
      console.error("Unhandled Rejection:", reason);
    });

    // Also intercept console.error in main process
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      const msg = args.map((a) => (typeof a === "object" ? String(a) : String(a))).join(" ");
      forwardError(msg, "main-process");
      origError.apply(console, args);
    };
  }

  // ── Step 2: Paths and Chrome flags ────────────────────────────────────

  private _initPaths(): void {
    this.openp41geDir =
      process.env.OPENP41GE_E2E_DIR ||
      process.env.OPENP41GE_DIR ||
      path.join(process.env.HOME || process.env.USERPROFILE || "", ".openp41ge");

    // Parse CLI args for --project <name>
    const projectIndex = process.argv.indexOf("--project");
    if (projectIndex !== -1 && projectIndex + 1 < process.argv.length) {
      this.projectName = process.argv[projectIndex + 1];
    }
  }

  private _initChromeFlags(): void {
    app.setName("openp41ge");
    app.commandLine.appendSwitch("disable-features", "FontationsFontBackend");
    app.commandLine.appendSwitch("disable-gpu");
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
    this.projectStore = new ProjectStore(this.openp41geDir);
    this.recentProjects = new RecentProjectsModel(this.openp41geDir);

    // Garbage-collect expired drafts on every startup
    this.projectStore.gcDrafts();

    // When no project is specified on the CLI, auto-create a draft project.
    // This replaces the old flow where the project picker was required — now
    // the app opens directly into a draft that can be saved later.
    if (!this.projectName) {
      this.projectName = this.projectStore.createDraft();
      this.recentProjects.add(this.projectName);
    }

    const reposDir = this.projectStore.reposDir(this.projectName);

    this.dispatcher = new OperationDispatcher();
    this.terminalManager = new TerminalManager();
    this.dragGhost = new DragGhostManager(BrowserWindow);
    this.tabNames = new TabNameGenerator();
    this.gitService = new NodeGitService(reposDir);
    this.gitCommitService = new NodeGitCommitService(reposDir);
    this.fileSystem = new ElectronFileSystem();
    this.workspaceService = new WorkspaceService(this.gitService, this.fileSystem, reposDir);
    this.workspaceStateStore = new WorkspaceStateStore(this.openp41geDir);
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
    // When no project is set, nothing is persisted — the picker must run first.
    this.dispatcher.setSaveHandler((ws) => {
      if (!this.projectName) return;
      const projectStatePath = this.projectStore.workspaceStatePath(this.projectName);
      this.workspaceStateStore.save(ws, projectStatePath);
    });

    setDispatcher(this.dispatcher);
    setTabNames(this.tabNames);
  }

  // ── Step 5b: Load saved state ───────────────────────────────────────

  /**
   * Load saved workspace state for the current project.
   * This is now called for both regular projects and drafts.
   * Drafts that have never been saved simply get a fresh empty workspace.
   */
  private _maybeLoadState(): void {
    if (!this.projectName) return;

    const statePath = this.projectStore.workspaceStatePath(this.projectName);
    const saved = this.workspaceStateStore.load(statePath);
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
    registerRepoRefHandlers(this.dispatcher);
    registerConfigHandlers(this.configService);
    registerProjectHandlers(
      this.projectStore,
      this.workspaceStateStore,
      this.dispatcher,
      this.workspaceService,
      this.gitService,
      this.gitCommitService,
      () => this.projectName,
      (name: string | null) => {
        this.projectName = name;
        if (name) this.recentProjects.add(name);
      },
    );
    registerRecentProjectsHandlers(this.recentProjects);
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
