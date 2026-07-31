// @vitest-environment node
/**
 * Integration tests for tab placement — verifying that creating tabs
 * respects cell capacity, overflow behavior, and preview replacement.
 *
 * These tests exercise the real openTabInCell, actionOpenFile, and
 * actionAddTab functions with sequences that test placement invariants.
 */

import { describe, it, expect } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";

describe("Tab placement invariants", () => {
  describe("Cell capacity and stacking", () => {
    it("can hold multiple tabs in a single cell", () => {
      const ws = types.createWorkspace("ws-stack");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "Terminal");
      const t2 = types.createTab("t2", "markdown", "Markdown");
      const t3 = types.createTab("t3", "video", "Video");

      let r = ops.addTabToCell(ws, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 0);
      r = ops.addTabToCell(r, winId, t3, 0, 0);

      const placement = r.windows[0].grid.placements[0];
      expect(placement.tabIds).toHaveLength(3);
      expect(placement.tabIds).toEqual(["t1", "t2", "t3"]);
    });

    it("opens multiple tabs in different cells when grid is expanded", () => {
      const ws = types.createWorkspace("ws-multi-cell");
      const winId = ws.windows[0].id;

      let r = ops.resizeGrid(ws, winId, 1, 3);
      const t1 = types.createTab("t1", "terminal", "T1");
      const t2 = types.createTab("t2", "markdown", "T2");
      const t3 = types.createTab("t3", "video", "T3");

      r = ops.addTabToCell(r, winId, t1, 0, 0);
      r = ops.addTabToCell(r, winId, t2, 0, 1);
      r = ops.addTabToCell(r, winId, t3, 0, 2);

      expect(r.windows[0].grid.placements).toHaveLength(3);
      r.windows[0].grid.placements.forEach((p) => {
        expect(p.tabIds).toHaveLength(1);
      });
    });
  });

  describe("Overflow behavior", () => {
    it("actionAddTab adds a new row when grid is full", () => {
      const ws = types.createWorkspace("ws-overflow");
      const winId = ws.windows[0].id;

      // Fill the single cell in 1×1 grid
      let r = ops.actionAddTab(ws, winId, "t1", "terminal");
      expect(r.windows[0].grid.placements).toHaveLength(1);
      expect(r.windows[0].grid.rows).toBe(1);

      // Second actionAddTab should add a row (grid is full)
      r = ops.actionAddTab(r, winId, "t2", "markdown");
      expect(r.windows[0].grid.rows).toBe(2);
      expect(r.windows[0].grid.placements).toHaveLength(2);
    });

    it("addColumnTab adds a new column when grid is full", () => {
      const ws = types.createWorkspace("ws-col-overflow");
      const winId = ws.windows[0].id;

      // Fill the single cell
      let r = ops.addColumnTab(ws, winId, "terminal");
      expect(r.windows[0].grid.cols).toBe(1);

      // Second addColumnTab should add a column
      r = ops.addColumnTab(r, winId, "markdown");
      expect(r.windows[0].grid.cols).toBe(2);
      expect(r.windows[0].grid.placements).toHaveLength(2);
    });
  });

  describe("Preview tab management via openTabInCell", () => {
    it("opens a pinned (edit) tab in an empty cell", () => {
      const ws = types.createWorkspace("ws-pinned");
      const winId = ws.windows[0].id;

      const result = ops.openTabInCell(
        ws,
        winId,
        "file-viewer",
        "test.ts",
        "/test.ts",
        0,
        true, // pinned
      );

      const placement = result.windows[0].grid.placements[0];
      expect(placement).toBeDefined();
      expect(placement.tabIds).toHaveLength(1);
      const tabId = placement.tabIds[0];
      expect(result.editorTabs[tabId].isPreview).toBe(false);
      expect(result.editorTabs[tabId].appType).toBe("file-viewer");
    });

    it("opens an unpinned (preview) tab and marks it as preview", () => {
      const ws = types.createWorkspace("ws-preview");
      const winId = ws.windows[0].id;

      const result = ops.openTabInCell(
        ws,
        winId,
        "file-viewer",
        "test.ts",
        "/test.ts",
        0,
        false, // unpinned → preview
      );

      const placement = result.windows[0].grid.placements[0];
      const tabId = placement.tabIds[0];
      expect(result.editorTabs[tabId].isPreview).toBe(true);
    });

    it("replaces an existing preview tab when opening a new unpinned tab", () => {
      const ws = types.createWorkspace("ws-replace-preview");
      const winId = ws.windows[0].id;

      // Open first preview tab
      let r = ops.openTabInCell(ws, winId, "file-viewer", "first.ts", "/first.ts", 0, false);

      const firstTabId = r.windows[0].grid.placements[0].tabIds[0];
      expect(r.editorTabs[firstTabId].isPreview).toBe(true);

      // Open second preview tab — should replace the first
      r = ops.openTabInCell(r, winId, "file-viewer", "second.ts", "/second.ts", 0, false);

      const placement = r.windows[0].grid.placements[0];
      // The new tab replaces the old preview tab
      const currentTabId = placement.tabIds[0];
      expect(currentTabId).not.toBe(firstTabId);
      expect(r.editorTabs[currentTabId].isPreview).toBe(true);
      expect(r.editorTabs[currentTabId].config?.filePath).toBe("/second.ts");

      // The old preview tab should no longer be in the workspace tabs
      expect(r.editorTabs[currentTabId]).toBeDefined();
    });

    it("does not replace preview tab when opening a pinned (edit) tab", () => {
      const ws = types.createWorkspace("ws-pinned-after-preview");
      const winId = ws.windows[0].id;

      // Open a preview tab first
      let r = ops.openTabInCell(ws, winId, "file-viewer", "preview.ts", "/preview.ts", 0, false);

      const firstTabId = r.windows[0].grid.placements[0].tabIds[0];

      // Open a pinned tab in the same cell — it joins the existing tab(s)
      r = ops.openTabInCell(r, winId, "file-viewer", "edit.ts", "/edit.ts", 0, true);

      const placement = r.windows[0].grid.placements[0];
      expect(placement.tabIds).toHaveLength(2);
      expect(placement.tabIds).toContain(firstTabId);
    });

    it("expands grid when opening at a column beyond current grid", () => {
      const ws = types.createWorkspace("ws-expand-col");
      const winId = ws.windows[0].id;

      const result = ops.openTabInCell(
        ws,
        winId,
        "file-viewer",
        "file.ts",
        "/file.ts",
        5, // target col beyond current 1-col grid
        true,
      );

      expect(result.windows[0].grid.cols).toBe(6);
      const placement = result.windows[0].grid.placements.find((p) => p.position.col === 5);
      expect(placement).toBeDefined();
    });
  });

  describe("Preview tab detection", () => {
    it("findPreviewTabInCell returns null when no preview tab exists", () => {
      const ws = types.createWorkspace("ws-find-preview");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "Terminal");
      const r = ops.addTabToCell(ws, winId, t1, 0, 0);

      const preview = ops.findPreviewTabInCell(r, winId, 0);
      expect(preview).toBeNull();
    });

    it("findPreviewTabInCell finds preview tab when one exists", () => {
      const ws = types.createWorkspace("ws-find-preview2");
      const winId = ws.windows[0].id;

      const r = ops.openTabInCell(
        ws,
        winId,
        "file-viewer",
        "test.ts",
        "/test.ts",
        0,
        false, // preview
      );

      const preview = ops.findPreviewTabInCell(r, winId, 0);
      expect(preview).not.toBeNull();
    });
  });

  describe("actionOpenFile — file open flow", () => {
    it("opens a file in a new column when no target column exists", () => {
      const ws = types.createWorkspace("ws-open-file");
      const winId = ws.windows[0].id;

      const result = ops.actionOpenFile(
        ws,
        winId,
        "file-viewer",
        "test.ts",
        "/test.ts",
        undefined, // no target col
        true,
      );

      expect(result.windows[0].grid.placements).toHaveLength(1);
    });

    it("opens a file into an existing file-viewer column when target col not specified", () => {
      const ws = types.createWorkspace("ws-open-file-existing");
      const winId = ws.windows[0].id;

      // First, add a file-viewer to col 0
      let r = ops.actionOpenFile(ws, winId, "file-viewer", "first.ts", "/first.ts", 0, true);

      // Now open another file without specifying target col
      r = ops.actionOpenFile(r, winId, "file-viewer", "second.ts", "/second.ts", undefined, true);

      // Should reuse the existing file-viewer column (col 0)
      const placement = r.windows[0].grid.placements[0];
      expect(placement.tabIds).toHaveLength(2);
      expect(placement.position.col).toBe(0);
    });
  });
});
