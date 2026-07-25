// @vitest-environment jsdom
/**
 * Integration tests for TabMountManager — controller lifecycle management
 * synced with workspace state.
 *
 * Verifies that controllers are created/mounted/unmounted as tabs appear
 * and disappear in the workspace, and that activateTab shows/hides the
 * correct containers.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TabMountManager } from "@openp41ge/renderer/services/tab-mount-manager";
import { registerAppType } from "@openp41ge/renderer/apps/app-registry";
import type { TabController } from "@openp41ge/renderer/controllers/types";
import type { Workspace } from "@openp41ge/layout/types";
import { createWorkspace } from "@openp41ge/layout/types";

// ── Helpers ──────────────────────────────────────────────────────────────

class TestController implements TabController {
  readonly tabId: string;
  readonly appType: string;
  mountCalls: HTMLElement[] = [];
  unmountCalls = 0;
  visibleStates: boolean[] = [];
  container: HTMLElement | null = null;

  constructor(tabId: string, appType: string) {
    this.tabId = tabId;
    this.appType = appType;
  }

  mount(container: HTMLElement): void {
    this.mountCalls.push(container);
    this.container = container;
    container.innerHTML = `<div class="ctrl-${this.tabId}">${this.appType}</div>`;
  }

  unmount(): void {
    this.unmountCalls++;
    if (this.container) {
      this.container.innerHTML = "";
    }
    this.container = null;
  }

  setVisible(visible: boolean): void {
    this.visibleStates.push(visible);
  }

  snapshot(): Record<string, unknown> {
    return { appType: this.appType };
  }

  restore(_state: Record<string, unknown>): void {
    // noop
  }
}

function registerTestAppType(id: string): void {
  registerAppType({
    id,
    label: id,
    icon: "?",
    description: "test type",
    createController: (tabId: string) => new TestController(tabId, id),
  });
}

/** Create a minimal workspace with one window and add a tab to it. */
function addTabToWorkspace(
  ws: Workspace,
  tabId: string,
  appType: string,
  col: number = 0,
  title?: string,
): Workspace {
  const tab = { id: tabId, appType, title: title ?? appType, config: {}, isPreview: false } as any;
  (ws.tabs as any)[tabId] = tab;

  while (ws.windows[0].grid.cols <= col) {
    ws.windows[0].grid.cols++;
  }

  const existing = ws.windows[0].grid.placements.find((p) => p.position.col === col);
  if (existing) {
    existing.tabIds.push(tabId);
  } else {
    ws.windows[0].grid.placements.push({
      position: { row: 0, col },
      tabIds: [tabId],
      activeTabId: tabId,
    });
  }

  return ws;
}

/**
 * Create a realistic DOM structure matching what <tab-grid> renders:
 *   .openp41ge-grid-area
 *     <tab-grid>
 *       .grid-cell[data-cell-col="0"]
 *         <tab-bar></tab-bar>
 *         <tab-view></tab-view>
 *       .grid-cell[data-cell-col="1"]
 *         <tab-bar></tab-bar>
 *         <tab-view></tab-view>
 */
// ── Global reference to the mock grid for re-syncing placements ──────────
let mockGrid: HTMLElement | null = null;

/**
 * Sync the mock grid's placements from the workspace state.
 * Called before each manager.sync().
 */
function syncGridPlacements(winId: string, ws: Workspace): void {
  if (!mockGrid) return;
  const win = ws.windows.find((w) => w.id === winId);
  if (!win) return;
  (mockGrid as any).placements = win.grid.placements;
}

