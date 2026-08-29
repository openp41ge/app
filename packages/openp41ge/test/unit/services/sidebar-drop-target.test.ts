/**
 * Unit tests for ClosedSidebarDropTarget — the drop surface for dragging a
 * sidebar tab onto the OTHER sidebar when that sidebar is CLOSED.
 *
 * Covers:
 *  - onHover paints a fixed vertical line at the app-window edge on the target
 *    side (left:0 for "left", right:0 for "right") with no duplicates on
 *    repeated hover.
 *  - onDrop fires the sidebar-tab-drop CustomEvent with the correct
 *    targetSide / dropIndex (append at end of the closed sidebar's tab bar)
 *    and hides the edge line; non-system-tab sources are rejected.
 *  - onLeave removes the edge line.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SIDEBAR_DROP_EVENT } from "openp41ge-constants";
import type { IDragSource } from "../../../src/renderer/openp41ge-tabs-adapter";
import { ClosedSidebarDropTarget } from "../../../src/renderer/services/drop-targets/closed-sidebar-drop-target";
import { SidebarDropTarget } from "../../../src/renderer/services/drop-targets/sidebar-drop-target";

function fakeSystemTabSource(tabId: string, side: "left" | "right", winId = "w1"): IDragSource {
  return {
    type: "sidebar-tab",
    createGhost: () => document.createElement("div"),
    getDragData: () => ({ type: "system-tab", tabId, side, winId, title: "Tab" }),
    onDragStart: () => {},
    onDragEnd: () => {},
  };
}

/** Build a sidebar host containing a tab bar with `n` placeholder tab buttons. */
function buildClosedSidebar(side: "left" | "right", n: number) {
  document.body.innerHTML = "";
  const host = document.createElement("openp41ge-sidebar");
  host.setAttribute("side", side);
  host.classList.add("sidebar-element-hidden");
  const bar = document.createElement("div");
  bar.setAttribute("data-sidebar-tab-bar", side);
  for (let i = 0; i < n; i++) {
    const tab = document.createElement("div");
    tab.setAttribute("data-sidebar-tab-id", `${side}-${i}`);
    bar.appendChild(tab);
  }
  host.appendChild(bar);
  document.body.appendChild(host);
  return {
    host,
    bar: document.querySelector(`[data-sidebar-tab-bar="${side}"]`) as HTMLElement,
  };
}

function edgeEl(): HTMLElement | null {
  return document.querySelector(".closed-sidebar-edge-indicator");
}

// ─── SidebarDropTarget: no-op reorder indicator suppression ───────────────
// Reordering a sidebar tab right before or right after itself is a no-op (the
// drop handler already refuses it); the indicator must not advertise a drop
// that would not move the tab.

function mockRect(el: HTMLElement, left: number, top: number, width: number, height: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
}

/** 3-tab right bar; tabs at x=0,100,200 (100px wide) → midpoints 50,150,250. */
function buildRightBar(n: number) {
  document.body.innerHTML = "";
  const host = document.createElement("openp41ge-sidebar");
  host.setAttribute("side", "right");
  const bar = document.createElement("div");
  bar.setAttribute("data-sidebar-tab-bar", "right");
  const tabs: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const tab = document.createElement("div");
    tab.setAttribute("data-sidebar-tab-id", `t${i}`);
    tab.setAttribute("data-sidebar-side", "right");
    mockRect(tab, i * 100, 0, 100, 30);
    bar.appendChild(tab);
    tabs.push(tab);
  }
  mockRect(bar, 0, 0, 100, 30);
  host.appendChild(bar);
  document.body.appendChild(host);
  return { host, bar, tabs };
}

function indicatorVisible(): boolean {
  const el = document.querySelector(".sidebar-drop-indicator");
  // element may still be mounted but display:none when suppressed — check real visibility
  return !!el && getComputedStyle(el).display !== "none";
}

