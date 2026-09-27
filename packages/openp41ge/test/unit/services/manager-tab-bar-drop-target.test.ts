// @ts-nocheck
/**
 * Unit tests for ManagerTabBarDropTarget — the drop target for the Application
 * Management window's tab bar (`.wm-tabbar`) inside the component's shadow root.
 *
 * Only manager-tab drags may land here. A successful drop fires a composed
 * `manager-tab-reorder` CustomEvent on the bar. While hovering, a blue insert
 * line marks the gap.
 */

import {
  ManagerTabBarDropTarget,
  managerTabButtons,
  managerDropIndex,
  MANAGER_TAB_REORDER_EVENT,
} from "@openp41ge/renderer/services/drop-targets/manager-tab-bar-drop-target";
import { ManagerTabDragSource } from "@openp41ge/renderer/services/drag-sources/manager-tab-drag-source";

function rect(left: number, width: number): DOMRect {
  return {
    left,
    top: 0,
    right: left + width,
    bottom: 30,
    width,
    height: 30,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

/** A bar with three tabs: workspaces(0) settings(1) releases(2). */
function makeBar(): { bar: HTMLElement; buttons: HTMLElement[] } {
  const bar = document.createElement("div");
  bar.className = "wm-tabbar";
  ["workspaces", "settings", "releases"].forEach((id) => {
    const btn = document.createElement("div");
    btn.className = "wm-tab";
    btn.setAttribute("data-manager-tab", id);
    bar.appendChild(btn);
  });
  document.body.appendChild(bar);

  const buttons = managerTabButtons(bar);
  // Layout: bar left=0 width=300; each tab 100px wide (96px content).
  Object.defineProperty(bar, "getBoundingClientRect", {
    value: () => rect(0, 300),
    configurable: true,
  });
  Object.defineProperty(bar, "scrollWidth", { value: 300, configurable: true });
  buttons.forEach((b, i) => {
    Object.defineProperty(b, "getBoundingClientRect", {
      value: () => rect(i * 100, 96),
      configurable: true,
    });
    Object.defineProperty(b, "offsetLeft", { value: i * 100, configurable: true });
  });
  return { bar, buttons };
}

describe("ManagerTabBarDropTarget", () => {
  test("managerTabButtons returns the .wm-tab children in order", () => {
    const { buttons } = makeBar();
    expect(buttons.map((b) => b.getAttribute("data-manager-tab"))).toEqual([
      "workspaces",
      "settings",
      "releases",
    ]);
  });

  test("managerDropIndex inserts at the gap under clientX", () => {
    const { bar } = makeBar();
    expect(managerDropIndex(bar, 50)).toBe(1);
    expect(managerDropIndex(bar, 300)).toBe(3); // end of bar → after all tabs
    expect(managerDropIndex(bar, -10)).toBe(0); // before the first tab
  });

  test("onHover ignores non-manager drags", () => {
    const { bar } = makeBar();
    const target = new ManagerTabBarDropTarget(bar);
    expect(target.onHover({ type: "tab" }, 50, 10)).toBeNull();
  });

  test("onHover accepts a manager-tab drag and shows the indicator", () => {
    const { bar } = makeBar();
    const target = new ManagerTabBarDropTarget(bar);
    const source = new ManagerTabDragSource(bar.children[0], "workspaces", "wm-1", "Workspaces");
    const feedback = target.onHover(source, 150, 10);
    expect(feedback).toEqual({ cssClass: "wm-tabbar--drop-active", overTabBar: true });
    const indicator = bar.querySelector(".wm-tab-drop-indicator");
    expect(indicator).not.toBeNull();
    expect(indicator.style.display).toBe("block");
  });

  test("the indicator is the shared full-height square look with vertical strokes (no cross-cap ticks)", () => {
    const { bar } = makeBar();
    const target = new ManagerTabBarDropTarget(bar);
    const source = new ManagerTabDragSource(bar.children[0], "workspaces", "wm-1", "Workspaces");
    target.onHover(source, 50, 10);

    const ind = bar.querySelector<HTMLElement>(".wm-tab-drop-indicator")!;
    // A plain div (NOT <drop-line>), matching the grid/sidebar indicators.
    expect(ind.tagName).toBe("DIV");
    // Full-height, square, 3px blue with a glow.
    expect(ind.style.top).toBe("0px");
    expect(ind.style.bottom).toBe("0px");
    expect(ind.style.width).toBe("3px");
    expect(ind.style.background).toContain("rgb(74, 158, 255");
    expect(ind.style.borderRadius).toBe("0px");
    // Two vertical overdraw strokes; no horizontal cross-cap ticks.
    expect(ind.querySelectorAll(".drop-tip-vod-up, .drop-tip-vod-down")).toHaveLength(2);
    expect(ind.querySelectorAll("overdraw-line")).toHaveLength(0);
    expect(ind.querySelectorAll("div")).toHaveLength(2);
  });

  test("onLeave hides the indicator", () => {
    const { bar } = makeBar();
    const target = new ManagerTabBarDropTarget(bar);
    const source = new ManagerTabDragSource(bar.children[0], "workspaces", "wm-1", "Workspaces");
    target.onHover(source, 150, 10);
    target.onLeave();
    expect(bar.querySelector(".wm-tab-drop-indicator").style.display).toBe("none");
  });

  test("onDrop reorders on a forward insertion by adjusting the index down one", () => {
    const { bar } = makeBar();
    const target = new ManagerTabBarDropTarget(bar);
    // Source tab is workspaces (index 0).
    const source = new ManagerTabDragSource(bar.children[0], "workspaces", "wm-1", "Workspaces");

    const events = [];
    bar.addEventListener(MANAGER_TAB_REORDER_EVENT, (e) => events.push(e.detail));

    // Drop at clientX=200 → gap between "settings" and "releases" (dropIndex 2),
    // which after removing workspaces (fromIndex 0) becomes toIndex 1.
    return target.onDrop(source, 200, 10).then((r) => {
      expect(r.success).toBe(true);
      expect(events).toEqual([{ tabId: "workspaces", fromIndex: 0, toIndex: 1 }]);
    });
  });

  test("onDrop with a non-manager source fails without firing", () => {
    const { bar } = makeBar();
    const target = new ManagerTabBarDropTarget(bar);
    const events = [];
    bar.addEventListener(MANAGER_TAB_REORDER_EVENT, (e) => events.push(e.detail));
    return target.onDrop({ type: "tab" }, 50, 10).then((r) => {
      expect(r.success).toBe(false);
      expect(events).toEqual([]);
    });
  });
});
