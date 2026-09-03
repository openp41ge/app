/**
 * Unit tests for sidebar (system) tab activation behavior — specifically that
 * when the ACTIVE tab is moved to the other sidebar, the source sidebar
 * activates the most recently accessed remaining tab instead of going blank,
 * and that last-access is tracked on activation.
 */

import { describe, it, expect } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";

type Ws = types.Workspace;

function makeRightSidebarWs(tabCount: number): { ws: Ws; winId: string } {
  let ws = types.createWorkspace("ws1");
  const winId = ws.windows[0].id;
  ws = ops.openSystemTab(ws, winId, "right", "explorer", "Explorer", true);
  if (tabCount > 1) ws = ops.openSystemTab(ws, winId, "right", "git", "History", true);
  if (tabCount > 2) ws = ops.openSystemTab(ws, winId, "right", "search", "Search", true);
  return { ws, winId };
}

function stamp(ws: Ws, tabId: string, iso: string | null): Ws {
  const sid = tabId as types.SystemTabId;
  return {
    ...ws,
    systemTabs: { ...ws.systemTabs, [sid]: { ...ws.systemTabs[sid], lastAccessedAt: iso } },
  };
}

function rightTabs(ws: Ws): string[] {
  return (ws.sidebar.rightSidebarTabs ?? []) as unknown as string[];
}

function activeRight(ws: Ws): string | null {
  return (ws.windows[0].sidebar?.activeRightTab ?? null) as string | null;
}

function activeLeft(ws: Ws): string | null {
  return (ws.windows[0].sidebar?.activeLeftTab ?? null) as string | null;
}

describe("sidebar tab last-access tracking", () => {
  it("activateSystemTab stamps lastAccessedAt on the activated tab", () => {
    let { ws, winId } = makeRightSidebarWs(2);
    const target = rightTabs(ws)[0];
    const t0 = Date.now();
    const ws2 = ops.activateSystemTab(ws, winId, "right", target);
    const stamped = (
      ws2.systemTabs[target as types.SystemTabId] as { lastAccessedAt: string | null }
    ).lastAccessedAt;
    expect(typeof stamped).toBe("string");
    expect(Date.parse(stamped as string)).toBeGreaterThanOrEqual(t0 - 5);
  });
});

describe("moved active tab → activate most recently accessed remaining tab", () => {
  it("selects the most recently accessed remaining tab on the source sidebar", () => {
    let { ws, winId } = makeRightSidebarWs(3);
    const [a, b, c] = rightTabs(ws);
    const base = Date.now();
    // b most recent, then a, then c
    ws = stamp(ws, a, new Date(base - 10_000).toISOString());
    ws = stamp(ws, b, new Date(base + 10_000).toISOString());
    ws = stamp(ws, c, new Date(base - 20_000).toISOString());
    ws = ops.activateSystemTab(ws, winId, "right", a as string);
    expect(activeRight(ws)).toBe(a);

    const ws2 = ops.moveSystemTabToSidebar(ws, winId, a as string, "left", 0);

    // a moved out of right & active on left
    expect(rightTabs(ws2)).not.toContain(a);
    expect(activeLeft(ws2)).toBe(a);
    // right activates the most recently accessed remaining tab (b)
    expect(activeRight(ws2)).toBe(b);
    expect(rightTabs(ws2)).toEqual([b, c]);
  });

  it("falls back to the first tab in the list when no remaining tab has a timestamp", () => {
    let { ws, winId } = makeRightSidebarWs(3);
    const [a, b, c] = rightTabs(ws);
    // legacy data: no timestamps anywhere
    ws = stamp(ws, a, null);
    ws = stamp(ws, b, null);
    ws = stamp(ws, c, null);
    ws = ops.activateSystemTab(ws, winId, "right", a as string);
    expect(activeRight(ws)).toBe(a);

    const ws2 = ops.moveSystemTabToSidebar(ws, winId, a as string, "left", 0);
    expect(activeRight(ws2)).toBe(b); // first remaining in list order
    expect(rightTabs(ws2)).toEqual([b, c]);
  });

  it("keeps the source active tab when the moved tab is not active", () => {
    let { ws, winId } = makeRightSidebarWs(3);
    const [a, b, c] = rightTabs(ws);
    const base = Date.now();
    ws = stamp(ws, a, new Date(base - 10_000).toISOString());
    ws = stamp(ws, b, new Date(base + 10_000).toISOString());
    ws = stamp(ws, c, new Date(base - 20_000).toISOString());
    ws = ops.activateSystemTab(ws, winId, "right", b as string);
    expect(activeRight(ws)).toBe(b);

    // move a (not active) to left
    const ws2 = ops.moveSystemTabToSidebar(ws, winId, a as string, "left", 0);
    expect(activeRight(ws2)).toBe(b); // unchanged
    expect(rightTabs(ws2)).toEqual([b, c]);
    expect(activeLeft(ws2)).toBe(a);
  });

  it("activates null when the moved active tab was the only tab on the sidebar", () => {
    let { ws, winId } = makeRightSidebarWs(1);
    const only = rightTabs(ws)[0];
    expect(activeRight(ws)).toBe(only);

    const ws2 = ops.moveSystemTabToSidebar(ws, winId, only as string, "left", 0);
    expect(rightTabs(ws2)).toEqual([]);
    expect(activeRight(ws2)).toBeNull();
    expect(activeLeft(ws2)).toBe(only);
  });
});

describe("openSystemTab explicit side overrides the registration default", () => {
  it("places a tab on an explicitly requested left sidebar even when its default is right", () => {
    // explorer's `defaultSide` is "right"; an explicit "left" must win.
    let ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    ws = ops.openSystemTab(ws, winId, "left", "explorer", "Explorer", true);

    const leftTabs = (ws.sidebar.leftSidebarTabs ?? []) as unknown as string[];
    const rightTabs = (ws.sidebar.rightSidebarTabs ?? []) as unknown as string[];
    expect(leftTabs).toHaveLength(1);
    expect(rightTabs).toEqual([]);
    // The left sidebar is open and the tab is active in this window.
    expect(ws.sidebar.leftSidebarOpen).toBe(true);
    expect(ws.windows[0].sidebar?.activeLeftTab).toBe(leftTabs[0]);
    // The tab was registered with the explorer appType.
    expect(ws.systemTabs[leftTabs[0] as types.SystemTabId]?.appType).toBe("explorer");
  });
});
