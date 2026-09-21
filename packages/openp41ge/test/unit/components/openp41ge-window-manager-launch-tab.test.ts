// @vitest-environment jsdom
/**
 * A window opened for a specific management tab (e.g. dragging the Settings
 * tab out into a new window, or app menu > Settings) should open with ONLY
 * that tab in the bar — not the default "workspaces" tab plus the appended
 * launch tab.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Openp41geWindowManager } from "../../../src/renderer/components/openp41ge-window-manager";

function stubWindow(launchTab: string | null): void {
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    drag: {
      start: vi.fn(),
      activate: vi.fn(),
      move: vi.fn(),
      end: vi.fn(),
      prepareBitmap: vi.fn(),
      onEndSession: vi.fn(() => () => {}),
    },
    windowManager: {
      openWindowSummaries: vi.fn().mockResolvedValue([]),
      onOpenWindowsChanged: vi.fn(() => () => {}),
      openWorkspaceWindow: vi.fn(),
      onActivateTab: vi.fn(() => () => {}),
      onReceiveTab: vi.fn(() => () => {}),
      onRemoveTab: vi.fn(() => () => {}),
    },
    workspace: {
      getWindowId: vi.fn(() => "win-ws1-0"),
      getLaunchTab: vi.fn(() => launchTab),
    },
    welcome: {
      isDismissed: vi.fn().mockResolvedValue(true),
    },
  };
}

async function mount(): Promise<Openp41geWindowManager> {
  const wm = new Openp41geWindowManager();
  document.body.appendChild(wm);
  await wm.updateComplete;
  return wm;
}

describe("window-manager launch tab", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  test("with no launch tab the bar starts with the default workspaces tab", async () => {
    stubWindow(null);
    const wm = await mount();
    expect((wm as unknown as { _openTabs: string[] })._openTabs).toEqual(["workspaces"]);
  });

  test("a window opened for the settings tab opens with ONLY settings", async () => {
    stubWindow("settings");
    const wm = await mount();
    const tabs = (wm as unknown as { _openTabs: string[] })._openTabs;
    expect(tabs).toEqual(["settings"]);
    expect((wm as unknown as { _activeTab: string })._activeTab).toBe("settings");
  });
});
