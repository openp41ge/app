/**
 * Window manager — Electron window creation, lifecycle, and helpers.
 *
 * Maintains the `openp41geWindows` map and provides helper functions
 * for window management that are reused across IPC handlers.
 */

import { app, BrowserWindow, dialog, screen } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "openp41ge-logger";
import type { TabNameGenerator } from "../src/main/index.js";
import type { OperationDispatcher } from "../src/main/index.js";

const log = createLogger("openp41ge", "window-manager");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged && !process.env.OPENP41GE_E2E_TEST;

// ─── Window state ────────────────────────────────────────────────────────
export const openp41geWindows = new Map<string, BrowserWindow>();

// When the whole app quits (Cmd+Q) we preserve the workspace's open windows so
// reopening the workspace restores them. A single window closed by hand (no
// quit in flight) still removes that window from state.
let _appQuitting = false;

export function setAppQuitting(value: boolean): void {
  _appQuitting = value;
}

// ─── Window type / binding ───────────────────────────────────────────────

/**
 * Kinds of window the app can host. `workspace` windows are bound to a
 * `.openp41ge-workspace` file; `window-manager` windows list/open workspaces.
 * Not exhaustive — future window types register via a factory (see plan).
 */
export type Openp41geWindowType = "workspace" | "window-manager";

/** Metadata describing a created window (its kind + workspace binding). */
export interface Openp41geWindowMeta {
  windowType: Openp41geWindowType;
  /** `.openp41ge-workspace` path the window is bound to (null for window-manager). */
  workspacePath: string | null;
}

/** Tracks the type/binding of every open window, keyed by window id. */
export const openp41geWindowMeta = new Map<string, Openp41geWindowMeta>();

/** Read the metadata for an open window id, or null if it isn't tracked. */
export function getWindowMeta(openp41geWinId: string): Openp41geWindowMeta | null {
  return openp41geWindowMeta.get(openp41geWinId) ?? null;
}

// ─── Confirm modal state ─────────────────────────────────────────────────
let _pendingConfirm: ((result: boolean) => void) | null = null;

// ─── Module-level dispatcher reference (set during wiring) ───────────────
let _dispatcher: OperationDispatcher | null = null;
let _tabNames: TabNameGenerator | null = null;

export function setDispatcher(d: OperationDispatcher): void {
  _dispatcher = d;
}

export function setTabNames(t: TabNameGenerator): void {
  _tabNames = t;
}

// ─── Confirm modal ───────────────────────────────────────────────────────

export function handleConfirmResponse(result: unknown): void {
  if (_pendingConfirm) {
    const resolve = _pendingConfirm;
    _pendingConfirm = null;
    resolve(result === true);
  }
}

export async function showConfirmViaIPC(
  bw: BrowserWindow,
  options: { title: string; message: string; confirmLabel?: string; cancelLabel?: string },
): Promise<boolean> {
  return new Promise((resolve) => {
    _pendingConfirm = resolve;
    bw.webContents.send("openp41ge:show-confirm", JSON.stringify(options));
    setTimeout(() => {
      if (_pendingConfirm === resolve) {
        _pendingConfirm = null;
        resolve(false);
      }
    }, 30000);
  });
}

// ─── Window creation ─────────────────────────────────────────────────────

/** True if `source` is the compact Window-Manager picker window. */
function sourceIsWindowManager(source?: BrowserWindow): boolean {
  if (!source || source.isDestroyed()) return false;
  for (const [id, bw] of openp41geWindows) {
    if (bw === source) return openp41geWindowMeta.get(id)?.windowType === "window-manager";
  }
  return false;
}

