/**
 * Grid tab-bar drop indicator geometry.
 *
 * The TabBarDropTarget (openp41ge-tabs) draws the blue insertion line on a
 * cell's tab bar during a tab drag/reorder. These tests pin that the marker is
 * FULL tab-bar height (flush with the top and bottom edges, not inset), square,
 * 3px with a glow, cross-capped with the overdraw-family blue ticks at its top
 * and bottom tips, continues past the bar's top/bottom edges (vertical
 * overdraw strokes), and is suppressed for same-cell no-op reorders.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { TabBarDropTarget } from "openp41ge-tabs/targets/tab-bar-drop-target";
import type { IDragSource } from "openp41ge-tabs/interfaces";

function fakeTabSource(tabId = "t1"): IDragSource {
  return {
    type: "tab",
    createGhost: () => document.createElement("div"),
    getDragData: () => ({ type: "tab", tabId, winId: "w1", col: 0 }),
    onDragStart: () => {},
    onDragEnd: () => {},
  } as unknown as IDragSource;
}

function rectFor(left: number, width = 100): DOMRect {
  return {
    left,
    right: left + width,
    top: 0,
    bottom: 35,
    width,
    height: 35,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as unknown as DOMRect;
}

describe("TabBarDropTarget tab-bar indicator geometry", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function bar(): HTMLElement {
    const b = document.createElement("div");
    b.style.position = "relative";
    document.body.appendChild(b);
    return b;
  }

  function crossCapTicks(ind: HTMLElement): HTMLElement[] {
    return Array.from(ind.querySelectorAll<HTMLElement>(
      "div:not(.drop-tip-vod-up):not(.drop-tip-vod-down)",
    ));
  }

  it("is full-height (3px, glow, square) once the indicator is shown", () => {
    const b = bar();
    const target = new TabBarDropTarget(b, "w1", 0);

    const feedback = target.onHover(fakeTabSource(), 10, 15);
    expect(feedback).not.toBeNull();

    const ind = b.querySelector<HTMLElement>(".tab-drop-indicator")!;
    expect(ind).not.toBeNull();
    // Flush with the bar's edges (previously inset 4px).
    expect(ind.style.top).toBe("0px");
    expect(ind.style.bottom).toBe("0px");
    expect(ind.style.width).toBe("3px");
    // Square + glow (matches the sidebar <drop-line> look).
    expect(ind.style.boxShadow).toContain("rgba(74,158,255");
    expect(ind.style.display).toBe("block");
  });

  it("cross-caps the indicator with four blue tip ticks", () => {
    const b = bar();
    const target = new TabBarDropTarget(b, "w1", 0);
    target.onHover(fakeTabSource(), 10, 15);

    const ind = b.querySelector<HTMLElement>(".tab-drop-indicator")!;
    const ticks = crossCapTicks(ind);
    expect(ticks).toHaveLength(4);
    expect(ticks.map((t) => t.style.backgroundImage)).toEqual([
      "linear-gradient(to left, rgb(74, 158, 255) 40%, transparent)",
      "linear-gradient(to right, rgb(74, 158, 255) 40%, transparent)",
      "linear-gradient(to left, rgb(74, 158, 255) 40%, transparent)",
      "linear-gradient(to right, rgb(74, 158, 255) 40%, transparent)",
    ]);
    // Top pair sits at the line's top edge, bottom pair at its last pixel row.
    expect(ticks[0].style.top).toBe("0px");
    expect(ticks[2].style.top).toBe("calc(100% - 1px)");
    expect(ticks[0].style.right).toBe("100%");
    expect(ticks[1].style.left).toBe("100%");
  });

  it("adds two fixed vertical overdraw strokes (up + down) at the tips", () => {
    const b = bar();
    const target = new TabBarDropTarget(b, "w1", 0);
    target.onHover(fakeTabSource(), 10, 15);

    const ind = b.querySelector<HTMLElement>(".tab-drop-indicator")!;
    const up = ind.querySelector<HTMLElement>(".drop-tip-vod-up")!;
    const down = ind.querySelector<HTMLElement>(".drop-tip-vod-down")!;
    expect(up).not.toBeNull();
    expect(down).not.toBeNull();
    // Fixed so they escape the bar's overflow-y:hidden clip.
    expect(up.style.position).toBe("fixed");
    expect(down.style.position).toBe("fixed");
    // Opaque at the tip edge, fading away from it. `to top` fades the up
    // stroke upward; the down stroke fades the default (to-bottom) direction
    // downward — jsdom serializes the default direction without the keyword.
    expect(up.style.backgroundImage).toBe(
      "linear-gradient(to top, rgb(74, 158, 255) 40%, transparent)",
    );
    expect(down.style.backgroundImage).toBe(
      "linear-gradient(rgb(74, 158, 255) 40%, transparent)",
    );
  });

  it("does not re-append the ticks/strokes when the indicator is reused across hovers", () => {
    const b = bar();
    const target = new TabBarDropTarget(b, "w1", 0);
    target.onHover(fakeTabSource(), 10, 15);
    expect(b.querySelectorAll(".tab-drop-indicator")).toHaveLength(1);

    target.onHover(fakeTabSource(), 20, 15);
    expect(b.querySelectorAll(".tab-drop-indicator")).toHaveLength(1);
    const ind = b.querySelector<HTMLElement>(".tab-drop-indicator")!;
    expect(crossCapTicks(ind)).toHaveLength(4);
    expect(ind.querySelectorAll(".drop-tip-vod-up, .drop-tip-vod-down")).toHaveLength(2);
  });

  it("hides the indicator for a same-cell drag at the tab's own position (no-op reorder)", () => {
    const b = bar();
    const t1 = document.createElement("div");
    t1.className = "tab-btn";
    t1.setAttribute("data-tab-id", "t1");
    const t2 = document.createElement("div");
    t2.className = "tab-btn";
    t2.setAttribute("data-tab-id", "t2");
    t1.getBoundingClientRect = () => rectFor(0);
    t2.getBoundingClientRect = () => rectFor(100);
    b.appendChild(t1);
    b.appendChild(t2);

    const target = new TabBarDropTarget(b, "w1", 0);
    const source = fakeTabSource("t1"); // dragged tab is at index 0

    // Over its own position (drop before itself) — no-op.
    target.onHover(source, 25, 15);
    const ind = b.querySelector<HTMLElement>(".tab-drop-indicator")!;
    expect(ind).not.toBeNull();
    expect(ind.style.display).toBe("none");
    // Over the boundary immediately after itself — no-op.
    target.onHover(source, 75, 15);
    expect(ind.style.display).toBe("none");
    // Beyond all tabs — a real move, indicator shows.
    target.onHover(source, 175, 15);
    expect(ind.style.display).toBe("block");
  });

  it("always shows the indicator for a cross-cell drag (source tab not in this bar)", () => {
    const b = bar();
    const t1 = document.createElement("div");
    t1.className = "tab-btn";
    t1.setAttribute("data-tab-id", "t1");
    t1.getBoundingClientRect = () => rectFor(0);
    b.appendChild(t1);

    const target = new TabBarDropTarget(b, "w1", 0);
    // Source tab (t9) is not in this bar — cross-cell move, always show.
    const source = fakeTabSource("t9");
    target.onHover(source, 25, 15);
    const ind = b.querySelector<HTMLElement>(".tab-drop-indicator")!;
    expect(ind.style.display).toBe("block");
  });
});
