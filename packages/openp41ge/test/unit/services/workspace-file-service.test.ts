import { describe, it, expect, beforeEach } from "vitest";
import {
  WorkspaceFileService,
  workspaceMatchesQuery,
} from "../../../src/renderer/services/workspace-file-service";
import type { WorkspaceFileData } from "../../../src/layout/types";

function wsData(overrides: Partial<{ name?: string }> = {}): {
  id: string;
  name?: string;
  version: number;
  createdAt: string;
  dataDir: string;
  repos: Array<{ url: string; worktrees: string[] }>;
} {
  return { id: "1", version: 1, createdAt: "", dataDir: "", repos: [], ...overrides };
}

describe("WorkspaceFileService.activeWorkspaceName", () => {
  let svc: WorkspaceFileService;

  beforeEach(() => {
    svc = new WorkspaceFileService();
  });

  it("uses data.name when set (trimmed)", () => {
    svc.activeFilePath = "~/.openp41ge/workspaces/x.openp41ge-workspace";
    svc.activeData = wsData({ name: "  My Workspace  " });
    expect(svc.activeWorkspaceName).toBe("My Workspace");
  });

  it("falls back to the file basename (minus extension) when no name is set", () => {
    svc.activeFilePath = "~/.openp41ge/workspaces/abc.openp41ge-workspace";
    svc.activeData = wsData();
    expect(svc.activeWorkspaceName).toBe("abc");
  });

  it("falls back to the basename when name is only whitespace", () => {
    svc.activeFilePath = "~/dir/foo.openp41ge-workspace";
    svc.activeData = wsData({ name: "   " });
    expect(svc.activeWorkspaceName).toBe("foo");
  });

  it("returns 'No workspace' when nothing is active", () => {
    expect(svc.activeWorkspaceName).toBe("No workspace");
  });
});

describe("workspaceMatchesQuery", () => {
  const data = (overrides: Partial<WorkspaceFileData> = {}): WorkspaceFileData => ({
    id: "1",
    name: "Alpha",
    version: 1,
    createdAt: "",
    dataDir: "",
    repos: [
      { url: "https://github.com/acme/widget.git", worktrees: ["main", "feature/xyz"] },
    ],
    ...overrides,
  });

  it.each([
    ["", true],
    ["   ", true],
    ["alpha", true],
    ["al", true],
    ["widget", true],
    ["acme/widget", true],
    ["feature/xyz", true],
    ["main", true],
    ["nothing-here", false],
  ])("query %j -> %s", (q, expected) => {
    expect(workspaceMatchesQuery(data(), "/x/alpha.openp41ge-workspace", q)).toBe(expected);
  });

  it("matches on the file basename when the workspace has no name", () => {
    const d = data({ name: undefined });
    expect(workspaceMatchesQuery(d, "~/.openp41ge/workspaces/zzz.openp41ge-workspace", "zzz")).toBe(
      true,
    );
  });
});
