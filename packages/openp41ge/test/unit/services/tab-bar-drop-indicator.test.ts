/**
 * Grid tab-bar drop indicator geometry.
 *
 * The TabBarDropTarget (openp41ge-tabs) draws the blue insertion line on a
 * cell's tab bar during a tab drag/reorder. These tests pin that the marker is
 * FULL tab-bar height (flush with the top and bottom edges, not inset), square,
 * 3px with a glow, and cross-capped with the overdraw-family blue ticks at its
 * top and bottom tips — matching the sidebar's indicator.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { TabBarDropTarget } from "openp41ge-tabs/targets/tab-bar-drop-target";
import type { IDragSource } from "openp41ge-tabs/interfaces";

function fakeTabSource(): IDragSource {
  return {
    type: "tab",
    createGhost: () => document.createElement("div"),
    getDragData: () => ({ type: "tab", tabId: "t1", winId: "w1", col: 0 }),
    onDragStart: () => {},
    onDragEnd: () => {},
  } as unknown as IDragSource;
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
    const ticks = Array.from(ind.querySelectorAll("div"));
    expect(ticks).toHaveLength(4);
    expect(ticks.map((t) => (t as HTMLElement).style.backgroundImage)).toEqual([
      "linear-gradient(to left, rgb(74, 158, 255) 40%, transparent)",
      "linear-gradient(to right, rgb(74, 158, 255) 40%, transparent)",
      "linear-gradient(to left, rgb(74, 158, 255) 40%, transparent)",
      "linear-gradient(to right, rgb(74, 158, 255) 40%, transparent)",
    ]);
    // Top pair sits at the line's top edge, bottom pair at its last pixel row.
    expect((ticks[0] as HTMLElement).style.top).toBe("0px");
    expect((ticks[2] as HTMLElement).style.top).toBe("calc(100% - 1px)");
    expect((ticks[0] as HTMLElement).style.right).toBe("100%");
    expect((ticks[1] as HTMLElement).style.left).toBe("100%");
  });

  it("does not re-append the ticks when the indicator is reused across hovers", () => {
    const b = bar();
    const target = new TabBarDropTarget(b, "w1", 0);
    target.onHover(fakeTabSource(), 10, 15);
    expect(b.querySelectorAll(".tab-drop-indicator")).toHaveLength(1);

    target.onHover(fakeTabSource(), 20, 15);
    expect(b.querySelectorAll(".tab-drop-indicator")).toHaveLength(1);
    expect(
      b.querySelector<HTMLElement>(".tab-drop-indicator")!.querySelectorAll("div"),
    ).toHaveLength(4);
  });
});
