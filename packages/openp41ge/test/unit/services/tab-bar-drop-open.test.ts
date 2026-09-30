/**
 * TabBarDropTarget open-tab / file drop behavior.
 *
 * A stream (`open-tab`) or file dropped on a cell's tab bar opens it in that
 * column — mirroring a drop on the grid surface. The target fires `grid-open-tab`
 * so the host (logs window / workspace) can route it. Tab drags still reorder
 * as before.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { TabBarDropTarget } from "openp41ge-tabs/targets/tab-bar-drop-target";
import type { IDragSource } from "openp41ge-tabs/interfaces";

function openTabSource(appType: string, tabConfig: Record<string, unknown>): IDragSource {
  return {
    type: "open-tab",
    onDragStart: () => {},
    onDragEnd: () => {},
    createGhost: () => document.createElement("div"),
    getDragData: () => ({ type: "open-tab", appType, tabConfig }),
  } as unknown as IDragSource;
}

function fileSource(filePath: string): IDragSource {
  return {
    type: "file",
    onDragStart: () => {},
    onDragEnd: () => {},
    createGhost: () => document.createElement("div"),
    getDragData: () => ({ type: "file", filePath }),
  } as unknown as IDragSource;
}

function unknownSource(): IDragSource {
  return {
    type: "system-tab",
    onDragStart: () => {},
    onDragEnd: () => {},
    createGhost: () => document.createElement("div"),
    getDragData: () => ({ type: "system-tab", tabId: "s1", side: "left", winId: "w1" }),
  } as unknown as IDragSource;
}

describe("TabBarDropTarget open-tab / file drop", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function bar(): HTMLElement {
    const b = document.createElement("div");
    b.style.position = "relative";
    document.body.appendChild(b);
    return b;
  }

  it("fires grid-open-tab for an open-tab (stream) drop, targeting this cell", async () => {
    const b = bar();
    const target = new TabBarDropTarget(b, "w1", 2);
    const listener = vi.fn();
    b.addEventListener("grid-open-tab", listener);

    const result = await target.onDrop(
      openTabSource("log-viewer", { system: "openp41ge-agents" }),
      10,
      15,
    );
    expect(result.success).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toMatchObject({
      winId: "w1",
      tabType: "log-viewer",
      tabConfig: { system: "openp41ge-agents" },
      targetCol: 2,
      pinned: true,
    });
  });

  it("fires grid-open-tab for a file drop on the tab bar", async () => {
    const b = bar();
    const target = new TabBarDropTarget(b, "w1", 0);
    const listener = vi.fn();
    b.addEventListener("grid-open-tab", listener);

    const result = await target.onDrop(fileSource("/repo/a.ts"), 10, 15);
    expect(result.success).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toMatchObject({
      winId: "w1",
      tabType: "file-viewer",
      tabConfig: { filePath: "/repo/a.ts" },
      targetCol: 0,
      pinned: true,
    });
  });

  it("still rejects unknown drag types on the tab bar", async () => {
    const b = bar();
    const target = new TabBarDropTarget(b, "w1", 0);
    const listener = vi.fn();
    b.addEventListener("grid-open-tab", listener);

    const result = await target.onDrop(unknownSource(), 10, 15);
    expect(result.success).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
