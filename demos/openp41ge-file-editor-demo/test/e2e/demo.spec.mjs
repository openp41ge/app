// @ts-check
import { test, expect } from "@playwright/test";

test.describe("File Editor Demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.waitForSelector("file-editor", { state: "attached", timeout: 5000 });
    // Wait for both editors to fully load (TextMate init + first render)
    await page.waitForTimeout(5000);
  });

  /** Focus the hidden textarea inside a specific editor by index via page.evaluate. */
  async function focusEditor(page, index) {
    await page.evaluate((idx) => {
      const editors = document.querySelectorAll("file-editor[data-editor-id]");
      const editor = editors[idx];
      if (!editor) throw new Error(`Editor ${idx} not found`);
      const textarea = editor.querySelector(".fe-hidden-textarea");
      if (!textarea) throw new Error(`.fe-hidden-textarea not found in editor ${idx}`);
      textarea.focus();
    }, index);
    await page.waitForTimeout(200);
  }

  test("page loads with two editors sharing the same file", async ({ page }) => {
    const editors = page.locator("file-editor");
    await expect(editors).toHaveCount(2);
    await expect(editors.nth(0)).toBeVisible();
    await expect(editors.nth(1)).toBeVisible();

    await expect(page.locator("header h1")).toHaveText(/File Editor Demo/);
    await expect(page.locator(".editor-panel")).toHaveCount(2);
    await expect(page.locator(".file-select")).toHaveCount(2);

    // Both editors should show the same file (TypeScript) with shared model
    const badges = page.locator(".language-badge");
    await expect(badges.nth(0)).toHaveText("Typescript");
    await expect(badges.nth(1)).toHaveText("Typescript");

    // Both file selects should show sample.ts
    const selects = page.locator(".file-select");
    await expect(selects.nth(0)).toHaveValue("typescript");
    await expect(selects.nth(1)).toHaveValue("typescript");
  });

  test("file switching changes language badge", async ({ page }) => {
    // Editor 1: switch to JavaScript
    await page.locator(".file-select").nth(0).selectOption("javascript");
    await page.waitForTimeout(1000);
    await expect(page.locator(".language-badge").nth(0)).toHaveText("Javascript");

    // Editor 2: switch to HTML
    await page.locator(".file-select").nth(1).selectOption("html");
    await page.waitForTimeout(1000);
    await expect(page.locator(".language-badge").nth(1)).toHaveText("Html");
  });

  test("theme toggle on one editor affects both", async ({ page }) => {
    await expect(page.locator("body")).not.toHaveClass(/light-theme/);

    await page.locator(".theme-toggle").nth(0).click();
    await page.waitForTimeout(300);
    await expect(page.locator("body")).toHaveClass(/light-theme/);

    await page.locator(".theme-toggle").nth(1).click();
    await page.waitForTimeout(300);
    await expect(page.locator("body")).not.toHaveClass(/light-theme/);
  });

  test("typing text makes dirty indicator visible", async ({ page }) => {
    const dirty1 = page.locator(".dirty-indicator").nth(0);
    await expect(dirty1).toHaveClass(/dirty-hidden/);

    await focusEditor(page, 0);
    await page.keyboard.press("x");
    await page.waitForTimeout(500);

    await expect(dirty1).toHaveClass(/dirty-visible/);
  });

  test("save clears dirty indicator", async ({ page }) => {
    const dirty1 = page.locator(".dirty-indicator").nth(0);

    await focusEditor(page, 0);
    await page.keyboard.press("x");
    await page.waitForTimeout(500);
    await expect(dirty1).toHaveClass(/dirty-visible/);

    await page.locator(".save-btn").nth(0).click();
    await page.waitForTimeout(500);
    await expect(dirty1).toHaveClass(/dirty-hidden/);
  });

  test("focus switches between two editors", async ({ page }) => {
    await focusEditor(page, 0);
    await page.keyboard.press("x");
    await page.waitForTimeout(300);
    await expect(page.locator(".dirty-indicator").nth(0)).toHaveClass(/dirty-visible/);

    await focusEditor(page, 1);
    await page.keyboard.press("y");
    await page.waitForTimeout(300);
    await expect(page.locator(".dirty-indicator").nth(1)).toHaveClass(/dirty-visible/);

    await expect(page.locator(".dirty-indicator").nth(0)).toHaveClass(/dirty-visible/);
    await expect(page.locator(".dirty-indicator").nth(1)).toHaveClass(/dirty-visible/);
  });

  test("editing in one editor dirties both (shared model sync)", async ({ page }) => {
    await focusEditor(page, 0);
    await page.keyboard.press("a");
    await page.waitForTimeout(500);

    await expect(page.locator(".dirty-indicator").nth(0)).toHaveClass(/dirty-visible/);
    await expect(page.locator(".dirty-indicator").nth(1)).toHaveClass(/dirty-visible/);
  });

  test("saving in one editor clears both (shared model sync)", async ({ page }) => {
    await focusEditor(page, 0);
    await page.keyboard.press("a");
    await page.waitForTimeout(500);

    await expect(page.locator(".dirty-indicator").nth(0)).toHaveClass(/dirty-visible/);
    await expect(page.locator(".dirty-indicator").nth(1)).toHaveClass(/dirty-visible/);

    await page.locator(".save-btn").nth(1).click();
    await page.waitForTimeout(500);

    await expect(page.locator(".dirty-indicator").nth(0)).toHaveClass(/dirty-hidden/);
    await expect(page.locator(".dirty-indicator").nth(1)).toHaveClass(/dirty-hidden/);
  });

  test("backspace deletes text", async ({ page }) => {
    const dirty1 = page.locator(".dirty-indicator").nth(0);

    await focusEditor(page, 0);

    await page.keyboard.type("hello");
    await page.waitForTimeout(300);
    await expect(dirty1).toHaveClass(/dirty-visible/);

    await page.keyboard.press("Backspace");
    await page.waitForTimeout(300);

    await page.keyboard.press("x");
    await page.waitForTimeout(300);
    await expect(dirty1).toHaveClass(/dirty-visible/);
  });

  test("typing in different files across editors", async ({ page }) => {
    // Editor 1: switch to JSON, type something
    await page.locator(".file-select").nth(0).selectOption("json");
    await page.waitForTimeout(1000);

    await focusEditor(page, 0);
    await page.keyboard.press("a");
    await page.waitForTimeout(300);
    await expect(page.locator(".dirty-indicator").nth(0)).toHaveClass(/dirty-visible/);
    await expect(page.locator(".dirty-indicator").nth(1)).toHaveClass(/dirty-hidden/);

    await focusEditor(page, 1);
    await page.keyboard.press("b");
    await page.waitForTimeout(300);
    await expect(page.locator(".dirty-indicator").nth(1)).toHaveClass(/dirty-visible/);

    await page.locator(".save-btn").nth(0).click();
    await page.waitForTimeout(500);
    await expect(page.locator(".dirty-indicator").nth(0)).toHaveClass(/dirty-hidden/);
    await expect(page.locator(".dirty-indicator").nth(1)).toHaveClass(/dirty-visible/);

    await page.locator(".save-btn").nth(1).click();
    await page.waitForTimeout(500);
    await expect(page.locator(".dirty-indicator").nth(0)).toHaveClass(/dirty-hidden/);
    await expect(page.locator(".dirty-indicator").nth(1)).toHaveClass(/dirty-hidden/);
  });

  test("long-line file triggers horizontal scrollbar", async ({ page }) => {
    // Switch editor 1 to the long-line file
    await page.locator(".file-select").nth(0).selectOption("long");
    await page.waitForTimeout(1500);

    // The long-line.txt file has a line that is ~660 characters at ~8.4px/char ≈ ~5500px.
    // This should overflow any viewport, so overflowX should be "auto".
    const overflowX = await page.evaluate(() => {
      const fe = document.querySelector("file-editor");
      if (!fe) return null;
      return fe._viewportEl.style.overflowX;
    });
    expect(overflowX).toBe("auto");

    // The content scrollWidth should exceed the viewport clientWidth
    const hasOverflow = await page.evaluate(() => {
      const fe = document.querySelector("file-editor");
      const vp = fe._viewportEl;
      return vp.scrollWidth > vp.clientWidth;
    });
    expect(hasOverflow).toBe(true);
  });
});