function overlayVisible(): boolean {
  return !!document.querySelector(".sidebar-ghost-overlay");
}

describe("SidebarDropTarget no-op reorder suppression", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("hides only the vertical bar (keeps the overlay) when hovering right before the dragged tab (dropIndex === fromIndex)", () => {
    const { bar, tabs } = buildRightBar(3);
    const target = new SidebarDropTarget(bar, "w1", "right");
    const source = fakeSystemTabSource("t1", "right"); // dragged tab is index 1

    // clientX=80 → dropIndex 1 (before tab at midpoint 150) == fromIndex → no-op
    const feedback = target.onHover(source, 80, 15);

    expect(indicatorVisible()).toBe(false); // precise bar suppressed
    expect(overlayVisible()).toBe(true); // sidebar overlay still shown
    expect(feedback).not.toBeNull();
  });

  it("hides only the vertical bar (keeps the overlay) when hovering right after the dragged tab (dropIndex === fromIndex + 1)", () => {
    const { bar } = buildRightBar(3);
    const target = new SidebarDropTarget(bar, "w1", "right");
    const source = fakeSystemTabSource("t1", "right");

    // clientX=180 → dropIndex 2 == fromIndex(1) + 1 → no-op
    const feedback = target.onHover(source, 180, 15);

    expect(indicatorVisible()).toBe(false); // precise bar suppressed
    expect(overlayVisible()).toBe(true); // sidebar overlay still shown
    expect(feedback).not.toBeNull();
  });

  it("shows the indicator for a position that actually moves the tab", () => {
    const { bar } = buildRightBar(3);
    const target = new SidebarDropTarget(bar, "w1", "right");
    const source = fakeSystemTabSource("t1", "right");

    // clientX=30 → dropIndex 0 (before tab at midpoint 50) — moves t1 to front
    const feedback = target.onHover(source, 30, 15);
    expect(indicatorVisible()).toBe(true);
    expect(overlayVisible()).toBe(true);
    expect(feedback).not.toBeNull();

    target.onLeave();
    // clientX=300 → dropIndex 3 (end) — moves t1 to the end
    const feedback2 = target.onHover(source, 300, 15);
    expect(indicatorVisible()).toBe(true);
    expect(feedback2).not.toBeNull();
  });

  it("shows the indicator for a cross-sidebar drop (always moves)", () => {
    const { bar } = buildRightBar(3);
    const target = new SidebarDropTarget(bar, "w1", "right");
    const source = fakeSystemTabSource("t1", "left"); // dragging FROM left

    const feedback = target.onHover(source, 80, 15);
    expect(indicatorVisible()).toBe(true);
    expect(feedback).not.toBeNull();
  });

  it("hides only the vertical bar everywhere when the dragged tab is the only tab in the bar", () => {
    const { bar } = buildRightBar(1);
    const target = new SidebarDropTarget(bar, "w1", "right");
    const source = fakeSystemTabSource("t0", "right");

    // any dropIndex (0 or 1) is a no-op for a lone tab → no precise bar,
    // but the overlay stays
    expect(target.onHover(source, 30, 15)).not.toBeNull();
    expect(indicatorVisible()).toBe(false);
    expect(overlayVisible()).toBe(true);
    expect(target.onHover(source, 300, 15)).not.toBeNull();
    expect(indicatorVisible()).toBe(false);
    expect(overlayVisible()).toBe(true);
  });
});

