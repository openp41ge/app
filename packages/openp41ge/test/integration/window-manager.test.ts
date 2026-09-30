/**
 * Integration tests for the main-process window-manager helpers that back the
 * "open a workspace" path. Specifically guards `focusWorkspaceWindow` — the
 * idempotency guard that `Openp41geApplication._openWorkspaceSession` now uses
 * to avoid re-creating duplicate/stale windows when a workspace is already open.
 *
 * The `electron` module is mocked because it is a Node/Electron runtime module
 * unavailable under vitest's jsdom environment.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("electron", () => {
  class MockBrowserWindow {
    _destroyed = false;
    _focused = false;
    isDestroyed(): boolean {
      return this._destroyed;
    }
    isMinimized(): boolean {
      return false;
    }
    restore(): void {}
    focus(): void {
      this._focused = true;
    }
  }
  return {
    app: { isPackaged: true },
    BrowserWindow: MockBrowserWindow,
    dialog: {},
    screen: {
      getDisplayMatching: () => ({ workArea: {} }),
      getDisplayNearestPoint: () => ({ workArea: {} }),
    },
  };
});

import {
  openp41geWindows,
  openp41geWindowMeta,
  focusWorkspaceWindow,
  closeOrphanedWindows,
  setDispatcher,
} from "../../electron/window-manager.js";
import type { BrowserWindow } from "electron";

type AnyWin = BrowserWindow & Record<string, unknown>;

function makeWindow(): AnyWin {
  const win: AnyWin = {
    _focused: false,
    _destroyed: false,
    isDestroyed(): boolean {
      return win._destroyed as boolean;
    },
    isMinimized(): boolean {
      return false;
    },
    restore(): void {},
    focus(): void {
      win._focused = true;
    },
    close(): void {
      win._destroyed = true;
    },
  };
  return win;
}

describe("focusWorkspaceWindow", () => {
  beforeEach(() => {
    openp41geWindows.clear();
    openp41geWindowMeta.clear();
  });

  it("returns false when no live window is bound to the workspace path", () => {
    openp41geWindows.set("w1", makeWindow());
    openp41geWindowMeta.set("w1", { windowType: "workspace", workspacePath: "/a" });
    expect(focusWorkspaceWindow("/b")).toBe(false);
  });

  it("focuses the first live workspace window for the path and returns true", () => {
    const w = makeWindow();
    openp41geWindows.set("w1", w as BrowserWindow);
    openp41geWindowMeta.set("w1", { windowType: "workspace", workspacePath: "/a" });
    expect(focusWorkspaceWindow("/a")).toBe(true);
    expect(w._focused).toBe(true);
  });

  it("skips destroyed windows", () => {
    const w = makeWindow();
    openp41geWindows.set("w1", w as BrowserWindow);
    openp41geWindowMeta.set("w1", { windowType: "workspace", workspacePath: "/a" });
    (w as { _destroyed: boolean })._destroyed = true;
    expect(focusWorkspaceWindow("/a")).toBe(false);
  });

  it("only matches workspace windows, not the window-manager window", () => {
    const w = makeWindow();
    openp41geWindows.set("wm", w as BrowserWindow);
    openp41geWindowMeta.set("wm", { windowType: "window-manager", workspacePath: null });
    expect(focusWorkspaceWindow("/a")).toBe(false);
  });
});

describe("closeOrphanedWindows", () => {
  beforeEach(() => {
    openp41geWindows.clear();
    openp41geWindowMeta.clear();
    setDispatcher({
      getWorkspace: () => ({ windows: [{ id: "ws-active" }] }),
    } as never);
  });

  it("only closes workspace windows that are absent from the layout", () => {
    const logs = makeWindow();
    const wm = makeWindow();
    const wsActive = makeWindow();
    const wsOrphan = makeWindow();

    openp41geWindows.set("logs-1", logs as BrowserWindow);
    openp41geWindowMeta.set("logs-1", { windowType: "logs", workspacePath: null });
    openp41geWindows.set("wm", wm as BrowserWindow);
    openp41geWindowMeta.set("wm", { windowType: "window-manager", workspacePath: null });
    openp41geWindows.set("ws-active", wsActive as BrowserWindow);
    openp41geWindowMeta.set("ws-active", { windowType: "workspace", workspacePath: "/a" });
    openp41geWindows.set("ws-orphan", wsOrphan as BrowserWindow);
    openp41geWindowMeta.set("ws-orphan", { windowType: "workspace", workspacePath: "/a" });

    closeOrphanedWindows();

    // Logs + window-manager + still-active workspace windows survive; the
    // orphaned workspace window (absent from the layout) is closed. This guards
    // the bug where a workspace shortcut fired from the Logs window dispatched
    // a layout command, ran orphan cleanup, and closed the Logs window.
    expect(logs.isDestroyed()).toBe(false);
    expect(wm.isDestroyed()).toBe(false);
    expect(wsActive.isDestroyed()).toBe(false);
    expect(wsOrphan.isDestroyed()).toBe(true);
  });
});
