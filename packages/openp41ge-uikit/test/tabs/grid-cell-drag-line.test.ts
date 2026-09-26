/**
 * The grid-cell resize dividers carry the shared <drag-line> + its
 * <drag-line-overdraw> companion, so a cell divider's blue line can overdraw
 * up into the top bar exactly like the sidebar resize notches. These tests pin
 * that each divider renders the pair and that the line's visibility follows
 * hover / drag state.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import "../../src/components/tabs/tab-grid";
import "../../src/components/tabs/tab-bar";
import "../../src/components/tabs/tab-content";

const cleanup: HTMLElement[] = [];
afterEach(() => {
  for (const c of cleanup) c.remove();
  cleanup.length = 0;
});

function makeGrid(cols = 2): HTMLElement & {
  _resizeCol: number;
  _hoverResizeCol: number;
} {
  const grid = document.createElement("tab-grid") as HTMLElement & {
    _resizeCol: number;
    _hoverResizeCol: number;
  };
  grid.setAttribute("winId", "w1");
  (grid as unknown as { cols: number }).cols = cols;
  (grid as unknown as { placements: unknown[] }).placements = Array.from(
    { length: cols },
    (_, i) => ({ position: { row: 0, col: i }, tabIds: [`a${i}`] }),
  );
  (grid as unknown as { tabData: Record<string, unknown> }).tabData = Object.fromEntries(
    Array.from({ length: cols }, (_, i) => [`a${i}`, { title: `a${i}`, content: "" }]),
  );
  (grid as unknown as { activeTabIds: Record<string, string> }).activeTabIds = Object.fromEntries(
    Array.from({ length: cols }, (_, i) => [`${i}`, `a${i}`]),
  );
  document.body.appendChild(grid);
  cleanup.push(grid);
  return grid;
}

describe("tab-grid cell divider drag line", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a drag-line and overdraw in each cell divider", async () => {
    const grid = makeGrid(3);
    await grid.updateComplete;
    const handles = grid.querySelectorAll(".grid-resize-handle");
    expect(handles.length).toBe(2);
    for (const h of handles) {
      expect(h.querySelector("drag-line")).toBeTruthy();
      expect(h.querySelector("drag-line-overdraw")).toBeTruthy();
    }
  });

  it("is hidden by default, shown while the divider is hovered, hidden on leave", async () => {
    const grid = makeGrid(2);
    await grid.updateComplete;
    const handle = grid.querySelector(".grid-resize-handle") as HTMLElement;
    const line = handle.querySelector("drag-line") as HTMLElement;
    expect(line.hasAttribute("show")).toBe(false);

    handle.dispatchEvent(new Event("pointerenter"));
    await grid.updateComplete;
    expect(line.hasAttribute("show")).toBe(true);

    handle.dispatchEvent(new Event("pointerleave"));
    await grid.updateComplete;
    expect(line.hasAttribute("show")).toBe(false);
  });

  it("keeps the line shown for the whole resize drag", async () => {
    const grid = makeGrid(2);
    await grid.updateComplete;
    const handle = grid.querySelector(".grid-resize-handle") as HTMLElement;
    const line = handle.querySelector("drag-line") as HTMLElement;

    // Start a resize drag.
    const pointerType = typeof PointerEvent !== "undefined" ? PointerEvent : Event;
    handle.dispatchEvent(new pointerType("pointerdown", { bubbles: true, clientX: 100 }) as Event);
    await grid.updateComplete;
    expect(grid._resizeCol).toBe(0);
    expect(line.hasAttribute("show")).toBe(true);

    window.dispatchEvent(new Event("pointerup"));
    await grid.updateComplete;
    expect(grid._resizeCol).toBe(-1);
    // Not hovered anymore → line hides once the drag ends.
    expect(line.hasAttribute("show")).toBe(false);
  });
});
