/**
 * Unit tests for the v2 workspace-file session module.
 *
 * Verifies the manifest+session model: v1 → v2 migration, extraction of the
 * layout `Workspace` into a workspace file, rebuilding a layout `Workspace`
 * from a file, and JSON round-tripping. All pure — no I/O.
 */

import { describe, it, expect } from "vitest";
import {
  createTab,
  createWorkspace,
  createWindow,
  createSidebarTab,
} from "@openp41ge/layout/types";
import {
  WORKSPACE_FILE_VERSION,
  migrateWorkspaceFileData,
  workspaceToFileData,
  fileDataToWorkspace,
  extractWorkspaceSession,
  emptySharedSidebars,
  serializeWorkspaceFile,
  deserializeWorkspaceFile,
} from "@openp41ge/layout/workspace-file";

const V1_MANIFEST = {
  id: "u-123",
  name: "Acme",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  dataDir: "~/.openp41ge/workspaces-data/u-123",
  repos: [{ url: "git@example.com:acme.git", worktrees: ["main"] }],
};

/** Build a layout Workspace with two windows, a tab, and a system tab. */
function sampleWorkspace() {
  const ws = createWorkspace("ws1");
  const tab = createTab("tab-1", "file-viewer", "app.ts", { filePath: "/w/app.ts" });
  const w0 = ws.windows[0];
  const grid = {
    ...w0.grid,
    placements: [
      {
        tabIds: [tab.id],
        activeTabId: tab.id,
        position: { row: 0, col: 0 },
        span: { rowSpan: 1, colSpan: 1 },
      },
    ],
  };
  const w1 = createWindow("win-ws1-1");
  ws.windows = [
    { ...w0, grid, bounds: { x: 0, y: 0, width: 1280, height: 860 } },
    { ...w1, bounds: { x: 200, y: 80, width: 1000, height: 700 } },
  ];
  ws.editorTabs = { [tab.id]: tab };
  ws.systemTabs = {
    explorer: createSidebarTab("explorer", "explorer", "Explorer", true),
  };
  ws.scopedFolders = ["/w"];
  return ws;
}

describe("migrateWorkspaceFileData", () => {
  it("upgrades a v1 manifest-only file to v2 with empty session defaults", () => {
    const migrated = migrateWorkspaceFileData(V1_MANIFEST);
    expect(migrated.version).toBe(WORKSPACE_FILE_VERSION);
    expect(migrated.windows).toEqual([]);
    expect(migrated.systemTabs).toEqual({});
    expect(migrated.editorTabs).toEqual({});
    expect(migrated.tabGroups).toEqual({});
    expect(migrated.scopedFolders).toEqual([]);
    expect(migrated.sharedSidebars).toEqual(emptySharedSidebars());
    // Manifest fields preserved.
    expect(migrated.name).toBe("Acme");
    expect(migrated.repos).toHaveLength(1);
  });

  it("preserves existing session fields and never throws on garbage input", () => {
    const withSession = migrateWorkspaceFileData({
      ...V1_MANIFEST,
      windows: [],
      sharedSidebars: emptySharedSidebars(),
    });
    expect(withSession.windows).toEqual([]);
    expect(migrateWorkspaceFileData(null).windows).toEqual([]);
    expect(migrateWorkspaceFileData("nope").repos).toEqual([]);
  });
});

describe("workspaceToFileData / fileDataToWorkspace round-trip", () => {
  it("extracts the session into the file and rebuilds an equivalent Workspace", () => {
    const ws = sampleWorkspace();
    const file = workspaceToFileData(ws, V1_MANIFEST);

    expect(file.version).toBe(WORKSPACE_FILE_VERSION);
    expect(file.windows).toHaveLength(2);
    expect(file.systemTabs?.explorer).toBeDefined();
    expect(file.sharedSidebars?.rightSidebarOpen).toBe(false);

    const rebuilt = fileDataToWorkspace(file);
    expect(rebuilt.windows).toHaveLength(2);
    expect(rebuilt.windows[0].bounds).toEqual({ x: 0, y: 0, width: 1280, height: 860 });
    expect(rebuilt.windows[1].bounds).toEqual({ x: 200, y: 80, width: 1000, height: 700 });
    // Central grid placements are preserved per window.
    expect(rebuilt.windows[0].grid.placements).toHaveLength(1);
    expect(rebuilt.windows[0].grid.placements[0].tabIds).toEqual(["tab-1"]);
    expect(rebuilt.windows[1].grid.placements).toHaveLength(0);
    // Workspace-shared state is preserved.
    expect(rebuilt.editorTabs["tab-1"]).toBeDefined();
    expect(rebuilt.systemTabs["explorer"]).toBeDefined();
    expect(rebuilt.scopedFolders).toEqual(["/w"]);
  });

  it("does not mutate the source workspace when extracting the session", () => {
    const ws = sampleWorkspace();
    const before = JSON.stringify(ws);
    workspaceToFileData(ws, V1_MANIFEST);
    expect(JSON.stringify(ws)).toBe(before);
  });

  it("rebuilds an empty workspace when the file has no windows", () => {
    const file = migrateWorkspaceFileData(V1_MANIFEST);
    const rebuilt = fileDataToWorkspace(file);
    expect(rebuilt.windows).toHaveLength(0);
    expect(rebuilt.editorTabs).toEqual({});
  });
});

describe("extractWorkspaceSession", () => {
  it("derives shared sidebars from the first window (pre-split heuristic)", () => {
    const ws = sampleWorkspace();
    const session = extractWorkspaceSession(ws);
    expect(session.windows).toHaveLength(2);
    expect(session.sharedSidebars.leftSidebarTabs).toEqual([]);
  });
});

describe("serialize / deserialize", () => {
  it("JSON round-trips the full file, migrating on the way back", () => {
    const file = workspaceToFileData(sampleWorkspace(), V1_MANIFEST);
    const json = serializeWorkspaceFile(file);
    const back = deserializeWorkspaceFile(json);
    expect(back.version).toBe(WORKSPACE_FILE_VERSION);
    expect(back.windows).toHaveLength(2);
    expect(back.systemTabs?.explorer).toBeDefined();
  });
});
