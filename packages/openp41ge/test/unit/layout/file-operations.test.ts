// @ts-nocheck
/**
 * Unit tests for layout file operations — actionOpenFileInNewWindow.
 *
 * Verifies that a file dropped outside any window creates a new window that
 * copies the source window's non-editor chrome (sidebar tabs, repo list) while
 * starting with a fresh central grid containing only the dropped file.
 */

import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";

/** Open Explorer + Git in the right sidebar of a window, plus a file in the grid. */
function buildSourceWs() {
  const ws = types.createWorkspace("ws1");
  let result = ops.openSystemTab(ws, ws.windows[0].id, "right", "explorer", "Explorer", true);
  result = ops.openSystemTab(result, ws.windows[0].id, "right", "git", "Git", true);
  const tab = types.createTab("p1", "file-viewer", "app.ts", { filePath: "/src/app.ts" });
  result = ops.addTabToCell(result, ws.windows[0].id, tab, 0, 0);
  return result;
}

describe("splitFileOpen empty-grid guard", () => {
  test("fills column 0 full-width without creating an empty cell on an empty grid", () => {
    const ws = types.createWorkspace("ws1");
    const winId = ws.windows[0].id;
    // empty grid has no placements
    expect(ws.windows[0].grid.placements).toEqual([]);

    // boundary drop on the right side of the empty grid (splitCol 0, splitLeft false)
    const result = ops.splitFileOpen(ws, winId, "file-viewer", "app.ts", "/src/app.ts", 0, false);

    const grid = result.windows[0].grid;
    // No split: still a single full-width column (no empty neighbour)
    expect(grid.cols).toBe(1);
    expect(grid.placements).toHaveLength(1);
    const p = grid.placements[0];
    expect(p.position.col).toBe(0);
    expect(p.tabIds).toHaveLength(1);
    const tab = result.editorTabs[p.tabIds[0] as string];
    expect(tab?.appType).toBe("file-viewer");
    expect(tab?.config?.filePath).toBe("/src/app.ts");
  });

  test("still splits when the target grid already has tabs", () => {
    const ws = types.createWorkspace("ws1");
    let r = ops.addTabToCell(ws, ws.windows[0].id, types.createTab("p1", "terminal", "t"), 0, 0);
    r = ops.splitFileOpen(r, ws.windows[0].id, "file-viewer", "app.ts", "/src/app.ts", 0, false);
    const grid = r.windows[0].grid;
    expect(grid.cols).toBe(2);
    expect(grid.placements).toHaveLength(2);
    expect(grid.placements.some((pl) => pl.position.col === 0)).toBe(true);
    expect(grid.placements.some((pl) => pl.position.col === 1)).toBe(true);
  });
});

describe("actionOpenFileInNewWindow", () => {
  test("creates a new window in the same workspace with the file in its grid", () => {
    const src = buildSourceWs();
    const srcWin = src.windows[0];

    const result = ops.actionOpenFileInNewWindow(src, "/src/other.ts", "other.ts", srcWin.id);

    const newWin = result.windows.find((w) => w.id !== srcWin.id);
    expect(newWin).toBeDefined();
    // Same workspace — window count grows by exactly one
    expect(result.windows).toHaveLength(src.windows.length + 1);
    // New grid has exactly one placement, holding the dropped file
    expect(newWin.grid.placements).toHaveLength(1);
    const p = newWin.grid.placements[0];
    expect(p.tabIds).toHaveLength(1);
    const tab = result.editorTabs[p.tabIds[0]];
    expect(tab?.appType).toBe("file-viewer");
    expect(tab?.config?.filePath).toBe("/src/other.ts");
  });

  test("copies the source window's sidebar tabs and open state", () => {
    const src = buildSourceWs();
    const srcWin = src.windows[0];

    const result = ops.actionOpenFileInNewWindow(src, "/a.ts", "a.ts", srcWin.id);
    const newWin = result.windows.find((w) => w.id !== srcWin.id);

    expect(newWin.sidebar.rightSidebarTabs).toEqual(srcWin.sidebar.rightSidebarTabs);
    expect(newWin.sidebar.rightSidebarOpen).toBe(srcWin.sidebar.rightSidebarOpen);
    expect(newWin.sidebar.leftSidebarOpen).toBe(srcWin.sidebar.leftSidebarOpen);
    // Each copied string array is a distinct reference (no aliasing)
    expect(newWin.sidebar.rightSidebarTabs).not.toBe(srcWin.sidebar.rightSidebarTabs);
  });

  test("copies the source window's repo refs", () => {
    const src = buildSourceWs();
    const srcWin = src.windows[0];
    srcWin.repoRefs = [{ name: "repo1", url: "github.com/repo1", worktrees: ["main", "dev"] }];

    const result = ops.actionOpenFileInNewWindow(src, "/a.ts", "a.ts", srcWin.id);
    const newWin = result.windows.find((w) => w.id !== srcWin.id);

    expect(newWin.repoRefs).toEqual([
      { name: "repo1", url: "github.com/repo1", worktrees: ["main", "dev"] },
    ]);
    expect(newWin.repoRefs).not.toBe(srcWin.repoRefs);
    expect(newWin.repoRefs[0].worktrees).not.toBe(srcWin.repoRefs[0].worktrees);
  });

  test("without a source window the new window has an empty default sidebar", () => {
    const src = buildSourceWs();
    const srcWin = src.windows[0];

    const result = ops.actionOpenFileInNewWindow(src, "/a.ts", "a.ts");
    const newWin = result.windows.find((w) => w.id !== srcWin.id);

    expect(newWin.sidebar.rightSidebarTabs).toEqual([]);
    expect(newWin.repoRefs).toEqual([]);
  });
});
