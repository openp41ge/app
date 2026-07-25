// @ts-check
import { test, expect } from "@playwright/test";

async function dragElementTo(page, sourceSelector, targetX, targetY) {
  const box = await page.locator(sourceSelector).first().boundingBox();
  if (!box) throw new Error("Element not found: " + sourceSelector);

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(30);

  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    await page.mouse.move(startX + (targetX - startX) * t, startY + (targetY - startY) * t);
    await page.waitForTimeout(10);
  }

  await page.mouse.up();
  await page.waitForTimeout(100);
}

/** Get bounding box of a tab button uniquely identified by its data-tab-id. */
async function tabBox(page, gridSelector, tabId) {
  const sel = gridSelector + ' [role="tab"][data-tab-id="' + tabId + '"]';
  const el = page.locator(sel);
  const box = await el.boundingBox();
  if (!box) throw new Error("Tab " + tabId + " not found in " + gridSelector);
  return box;
}

test.describe("Openp41ge Tabs Demo \u2014 Grid", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/");
    await page.waitForSelector("tab-grid", { state: "visible" });
    await page.waitForSelector("#log", { state: "visible" });
    await page.waitForTimeout(800);
  });

  test("page loads with all grids and tabs", async ({ page }) => {
    await expect(page.locator("tab-grid")).toHaveCount(3);
    const editor = page.locator("#editor-grid");
    await expect(editor.locator('[role="tab"]')).toHaveCount(4);
    await expect(page.locator("#side-grid-a [role='tab']")).toHaveCount(2);
    await expect(page.locator("#side-grid-b [role='tab']")).toHaveCount(1);
    await expect(page.locator("#log")).toContainText("Advanced demo initialized");
  });

  test("clicking a tab activates it", async ({ page }) => {
    const editor = page.locator("#editor-grid");
    const secondTab = editor.locator('[role="tab"]').nth(1);
    await secondTab.click();
    await page.waitForTimeout(100);
    await expect(page.locator("#log")).toContainText("grid-activate");
  });

  test("close button removes a tab", async ({ page }) => {
    const sideA = page.locator("#side-grid-a");
    await sideA.locator(".tab-close").first().click();
    await page.waitForTimeout(100);
    await expect(sideA.locator('[role="tab"]')).toHaveCount(1);
  });

  test("add button creates a new tab", async ({ page }) => {
    const sideB = page.locator("#side-grid-b");
    // The add button is now external — click the .demo-add-tab-btn associated with side-b
    await page.locator('.demo-add-tab-btn[data-win-id="side-b"]').click();
    await page.waitForTimeout(100);
    await expect(sideB.locator('[role="tab"]')).toHaveCount(2);
  });

  test("drag reorders tabs within the same tab bar", async ({ page }) => {
    // Editor col 0 has: README.md (tab-200, left), styles.css (tab-202, middle), output.log (tab-203, right)
    // Drop tab-202 (styles.css, index 1) into the left half of tab-200 (index 0) to reorder it.
    const tab200Box = await tabBox(page, "#editor-grid", "tab-200");

    // Drop at the left quarter of tab-200 (inside the tab button), so getDropIndexInBar returns 0.
    await dragElementTo(
      page,
      '#editor-grid [role="tab"][data-tab-id="tab-202"]',
      tab200Box.x + tab200Box.width * 0.25,
      tab200Box.y + tab200Box.height / 2,
    );
    await page.waitForTimeout(100);

    await expect(page.locator("#log")).toContainText("tab-bar-reorder");
  });

  test("drag to grid right edge splits the grid", async ({ page }) => {
    // Editor starts with 2 cols. Col 0 has 3 tabs, col 1 has 1 tab.
    // Drag output.log (tab-203) from col 0's right edge to the editor's right edge.
    const editor = page.locator("#editor-grid");
    const editorBox = await editor.boundingBox();
    if (!editorBox) throw new Error("Editor bounds");

    await dragElementTo(
      page,
      '#editor-grid [role="tab"][data-tab-id="tab-203"]',
      editorBox.x + editorBox.width - 3,
      editorBox.y + editorBox.height / 2,
    );
    await page.waitForTimeout(100);

    const cols = await page.evaluate(() => {
      const g = document.querySelector("#editor-grid");
      return g ? g.cols : -1;
    });
    expect(cols).toBe(3);
    await expect(page.locator("#log")).toContainText("grid-split");
  });

  test("ghost overlay is within grid bounds during drag", async ({ page }) => {
    const sideA = page.locator("#side-grid-a");
    const editorBox = await page.locator("#editor-grid").boundingBox();
    const tabBox = await sideA.locator('[role="tab"]').first().boundingBox();
    if (!editorBox || !tabBox) throw new Error("Bounds");

    const startX = tabBox.x + tabBox.width / 2;
    const startY = tabBox.y + tabBox.height / 2;
    const endX = editorBox.x + editorBox.width - 3;
    const endY = editorBox.y + editorBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(30);

    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(startX + ((endX - startX) * i) / 6, startY + ((endY - startY) * i) / 6);
      await page.waitForTimeout(15);
    }

    const ghostInfo = await page.evaluate(() => {
      const ghost = document.querySelector(".openp41ge-ghost-overlay");
      if (!ghost) return { found: false };
      const grid = ghost.closest("tab-grid");
      if (!grid) return { found: true, error: "ghost not in grid" };
      const gr = ghost.getBoundingClientRect();
      const gb = grid.getBoundingClientRect();
      return {
        found: true,
        fitsInGrid:
          Math.round(gr.x) >= Math.round(gb.x) - 1 &&
          Math.round(gr.right) <= Math.round(gb.right) + 1 &&
          Math.round(gr.y) >= Math.round(gb.y) - 1 &&
          Math.round(gr.bottom) <= Math.round(gb.bottom) + 1,
        gridPos: getComputedStyle(grid).position,
      };
    });

    expect(ghostInfo.found).toBe(true);
    expect(ghostInfo.fitsInGrid).toBe(true);
    await page.mouse.up();
  });

  test("double-click an unpinned tab pins it", async ({ page }) => {
    const tabId = "tab-203";
    await expect(
      page.locator('#editor-grid [role="tab"][data-tab-id="' + tabId + '"]'),
    ).toBeVisible();

    // Simulate double-click by dispatching two rapid click events
    const result = await page.evaluate((tid) => {
      const grid = document.querySelector("#editor-grid");
      if (!grid) return "no-grid";
      const tabBtn = grid.querySelector('[role="tab"][data-tab-id="' + tid + '"]');
      if (!tabBtn) return "no-tabBtn";

      const before = grid.tabData?.[tid]?.pinned;

      // First click (dispatches grid-activate immediately)
      tabBtn.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0, clientX: 10, clientY: 10 }),
      );
      // Second click within 300ms → should trigger double-click pinning
      tabBtn.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0, clientX: 10, clientY: 10 }),
      );

      const after = grid.tabData?.[tid]?.pinned;
      return { before, after };
    }, tabId);

    await page.waitForTimeout(100);

    // grid-pin event should have fired
    await expect(page.locator("#log")).toContainText("grid-pin");

    // Tab should now be pinned
    const pinned = result && result.after === true;
    expect(pinned).toBe(true);
  });

  test("clicking file card opens unpinned tab in editor grid and replacing it", async ({
    page,
  }) => {
    // Get titles from the title span inside each tab
    const titles = await page.evaluate(() => {
      const grid = document.querySelector("#editor-grid");
      if (!grid) return [];
      const tabs = grid.querySelectorAll('[role="tab"]');
      return Array.from(tabs).map((t) => {
        const span = t.querySelector("span");
        return span?.textContent?.trim() ?? t.textContent?.trim() ?? "";
      });
    });

    // Find which tab is unpinned (output.log)
    const unpinnedIdx = titles.findIndex((t) => t.includes("output.log"));
    expect(unpinnedIdx).toBeGreaterThanOrEqual(0);

    // Dispatch grid-open-tab for app.ts
    await page.evaluate(() => {
      const grid = document.querySelector("#editor-grid");
      if (!grid) return;
      grid.dispatchEvent(
        new CustomEvent("grid-open-tab", {
          bubbles: true,
          detail: {
            winId: "editor",
            tabType: "file-viewer",
            tabConfig: { filePath: "/home/user/project/src/app.ts" },
            targetCol: 0,
            pinned: false,
          },
        }),
      );
    });
    await page.waitForTimeout(300);

    // Tab count should still be 4 (replaced output.log, not added)
    const tabCount1 = await page.locator('#editor-grid [role="tab"]').count();
    expect(tabCount1).toBe(titles.length);

    // The unpinned tab should now have "app.ts"
    const titles1 = await page.evaluate(() => {
      const grid = document.querySelector("#editor-grid");
      if (!grid) return [];
      const tabs = grid.querySelectorAll('[role="tab"]');
      return Array.from(tabs).map((t) => {
        const span = t.querySelector("span");
        return span?.textContent?.trim() ?? t.textContent?.trim() ?? "";
      });
    });
    expect(titles1[unpinnedIdx]).toContain("app.ts");

    // Dispatch grid-open-tab for utils.ts — should REPLACE again
    await page.evaluate(() => {
      const grid = document.querySelector("#editor-grid");
      if (!grid) return;
      grid.dispatchEvent(
        new CustomEvent("grid-open-tab", {
          bubbles: true,
          detail: {
            winId: "editor",
            tabType: "file-viewer",
            tabConfig: { filePath: "/home/user/project/src/utils.ts" },
            targetCol: 0,
            pinned: false,
          },
        }),
      );
    });
    await page.waitForTimeout(300);

    // Tab count should still be 4
    const tabCount2 = await page.locator('#editor-grid [role="tab"]').count();
    expect(tabCount2).toBe(titles.length);

    // The unpinned tab should now have "utils.ts"
    const titles2 = await page.evaluate(() => {
      const grid = document.querySelector("#editor-grid");
      if (!grid) return [];
      const tabs = grid.querySelectorAll('[role="tab"]');
      return Array.from(tabs).map((t) => {
        const span = t.querySelector("span");
        return span?.textContent?.trim() ?? t.textContent?.trim() ?? "";
      });
    });
    expect(titles2[unpinnedIdx]).toContain("utils.ts");
  });
});

