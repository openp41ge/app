// @vitest-environment node
/**
 * Integration tests for workspace serialization round-trips.
 *
 * Verifies that serialize() + deserialize() produces an identical workspace
 * state, including migrated formats (old worksets format → new grid format).
 */

import { describe, it, expect } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";

describe("Serialization round-trip", () => {
  describe("Basic round-trip", () => {
    it("serialize then deserialize produces identical workspace", () => {
      const ws = types.createWorkspace("ws-roundtrip-basic");
      const winId = ws.windows[0].id;

      // Add some state
      const t1 = types.createTab("t1", "terminal", "Terminal");
      const r = ops.addTabToCell(ws, winId, t1, 0, 0);

      const json = ops.serialize(r);
      const deserialized = ops.deserialize(json);

      expect(deserialized.id).toBe(r.id);
      expect(deserialized.windows).toHaveLength(r.windows.length);
      expect(deserialized.editorTabs["t1"]).toBeDefined();
      expect(deserialized.editorTabs["t1"]?.title).toBe("Terminal");
      expect(deserialized.editorTabs["t1"]?.config).toEqual({});
    });

    it("preserves tab config after round-trip", () => {
      const ws = types.createWorkspace("ws-roundtrip-config");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "Terminal", { cwd: "/home/user" });
      const r = ops.registerTab(ws, t1);

      const json = ops.serialize(r);
      const deserialized = ops.deserialize(json);

      expect(deserialized.editorTabs["t1"]?.config?.cwd).toBe("/home/user");
    });

    it("preserves complex multi-window state", () => {
      const ws = types.createWorkspace("ws-roundtrip-complex");
      const winId1 = ws.windows[0].id;

      // Build multi-window state with tabs, overlays, sidebar
      let r = ops.addWindow(ws, "w2");

      // Add tabs to win1
      const t1 = types.createTab("t1", "terminal", "Terminal");
      const t2 = types.createTab("t2", "markdown", "Markdown");
      r = ops.addTabToCell(r, winId1, t1, 0, 0);
      r = ops.addTabToCell(r, winId1, t2, 0, 0);

      // Add tabs to w2
      const t3 = types.createTab("t3", "video", "Video");
      r = ops.addTabToCell(r, "w2", t3, 0, 0);

      // Add overlay to w2
      const oTab = types.createTab("o1", "notes", "Notes");
      r = ops.createOverlay(r, "w2", oTab, "top-right");

      // Set sidebar state (open explorer system tab — pinned so it survives serialization)
      r = ops.openSystemTab(r, winId1, "right", "explorer", "Explorer", true);

      const json = ops.serialize(r);
      const deserialized = ops.deserialize(json);

      // Verify structure
      expect(deserialized.windows).toHaveLength(2);
      expect(Object.keys(deserialized.editorTabs)).toHaveLength(4); // t1, t2, t3, o1

      // Verify tabs in win1
      const dWin1 = deserialized.windows[0];
      expect(dWin1.grid.placements[0].tabIds).toContain("t1");
      expect(dWin1.grid.placements[0].tabIds).toContain("t2");

      // Verify tabs in w2
      const dWin2 = deserialized.windows[1];
      expect(dWin2.grid.placements[0].tabIds).toContain("t3");

      // Verify overlay
      expect(dWin2.overlays).toHaveLength(1);
      expect(dWin2.overlays[0].tab.id).toBe("o1");
      expect(dWin2.overlays[0].position).toBe("top-right");

      // Verify sidebar — only the system tab we opened (no defaults)
      expect(dWin1.sidebar?.rightSidebarTabs).toHaveLength(1);
      expect(dWin1.sidebar?.rightSidebarOpen).toBe(true);
      expect(dWin1.sidebar?.activeRightTab).toBeDefined();
    });

    it("serialize returns valid JSON string", () => {
      const ws = types.createWorkspace("ws-serialize-json");
      const json = ops.serialize(ws);

      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.id).toBe("ws-serialize-json");
    });
  });

  describe("Migration from old worksets format", () => {
    it("migrates worksets-based window to new grid format", () => {
      // Old format: window has `worksets` array instead of `grid`
      const oldJson = JSON.stringify({
        id: "ws-migrated",
        windows: [
          {
            id: "win-old-0",
            bounds: { x: 0, y: 0, width: 1280, height: 800 },
            worksets: [
              {
                id: "ws-old-0",
                name: "default",
                grid: {
                  id: "grid-old",
                  rows: 1,
                  cols: 2,
                  placements: [
                    {
                      tabIds: ["t1"],
                      activeTabId: "t1",
                      position: { row: 0, col: 0 },
                      span: { rowSpan: 1, colSpan: 1 },
                    },
                  ],
                  dividers: { columns: [0.5], rows: [] },
                },
                sidebar: { activeViewId: null, width: 280 },
                repoRefs: [],
              },
            ],
          },
        ],
        tabs: {
          t1: {
            id: "t1",
            appType: "terminal",
            title: "Terminal",
            config: {},
          },
        },
        scopedFolders: [],
      });

      const deserialized = ops.deserialize(oldJson);

      // Should have migrated to new format
      expect(deserialized.id).toBe("ws-migrated");
      expect(deserialized.windows).toHaveLength(1);

      const win = deserialized.windows[0];
      expect(win.grid).toBeDefined();
      expect(win.grid.cols).toBe(2);
      expect(win.grid.placements).toHaveLength(1);
      expect(win.grid.placements[0].tabIds).toContain("t1");
      expect(win.sidebar).toBeDefined();
      expect(win.sidebar.activeViewId).toBeNull();
      expect(win.repoRefs).toEqual([]);
    });

    it("handles empty worksets gracefully", () => {
      const oldJson = JSON.stringify({
        id: "ws-empty-worksets",
        windows: [
          {
            id: "win-empty",
            bounds: { x: 0, y: 0, width: 1280, height: 800 },
            worksets: [],
          },
        ],
        tabs: {},
        scopedFolders: [],
      });

      const deserialized = ops.deserialize(oldJson);
      expect(deserialized.id).toBe("ws-empty-worksets");
      expect(deserialized.windows).toHaveLength(1);

      const win = deserialized.windows[0];
      expect(win.grid).toBeDefined();
      expect(win.grid.placements).toHaveLength(0);
      expect(win.sidebar).toBeDefined();
      expect(win.repoRefs).toEqual([]);
    });

    it("handles window with no worksets and no grid (should create empty grid)", () => {
      const bareJson = JSON.stringify({
        id: "ws-bare",
        windows: [
          {
            id: "win-bare",
            bounds: { x: 0, y: 0, width: 1280, height: 800 },
            // No worksets, no grid
          },
        ],
        tabs: {},
        scopedFolders: [],
      });

      const deserialized = ops.deserialize(bareJson);
      expect(deserialized.id).toBe("ws-bare");
      expect(deserialized.windows).toHaveLength(1);
      expect(deserialized.windows[0].grid).toBeDefined();
      expect(deserialized.windows[0].grid.placements).toHaveLength(0);
    });
  });

  describe("Round-trip invariance", () => {
    it("double round-trip (serialize → deserialize → serialize → deserialize) produces identical state", () => {
      const ws = types.createWorkspace("ws-double-round");
      const winId = ws.windows[0].id;

      const t1 = types.createTab("t1", "terminal", "Terminal", { cwd: "/home" });
      let r = ops.addTabToCell(ws, winId, t1, 0, 0);

      // Add sidebar
      r = ops.openSystemTab(r, winId, "right", "explorer", "Explorer");

      // First round-trip
      const json1 = ops.serialize(r);
      const r1 = ops.deserialize(json1);

      // Second round-trip
      const json2 = ops.serialize(r1);
      const r2 = ops.deserialize(json2);

      // Compare critical properties
      expect(r2.id).toBe(r1.id);
      expect(r2.windows).toHaveLength(r1.windows.length);

      const w1 = r1.windows[0];
      const w2 = r2.windows[0];
      expect(w2.grid.placements).toHaveLength(w1.grid.placements.length);
      expect(w2.grid.cols).toBe(w1.grid.cols);
      expect(w2.sidebar?.rightSidebarOpen).toBe(w1.sidebar?.rightSidebarOpen);

      // Tab properties
      const t1_1 = r1.editorTabs["t1"];
      const t1_2 = r2.editorTabs["t1"];
      expect(t1_2?.appType).toBe(t1_1?.appType);
      expect(t1_2?.title).toBe(t1_1?.title);
    });
  });
});
