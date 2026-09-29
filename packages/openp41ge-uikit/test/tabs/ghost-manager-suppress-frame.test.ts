/**
 * GhostManager suppressFrame (wash-only drop box).
 *
 * The landing-cell drop box carries an inset border ring + glow and a
 * <drop-box-overdraw> corner-bleed companion. While the cursor hovers a tab
 * bar, the host re-supplies the grid ghost with `suppressFrame: true` so the
 * box keeps only its wash (its `frame` is removed and the overdraw is hidden),
 * letting the tab bar's insert line read clearly. These tests pin that the box
 * is re-framed when `suppressFrame` toggles — without recreating the overlay.
 */
import { describe, it, expect, afterEach } from "vitest";
import { GhostManager } from "openp41ge-tabs/ghost-manager";
// Register <drop-box> / <drop-box-overdraw> (self-registering modules).
import "../../src/components/drop-indicator/drop-box";
import "../../src/components/drop-indicator/drop-box-overdraw";

afterEach(() => {
  document.body.innerHTML = "";
});

function makeGrid(): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "tab-grid";
  document.body.appendChild(grid);
  return grid;
}

function landingBox(grid: HTMLElement): HTMLElement | null {
  // The overlay's column divs are direct children; the active column holds the
  // drop-box. With a 2-col cell-center drop on col 1, the LAST column div is
  // the active one.
  const overlay = grid.querySelector<HTMLElement>(".openp41ge-ghost-overlay");
  if (!overlay) return null;
  const colDivs = Array.from(overlay.children) as HTMLElement[];
  return colDivs.find((c) => c.querySelector(":scope > drop-box")) ?? null;
}

describe("GhostManager suppressFrame", () => {
  it("shows a bordered box + overdraw by default", () => {
    const grid = makeGrid();
    const manager = new GhostManager();
    manager.showGhost(grid, { cols: 2, activeCol: 1 });

    const col = landingBox(grid);
    expect(col).not.toBeNull();
    const box = col!.querySelector<HTMLElement>(":scope > drop-box")!;
    const over = col!.querySelector<HTMLElement>(":scope > drop-box-overdraw")!;
    expect((box as unknown as { frame: boolean }).frame).toBe(true);
    expect(box.hasAttribute("fade")).toBe(false); // solid landing target
    expect(over.style.display).not.toBe("none");
    manager.dispose();
  });

  it("suppresses frame + overdraw when suppressFrame is true, keeping the wash box", () => {
    const grid = makeGrid();
    const manager = new GhostManager();
    manager.showGhost(grid, { cols: 2, activeCol: 1, suppressFrame: true });

    const col = landingBox(grid);
    expect(col).not.toBeNull();
    const box = col!.querySelector<HTMLElement>(":scope > drop-box")!;
    const over = col!.querySelector<HTMLElement>(":scope > drop-box-overdraw")!;
    // Wash-only: the box stays (marks the landing cell) but loses its border
    // ring (no `frame`) and its overdraw corner accents are hidden.
    expect((box as unknown as { frame: boolean }).frame).toBe(false);
    expect(over.style.display).toBe("none");
    manager.dispose();
  });

  it("re-frames the SAME box + overdraw when suppressFrame toggles (no rebuild)", () => {
    const grid = makeGrid();
    const manager = new GhostManager();

    manager.showGhost(grid, { cols: 2, activeCol: 1 });
    const box1 = grid.querySelector<HTMLElement>(":scope .openp41ge-ghost-overlay drop-box");
    expect((box1 as unknown as { frame: boolean }).frame).toBe(true);

    // Toggle to wash-only (cursor moves onto the tab bar).
    manager.showGhost(grid, { cols: 2, activeCol: 1, suppressFrame: true });
    const box2 = grid.querySelector<HTMLElement>(":scope .openp41ge-ghost-overlay drop-box");
    expect(box2).toBe(box1); // same element — overlay/box reused, no flicker
    expect((box2 as unknown as { frame: boolean }).frame).toBe(false);
    const over = grid.querySelector<HTMLElement>(
      ":scope .openp41ge-ghost-overlay drop-box-overdraw",
    );
    expect(over!.style.display).toBe("none");

    // Toggle back to the bordered box (cursor over the cell).
    manager.showGhost(grid, { cols: 2, activeCol: 1 });
    expect((box2 as unknown as { frame: boolean }).frame).toBe(true);
    expect(over!.style.display).not.toBe("none");
    manager.dispose();
  });
});
