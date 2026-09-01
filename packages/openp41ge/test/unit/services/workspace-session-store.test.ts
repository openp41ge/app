// @vitest-environment jsdom
/**
 * Unit tests for FileWorkspaceSessionStore — persists a workspace's layout
 * session into its own `.openp41ge-workspace` file (manifest + session).
 *
 * Uses injected in-memory fs mocks so no disk is touched.
 */

import { describe, it, expect } from "vitest";
import { FileWorkspaceSessionStore } from "../../../src/main/services/workspace-session-store";
import { createWorkspace } from "../../../src/layout/types";

function makeMockFs(): {
  files: Map<string, string>;
  readFile: (p: string) => string;
  writeFile: (p: string, data: string) => void;
  exists: (p: string) => boolean;
} {
  const files = new Map<string, string>();
  return {
    files,
    readFile: (p: string) => {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return files.get(p)!;
    },
    writeFile: (p: string, data: string) => void files.set(p, data),
    exists: (p: string) => files.has(p),
  };
}

const BASE_FILE = {
  id: "abc-123",
  name: "Acme",
  version: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  dataDir: "/w",
  repos: [{ url: "https://example.com/acme.git", worktrees: ["main"] }],
};

describe("FileWorkspaceSessionStore", () => {
  it("saves the merged manifest + session to a bound workspace file", () => {
    const mock = makeMockFs();
    mock.files.set("/w/acme.openp41ge-workspace", JSON.stringify(BASE_FILE));
    const store = new FileWorkspaceSessionStore(mock.readFile, mock.writeFile, mock.exists);

    const ws = createWorkspace("ws1");
    store.setCurrentWorkspacePath("/w/acme.openp41ge-workspace");
    store.save(ws);

    const written = JSON.parse(mock.files.get("/w/acme.openp41ge-workspace")!);
    // Manifest preserved.
    expect(written.name).toBe("Acme");
    expect(written.repos).toEqual(BASE_FILE.repos);
    // Session written back.
    expect(written.version).toBe(2);
    expect(written.windows.length).toBe(1);
    expect(written.windows[0].id).toBe("win-ws1-0");
  });

  it("is a no-op save when no workspace path is bound", () => {
    const mock = makeMockFs();
    const store = new FileWorkspaceSessionStore(mock.readFile, mock.writeFile, mock.exists);
    store.save(createWorkspace("ws1"));
    expect(mock.files.size).toBe(0);
  });

  it("loads a layout workspace back from a workspace file", () => {
    const mock = makeMockFs();
    mock.files.set(
      "/w/acme.openp41ge-workspace",
      JSON.stringify({ ...BASE_FILE, windows: [{ id: "win-restore-0", bounds: { x: 0, y: 0, width: 1000, height: 700 }, monitor: 0, grid: { id: "g", rows: 1, cols: 1, placements: [], dividers: { columns: [], rows: [] } }, overlays: [], sidebar: { activeViewId: null, width: 280, activeLeftTab: null, activeRightTab: null } }] }),
    );
    const store = new FileWorkspaceSessionStore(mock.readFile, mock.writeFile, mock.exists);

    const ws = store.load("/w/acme.openp41ge-workspace");
    expect(ws).not.toBeNull();
    expect(ws!.windows).toHaveLength(1);
    expect(ws!.windows[0].id).toBe("win-restore-0");
  });

  it("returns null for a missing or unparseable file", () => {
    const mock = makeMockFs();
    const store = new FileWorkspaceSessionStore(mock.readFile, mock.writeFile, mock.exists);
    expect(store.load("/w/missing.openp41ge-workspace")).toBeNull();

    mock.files.set("/w/bad.openp41ge-workspace", "{not json");
    expect(store.load("/w/bad.openp41ge-workspace")).toBeNull();
  });
});
