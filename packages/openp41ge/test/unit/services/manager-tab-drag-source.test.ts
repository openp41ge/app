// @ts-nocheck
/**
 * Unit tests for ManagerTabDragSource — the Application Management window's
 * tab bar drag source.
 *
 * Like every other tab type, the visible ghost is the main-process
 * DragGhostManager BrowserWindow (a captured bitmap of the source tab), so the
 * in-DOM ghost is invisible and the source tab is dimmed instead.
 */

import { ManagerTabDragSource } from "@openp41ge/renderer/services/drag-sources/manager-tab-drag-source";

describe("ManagerTabDragSource", () => {
  test("getDragData reports a manager-tab payload with tabId/winId/title", () => {
    const source = new ManagerTabDragSource(document.createElement("div"), "settings", "wm-1", "Settings");
    expect(source.getDragData()).toEqual({
      type: "manager-tab",
      tabId: "settings",
      winId: "wm-1",
      title: "Settings",
    });
  });

  test("setOffset records the cursor offset relative to the tab", () => {
    const source = new ManagerTabDragSource(document.createElement("div"), "workspaces", "wm-1", "Workspaces");
    expect(source.offsetX).toBe(0);
    expect(source.offsetY).toBe(0);
    source.setOffset(12, 30);
    expect(source.offsetX).toBe(12);
    expect(source.offsetY).toBe(30);
  });

  test("createGhost returns an invisible, pointer-inert element (visual is the BrowserWindow bitmap)", () => {
    const source = new ManagerTabDragSource(document.createElement("div"), "releases", "wm-1", "Releases");
    const ghost = source.createGhost();
    expect(ghost.style.pointerEvents).toBe("none");
    expect(ghost.style.opacity).toBe("0");
  });

  test("onDragStart dims the source tab; onDragEnd restores it and removes the ghost", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const source = new ManagerTabDragSource(el, "welcome", "wm-1", "Welcome");

    source.createGhost();
    source.onDragStart();
    expect(el.style.opacity).toBe("0.4");

    source.onDragEnd({ success: true });
    expect(el.style.opacity).toBe("");
  });

  test("onDragEnd removes the invisible ghost from the DOM", () => {
    const source = new ManagerTabDragSource(document.createElement("div"), "workspaces", "wm-1", "Workspaces");
    const ghost = source.createGhost();
    document.body.appendChild(ghost);
    source.onDragEnd({ success: true });
    expect(document.body.contains(ghost)).toBe(false);
  });
});
