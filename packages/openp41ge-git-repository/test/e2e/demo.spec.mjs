/**
 * E2E tests for the git repository demo page.
 *
 * Launches via Vite dev server (configured in playwright.config.mjs),
 * asserts DOM structure, state transitions, loading/empty/error states.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function section(page, name) {
  return page.locator(`[data-section="${name}"]`);
}

function sectionHeader(page, name) {
  return section(page, name).locator(".git-section-header");
}

function sectionBody(page, name) {
  return section(page, name).locator(".git-section-body");
}

/** Individual rows inside the section body's wrapper div. */
function sectionRows(page, name) {
  return sectionBody(page, name).locator("> div > div");
}

/** The "Show more" button inside the commits section. */
function showMore(page) {
  return sectionBody(page, "commits").locator("div", { hasText: "Show more" }).last();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Git Repository Demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the git panel to render
    await page.waitForSelector("[data-section='branches']", { timeout: 10000 });
  });

  test("Page loads with git panel visible", async ({ page }) => {
    // All three sections should exist
    await expect(section(page, "branches")).toBeVisible();
    await expect(section(page, "commits")).toBeVisible();
    await expect(section(page, "files")).toBeVisible();

    // Repo header should show "openp41ge"
    await expect(page.locator(".repo-header")).toContainText("openp41ge");

    // Console log should be visible
    await expect(page.locator(".demo-console")).toBeVisible();
  });

  test("Branches section renders with branch entries", async ({ page }) => {
    const rows = sectionRows(page, "branches");
    const count = await rows.count();
    expect(count).toBeGreaterThan(3);

    // Should show branch names
    await expect(sectionBody(page, "branches")).toContainText("main");
    await expect(sectionBody(page, "branches")).toContainText("feature/file-editor");
  });

  test("Branch selection switches branch and updates commits", async ({ page }) => {
    // Click "feature/file-editor" branch
    const rows = sectionRows(page, "branches");
    const target = rows.filter({ hasText: "feature/file-editor" }).first();
    await target.click();

    // Wait for simulated 600ms loading
    await page.waitForTimeout(800);

    // Console should show the selection
    await expect(page.locator(".demo-console-body")).toContainText(
      "Selected branch: refs/heads/feature/file-editor",
    );

    // Commits section should now show commits (not loading)
    const commitsSection = sectionBody(page, "commits");
    await expect(commitsSection).not.toContainText("Loading commits");
  });

  test("Commits section renders with commit entries", async ({ page }) => {
    const rows = sectionRows(page, "commits");
    const count = await rows.count();
    // Should have multiple commit rows (at least 1 commit, but likely 6 + show more)
    expect(count).toBeGreaterThanOrEqual(1);

    // Should show "Show more" button (16 total commits, 6 visible)
    await expect(showMore(page)).toBeVisible();
  });

  test("Commit selection switches commit and shows files", async ({ page }) => {
    const commitsRows = sectionRows(page, "commits");

    // First commit should be auto-selected — files should be showing immediately
    const filesSection = sectionBody(page, "files");
    await expect(filesSection).not.toContainText("Loading files");
    await expect(filesSection).not.toContainText("No changed files");

    // Click the second commit
    const secondCommit = commitsRows.nth(1);
    await secondCommit.click();

    // Wait for simulated 300ms file loading
    await page.waitForTimeout(600);

    // Console should show the selection
    await expect(page.locator(".demo-console-body")).toContainText("Selected commit:");

    // Files section should still show files (not loading)
    await expect(filesSection).not.toContainText("Loading files");
    await expect(filesSection).not.toContainText("No changed files");

    // Click the second commit again — should stay selected (radio behavior)
    await secondCommit.click();
    await page.waitForTimeout(200);
    await expect(filesSection).not.toContainText("Loading files");
  });

  test('"Show more" loads more commits', async ({ page }) => {
    const rows = sectionRows(page, "commits");
    const initialCount = await rows.count();

    // Click "Show more"
    await showMore(page).click();

    // Wait for re-render
    await page.waitForTimeout(300);

    // Commit count should have increased
    const newCount = await rows.count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  test("Section collapse/expand", async ({ page }) => {
    const header = sectionHeader(page, "branches");
    const body = sectionBody(page, "branches");

    // Body should be visible initially
    await expect(body).toBeVisible();

    // Click header to collapse
    await header.click();
    await page.waitForTimeout(100);

    // Body should now be hidden
    await expect(body).not.toBeVisible();

    // Click header to expand again
    await header.click();
    await page.waitForTimeout(100);

    // Body should be visible again
    await expect(body).toBeVisible();
  });

  test("Empty state for no branches", async ({ page }) => {
    // Click "Clear branches" button
    await page.click("#btn-clear-branches");
    await page.waitForTimeout(200);

    await expect(sectionBody(page, "branches")).toContainText("No branches");
  });

  test("Loading state shows spinner", async ({ page }) => {
    // Click "Loading branches" button
    await page.click("#btn-load-branches");
    await page.waitForTimeout(200);

    // Spinner should be visible in branches header
    await expect(section(page, "branches").locator(".git-section-spinner")).toBeVisible();
  });

  test("Error state with retry", async ({ page }) => {
    // Click "Show error state" button
    await page.click("#btn-show-error");
    await page.waitForTimeout(200);

    // Error message should be visible in the git panel
    await expect(page.locator(".demo-git-panel")).toContainText("Failed to load git data");

    // Retry button should exist and be clickable
    const retryBtn = page.locator(".demo-git-panel button", { hasText: "Retry" });
    await expect(retryBtn).toBeVisible();

    // Click retry
    await retryBtn.click();
    await page.waitForTimeout(200);

    // Normal state should restore — branches section should be back with content
    await expect(sectionRows(page, "branches")).not.toHaveCount(0);
  });

  test("Console log shows callback activity", async ({ page }) => {
    const consoleBody = page.locator(".demo-console-body");

    // Click a branch to trigger callback
    const branchRow = sectionRows(page, "branches")
      .filter({ hasText: "feature/drag-ghost" })
      .first();
    await branchRow.click();
    await page.waitForTimeout(800);

    // Console should show the event
    await expect(consoleBody).toContainText("Selected branch:");
  });
});
