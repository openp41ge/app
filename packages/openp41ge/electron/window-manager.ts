/**
 * Window manager — Electron window creation, lifecycle, and helpers.
 *
 * Maintains the `openp41geWindows` map and provides helper functions
 * for window management that are reused across IPC handlers.
 */

import { app, BrowserWindow, dialog, screen } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import type { TabNameGenerator } from "../src/main/index.js";
import type { OperationDispatcher } from "../src/main/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged && !process.env.OPENP41GE_E2E_TEST;

// ─── Window state ────────────────────────────────────────────────────────
export const openp41geWindows = new Map<string, BrowserWindow>();

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

export function createOpenp41geWindow(
  openp41geWinId: string,
  isMaster: boolean,
  sourceWindow?: BrowserWindow,
  dropScreenX?: number,
  dropScreenY?: number,
): void {
  const isTest = !!process.env.OPENP41GE_E2E_TEST;

  // Inherit size from the source window, falling back to defaults
  let width = 1280;
  let height = 860;
  if (sourceWindow && !sourceWindow.isDestroyed()) {
    const bounds = sourceWindow.getBounds();
    width = bounds.width;
    height = bounds.height;
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
  } else if (sourceWindow && !sourceWindow.isDestroyed()) {
    const bounds = sourceWindow.getBounds();
    x = bounds.x + 30;
    y = bounds.y + 30;
  }

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 480,
    minHeight: 200,
    title: "Openp41ge",
    titleBarStyle: "hiddenInset",
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

  win.webContents.on("did-finish-load", () => {
    if (_dispatcher) {
      win.webContents.send("openp41ge:init", {
        windowId: openp41geWinId,
        workspace: JSON.stringify(_dispatcher.getWorkspace()),
        isDev,
      });
    }
  });

  win.on("closed", () => {
    openp41geWindows.delete(openp41geWinId);
    if (!isMaster && _dispatcher) {
      _dispatcher.apply("closeWindow", [openp41geWinId]);
      _dispatcher.broadcast();
    }
  });

  if (process.env.OPENP41GE_E2E_TEST || !isDev) {
    win.loadFile(path.join(__dirname, "../../dist/index.html"));
  } else {
    win.loadURL("http://localhost:7392");
  }

  // Auto-open DevTools when OPENP41GE_DEVTOOLS=1
  if (isDev && process.env.OPENP41GE_DEVTOOLS) {
    win.webContents.openDevTools({ mode: "detach" });
  }
  // Always open devtools if OPENP41GE_DEVTOOLS is set, regardless of mode
  if (process.env.OPENP41GE_DEVTOOLS) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

// ─── Window lifecycle helpers ────────────────────────────────────────────

export function closeOrphanedWindows(): void {
  if (!_dispatcher) return;
  const ws = _dispatcher.getWorkspace();
  const activeIds = new Set(ws.windows.map((w) => w.id as string));
  for (const [openp41geWinId, bw] of openp41geWindows) {
    if (!bw.isDestroyed() && !activeIds.has(openp41geWinId)) {
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
