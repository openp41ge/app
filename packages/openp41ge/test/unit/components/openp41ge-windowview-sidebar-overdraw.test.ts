/**
 * Tests for the empty-grid sidebar divider overdraws in <openp41ge-windowview>.
 *
 * When the grid has no tabs but open, populated sidebars, the windowview
 * continues each sidebar's grid-side 1px divider up past the title-bar seam
 * with a portalled <overdraw-line dir="up"> so the sidebar edge stays visible
 * against the empty grid. The lines must:
 *  - appear on initial mount (even though the child sidebar has not rendered
 *    its internal gutter yet — positions come from the sidebar HOST's box);
 *  - be removed once the grid gets a tab, a sidebar closes, or a sidebar has no
 *    system tabs;
 *  - reappear when the condition holds again;
 *  - be cleaned up when the windowview disconnects.
 */
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../../../src/renderer/components/openp41ge-windowview";

import {
  CELL_DIVIDER_OVERDRAW_LENGTH,
  SIDEBAR_FOOTER_OVERDRAW_LENGTH,
  SIDEBAR_OVERDRAW_LENGTH,
  SIDEBAR_SEP_OVERDRAW_LENGTH,
} from "../../../src/renderer/components/openp41ge-windowview";

// jsdom has no real animation frame loop; capture callbacks so the per-frame
// overdraw tracker never spins, and let tests step frames deterministically.
let rafCallbacks: FrameRequestCallback[] = [];
beforeEach(() => {
  rafCallbacks = [];
  (globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame =
    (cb: FrameRequestCallback): number => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };
  (globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = () => {};
});

afterEach(() => {
  document.body.innerHTML = "";
});

function makeWin() {
  return {
    id: "win-a",
    grid: { cols: 1, placements: [] as { position: { row: number; col: number }; tabIds: string[] }[] },
    sidebar: { activeLeftTab: null, activeRightTab: null },
  };
}

function makeWs(win: ReturnType<typeof makeWin>) {
  return {
    id: "ws-1",
    windows: [win],
    editorTabs: {},
    systemTabs: {
      "sys-explorer": { id: "sys-explorer", appType: "explorer", title: "Explorer", pinned: true },
      "sys-settings": { id: "sys-settings", appType: "settings", title: "Settings", pinned: true },
    },
    tabGroups: {},
    scopedFolders: [],
    sidebar: {
      leftSidebarTabs: ["sys-explorer", "sys-settings"],
      rightSidebarTabs: ["sys-explorer"],
      leftSidebarOpen: true,
      rightSidebarOpen: true,
    },
  };
}

async function mount() {
  const wv = document.createElement("openp41ge-windowview");
  const win = makeWin();
  const ws = makeWs(win);
  wv.windowData = win;
  wv.workspaceData = ws;
  document.body.appendChild(wv);
  await wv.updateComplete;
  return { wv, win, ws };
}

const lines = () => [...document.body.querySelectorAll('overdraw-line[dir="up"]')];

const sbRect = (left: number, right: number, top: number) => ({
  left, top, right, bottom: top + 400, width: right - left, height: 400, x: left, y: top, toJSON() {},
});

describe("openp41ge-windowview sidebar divider overdraws", () => {
  it("shows one overdraw line per open populated sidebar when the grid is empty", async () => {
    const { wv } = await mount();
    expect(lines().length).toBe(2);
    expect(wv._sbDividerOverdraw.size).toBe(2);
  });

  it("positions the line over each sidebar's grid-side divider, extending up by SIDEBAR_OVERDRAW_LENGTH", async () => {
    const { wv } = await mount();
    // Give each sidebar a real box (jsdom reports zero-size rects).
    const left = wv.querySelector('openp41ge-sidebar[side="left"]');
    const right = wv.querySelector('openp41ge-sidebar[side="right"]');
    const rect = (left: number, right: number, top: number) => ({
      left, top, right, bottom: top + 400, width: right - left, height: 400, x: left, y: top, toJSON() {},
    });
    Object.defineProperty(left, "getBoundingClientRect", { configurable: true, value: () => rect(0, 209, 36) });
    Object.defineProperty(right, "getBoundingClientRect", { configurable: true, value: () => rect(490, 656, 36) });

    wv._positionSbDividerOverdraws();

    const [l, r] = lines();
    // left divider on its right edge (209), right divider on its left edge (490)
    expect(parseFloat(l.style.left)).toBe(209 - 1);
    expect(parseFloat(l.style.top)).toBe(36 - SIDEBAR_OVERDRAW_LENGTH);
    expect(parseFloat(r.style.left)).toBe(490);
    expect(parseFloat(r.style.top)).toBe(36 - SIDEBAR_OVERDRAW_LENGTH);
  });

  it("keeps the divider lines visible once the grid gets a tab", async () => {
    const { wv, win } = await mount();
    expect(lines().length).toBe(2);
    win.grid.placements = [{ position: { row: 0, col: 0 }, tabIds: ["t1"] }];
    wv.windowData = { ...win };
    await wv.updateComplete;
    // Vertical divider overdraws are always shown while a sidebar is open,
    // even when the grid hosts tabs.
    expect(lines().length).toBe(2);
    expect(wv._sbDividerOverdraw.size).toBe(2);
  });

  it("keeps the lines across a grid tab round-trip (add then empty)", async () => {
    const { wv, win } = await mount();
    win.grid.placements = [{ position: { row: 0, col: 0 }, tabIds: ["t1"] }];
    wv.windowData = { ...win };
    await wv.updateComplete;
    expect(lines().length).toBe(2);

    win.grid.placements = [];
    wv.windowData = { ...win };
    await wv.updateComplete;
    expect(lines().length).toBe(2);
  });

  it("shows only the still-open, populated sidebar when one closes", async () => {
    const { wv, ws } = await mount();
    const ws2 = { ...ws, sidebar: { ...ws.sidebar, leftSidebarOpen: false } };
    wv.workspaceData = ws2;
    await wv.updateComplete;
    const remaining = lines();
    expect(remaining.length).toBe(1);
    // The left line is gone; only the right sidebar's line remains in the map.
    expect(wv._sbDividerOverdraw.get("left")).toBeUndefined();
    expect(wv._sbDividerOverdraw.get("right")).toBeTruthy();
  });

  it("does not draw a line for an open sidebar with no system tabs", async () => {
    const { wv, ws } = await mount();
    const ws2 = { ...ws, sidebar: { ...ws.sidebar, rightSidebarTabs: [] } };
    wv.workspaceData = ws2;
    await wv.updateComplete;
    expect(lines().length).toBe(1);
    expect(wv._sbDividerOverdraw.get("right")).toBeUndefined();
  });

  it("reuses a line element across re-places instead of recreating it", async () => {
    const { wv } = await mount();
    const before = lines()[0];
    wv._placeSidebarDividerOverdraws();
    expect(lines()[0]).toBe(before);
  });
});

describe("openp41ge-windowview sidebar footer overdraws", () => {
  const footRect = (side: string) => ({
    left: side === "left" ? 0 : 515,
    top: 826,
    right: side === "left" ? 209 : 656,
    bottom: 860,
    width: side === "left" ? 209 : 141,
    height: 34,
    x: side === "left" ? 0 : 515,
    y: 826,
    toJSON() {},
  });

  // Inject a bottom bar (a light-DOM div pinned to the active host's bottom with
  // a 1px top border) into a sidebar, stubbing its rects (jsdom reports zero).
  function addFooter(sb: HTMLElement, side: "left" | "right"): HTMLElement {
    const host = document.createElement("div");
    host.className = "sidebar-tab-host visible";
    const footer = document.createElement("div");
    footer.style.borderTop = "1px solid #333";
    host.appendChild(footer);
    sb.appendChild(host);
    Object.defineProperty(host, "getBoundingClientRect", {
      configurable: true,
      value: () => footRect(side),
    });
    Object.defineProperty(footer, "getBoundingClientRect", {
      configurable: true,
      value: () => footRect(side),
    });
    return footer;
  }

  it("draws one footer overdraw per open sidebar that has a bottom bar when the grid is empty", async () => {
    const { wv } = await mount();
    const left = wv.querySelector('openp41ge-sidebar[side="left"]');
    const right = wv.querySelector('openp41ge-sidebar[side="right"]');
    Object.defineProperty(left, "getBoundingClientRect", { configurable: true, value: () => sbRect(0, 209, 36) });
    Object.defineProperty(right, "getBoundingClientRect", { configurable: true, value: () => sbRect(490, 656, 36) });
    addFooter(left, "left");
    addFooter(right, "right");

    wv._placeSidebarFooterOverdraws();

    expect(wv._sbFooterOverdraw.has("left")).toBe(true);
    expect(wv._sbFooterOverdraw.has("right")).toBe(true);

    wv._positionSidebarFooterOverdraws();
    const l = wv._sbFooterOverdraw.get("left");
    const r = wv._sbFooterOverdraw.get("right");
    // Left: fades right from the sidebar's right edge; right: fades left from its left edge.
    expect(l.getAttribute("dir")).toBe("right");
    expect(parseFloat(l.style.left)).toBe(209);
    expect(parseFloat(l.style.top)).toBe(826);
    expect(r.getAttribute("dir")).toBe("left");
    expect(parseFloat(r.style.left)).toBe(490 - SIDEBAR_FOOTER_OVERDRAW_LENGTH);
    expect(parseFloat(r.style.top)).toBe(826);
  });

  it("does not draw a footer overdraw for a sidebar with no bottom bar", async () => {
    const { wv } = await mount();
    const left = wv.querySelector('openp41ge-sidebar[side="left"]');
    const right = wv.querySelector('openp41ge-sidebar[side="right"]');
    Object.defineProperty(left, "getBoundingClientRect", { configurable: true, value: () => sbRect(0, 209, 36) });
    Object.defineProperty(right, "getBoundingClientRect", { configurable: true, value: () => sbRect(490, 656, 36) });
    addFooter(left, "left");

    wv._placeSidebarFooterOverdraws();

    expect(wv._sbFooterOverdraw.has("left")).toBe(true);
    expect(wv._sbFooterOverdraw.has("right")).toBe(false);
  });

  it("removes the footer overdraws once the grid gets a tab (divider lines remain)", async () => {
    const { wv, win } = await mount();
    const left = wv.querySelector('openp41ge-sidebar[side="left"]');
    const right = wv.querySelector('openp41ge-sidebar[side="right"]');
    addFooter(left, "left");
    addFooter(right, "right");
    wv._placeSidebarFooterOverdraws();
    expect(wv._sbFooterOverdraw.size).toBe(2);

    win.grid.placements = [{ position: { row: 0, col: 0 }, tabIds: ["t1"] }];
    wv.windowData = { ...win };
    await wv.updateComplete;
    // Footer overdraws go away (a tab's own bottom bar now provides the line),
    // but the vertical divider overdraws stay.
    expect(wv._sbFooterOverdraw.size).toBe(0);
    expect(wv._sbDividerOverdraw.size).toBe(2);
    expect([...document.body.querySelectorAll("overdraw-line")].every((l) => l.getAttribute("dir") === "up")).toBe(true);
  });

  it("cleans up the footer overdraws when disconnected", async () => {
    const { wv } = await mount();
    const left = wv.querySelector('openp41ge-sidebar[side="left"]');
    addFooter(left, "left");
    wv._placeSidebarFooterOverdraws();
    wv._sbOverdrawRaf = 9;
    const cancel = vi.fn();
    (globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = cancel;
    wv.remove();
    await wv.updateComplete.catch(() => {});
    expect(wv._sbFooterOverdraw.size).toBe(0);
    expect(cancel).toHaveBeenCalledWith(9);
  });
});

describe("openp41ge-windowview grid cell-divider overdraws", () => {
  // Mount with a multi-column grid so the real <tab-grid> renders that many
  // .grid-cell elements (tab-grid is registered via openp41ge-uikit).
  async function mountGrid(cols: number) {
    const win = makeWin();
    win.grid.cols = cols;
    win.grid.placements = Array.from({ length: cols }, (_, c) => ({
      position: { row: 0, col: c },
      tabIds: [`g${c}`],
    }));
    const ws = makeWs(win);
    const wv = document.createElement("openp41ge-windowview");
    wv.windowData = win;
    wv.workspaceData = ws;
    document.body.appendChild(wv);
    await wv.updateComplete;
    return { wv, win };
  }
  const rect = (left: number, right: number, top: number) => ({
    left, top, right, bottom: top + 800, width: right - left, height: 800, x: left, y: top, toJSON() {},
  });
  function stubCell(wv: HTMLElement, col: number, left: number, right: number, top = 60) {
    const cell = wv.querySelector<HTMLElement>(`.openp41ge-grid-area tab-grid .grid-cell[data-cell-col="${col}"]`)!;
    Object.defineProperty(cell, "getBoundingClientRect", { configurable: true, value: () => rect(left, right, top) });
    return cell;
  }

  it("draws one overdraw per interior cell divider when the grid has 2+ columns", async () => {
    const { wv } = await mountGrid(2);
    stubCell(wv, 0, 225, 525);
    stubCell(wv, 1, 525, 900);

    wv._placeCellDividerOverdraws();
    expect(wv._cellOverdraw.size).toBe(1);
    expect(wv._cellOverdraw.has(0)).toBe(true);
    expect(wv._cellOverdraw.has(1)).toBe(false); // last column has no divider

    wv._positionCellDividerOverdraws();
    const line = wv._cellOverdraw.get(0)!;
    expect(line.getAttribute("dir")).toBe("up");
    expect(parseFloat(line.style.left)).toBe(525 - 1);
    expect(parseFloat(line.style.top)).toBe(60 - CELL_DIVIDER_OVERDRAW_LENGTH);
  });

  it("draws two overdraws for a 3-column grid and removes them when the grid drops to 1 column", async () => {
    const { wv, win } = await mountGrid(3);
    stubCell(wv, 0, 100, 400);
    stubCell(wv, 1, 400, 700);
    stubCell(wv, 2, 700, 1000);
    wv._placeCellDividerOverdraws();
    expect(wv._cellOverdraw.size).toBe(2);
    expect(wv._cellOverdraw.has(0)).toBe(true);
    expect(wv._cellOverdraw.has(1)).toBe(true);

    // Grid drops to a single column: the extra cells disappear on re-render,
    // so the cell overdraws are removed (sidebar divider overdraws remain).
    win.grid.cols = 1;
    win.grid.placements = [{ position: { row: 0, col: 0 }, tabIds: ["g0"] }];
    wv.windowData = { ...win };
    await wv.updateComplete;
    wv._placeCellDividerOverdraws();
    expect(wv._cellOverdraw.size).toBe(0);
    expect(wv._cellOverdraw.has(0)).toBe(false);
    expect(wv._cellOverdraw.has(1)).toBe(false);
  });

  it("cleans up the cell overdraws when disconnected", async () => {
    const { wv } = await mountGrid(2);
    stubCell(wv, 0, 225, 525);
    stubCell(wv, 1, 525, 900);
    wv._placeCellDividerOverdraws();
    expect(wv._cellOverdraw.size).toBe(1);
    wv.remove();
    await wv.updateComplete.catch(() => {});
    expect(wv._cellOverdraw.size).toBe(0);
    expect(document.body.querySelectorAll("overdraw-line").length).toBe(0);
  });
});

describe("openp41ge-windowview sidebar chat-list separator overdraws", () => {
  const sepRect = (left: number, right: number, top: number, h = 30) => ({
    left, top, right, bottom: top + h, width: right - left, height: h, x: left, y: top, toJSON() {},
  });

  // Build a visible host holding marked separator rows ([data-sb-sep]) like the
  // agents tab emits — rows carry a 1px top and/or bottom separator border.
  // `y` is the row's top coordinate; `top`/`bottom` declare which borders are
  // separators (they must not collide with the position key).
  function addSepHost(
    sb: HTMLElement,
    rows: Array<{ top?: boolean; bottom?: boolean; left: number; right: number; y: number; h?: number; noBottom?: boolean }>,
  ): HTMLElement {
    const host = document.createElement("div");
    host.className = "sidebar-tab-host visible";
    for (const cfg of rows) {
      const row = document.createElement("div");
      const marks: string[] = [];
      if (cfg.top) {
        row.style.borderTop = "1px solid #333";
        marks.push("top");
      }
      if (cfg.bottom) {
        // A suppressed separator is still marked (the agents tab always sets
        // data-sb-sep="bottom" on the last row) but carries no border — the
        // windowview reads the live computed border width, so it must skip it.
        if (!cfg.noBottom) row.style.borderBottom = "1px solid #333";
        marks.push("bottom");
      }
      if (marks.length) row.dataset.sbSep = marks.join(" ");
      Object.defineProperty(row, "getBoundingClientRect", {
        configurable: true,
        value: () => sepRect(cfg.left, cfg.right, cfg.y, cfg.h),
      });
      host.appendChild(row);
    }
    sb.appendChild(host);
    return host;
  }

  function stubSidebars(wv: HTMLElement): [HTMLElement, HTMLElement] {
    const left = wv.querySelector('openp41ge-sidebar[side="left"]')!;
    const right = wv.querySelector('openp41ge-sidebar[side="right"]')!;
    Object.defineProperty(left, "getBoundingClientRect", { configurable: true, value: () => sbRect(0, 209, 36) });
    Object.defineProperty(right, "getBoundingClientRect", { configurable: true, value: () => sbRect(490, 656, 36) });
    return [left, right];
  }

  const rightLines = () => [...document.body.querySelectorAll('overdraw-line[dir="right"]')];
  const leftLines = () => [...document.body.querySelectorAll('overdraw-line[dir="left"]')];

  it("draws one horizontal overdraw per marked separator border", async () => {
    const { wv } = await mount();
    const [left, right] = stubSidebars(wv);
    // Left sidebar: new-chat bottom separator + a mid row with top+bottom.
    addSepHost(left, [
      { bottom: true, left: 0, right: 209, y: 60 },
      { top: true, bottom: true, left: 0, right: 209, y: 90 },
    ]);
    // Right sidebar: only the last-row bottom separator.
    addSepHost(right, [{ bottom: true, left: 490, right: 656, y: 60 }]);

    wv._syncSidebarSepOverdraws();

    expect(wv._sbSepOverdraw.size).toBe(3);
    expect(rightLines().length).toBe(3); // left sidebar's 3 separators
    expect(leftLines().length).toBe(1); // right sidebar's 1 separator

    const [nl, rowTop, rowBottom] = rightLines();
    // Left sidebar separators fade right from the sidebar's right edge.
    expect(nl.getAttribute("dir")).toBe("right");
    expect(parseFloat(nl.style.left)).toBe(209);
    expect(parseFloat(nl.style.top)).toBe(60 + 30 - 1); // bottom of the new-chat row
    expect(parseFloat(rowTop.style.top)).toBe(90); // mid row's top border
    expect(parseFloat(rowBottom.style.top)).toBe(90 + 30 - 1);

    // Right sidebar separator fades left from its left edge.
    const r = leftLines()[0];
    expect(parseFloat(r.style.left)).toBe(490 - SIDEBAR_SEP_OVERDRAW_LENGTH);
    expect(parseFloat(r.style.top)).toBe(60 + 30 - 1);
  });

  it("does not draw a bottom accent when the row's bottom border is suppressed", async () => {
    const { wv } = await mount();
    const [left] = stubSidebars(wv);
    // Last row is marked "bottom" but carries no bottom border (the
    // overflow-suppressed case) — no accent may be created for it.
    addSepHost(left, [{ bottom: true, left: 0, right: 209, y: 60, noBottom: true }]);

    wv._syncSidebarSepOverdraws();

    expect(wv._sbSepOverdraw.size).toBe(1);
    expect(rightLines().length).toBe(0);
    expect([...document.body.querySelectorAll("overdraw-line")].every((l) => l.getAttribute("dir") === "up")).toBe(true);
  });

  it("drops accents when the separator rows leave the DOM", async () => {
    const { wv } = await mount();
    const [left] = stubSidebars(wv);
    const host = addSepHost(left, [{ bottom: true, left: 0, right: 209, y: 60 }]);
    wv._syncSidebarSepOverdraws();
    expect(rightLines().length).toBe(1);

    host.remove(); // refresh rebuilt the list
    wv._syncSidebarSepOverdraws();
    expect(wv._sbSepOverdraw.size).toBe(0);
    expect(rightLines().length).toBe(0);
  });

  it("cleans up the separator overdraws when disconnected", async () => {
    const { wv } = await mount();
    const [left] = stubSidebars(wv);
    addSepHost(left, [{ bottom: true, left: 0, right: 209, y: 60 }]);
    wv._syncSidebarSepOverdraws();
    expect(wv._sbSepOverdraw.size).toBe(1);

    wv.remove();
    await wv.updateComplete.catch(() => {});
    expect(wv._sbSepOverdraw.size).toBe(0);
    expect(rightLines().length).toBe(0);
  });
});
