// @vitest-environment jsdom
/**
 * Integration test: a cross-window manager-tab drag previews the blue insertion
 * line on another management window's tab bar (the only valid drop surface).
 * It must never light up a central grid. Mirrors the "workspace"/"sidebar-tab"
 * guards in _updateCrossWindowGhost, but for manager tabs the target is the
 * registered manager bar in the component's shadow root — exercised here through
 * the registerManagerTabBarForTest hook.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initDragSystem } from "@openp41ge/renderer/services/init-drag-system";

type Hooks = {
  setRemoteDragActive: (active: boolean) => void;
  setRemoteDragType: (type: string | null) => void;
  callUpdateCrossWindowGhost: (cx: number, cy: number) => void;
  registerManagerTabBarForTest: (barEl: HTMLElement) => void;
  callUpdateManagerBarGhost: (cx: number, cy: number) => void;
  getGridGhostOverlay: () => HTMLElement | null;
  forceCrossWindowGhostCleanup: () => void;
};

function hooks(): Hooks {
  return (window as unknown as { __openp41geTestHooks: Hooks }).__openp41geTestHooks;
}

function makeManagerBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "wm-tabbar";
  const rect = { left: 0, top: 0, width: 400, height: 35, right: 400, bottom: 35 };
  bar.getBoundingClientRect = () => rect as DOMRect;
  Object.defineProperty(bar, "scrollWidth", { value: 400, configurable: true });
  document.body.appendChild(bar);
  return bar;
}

describe("cross-window manager-tab ghost on the manager bar", () => {
  let cleanup: () => void;

  beforeEach(() => {
    const drag = {
      start: vi.fn(),
      move: vi.fn(),
      end: vi.fn(),
      activate: vi.fn(),
      ghostForward: vi.fn(),
      check: vi.fn().mockResolvedValue(null),
      getActive: vi.fn().mockResolvedValue(null),
      endSession: vi.fn(),
      onEndSession: vi.fn().mockReturnValue(() => {}),
      onGhostShow: vi.fn().mockReturnValue(() => {}),
      onDragState: vi.fn().mockReturnValue(() => {}),
    };
    (window as unknown as { openp41ge: any }).openp41ge = {
      workspace: { getWindowId: vi.fn().mockReturnValue("win-1"), dispatch: vi.fn() },
      drag,
      workspaceController: {},
      file: { readRange: vi.fn() },
    };
    cleanup = initDragSystem();
  });

  afterEach(() => {
    cleanup();
    hooks().forceCrossWindowGhostCleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("shows the insertion line on the manager bar while dragging a manager-tab over it", () => {
    const bar = makeManagerBar();
    const H = hooks();
    H.registerManagerTabBarForTest(bar);
    H.setRemoteDragActive(true);
    H.setRemoteDragType("manager-tab");

    H.callUpdateCrossWindowGhost(200, 15);

    const indicator = bar.querySelector<HTMLElement>(".wm-tab-drop-indicator");
    expect(indicator).not.toBeNull();
    expect(indicator.style.display).toBe("block");
  });

  it("does NOT hide once the cursor leaves the bar", () => {
    const bar = makeManagerBar();
    const H = hooks();
    H.registerManagerTabBarForTest(bar);
    H.setRemoteDragActive(true);
    H.setRemoteDragType("manager-tab");

    H.callUpdateCrossWindowGhost(200, 15);
    H.callUpdateCrossWindowGhost(500, 15); // outside the bar's rect

    const indicator = bar.querySelector<HTMLElement>(".wm-tab-drop-indicator");
    expect(indicator).not.toBeNull();
    expect(indicator.style.display).toBe("none");
  });

  it("never paints a grid ghost for a manager-tab drag", () => {
    makeManagerBar();
    const grid = document.createElement("tab-grid");
    grid.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }) as DOMRect;
    document.body.appendChild(grid);

    const H = hooks();
    H.setRemoteDragActive(true);
    H.setRemoteDragType("manager-tab");

    H.callUpdateCrossWindowGhost(200, 150);

    expect(grid.querySelector(".openp41ge-ghost-overlay")).toBeNull();
    expect(H.getGridGhostOverlay()).toBeNull();
  });
});
