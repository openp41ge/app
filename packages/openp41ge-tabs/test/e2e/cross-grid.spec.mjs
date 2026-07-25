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

test.describe("Openp41ge Tabs Demo \u2014 Cross-Grid", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/");
    await page.waitForSelector("tab-grid", { state: "visible" });
    await page.waitForSelector("#log", { state: "visible" });
    await page.waitForTimeout(800);
  });

  test("drag tab between grids via tab bar (cell move)", async ({ page }) => {
    const sideB = page.locator("#side-grid-b");
    const gridBBox = await sideB.boundingBox();
    const readmeTab = page.locator('#editor-grid [role="tab"][data-tab-id="tab-200"]');
    const tabBox = await readmeTab.boundingBox();
    if (!gridBBox || !tabBox) throw new Error("Bounds");

    await dragElementTo(
      page,
      '#editor-grid [role="tab"][data-tab-id="tab-200"]',
      gridBBox.x + gridBBox.width / 2,
      gridBBox.y + 10,
    );
    await page.waitForTimeout(100);

    await expect(page.locator("#log")).toContainText("tab-bar-move-cell");
    await expect(sideB.locator('[role="tab"]')).toHaveCount(2);
  });

  test("cross-grid boundary split creates column on the correct grid", async ({ page }) => {
    const sideB = page.locator("#side-grid-b");
    const sideBBox = await sideB.boundingBox();
    const readmeTab = page.locator('#editor-grid [role="tab"][data-tab-id="tab-200"]');
    const tabBox = await readmeTab.boundingBox();
    if (!sideBBox || !tabBox) throw new Error("Bounds");

    await dragElementTo(
      page,
      '#editor-grid [role="tab"][data-tab-id="tab-200"]',
      sideBBox.x + sideBBox.width - 3,
      sideBBox.y + sideBBox.height / 2,
    );
    await page.waitForTimeout(100);

    const cols = await page.evaluate(() => {
      const g = document.getElementById("side-grid-b");
      return g ? g.cols : -1;
    });
    expect(cols).toBe(2);

    const log = page.locator("#log");
    const logText = await log.textContent();
    expect(logText).toContain("grid-split");
    expect(logText).toContain('"winId": "side-b"');
    expect(logText).toContain('"sourceWinId": "editor"');
  });

  test("cross-grid cell drop moves tab to target grid", async ({ page }) => {
    const editor = page.locator("#editor-grid");
    const sideB = page.locator("#side-grid-b");

    const sideBBox = await sideB.boundingBox();
    const readmeTab = page.locator('#editor-grid [role="tab"][data-tab-id="tab-200"]');
    const tabBox = await readmeTab.boundingBox();
    if (!sideBBox || !tabBox) throw new Error("Bounds");

    const editorCountBefore = await editor.locator('[role="tab"]').count();
    const sideBCountBefore = await sideB.locator('[role="tab"]').count();

    await dragElementTo(
      page,
      '#editor-grid [role="tab"][data-tab-id="tab-200"]',
      sideBBox.x + sideBBox.width / 2,
      sideBBox.y + sideBBox.height / 2,
    );
    await page.waitForTimeout(100);

    const editorCountAfter = await editor.locator('[role="tab"]').count();
    const sideBCountAfter = await sideB.locator('[role="tab"]').count();

    expect(editorCountAfter).toBe(editorCountBefore - 1);
    expect(sideBCountAfter).toBe(sideBCountBefore + 1);
  });
});
