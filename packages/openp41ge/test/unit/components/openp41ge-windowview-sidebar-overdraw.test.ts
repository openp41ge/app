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

import { SIDEBAR_OVERDRAW_LENGTH } from "../../../src/renderer/components/openp41ge-windowview";

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

  it("removes the lines and cancels the tracker when disconnected", async () => {
    const { wv } = await mount();
    expect(lines().length).toBe(2);
    wv._sbOverdrawRaf = 7; // pretend a frame is pending
    const cancel = vi.fn();
    (globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = cancel;
    wv.remove();
    await wv.updateComplete.catch(() => {});
    expect(lines().length).toBe(0);
    expect(wv._sbDividerOverdraw.size).toBe(0);
    expect(cancel).toHaveBeenCalledWith(7);
  });
});
