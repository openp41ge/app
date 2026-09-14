import { describe, it, expect, afterEach } from "vitest";
import "../../src/components/tabs/tab-grid";
import "../../src/components/tabs/tab-bar";
import "../../src/components/tabs/tab-content";

class FakeFeStatusBar extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div style="position:relative;display:flex;flex-direction:column;flex-shrink:0;">
        <div class="sbb-row" style="position:relative;display:flex;flex-shrink:0;align-items:center;height:48px;background:#1e1e1e;border-top:1px solid #2a2a2a;padding:0 0 0 8px;gap:8px;font-size:11px;color:#888;">
          <span style="color:#777;">Foo.ts</span>
          <div class="p41ge-icon-btn" style="height:100%;"><svg></svg></div>
        </div>
      </div>`;
  }
}
if (!customElements.get("fe-status-bar")) customElements.define("fe-status-bar", FakeFeStatusBar);

const cleanup: HTMLElement[] = [];
afterEach(() => { for (const c of cleanup) c.remove(); cleanup.length = 0; });

function makeGrid(): HTMLElement {
  const grid = document.createElement("tab-grid") as HTMLElement & any;
  grid.setAttribute("winId", "w1");
  grid.cols = 4;
  grid.placements = [
    { position: { row: 0, col: 0 }, tabIds: ["a0"] },
    { position: { row: 0, col: 1 }, tabIds: ["a1"] },
    { position: { row: 0, col: 2 }, tabIds: ["a2"] },
    { position: { row: 0, col: 3 }, tabIds: ["a3"] },
  ];
  grid.tabData = { a0:{title:"a0",content:""},a1:{title:"a1",content:""},a2:{title:"a2",content:""},a3:{title:"a3",content:""} };
  grid.activeTabIds = { 0:"a0",1:"a1",2:"a2",3:"a3" };
  document.body.appendChild(grid);
  cleanup.push(grid);
  return grid;
}

describe("grid hover-reserve", () => {
  it("applies the class and nudges .sbb-row content when overflowing and hovered", async () => {
    const grid = makeGrid();
    await grid.updateComplete;

    // Mount a fake status bar into each cell's controller container.
    const controllers = grid.querySelectorAll(".tab-content-controller");
    for (const c of controllers) {
      const fe = document.createElement("fe-status-bar");
      (c as HTMLElement).style.display = "flex";
      c.appendChild(fe);
    }

    const gc = grid.querySelector(".grid-container") as HTMLElement;
    // Simulate horizontal overflow; jsdom can't lay out, so override the props.
    Object.defineProperty(gc, "scrollWidth", { configurable: true, get: () => 900 });
    Object.defineProperty(gc, "clientWidth", { configurable: true, get: () => 400 });
    (grid as any)._updateGridHScrollState();

    // Simulate pointer entering the grid.
    grid.dispatchEvent(new Event("pointerenter"));

    expect(gc.classList.contains("grid-hover-reserve")).toBe(true);

    const row = grid.querySelector(".sbb-row") as HTMLElement;
    const cs = getComputedStyle(row);
    expect(cs.paddingBottom).toBe("10px");
    expect(cs.boxSizing).toBe("border-box");
    expect(cs.height).toBe("48px");
  });

  it("recomputes overflow fresh on hover (stale flag is corrected)", async () => {
    const grid = makeGrid();
    await grid.updateComplete;
    // Mount a real .sbb-row so the selector has a target.
    const controllers = grid.querySelectorAll(".tab-content-controller");
    for (const c of controllers) {
      const fe = document.createElement("fe-status-bar");
      (c as HTMLElement).style.display = "flex";
      c.appendChild(fe);
    }
    const gc = grid.querySelector(".grid-container") as HTMLElement;
    // Overflow only becomes present NOW (e.g. after content mount) and has NOT
    // been detected yet, so `_gridHasHScroll` is stale false. Entering the grid
    // must recompute it and apply the reserve class.
    Object.defineProperty(gc, "scrollWidth", { configurable: true, get: () => 900 });
    Object.defineProperty(gc, "clientWidth", { configurable: true, get: () => 400 });
    expect((grid as any)._gridHasHScroll).toBe(false);
    grid.dispatchEvent(new Event("pointerenter"));
    expect((grid as any)._gridHasHScroll).toBe(true);
    expect(gc.classList.contains("grid-hover-reserve")).toBe(true);
  });

  it("keeps bottom-bar action buttons FULL height while the bar reserves space", async () => {
    const grid = makeGrid();
    await grid.updateComplete;
    const controllers = grid.querySelectorAll(".tab-content-controller");
    for (const c of controllers) {
      const fe = document.createElement("fe-status-bar");
      (c as HTMLElement).style.display = "flex";
      c.appendChild(fe);
    }
    const gc = grid.querySelector(".grid-container") as HTMLElement;
    Object.defineProperty(gc, "scrollWidth", { configurable: true, get: () => 900 });
    Object.defineProperty(gc, "clientWidth", { configurable: true, get: () => 400 });

    const btn = grid.querySelector(".sbb-row .p41ge-icon-btn") as HTMLElement;
    // Without overflow the reserve class is absent, so the button keeps its
    // natural height (no artificial min-height / bottom padding).
    expect(btn).toBeTruthy();
    expect(grid.querySelector(".grid-container")!.classList.contains("grid-hover-reserve")).toBe(false);
    let cs = getComputedStyle(btn);
    expect(cs.minHeight).toBe("auto");
    expect(cs.paddingBottom).toBe("0");

    // With overflow the reserve applies: the button is pinned full height and
    // only its icon/text is nudged up (bottom padding), never shrunk.
    (grid as any)._updateGridHScrollState();
    grid.dispatchEvent(new Event("pointerenter"));
    expect(gc.classList.contains("grid-hover-reserve")).toBe(true);
    cs = getComputedStyle(btn);
    expect(cs.minHeight).toBe("34px");
    expect(cs.paddingBottom).toBe("10px");
  });

  it("does not apply the class when not overflowing", async () => {
    const grid = makeGrid();
    await grid.updateComplete;
    const gc = grid.querySelector(".grid-container") as HTMLElement;
    Object.defineProperty(gc, "scrollWidth", { configurable: true, get: () => 400 });
    Object.defineProperty(gc, "clientWidth", { configurable: true, get: () => 400 });
    (grid as any)._updateGridHScrollState();
    grid.dispatchEvent(new Event("pointerenter"));
    expect(gc.classList.contains("grid-hover-reserve")).toBe(false);
  });
});