export function createOpenp41geWindow(
  openp41geWinId: string,
  isMaster: boolean,
  sourceWindow?: BrowserWindow,
  dropScreenX?: number,
  dropScreenY?: number,
  meta?: Partial<Openp41geWindowMeta>,
): void {
  const isTest = !!process.env.OPENP41GE_E2E_TEST;
  const windowMeta: Openp41geWindowMeta = {
    windowType: meta?.windowType ?? "workspace",
    workspacePath: meta?.workspacePath ?? null,
  };

  // The Window Manager is a thin utility window: cap its width to 600 so it
  // stays a compact picker and never inherits a wide workspace window's size.
  const isWindowManager = windowMeta.windowType === "window-manager";
  // A workspace window opened from the compact Window Manager must not inherit
  // the picker's narrow size — open it large, clamped to the work area.
  const fromWindowManager = !isWindowManager && sourceIsWindowManager(sourceWindow);

  // Inherit size from the source window, falling back to defaults.
  let width = 1280;
  let height = 860;
  if (sourceWindow && !sourceWindow.isDestroyed() && !fromWindowManager) {
    const bounds = sourceWindow.getBounds();
    width = bounds.width;
    height = bounds.height;
  }

  // The Window Manager is a thin utility window: cap its width to 600 so it
  // stays a compact picker and never inherits a wide workspace window's size.
  if (isWindowManager) {
    width = Math.min(width, 600);
  }

  let display: ReturnType<typeof screen.getDisplayMatching> | undefined;
  if (fromWindowManager) {
    display = screen.getDisplayMatching(sourceWindow!.getBounds());
    const workArea = display.workArea;
    width = Math.min(1280, workArea.width);
    height = Math.min(860, workArea.height);
  }

  let x: number | undefined;
  let y: number | undefined;

  if (dropScreenX !== undefined && dropScreenY !== undefined) {
    // Position the window near the drop point, clamped to the work area
    const display = screen.getDisplayNearestPoint({ x: dropScreenX, y: dropScreenY });
    const workArea = display.workArea;

    // Try to align the top-left of the window near the drop point.
    // Clamp so the window doesn't overflow off the work area.
    let candidateX = dropScreenX - Math.round(width / 4);
    let candidateY = dropScreenY - Math.round(height / 4);

    x = Math.max(workArea.x, Math.min(candidateX, workArea.x + workArea.width - width));
    y = Math.max(workArea.y, Math.min(candidateY, workArea.y + workArea.height - height));
  } else if (fromWindowManager && display) {
    // Centre the freshly-opened workspace window on the Window Manager's display.
    const workArea = display.workArea;
    x = workArea.x + Math.round((workArea.width - width) / 2);
    y = workArea.y + Math.round((workArea.height - height) / 2);
  } else if (sourceWindow && !sourceWindow.isDestroyed()) {
    const bounds = sourceWindow.getBounds();
    x = bounds.x + 30;
    y = bounds.y + 30;
  }

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 600,
    minHeight: 200,
    // The Window Manager is a thin utility picker — it is not meant to be
    // fullscreenable, so remove the native window chrome and render custom
    // close/minimize controls (no fullscreen/green button) in the renderer.
    ...(isWindowManager ? { maxWidth: 600, frame: false, fullscreenable: false } : {}),
    title: "Openp41ge",
    ...(!isWindowManager ? { titleBarStyle: "hiddenInset" } : {}),
    // Match the app's dark surface so the areas exposed while the window
    // grows (native maximize animation, resize) never flash white.
    backgroundColor: "#161616",
    show: !isTest,
    focusable: !isTest,
    x,
    y,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  openp41geWindows.set(openp41geWinId, win);
  openp41geWindowMeta.set(openp41geWinId, windowMeta);

  log.info("window-create", {
    windowId: openp41geWinId,
    type: windowMeta.windowType,
    workspacePath: windowMeta.workspacePath,
    isDev,
  });

  // Tell any open Window Manager to refresh its "open windows" column.
  notifyOpenWindowsChanged();

  win.webContents.on("did-finish-load", () => {
    log.info("window-loaded", { windowId: openp41geWinId, type: windowMeta.windowType });
    if (_dispatcher) {
      win.webContents.send("openp41ge:init", {
        windowId: openp41geWinId,
        workspace: JSON.stringify(_dispatcher.getWorkspace()),
        isDev,
        windowType: windowMeta.windowType,
        workspacePath: windowMeta.workspacePath,
      });
    }
  });

  win.webContents.on("did-fail-load", (_e, code, desc) => {
    log.warn("window-load-failed", { windowId: openp41geWinId, code, desc });
  });

  win.on("closed", () => {
    const meta = openp41geWindowMeta.get(openp41geWinId);
    log.info("window-close", {
      windowId: openp41geWinId,
      type: meta?.windowType ?? "unknown",
    });
    openp41geWindows.delete(openp41geWinId);
    openp41geWindowMeta.delete(openp41geWinId);
    // Tell any open Window Manager to drop the closed window immediately.
    notifyOpenWindowsChanged();
    // Don't mutate workspace state during a full app quit — the whole session
    // (all open windows) is preserved so reopening the workspace restores them.
    if (!isMaster && _dispatcher && !_appQuitting) {
      // Closing a window while other windows of the same workspace remain open
      // *edits* the workspace (removes the window). Closing the LAST live
      // window closes the workspace itself — persist the layout (keep every
      // window, including this one, in the file) so the skeleton keeps
      // rendering the right grid and reopening restores it.
      const isWorkspace = meta?.windowType === "workspace";
      const wsPath = meta?.workspacePath;
      if (isWorkspace && wsPath) {
        let otherLive = 0;
        for (const [id, bw] of openp41geWindows) {
          if (bw.isDestroyed()) continue;
          const otherMeta = openp41geWindowMeta.get(id);
          if (otherMeta?.windowType === "workspace" && otherMeta.workspacePath === wsPath) {
            otherLive++;
          }
        }
        if (otherLive === 0) {
          // Last live window -> closing the workspace: persist, don't remove.
          _dispatcher.persist();
        } else {
          // Editing the workspace -> remove this window from the layout.
          _dispatcher.apply("closeWindow", [openp41geWinId]);
          _dispatcher.broadcast();
        }
      }
    }
  });

  if (process.env.OPENP41GE_E2E_TEST || !isDev) {
    win.loadFile(path.join(__dirname, "../../dist/index.html"));
  } else {
    win.loadURL("http://localhost:8642");
  }

  // DevTools is NOT auto-opened on window load anymore. In non-production
  // (unpackaged) builds it is available from the Window menu → Devtools.
}

