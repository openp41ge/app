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
  SIDEBAR_FOOTER_OVERDRAW_LENGTH,
  SIDEBAR_OVERDRAW_LENGTH,
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

  it("removes the lines once the grid gets a tab", async () => {
    const { wv, win } = await mount();
    expect(lines().length).toBe(2);
    win.grid.placements = [{ position: { row: 0, col: 0 }, tabIds: ["t1"] }];
    wv.windowData = { ...win };
    await wv.updateComplete;
    expect(lines().length).toBe(0);
    expect(wv._sbDividerOverdraw.size).toBe(0);
  });

  it("reappears when the grid empties again", async () => {
    const { wv, win } = await mount();
    win.grid.placements = [{ position: { row: 0, col: 0 }, tabIds: ["t1"] }];
    wv.windowData = { ...win };
    await wv.updateComplete;
    expect(lines().length).toBe(0);

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

  it("removes the footer overdraws once the grid gets a tab", async () => {
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
    expect(document.body.querySelectorAll("overdraw-line").length).toBe(0);
    expect(wv._sbFooterOverdraw.size).toBe(0);
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
