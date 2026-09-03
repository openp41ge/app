// @vitest-environment jsdom
/**
 * Regression test: a workspace-skeleton drag must NOT light up a central grid
 * drop indicator. A workspace skeleton can only be dropped to open a workspace
 * window (drag-out), never onto a grid/tab bar, so a cross-window drag of type
 * "workspace" must not paint a grid ghost overlay. Mirrors the existing
 * "sidebar-tab" guard in _updateCrossWindowGhost.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initDragSystem } from "@openp41ge/renderer/services/init-drag-system";

type Hooks = {
  setRemoteDragActive: (active: boolean) => void;
  setRemoteDragType: (type: string | null) => void;
  getRemoteDragType: () => string | null;
  callUpdateCrossWindowGhost: (cx: number, cy: number) => void;
  getGridGhostOverlay: () => HTMLElement | null;
  forceCrossWindowGhostCleanup: () => void;
};

function hooks(): Hooks {
  return (window as unknown as { __openp41geTestHooks: Hooks }).__openp41geTestHooks;
}

/** A minimal tab-grid with a known 400×300 rect so the ghost preview can run. */
function makeGrid(): HTMLElement {
  const grid = document.createElement("tab-grid");
  grid.setAttribute("cols", "1");
  (grid as HTMLElement & { cols: number }).cols = 1;
  const rect = { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 };
  grid.getBoundingClientRect = () => rect as DOMRect;
  document.body.appendChild(grid);
  return grid;
}

describe("cross-window grid ghost suppression by drag type", () => {
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
      workspace: {
        getWindowId: vi.fn().mockReturnValue("win-1"),
        dispatch: vi.fn(),
      },
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

  it("does NOT paint a grid ghost while dragging a workspace skeleton", () => {
    const grid = makeGrid();
    const H = hooks();
    H.setRemoteDragActive(true);
    H.setRemoteDragType("workspace");

    // Cursor over the centre of the grid would normally light a drop zone.
    H.callUpdateCrossWindowGhost(200, 150);

    expect(H.getRemoteDragType()).toBe("workspace");
    expect(H.getGridGhostOverlay()).toBeNull();
    expect(grid.querySelector(".openp41ge-ghost-overlay")).toBeNull();
  });

  it("still paints a grid ghost for a normal tab drag", () => {
    makeGrid();
    const H = hooks();
    H.setRemoteDragActive(true);
    H.setRemoteDragType("tab");

    H.callUpdateCrossWindowGhost(200, 150);

    expect(H.getGridGhostOverlay()).not.toBeNull();
  });

  it("clears any previously-shown grid ghost when the drag type is workspace", () => {
    makeGrid();
    const H = hooks();
    H.setRemoteDragActive(true);

    // Show a tab ghost first.
    H.setRemoteDragType("tab");
    H.callUpdateCrossWindowGhost(200, 150);
    expect(H.getGridGhostOverlay()).not.toBeNull();

    // Switching to a workspace drag must hide the grid ghost.
    H.setRemoteDragType("workspace");
    H.callUpdateCrossWindowGhost(200, 150);
    expect(H.getGridGhostOverlay()).toBeNull();
  });
});