test.describe("Openp41ge Tabs Demo \u2014 File Drop", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/");
    await page.waitForSelector("tab-grid", { state: "visible" });
    await page.waitForSelector(".file-card", { state: "visible" });
    await page.waitForTimeout(800);
  });

  /** Simulate a native file drag-and-drop by dispatching HTML5 DragEvent on the grid. */
  async function dispatchDrop(page, x, y, filePath) {
    await page.evaluate(
      ({ x, y, filePath }) => {
        const grid = document.querySelector("#editor-grid");
        if (!grid) throw new Error("Grid not found");
        const dt = new DataTransfer();
        dt.setData("text/plain", filePath);
        grid.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y,
          }),
        );
        grid.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y,
          }),
        );
      },
      { x, y, filePath },
    );
  }

  test("file card drop opens a new tab", async ({ page }) => {
    const gridBBox = await page.locator("#editor-grid").boundingBox();
    if (!gridBBox) throw new Error("Editor bounds");

    const targetX = gridBBox.x + gridBBox.width / 2;
    const targetY = gridBBox.y + gridBBox.height / 2;

    await dispatchDrop(page, targetX, targetY, "src/app.ts");
    await page.waitForTimeout(200);

    await expect(page.locator("#log")).toContainText("grid-open-tab");
    await expect(page.locator("#editor-grid [role='tab']").first()).toBeVisible();
  });

  test("file drop shows ghost overlay", async ({ page }) => {
    const gridBBox = await page.locator("#editor-grid").boundingBox();
    if (!gridBBox) throw new Error("Editor bounds");

    const targetX = gridBBox.x + gridBBox.width / 2;
    const targetY = gridBBox.y + gridBBox.height / 2;

    await page.evaluate(
      ({ x, y }) => {
        const grid = document.querySelector("#editor-grid");
        if (!grid) throw new Error("Grid not found");
        const dt = new DataTransfer();
        dt.setData("text/plain", "src/app.ts");
        grid.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y,
          }),
        );
      },
      { x: targetX, y: targetY },
    );

    await page.waitForTimeout(100);

    const ghostVisible = await page.evaluate(
      () => !!document.querySelector(".openp41ge-ghost-overlay"),
    );
    expect(ghostVisible).toBe(true);
  });

  test("file drop on grid left edge shows split indicator", async ({ page }) => {
    const gridBBox = await page.locator("#editor-grid").boundingBox();
    if (!gridBBox) throw new Error("Editor bounds");

    const targetX = gridBBox.x + 5;
    const targetY = gridBBox.y + gridBBox.height / 2;

    await page.evaluate(
      ({ x, y }) => {
        const grid = document.querySelector("#editor-grid");
        if (!grid) throw new Error("Grid not found");
        const dt = new DataTransfer();
        dt.setData("text/plain", "src/app.ts");
        grid.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y,
          }),
        );
      },
      { x: targetX, y: targetY },
    );

    await page.waitForTimeout(100);

    const ghostPreview = await page.evaluate(() => {
      const ghost = document.querySelector(".openp41ge-ghost-overlay");
      if (!ghost) return null;
      const cols = ghost.children;
      if (cols.length < 3) return null;
      return { cols: cols.length };
    });
    expect(ghostPreview).not.toBeNull();
    expect(ghostPreview.cols).toBeGreaterThanOrEqual(3);
  });

  test("file drop on grid right edge splits the grid", async ({ page }) => {
    const gridBBox = await page.locator("#editor-grid").boundingBox();
    if (!gridBBox) throw new Error("Editor bounds");

    const colsBefore = await page.evaluate(() => {
      const g = document.querySelector("#editor-grid");
      return g ? g.cols : -1;
    });

    const targetX = gridBBox.x + gridBBox.width - 5;
    const targetY = gridBBox.y + gridBBox.height / 2;

    await dispatchDrop(page, targetX, targetY, "src/app.ts");
    await page.waitForTimeout(200);

    const colsAfter = await page.evaluate(() => {
      const g = document.querySelector("#editor-grid");
      return g ? g.cols : -1;
    });
    expect(colsAfter).toBe(colsBefore + 1);
    await expect(page.locator("#log")).toContainText("grid-open-tab");
  });

  test("ghost overlay dismisses when dragging out of the grid", async ({ page }) => {
    const gridBBox = await page.locator("#editor-grid").boundingBox();
    if (!gridBBox) throw new Error("Editor bounds");

    // First show the ghost via dragover
    const centerX = gridBBox.x + gridBBox.width / 2;
    const centerY = gridBBox.y + gridBBox.height / 2;

    await page.evaluate(
      ({ x, y }) => {
        const grid = document.querySelector("#editor-grid");
        if (!grid) throw new Error("Grid not found");
        const dt = new DataTransfer();
        dt.setData("text/plain", "src/app.ts");
        grid.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: x,
            clientY: y,
          }),
        );
      },
      { x: centerX, y: centerY },
    );

    await page.waitForTimeout(100);

    const ghostBefore = await page.evaluate(
      () => !!document.querySelector(".openp41ge-ghost-overlay"),
    );
    expect(ghostBefore).toBe(true);

    // Now dispatch dragleave with relatedTarget outside the grid
    await page.evaluate(
      ({ gridRect }) => {
        const grid = document.querySelector("#editor-grid");
        if (!grid) throw new Error("Grid not found");

        const outsideEl = document.createElement("div");

        grid.dispatchEvent(
          new DragEvent("dragleave", {
            bubbles: true,
            cancelable: true,
            dataTransfer: new DataTransfer(),
            clientX: gridRect.x + gridRect.width + 50,
            clientY: gridRect.y + gridRect.height / 2,
            relatedTarget: outsideEl,
          }),
        );
      },
      { gridRect: gridBBox },
    );

    await page.waitForTimeout(50);

    const ghostAfter = await page.evaluate(
      () => !!document.querySelector(".openp41ge-ghost-overlay"),
    );
    expect(ghostAfter).toBe(false);
  });
});

