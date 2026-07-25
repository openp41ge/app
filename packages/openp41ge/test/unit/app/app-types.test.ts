/**
 * Unit tests for app-types.ts — metadata registry for pane app types.
 *
 * No mocking needed since this module has no external dependencies.
 *
 * Coverage target: 100% statements, branches, functions, lines.
 */

import { APP_TYPES } from "@openp41ge/renderer/app-types";

describe("APP_TYPES (unit)", () => {
  test("contains all expected app types", () => {
    const ids = APP_TYPES.map((t) => t.id);
    expect(ids).toContain("terminal");
    expect(ids).toContain("file-explorer");
    expect(ids).toContain("markdown");
    expect(ids).toContain("table");
    expect(ids).toContain("video");
  });

  test("each app type has required fields", () => {
    for (const appType of APP_TYPES) {
      expect(appType.id).toBeTruthy();
      expect(appType.label).toBeTruthy();
      expect(appType.icon).toBeTruthy();
      expect(typeof appType.description).toBe("string");
    }
  });

  test("no duplicate IDs", () => {
    const ids = APP_TYPES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("no duplicate labels", () => {
    const labels = APP_TYPES.map((t) => t.label);
    const uniqueLabels = new Set(labels);
    expect(uniqueLabels.size).toBe(labels.length);
  });

  test("APP_TYPES array is not empty", () => {
    expect(APP_TYPES.length).toBeGreaterThan(0);
  });
});
