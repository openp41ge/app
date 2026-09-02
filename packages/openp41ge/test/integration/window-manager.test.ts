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
