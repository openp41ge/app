// @vitest-environment jsdom
/**
 * Integration tests for Openp41geTabsEventHandler — the event translation layer
 * between openp41ge-tabs CustomEvents and the Openp41ge command bus.
 *
 * Simulates openp41ge-tabs CustomEvents on document and verifies the correct
 * command-bus operations are dispatched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Openp41geTabsEventHandler } from "@openp41ge/renderer/services/openp41ge-tabs-event-handler";

type DispatchSpy = ReturnType<typeof vi.fn>;

describe("Openp41geTabsEventHandler — command wiring", () => {
  let eventHandler: Openp41geTabsEventHandler;
  let dispatchSpy: DispatchSpy;
  let mockCommandBus: { dispatch: DispatchSpy };

  beforeEach(() => {
    dispatchSpy = vi.fn();
    mockCommandBus = { dispatch: dispatchSpy };
    eventHandler = new Openp41geTabsEventHandler();
    eventHandler.init(mockCommandBus as any);
  });

  afterEach(() => {
    eventHandler.destroy();
  });

  // ── Tab bar reorder ─────────────────────────────────────────────

  it("translates tab-bar-reorder to reorderTabsInCell", () => {
    document.dispatchEvent(
      new CustomEvent("tab-bar-reorder", {
        detail: { winId: "w1", col: 2, fromIndex: 0, toIndex: 3 },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "reorderTabsInCell",
      "w1",
      0, // row (always 0 for column-based grid)
      2, // col
      0, // fromIndex
      3, // toIndex
    );
  });

  // ── Tab bar cross-cell move ─────────────────────────────────────

  it("translates tab-bar-move-cell to moveTabBetweenCells", () => {
    document.dispatchEvent(
      new CustomEvent("tab-bar-move-cell", {
        detail: {
          sourceWinId: "w1",
          tabId: "t1",
          targetWinId: "w1",
          targetCol: 1,
          dropIndex: 0,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "moveTabBetweenCells",
      "w1",
      "t1",
      "w1",
      0, // targetRow (always 0)
      1, // targetCol
      0, // dropIndex
    );
  });

  // ── Grid split (boundary drop) ──────────────────────────────────

  it("translates grid-split to splitTabFromCell", () => {
    document.dispatchEvent(
      new CustomEvent("grid-split", {
        detail: {
          sourceWinId: "w1",
          winId: "w1",
          tabId: "t1",
          splitCol: 1,
          splitLeft: true,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "splitTabFromCell",
      "w1",
      "t1",
      1, // splitCol
      true, // splitLeft
    );
  });

  // ── Grid move (cell drop) ───────────────────────────────────────

  it("translates grid-move to moveTabBetweenCells", () => {
    document.dispatchEvent(
      new CustomEvent("grid-move", {
        detail: {
          sourceWinId: "w1",
          tabId: "t1",
          targetWinId: "w1",
          targetCol: 2,
          insertAt: -1,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "moveTabBetweenCells",
      "w1",
      "t1",
      "w1",
      0, // targetRow (always 0)
      2, // targetCol
      -1, // insertAt
    );
  });

  // ── Grid activate (same-cell drop) ──────────────────────────────

  it("translates grid-activate to activateTabInCell", () => {
    document.dispatchEvent(
      new CustomEvent("grid-activate", {
        detail: { winId: "w1", tabId: "t1" },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith("activateTabInCell", "w1", "t1");
  });

  // ── Grid remove (duplicate file path) ───────────────────────────

  it("translates grid-remove to removeTabFromCell", () => {
    document.dispatchEvent(
      new CustomEvent("grid-remove", {
        detail: { winId: "w1", tabId: "t1" },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith("removeTabFromCell", "w1", "t1");
  });

  // ── Grid open tab (file drop on cell center) ────────────────────

  it("translates grid-open-tab to actionOpenFile", () => {
    // Needs a <tab-grid> element in the DOM for _findWinId()
    const grid = document.createElement("tab-grid");
    (grid as any).winId = "w1";
    grid.style.display = "none";
    document.body.appendChild(grid);

    document.dispatchEvent(
      new CustomEvent("grid-open-tab", {
        detail: {
          tabType: "file-viewer",
          tabConfig: { filePath: "/path/to/file.ts" },
          targetCol: 0,
        },
      }),
    );

    expect(dispatchSpy).toHaveBeenCalledWith(
      "actionOpenFile",
      "w1",
      "file-viewer",
      "file.ts",
      "/path/to/file.ts",
      0,
      true,
    );

    document.body.removeChild(grid);
  });

  // ── Tab close button click ──────────────────────────────────────

  it("handles click on .tab-close button and dispatches removeTabFromCell", () => {
    // Create a minimal tab-bar element in the DOM
    const bar = document.createElement("tab-bar");
    (bar as any).winId = "w1";
    bar.style.display = "none";
    document.body.appendChild(bar);

    const closeBtn = document.createElement("span");
    closeBtn.className = "tab-close";
    closeBtn.setAttribute("data-close-tab-id", "t1");
    bar.appendChild(closeBtn);

    closeBtn.click();

    expect(dispatchSpy).toHaveBeenCalledWith("removeTabFromCell", "w1", "t1");

    document.body.removeChild(bar);
  });

  // ── Destruction cleanup ─────────────────────────────────────────

  it("stops dispatching events after destroy()", () => {
    eventHandler.destroy();

    document.dispatchEvent(
      new CustomEvent("tab-bar-reorder", {
        detail: { winId: "w1", col: 0, fromIndex: 0, toIndex: 1 },
      }),
    );

    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