test.describe("Tab Bar — Horizontal Scroll", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/");
    await page.waitForSelector("tab-grid", { state: "visible" });
    await page.waitForTimeout(800);
  });

  test("tab bar scrolls horizontally when many tabs overflow", async ({ page }) => {
    // Add many tabs to col 0 of the editor grid using grid-open-tab
    for (let i = 0; i < 20; i++) {
      await page.evaluate((idx) => {
        const grid = document.querySelector("#editor-grid");
        if (!grid) return;
        grid.dispatchEvent(
          new CustomEvent("grid-open-tab", {
            bubbles: true,
            detail: {
              winId: "editor",
              tabType: "file-viewer",
              tabConfig: { filePath: `/home/user/project/src/file-${idx}.ts` },
              targetCol: 0,
              pinned: true,
            },
          }),
        );
      }, i);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(200);

    // Check the tab bar container has overflow
    const scrollInfo = await page.evaluate(() => {
      const container = document.querySelector("#editor-grid tab-bar .tab-bar-container");
      if (!container) return null;
      return {
        scrollWidth: container.scrollWidth,
        clientWidth: container.clientWidth,
        overflowX: getComputedStyle(container).overflowX,
        scrollbarWidth:
          parseInt(getComputedStyle(container).getPropertyValue("scrollbar-width")) || -1,
      };
    });

    expect(scrollInfo).not.toBeNull();
    expect(scrollInfo.scrollWidth).toBeGreaterThan(scrollInfo.clientWidth);
    expect(scrollInfo.overflowX).toBe("auto");

    // Verify the scrollbar can actually be used — scroll the bar
    await page.evaluate(() => {
      const container = document.querySelector("#editor-grid tab-bar .tab-bar-container");
      if (!container) return;
      container.scrollLeft = container.scrollWidth;
    });
    await page.waitForTimeout(50);

    const scrolledRight = await page.evaluate(() => {
      const container = document.querySelector("#editor-grid tab-bar .tab-bar-container");
      if (!container) return -1;
      return container.scrollLeft;
    });
    expect(scrolledRight).toBeGreaterThan(0);
  });
});
