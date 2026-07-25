// @ts-check
import { test, expect } from "@playwright/test";

/**
 * Create a <tab-bar> element in the page with the given properties.
 * Returns the drop target type and whether both the drop target and
 * bar container were created successfully.
 */
async function createBar(page, tabIds, winId, col) {
  return page.evaluate(
    async ({ ids, wid, c }) => {
      const bar = document.createElement("tab-bar");
      bar.tabIds = ids;
      bar.winId = wid;
      bar.col = c;
      bar.style.cssText = "display:block;width:300px;height:32px;";
      document.body.appendChild(bar);
      await bar.updateComplete;
      await new Promise((r) => setTimeout(r, 50));
      const dt = bar.dropTarget;
      const barContainer = bar.barElement;
      return {
        dtExists: !!dt,
        containerExists: !!barContainer,
        type: dt?.type ?? null,
      };
    },
    { ids: tabIds, wid: winId, c: col },
  );
}

test.describe("TabBarDropTarget — browser E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("tab-grid", { state: "visible" });
  });

  test("creates a drop target with correct type", async ({ page }) => {
    const result = await createBar(page, ["tab-1", "tab-2", "tab-3"], "win-1", 0);
    expect(result.dtExists).toBe(true);
    expect(result.containerExists).toBe(true);
    expect(result.type).toBe("tab-bar");
  });

  test("shows and hides visual indicator on hover/leave", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const bar = document.createElement("tab-bar");
      bar.tabIds = ["tab-1", "tab-2", "tab-3"];
      bar.winId = "win-1";
      bar.col = 0;
      bar.style.cssText = "display:block;width:300px;height:32px;";
      document.body.appendChild(bar);
      await bar.updateComplete;
      await new Promise((r) => setTimeout(r, 50));

      const barContainer = bar.barElement;
      if (!barContainer) return { wasVisible: false, isHidden: false };

      // Use the TabBar's own showDropIndicator/hideDropIndicator which
      // manages a single indicator element on barContainer.
      const rect = barContainer.getBoundingClientRect();
      bar.showDropIndicator(rect.left + 120);

      await new Promise((r) => setTimeout(r, 50));
      const indicator = barContainer.querySelector(".tab-drop-indicator");
      const wasVisible = indicator?.style.display === "block";
      const displayBefore = indicator?.style.display ?? "no-indicator";

      bar.hideDropIndicator();
      await new Promise((r) => setTimeout(r, 50));
      const displayAfter = indicator?.style.display ?? "no-indicator";
      const isHidden = displayAfter === "none";

      document.body.removeChild(bar);
      return { wasVisible, isHidden, displayBefore, displayAfter };
    });

    expect(result.wasVisible).toBe(true);
    expect(result.isHidden).toBe(true);
  });

  test("fires tab-bar-reorder event when dropping at a different index", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const bar = document.createElement("tab-bar");
      bar.tabIds = ["tab-1", "tab-2", "tab-3"];
      bar.winId = "win-1";
      bar.col = 0;
      bar.style.cssText = "display:block;width:300px;height:32px;";
      document.body.appendChild(bar);
      await bar.updateComplete;
      await new Promise((r) => setTimeout(r, 50));

      const dt = bar.dropTarget;
      const barContainer = bar.barElement;
      if (!dt || !barContainer) return { success: false, eventFired: false, toIndex: -1 };

      const received = [];
      barContainer.addEventListener("tab-bar-reorder", (e) => received.push(e));

      const rect = barContainer.getBoundingClientRect();
      const clientX = rect.left + 10;

      const dropResult = await dt.onDrop(
        {
          type: "tab",
          getDragData: () => ({
            type: "tab",
            tabId: "tab-3",
            winId: "win-1",
            worksetId: "ws-1",
          }),
          onDragStart: () => {},
          onDragEnd: () => {},
          createGhost: () => document.createElement("div"),
        },
        clientX,
        0,
      );

      document.body.removeChild(bar);
      return {
        success: dropResult.success,
        eventFired: received.length === 1,
        toIndex: received[0]?.detail?.toIndex,
      };
    });

    expect(result.success).toBe(true);
    expect(result.eventFired).toBe(true);
    expect(result.toIndex).toBe(0);
  });

  test("fires tab-bar-move-cell for a tab from another cell", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const bar = document.createElement("tab-bar");
      bar.tabIds = ["tab-1", "tab-2", "tab-3"];
      bar.winId = "win-1";
      bar.col = 0;
      bar.style.cssText = "display:block;width:300px;height:32px;";
      document.body.appendChild(bar);
      await bar.updateComplete;
      await new Promise((r) => setTimeout(r, 50));

      const dt = bar.dropTarget;
      const barContainer = bar.barElement;
      if (!dt || !barContainer)
        return { success: false, eventFired: false, tabId: "", targetWinId: "" };

      const received = [];
      barContainer.addEventListener("tab-bar-move-cell", (e) => received.push(e));

      const rect = barContainer.getBoundingClientRect();
      const clientX = rect.left + 10;

      const dropResult = await dt.onDrop(
        {
          type: "tab",
          getDragData: () => ({
            type: "tab",
            tabId: "tab-other",
            winId: "other-win",
            worksetId: "other-ws",
          }),
          onDragStart: () => {},
          onDragEnd: () => {},
          createGhost: () => document.createElement("div"),
        },
        clientX,
        0,
      );

      document.body.removeChild(bar);
      return {
        success: dropResult.success,
        eventFired: received.length === 1,
        tabId: received[0]?.detail?.tabId,
        targetWinId: received[0]?.detail?.targetWinId,
      };
    });

    expect(result.success).toBe(true);
    expect(result.eventFired).toBe(true);
    expect(result.tabId).toBe("tab-other");
    expect(result.targetWinId).toBe("win-1");
  });

  test("does not fire reorder when dropping at the same index", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const bar = document.createElement("tab-bar");
      bar.tabIds = ["tab-1", "tab-2", "tab-3"];
      bar.winId = "win-1";
      bar.col = 0;
      bar.style.cssText = "display:block;width:300px;height:32px;";
      document.body.appendChild(bar);
      await bar.updateComplete;
      await new Promise((r) => setTimeout(r, 50));

      const dt = bar.dropTarget;
      const barContainer = bar.barElement;
      if (!dt || !barContainer) return { success: false, eventsFired: -1 };

      const received = [];
      barContainer.addEventListener("tab-bar-reorder", (e) => received.push(e));

      const rect = barContainer.getBoundingClientRect();
      const clientX = rect.left + 120; // middle of 300px bar → index 1 (tab-2)

      const dropResult = await dt.onDrop(
        {
          type: "tab",
          getDragData: () => ({
            type: "tab",
            tabId: "tab-2",
            winId: "win-1",
            worksetId: "ws-1",
          }),
          onDragStart: () => {},
          onDragEnd: () => {},
          createGhost: () => document.createElement("div"),
        },
        clientX,
        0,
      );

      document.body.removeChild(bar);
      return {
        success: dropResult.success,
        eventsFired: received.length,
      };
    });

    expect(result.success).toBe(true);
    expect(result.eventsFired).toBe(0);
  });

  test("rejects non-tab source types", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const bar = document.createElement("tab-bar");
      bar.tabIds = ["tab-1", "tab-2", "tab-3"];
      bar.winId = "win-1";
      bar.col = 0;
      bar.style.cssText = "display:block;width:300px;height:32px;";
      document.body.appendChild(bar);
      await bar.updateComplete;
      await new Promise((r) => setTimeout(r, 50));

      const dt = bar.dropTarget;
      if (!dt) return { success: true, reason: "no drop target" };

      const dropResult = await dt.onDrop(
        {
          type: "file",
          getDragData: () => ({ type: "file", filePath: "/test.ts" }),
          onDragStart: () => {},
          onDragEnd: () => {},
          createGhost: () => document.createElement("div"),
        },
        100,
        0,
      );

      document.body.removeChild(bar);
      return {
        success: dropResult.success,
        reason: dropResult.reason,
      };
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain("only tabs");
  });
});