// ─── Window-manager window ────────────────────────────────────────────────

/** Callback invoked when a workspace window should be opened for `workspacePath`. */
export type OpenWorkspaceWindowHandler = (workspacePath: string, source?: BrowserWindow) => void;

let _openWorkspaceWindow: OpenWorkspaceWindowHandler | null = null;

/** Wire the handler the window-manager uses to open a workspace-bound window. */
export function setOpenWorkspaceWindowHandler(fn: OpenWorkspaceWindowHandler): void {
  _openWorkspaceWindow = fn;
}

/**
 * Create a new thin window-manager window (not bound to any workspace layout
 * Window). Returns the window id.
 */
export function createWindowManagerWindow(sourceWindow?: BrowserWindow): string {
  const winId = `wm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  createOpenp41geWindow(winId, false, sourceWindow, undefined, undefined, {
    windowType: "window-manager",
    workspacePath: null,
  });
  return winId;
}

/** Open (or focus) a window-manager window. */
export function openWindowManager(sourceWindow?: BrowserWindow): void {
  for (const [id, bw] of openp41geWindows) {
    if (openp41geWindowMeta.get(id)?.windowType !== "window-manager") continue;
    if (bw.isDestroyed()) continue;
    if (bw.isMinimized()) bw.restore();
    bw.focus();
    return;
  }
  createWindowManagerWindow(sourceWindow);
}

/** Summaries of every open window (id, kind, workspace binding). */
export interface OpenWindowSummary {
  windowId: string;
  windowType: Openp41geWindowType;
  workspacePath: string | null;
}

/** List open windows for the window-manager's "open windows" column. */
export function getOpenWindowSummaries(): OpenWindowSummary[] {
  return Array.from(openp41geWindows.keys()).map((id) => ({
    windowId: id,
    windowType: openp41geWindowMeta.get(id)?.windowType ?? "workspace",
    workspacePath: openp41geWindowMeta.get(id)?.workspacePath ?? null,
  }));
}

/**
 * Notify every live window-manager window that the set of open windows
 * changed, so it refreshes its "open windows" column immediately (instead of
 * waiting for the window to regain focus).
 */
export function notifyOpenWindowsChanged(): void {
  for (const [id, bw] of openp41geWindows) {
    if (bw.isDestroyed()) continue;
    if (openp41geWindowMeta.get(id)?.windowType !== "window-manager") continue;
    bw.webContents.send("window-manager:open-windows-changed");
  }
}

/** Open a workspace window bound to `workspacePath` (delegates to the app). */
export function openWorkspaceWindow(workspacePath: string, sourceWindow?: BrowserWindow): void {
  if (_openWorkspaceWindow) {
    _openWorkspaceWindow(workspacePath, sourceWindow);
  } else {
    // Fallback: a plain workspace window with no binding.
    const ws = _dispatcher?.getWorkspace();
    const id = ws?.windows[0]?.id ?? `win-${Date.now()}-0`;
    createOpenp41geWindow(id, false, sourceWindow, undefined, undefined, {
      windowType: "workspace",
      workspacePath,
    });
  }
}

/** Focus the first live workspace window bound to `workspacePath`, if any. */
export function focusWorkspaceWindow(workspacePath: string): boolean {
  for (const [id, bw] of openp41geWindows) {
    if (bw.isDestroyed()) continue;
    const meta = openp41geWindowMeta.get(id);
    if (meta?.windowType !== "workspace" || meta.workspacePath !== workspacePath) continue;
    if (bw.isMinimized()) bw.restore();
    bw.focus();
    return true;
  }
  return false;
}

// ─── Window lifecycle helpers ────────────────────────────────────────────

export function closeOrphanedWindows(): void {
  if (!_dispatcher) return;
  const ws = _dispatcher.getWorkspace();
  const activeIds = new Set(ws.windows.map((w) => w.id as string));
  for (const [openp41geWinId, bw] of openp41geWindows) {
    if (bw.isDestroyed()) continue;
    // Window-manager windows are not bound to a layout Window, so they are
    // never "orphaned" by the workspace layout.
    if (openp41geWindowMeta.get(openp41geWinId)?.windowType === "window-manager") continue;
    if (!activeIds.has(openp41geWinId)) {
      bw.close();
    }
  }
}

export function handleNewTab(_openp41geWinId: string): void {
  // Cmd+T is no longer bound — new-tab creation is removed.
  // This will be replaced with something else in the future.
}

export async function handleCloseCurrentTab(openp41geWinId: string): Promise<void> {
  if (!_dispatcher) return;
  const ws = _dispatcher.getWorkspace();
  const win = ws.windows.find((w) => w.id === openp41geWinId);
  if (!win) return;

  // If the window has no grid placements, close the window
  if (win.grid.placements.length === 0) {
    const bw = openp41geWindows.get(openp41geWinId);
    if (bw && !bw.isDestroyed()) {
      bw.close();
    }
    return;
  }

  // Close the active tab in the first cell
  const firstCell = win.grid.placements[0];
  if (firstCell && firstCell.tabIds.length > 0) {
    const activeTabId = firstCell.activeTabId ?? firstCell.tabIds[0];
    if (!activeTabId) return;
    const bw = openp41geWindows.get(openp41geWinId);
    if (bw) {
      const confirmed = await showConfirmViaIPC(bw, {
        title: "Close tab?",
        message: "Close the active tab?",
        confirmLabel: "Close Tab",
      });
      if (!confirmed) return;
    }
    _dispatcher.apply("removeTabFromCell", [openp41geWinId, activeTabId]);
    _dispatcher.broadcast();
    return;
  }
}

export function handleNewColumn(openp41geWinId: string): void {
  if (!_dispatcher) return;
  _dispatcher.apply("addColumnTab", [openp41geWinId]);
  _dispatcher.broadcast();
}

export async function promptQuit(parentWindow?: BrowserWindow): Promise<void> {
  if (process.env.OPENP41GE_E2E_TEST) {
    app.quit();
    return;
  }
  if (parentWindow) {
    const confirmed = await showConfirmViaIPC(parentWindow, {
      title: "Quit Openp41ge?",
      message: "Are you sure you want to quit Openp41ge? All panes will be closed.",
      confirmLabel: "Quit",
    });
    if (confirmed) app.quit();
  } else {
    const result = dialog.showMessageBoxSync({
      type: "question",
      buttons: ["Quit", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      message: "Are you sure you want to quit Openp41ge?",
    });
    if (result === 0) app.quit();
  }
}