function setupGridDOM(cols: number): HTMLElement {
  const gridArea = document.createElement("div");
  gridArea.className = "openp41ge-grid-area";
  gridArea.style.position = "relative";

  const grid = document.createElement("tab-grid");
  grid.style.position = "relative";
  mockGrid = grid;

  // Set up placements on the grid element for the mock mountController
  (grid as any).placements = Array.from({ length: cols }, (_, i) => ({
    position: { row: 0, col: i },
    tabIds: [],
  }));

  // Add a mock mountController that mimics TabGrid's real behavior:
  // finds the <tab-content> for the matching column and appends element
  // to its .tab-content-controller div.
  (grid as any).mountController = (tabId: string, element: HTMLElement) => {
    // Find which column this tab belongs to in placements
    const placements = (grid as any).placements || [];
    for (const p of placements) {
      if (p.tabIds.includes(tabId)) {
        const col = p.position.col;
        const tabContent = grid.querySelector(`tab-content[col="${col}"]`);
        if (tabContent) {
          let controllerDiv = tabContent.querySelector(".tab-content-controller") as HTMLElement;
          if (!controllerDiv) {
            controllerDiv = document.createElement("div");
            controllerDiv.className = "tab-content-controller";
            controllerDiv.style.display = "flex";
            tabContent.appendChild(controllerDiv);
          }
          // Hide string content div if present
          const stringContent = tabContent.querySelector(".tab-content-string") as HTMLElement;
          if (stringContent) stringContent.style.display = "none";
          controllerDiv.style.display = "flex";
          if (!controllerDiv.contains(element)) {
            controllerDiv.appendChild(element);
          }
          return true;
        }
      }
    }
    return false;
  };

  for (let i = 0; i < cols; i++) {
    const cell = document.createElement("div");
    cell.className = "grid-cell";
    cell.setAttribute("data-cell-col", String(i));
    cell.style.display = "flex";
    cell.style.flexDirection = "column";

    const tabBar = document.createElement("tab-bar");
    (tabBar as any).winId = "w1";
    (tabBar as any).col = i;
    cell.appendChild(tabBar);

    // Create <tab-content> with string-content and controller divs,
    // matching the structure of the real tab-content component.
    const tabContent = document.createElement("tab-content");
    tabContent.setAttribute("col", String(i));
    tabContent.style.flex = "1";
    tabContent.style.display = "flex";
    tabContent.style.flexDirection = "column";

    const stringContent = document.createElement("div");
    stringContent.className = "tab-content-string";
    stringContent.textContent = "default";
    tabContent.appendChild(stringContent);

    const controllerDiv = document.createElement("div");
    controllerDiv.className = "tab-content-controller";
    controllerDiv.style.display = "none";
    tabContent.appendChild(controllerDiv);

    cell.appendChild(tabContent);
    grid.appendChild(cell);
  }

  gridArea.appendChild(grid);
  document.body.appendChild(gridArea);
  return gridArea;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("TabMountManager", () => {
  let manager: TabMountManager;
  let ws: Workspace;

  beforeEach(() => {
    registerTestAppType("test-terminal");
    registerTestAppType("test-editor");
    manager = new TabMountManager();
    ws = createWorkspace("test-ws");
  });

  afterEach(() => {
    manager.destroy();
    // Clean up DOM
    document.body.querySelector(".openp41ge-grid-area")?.remove();
  });

  it("creates controller containers for tabs in workspace state", () => {
    addTabToWorkspace(ws, "t1", "test-terminal", 0);
    addTabToWorkspace(ws, "t2", "test-editor", 1);
    const winId = ws.windows[0].id;
    setupGridDOM(2);
    syncGridPlacements(winId, ws);

    manager.sync(ws, winId);

    const ctrl1 = manager.getController("t1") as TestController;
    expect(ctrl1).toBeDefined();
    expect(ctrl1.mountCalls).toHaveLength(1);
    expect(ctrl1.mountCalls[0].innerHTML).toContain("ctrl-t1");

    const ctrl2 = manager.getController("t2") as TestController;
    expect(ctrl2).toBeDefined();
    expect(ctrl2.mountCalls).toHaveLength(1);

    // Containers should be children of their grid cells
    const cell0 = document.querySelector('[data-cell-col="0"]');
    const cell1 = document.querySelector('[data-cell-col="1"]');
    expect(cell0?.contains(ctrl1.container)).toBe(true);
    expect(cell1?.contains(ctrl2.container)).toBe(true);
  });

  it("shows active tab container and hides inactive in same column", () => {
    addTabToWorkspace(ws, "t1", "test-terminal", 0);
    addTabToWorkspace(ws, "t2", "test-editor", 0);
    ws.windows[0].grid.placements[0].activeTabId = "t1";
    const winId = ws.windows[0].id;
    setupGridDOM(1);
    syncGridPlacements(winId, ws);

    manager.sync(ws, winId);

    const ctrl1 = manager.getController("t1") as TestController;
    const ctrl2 = manager.getController("t2") as TestController;
    expect(ctrl1).toBeDefined();
    expect(ctrl2).toBeDefined();

    // Active container visible, inactive hidden
    expect(ctrl1.container!.style.display).not.toBe("none");
    expect(ctrl2.container!.style.display).toBe("none");

    // Activate t2
    manager.activateTab("t2");

    expect(ctrl1.container!.style.display).toBe("none");
    expect(ctrl2.container!.style.display).not.toBe("none");
  });

  it("removes orphan mounts when tab no longer exists", () => {
    addTabToWorkspace(ws, "t1", "test-terminal", 0);
    const winId = ws.windows[0].id;
    setupGridDOM(1);
    syncGridPlacements(winId, ws);

    manager.sync(ws, winId);
    expect(manager.getController("t1")).toBeDefined();

    // Remove t1 from workspace
    ws.windows[0].grid.placements[0].tabIds = [];
    delete (ws.tabs as any)["t1"];
    syncGridPlacements(winId, ws);

    manager.sync(ws, winId);

    expect(manager.getController("t1")).toBeUndefined();
  });

  it("calls setVisible(true) for active and setVisible(false) for inactive tabs", () => {
    addTabToWorkspace(ws, "t1", "test-terminal", 0);
    addTabToWorkspace(ws, "t2", "test-editor", 0);
    ws.windows[0].grid.placements[0].activeTabId = "t1";
    const winId = ws.windows[0].id;
    setupGridDOM(1);
    syncGridPlacements(winId, ws);

    manager.sync(ws, winId);

    const ctrl1 = manager.getController("t1") as TestController;
    const ctrl2 = manager.getController("t2") as TestController;

    expect(ctrl1.visibleStates).toContain(true);
    expect(ctrl2.visibleStates).toContain(false);
  });

  it("hides string-content for columns with active controllers", () => {
    addTabToWorkspace(ws, "t1", "test-terminal", 0);
    const winId = ws.windows[0].id;
    setupGridDOM(1);
    syncGridPlacements(winId, ws);

    manager.sync(ws, winId);

    const tabContent = document.querySelector("tab-content") as HTMLElement;
    const stringContent = tabContent?.querySelector(".tab-content-string") as HTMLElement;
    expect(stringContent.style.display).toBe("none");
  });

  it("destroy() unmounts all controllers", () => {
    addTabToWorkspace(ws, "t1", "test-terminal", 0);
    const winId = ws.windows[0].id;
    setupGridDOM(1);
    syncGridPlacements(winId, ws);

    manager.sync(ws, winId);

    const ctrl = manager.getController("t1") as TestController;
    expect(ctrl.unmountCalls).toBe(0);

    manager.destroy();

    expect(ctrl.unmountCalls).toBe(1);
  });
});
