import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Gutter, lineNumberColumn, foldColumn } from "../src/index";
import type { GutterColumn, GutterRow } from "../src/index";

/** Uniform rows: key = 0-based line index, top = idx*20, height = 20. */
function rows(count: number, keys?: number[]): GutterRow[] {
  return Array.from({ length: count }, (_, i) => ({
    key: keys ? keys[i] : i,
    top: i * 20,
    height: 20,
  }));
}

describe("Gutter", () => {
  let gutter: Gutter;
  let columns: GutterColumn[];

  afterEach(() => {
    gutter.dispose();
    document.body.textContent = "";
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    gutter = new Gutter({});
    document.body.appendChild(gutter.root);
    columns = [
      lineNumberColumn({ width: 30 }),
      foldColumn({ width: 19, onToggle: vi.fn() }),
    ];
    gutter.setColumns(columns);
  });

  it("renders a cell per row with the 1-based number", () => {
    gutter.setRows(rows(4));
    const cells = gutter.root.querySelectorAll(".eg-col--line-numbers .eg-cell");
    expect(cells.length).toBe(4);
    expect(cells[0].textContent).toBe("1");
    expect(cells[3].textContent).toBe("4");
  });

  it("toggles the error class from row data", () => {
    gutter.setRows(rows(3), (key) => ({ error: key === 1 }));
    const cells = gutter.root.querySelectorAll(".eg-col--line-numbers .eg-cell");
    expect(cells[1].classList.contains("eg-cell--err")).toBe(true);
    expect(cells[0].classList.contains("eg-cell--err")).toBe(false);
  });

  it("renders chevrons only on fold-header rows and empties elsewhere", () => {
    gutter.setRows(rows(3), (key) => ({ hasChevron: key === 0, folded: false }));
    const foldCells = gutter.root.querySelectorAll(".eg-col--fold .eg-cell");
    expect(foldCells[0].querySelector("button.eg-fold-chevron")).toBeTruthy();
    expect(foldCells[1].querySelector("button.eg-fold-chevron")).toBeNull();
  });

  it("shows the right-pointing chevron when folded", () => {
    gutter.setRows(rows(2), (key) => ({ hasChevron: key === 0, folded: key === 0 }));
    const svg = gutter.root.querySelector(".eg-col--fold button.eg-fold-chevron polyline")!;
    expect(svg.getAttribute("points")).toBe("6,4 10,8 6,12");
  });

  it("clicking the chevron invokes onToggle with the row key", () => {
    const toggle = vi.fn();
    gutter.setColumns([
      lineNumberColumn({ width: 10 }),
      foldColumn({ width: 10, onToggle: toggle }),
    ]);
    gutter.setRows(rows(1), (key) => ({ hasChevron: key === 0 }));
    const btn = gutter.root.querySelector(".eg-col--fold button.eg-fold-chevron")!;
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(toggle).toHaveBeenCalledWith(0);
  });

  describe("unified hover box", () => {
    it("spans both columns on a non-foldable row", () => {
      gutter.setRows(rows(3), () => ({}));
      gutter.setHoverRow(1);
      const box = gutter.root.querySelector<HTMLElement>(".eg-hoverbox")!;
      expect(box.style.display).not.toBe("none");
      expect(box.style.width).toBe("49px"); // 30 + 19
      expect(box.style.top).toBe("20px");
    });

    it("stays on the line-number column only when the row has a chevron", () => {
      gutter.setRows(rows(3), (key) => ({ hasChevron: key === 1 }));
      gutter.setHoverRow(1);
      const box = gutter.root.querySelector<HTMLElement>(".eg-hoverbox")!;
      expect(box.style.width).toBe("30px");
    });

    it("clears the box when hover clears", () => {
      gutter.setRows(rows(2), () => ({}));
      gutter.setHoverRow(0);
      gutter.setHoverRow(null);
      const box = gutter.root.querySelector<HTMLElement>(".eg-hoverbox")!;
      expect(box.style.display).toBe("none");
    });

    it("hovering a chevron does not light the adjacent line-number cell", () => {
      gutter.setRows(rows(2), (key) => ({ hasChevron: key === 0 }));
      // Light the row via its line-number cell.
      const numCell = gutter.root.querySelector(".eg-col--line-numbers .eg-cell")!;
      numCell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      expect(numCell.classList.contains("eg-cell--hover")).toBe(true);
      // Moving the pointer onto the chevron clears it (chevron owns its hover).
      const chev = gutter.root.querySelector(".eg-col--fold button.eg-fold-chevron")!;
      chev.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      expect(numCell.classList.contains("eg-cell--hover")).toBe(false);
      const box = gutter.root.querySelector<HTMLElement>(".eg-hoverbox")!;
      expect(box.style.display).toBe("none");
    });

    it("portals corner overdraw accents around the hover box and removes them on dispose", () => {
      const realRaf = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
      const rafCbs: FrameRequestCallback[] = [];
      (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: FrameRequestCallback) => {
        rafCbs.push(cb);
        return rafCbs.length;
      };
      try {
        gutter.setRows(rows(1), () => ({}));
        gutter.setHoverRow(0);

        const layer = document.body.querySelector<HTMLElement>("div[style*='position: fixed']");
        expect(layer).toBeTruthy();
        const strokes = Array.from(layer!.querySelectorAll("overdraw-line"));
        // 4 edges x 2 corners.
        expect(strokes).toHaveLength(8);
        expect(strokes.every((s) => s.style.getPropertyValue("--overdraw-color") === "var(--eg-hover-ring, rgba(255,255,255,0.16))")).toBe(true);
        expect(new Set(strokes.map((s) => s.getAttribute("corner"))).size).toBe(8);

        // Step one frame with a stubbed box rect to place the strokes.
        const box = gutter.root.querySelector<HTMLElement>(".eg-hoverbox")!;
        box.getBoundingClientRect = () =>
          ({ left: 100, top: 40, right: 200, bottom: 74, width: 100, height: 34, x: 100, y: 40, toJSON() {} }) as DOMRect;
        // Run the pending frame; place() schedules the next, so only splice once.
        for (const cb of rafCbs.splice(0)) cb(0);
        const brRight = strokes.find((s) => s.getAttribute("corner") === "br-right")!;
        const brBottom = strokes.find((s) => s.getAttribute("corner") === "br-bottom")!;
        expect(parseFloat(brRight.style.top)).toBe(74);
        expect(parseFloat(brRight.style.left)).toBe(199);
        expect(parseFloat(brBottom.style.top)).toBe(73);
        expect(parseFloat(brBottom.style.left)).toBe(200);

        gutter.dispose();
        expect(document.body.querySelector("div[style*='position: fixed']")).toBeNull();
        // afterEach disposes again — dispose() is idempotent.
      } finally {
        (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = realRaf;
      }
    });
  });

  describe("click / drag line selection", () => {
    it("fires onRowClick on mousedown of a highlightable cell", () => {
      const onClick = vi.fn();
      const g = new Gutter({ events: { onRowClick: onClick } });
      document.body.appendChild(g.root);
      g.setColumns([
        lineNumberColumn({ width: 10 }),
        foldColumn({ width: 10 }),
      ]);
      g.setRows(rows(2), () => ({}));
      const numCell = g.root.querySelector(".eg-col--line-numbers .eg-cell")!;
      numCell.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
      expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ key: 0 }));
      g.dispose();
    });

    it("does not start selection on a chevron cell", () => {
      const onClick = vi.fn();
      const g = new Gutter({ events: { onRowClick: onClick } });
      document.body.appendChild(g.root);
      g.setColumns([
        lineNumberColumn({ width: 10 }),
        foldColumn({ width: 10 }),
      ]);
      g.setRows(rows(1), (key) => ({ hasChevron: key === 0 }));
      const chevCell = g.root.querySelector(".eg-col--fold .eg-cell")!;
      chevCell.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
      expect(onClick).not.toHaveBeenCalled();
      g.dispose();
    });

    it("extends the selection range while dragging over the numbers", () => {
      const onRange = vi.fn();
      const g = new Gutter({
        events: { onRowSelectRange: onRange },
      });
      document.body.appendChild(g.root);
      g.setColumns([
        lineNumberColumn({ width: 10 }),
        foldColumn({ width: 10 }),
      ]);
      g.setRows(rows(4));
      const numCell = g.root.querySelector(".eg-col--line-numbers .eg-cell")!;
      numCell.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0, clientY: 2 }),
      );
      // Move the pointer (with the button held) to a lower row.
      document.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientY: 42 }),
      );
      expect(onRange).toHaveBeenCalledWith(
        expect.objectContaining({ key: 0 }),
        expect.objectContaining({ key: 2 }),
      );
      g.dispose();
    });
  });
});