describe("ClosedSidebarDropTarget", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("left side: onHover paints a fixed vertical line at the window's left edge", () => {
    const { host, bar } = buildClosedSidebar("left", 0);
    const target = new ClosedSidebarDropTarget(host, "w1", "left", bar);
    target.onHover(fakeSystemTabSource("s1", "right"), 5, 5);

    const ind = edgeEl();
    expect(ind).not.toBeNull();
    expect(ind!.style.position).toBe("fixed");
    expect(ind!.style.left).toBe("0px");
    expect(ind!.style.top).toBe("35px"); // below the title bar — sidebar doesn't go above it
    expect(ind!.style.bottom).toBe("12px"); // stops above the OS-rounded bottom corner strip
    expect(ind!.style.borderBottomLeftRadius).toBe(""); // no rounding on the thin line
    expect(ind!.style.width).toBe("3px");
    expect(document.body.contains(ind)).toBe(true);
  });

  it("right side: onHover paints the line at the window's right edge", () => {
    const { host, bar } = buildClosedSidebar("right", 0);
    const target = new ClosedSidebarDropTarget(host, "w1", "right", bar);
    target.onHover(fakeSystemTabSource("s1", "left"), 5, 5);

    const ind = edgeEl();
    expect(ind).not.toBeNull();
    expect(ind!.style.right).toBe("0px");
    expect(ind!.style.left).toBe("");
    expect(ind!.style.borderBottomRightRadius).toBe(""); // no rounding on the thin line
    expect(ind!.style.borderBottomLeftRadius).toBe("");
  });

  it("repeated onHover does not duplicate the edge line", () => {
    const { host, bar } = buildClosedSidebar("left", 0);
    const target = new ClosedSidebarDropTarget(host, "w1", "left", bar);
    target.onHover(fakeSystemTabSource("s1", "right"), 5, 5);
    target.onHover(fakeSystemTabSource("s1", "right"), 5, 6);
    expect(document.querySelectorAll(".closed-sidebar-edge-indicator").length).toBe(1);
  });

  it("onLeave removes the edge line", () => {
    const { host, bar } = buildClosedSidebar("left", 0);
    const target = new ClosedSidebarDropTarget(host, "w1", "left", bar);
    target.onHover(fakeSystemTabSource("s1", "right"), 5, 5);
    expect(edgeEl()).not.toBeNull();
    target.onLeave();
    expect(edgeEl()).toBeNull();
  });

  it("onDrop fires sidebar-tab-drop to the target side, appending at end of the bar, and hides the line", async () => {
    const { host, bar } = buildClosedSidebar("left", 2); // two existing tabs
    const target = new ClosedSidebarDropTarget(host, "w1", "left", bar);
    const listener = vi.fn();
    document.addEventListener(SIDEBAR_DROP_EVENT, listener);

    target.onHover(fakeSystemTabSource("s1", "right"), 5, 5);
    const result = await target.onDrop(fakeSystemTabSource("s1", "right"), 5, 5);

    expect(result).toEqual({ success: true });
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toEqual({
      tabId: "s1",
      sourceSide: "right",
      targetSide: "left",
      dropIndex: 2, // after the two existing tabs
      winId: "w1",
    });
    expect(edgeEl()).toBeNull();
  });

  it("right-side target reports targetSide 'right'", async () => {
    const { host, bar } = buildClosedSidebar("right", 1);
    const target = new ClosedSidebarDropTarget(host, "w1", "right", bar);
    const listener = vi.fn();
    document.addEventListener(SIDEBAR_DROP_EVENT, listener);

    await target.onDrop(fakeSystemTabSource("s1", "left"), 5, 5);

    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.targetSide).toBe("right");
    expect(detail.sourceSide).toBe("left");
    expect(detail.dropIndex).toBe(1);
  });

  it("rejects non-system-tab sources without firing the event", async () => {
    const { host, bar } = buildClosedSidebar("left", 0);
    const target = new ClosedSidebarDropTarget(host, "w1", "left", bar);
    const listener = vi.fn();
    document.addEventListener(SIDEBAR_DROP_EVENT, listener);

    const source = fakeSystemTabSource("s1", "right");
    source.getDragData = () => ({ type: "file", filePath: "/x" });
    const result = await target.onDrop(source, 5, 5);

    expect(result).toEqual({
      success: false,
      reason: "only system tabs can be dropped on a closed sidebar edge",
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
