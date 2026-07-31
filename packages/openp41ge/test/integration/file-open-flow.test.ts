// @vitest-environment node
/**
 * Integration tests for the file open flow — preview vs edit tab management,
 * actionOpenFile, and actionAddTab orchestration.
 *
 * These tests exercise the real production code paths for opening files
 * and managing preview/edit tab semantics.
 */

import { describe, it, expect } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";

describe("File open flow — preview vs edit", () => {
  describe("actionOpenFile scenarios", () => {
    it("opens a pinned file into a new column with correct config", () => {
      const ws = types.createWorkspace("ws-file-pinned");
      const winId = ws.windows[0].id;

      const result = ops.actionOpenFile(
        ws,
        winId,
        "file-viewer",
        "readme.md",
        "/project/readme.md",
        0, // target col 0
        true, // pinned → edit tab
      );

      const tabId = result.windows[0].grid.placements[0].tabIds[0];
      expect(result.editorTabs[tabId].config?.filePath).toBe("/project/readme.md");
      expect(result.editorTabs[tabId].isPreview).toBe(false);
    });

    it("opens an unpinned (preview) file with isPreview=true", () => {
      const ws = types.createWorkspace("ws-file-preview");
      const winId = ws.windows[0].id;

      const result = ops.actionOpenFile(
        ws,
        winId,
        "file-viewer",
        "quick.ts",
        "/project/quick.ts",
        0,
        false, // unpinned → preview
      );

      const tabId = result.windows[0].grid.placements[0].tabIds[0];
      expect(result.editorTabs[tabId].isPreview).toBe(true);
    });

    it("replaces an existing preview tab with a new unpinned file", () => {
      const ws = types.createWorkspace("ws-preview-replace");
      const winId = ws.windows[0].id;

      // Open first preview file
      let r = ops.actionOpenFile(ws, winId, "file-viewer", "a.ts", "/a.ts", 0, false);
      const firstTabId = r.windows[0].grid.placements[0].tabIds[0];

      // Open second preview file
      r = ops.actionOpenFile(r, winId, "file-viewer", "b.ts", "/b.ts", 0, false);

      const placement = r.windows[0].grid.placements[0];
      const currentTabId = placement.tabIds[0];
      // The old preview tab should have been replaced
      expect(currentTabId).not.toBe(firstTabId);
    });

    it("joins tabs in the same cell when opening a pinned file alongside an existing tab", () => {
      const ws = types.createWorkspace("ws-join");
      const winId = ws.windows[0].id;

      // Add a terminal tab
      const t1 = types.createTab("t1", "terminal", "Terminal");
      let r = ops.addTabToCell(ws, winId, t1, 0, 0);

      // Open a file in the same cell
      r = ops.actionOpenFile(r, winId, "file-viewer", "file.ts", "/file.ts", 0, true);

      const placement = r.windows[0].grid.placements[0];
      expect(placement.tabIds).toHaveLength(2);
      expect(placement.tabIds).toContain("t1");
    });
  });

  describe("Preview tab pinning", () => {
    it("pins a preview tab (removes preview status)", () => {
      const ws = types.createWorkspace("ws-pin-preview");
      const winId = ws.windows[0].id;

      // Open as preview
      let r = ops.openTabInCell(ws, winId, "file-viewer", "preview.md", "/preview.md", 0, false);

      const tabId = r.windows[0].grid.placements[0].tabIds[0];
      expect(r.editorTabs[tabId].isPreview).toBe(true);

      // Pin it
      r = ops.pinTabInCell(r, winId, 0, tabId);
      expect(r.editorTabs[tabId].isPreview).toBe(false);
    });

    it("pinned preview tab is no longer replaced by new preview tab", () => {
      const ws = types.createWorkspace("ws-pin-replace");
      const winId = ws.windows[0].id;

      // Open as preview, then pin it
      let r = ops.openTabInCell(ws, winId, "file-viewer", "keep.md", "/keep.md", 0, false);
      const pinnedTabId = r.windows[0].grid.placements[0].tabIds[0];
      r = ops.pinTabInCell(r, winId, 0, pinnedTabId);

      // Open a new preview — should NOT replace the pinned tab
      r = ops.actionOpenFile(r, winId, "file-viewer", "new.md", "/new.md", 0, false);

      const placement = r.windows[0].grid.placements[0];
      expect(placement.tabIds).toHaveLength(2);
      expect(placement.tabIds).toContain(pinnedTabId);
    });
  });

  describe("actionAddTab integration", () => {
    it("creates a tab with a generated title", () => {
      const ws = types.createWorkspace("ws-add-tab");
      const winId = ws.windows[0].id;

      const result = ops.actionAddTab(ws, winId, "t1", "file-viewer");
      expect(result.editorTabs["t1"].title).toBe("file viewer");
      expect(result.editorTabs["t1"].appType).toBe("file-viewer");
    });

    it("places tab in empty cell when grid has space", () => {
      const ws = types.createWorkspace("ws-add-tab-space");
      const winId = ws.windows[0].id;

      let r = ops.resizeGrid(ws, winId, 2, 2);

      const r1 = ops.actionAddTab(r, winId, "t1", "terminal");
      expect(r1.windows[0].grid.placements).toHaveLength(1);

      const r2 = ops.actionAddTab(r1, winId, "t2", "markdown");
      expect(r2.windows[0].grid.placements).toHaveLength(2);
    });
  });
});
