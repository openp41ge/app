/**
 * Tests for scope expansion utilities used in cross-openp41ge tab relocation.
 */

import { describe, it, expect } from "vitest";
import {
  resolveFileReferences,
  getUncoveredPaths,
  isFileScopedTab,
  parentDirForVisibility,
} from "../../../src/renderer/services/scope-expansion-utils";
import { createTab } from "../../../src/layout/types";

describe("resolveFileReferences", () => {
  it("returns filePath for file-viewer tab", () => {
    const tab = createTab("t1", "file-viewer", "test.ts", {
      filePath: "/Users/me/repos/project-a/src/test.ts",
    });
    const refs = resolveFileReferences(tab);
    expect(refs).toEqual(["/Users/me/repos/project-a/src/test.ts"]);
  });

  it("returns empty array for file-viewer without filePath", () => {
    const tab = createTab("t2", "file-viewer", "untitled");
    const refs = resolveFileReferences(tab);
    expect(refs).toEqual([]);
  });

  it("returns scopeRoots for agent-chat tab", () => {
    const tab = createTab("t3", "agent-chat", "Chat", {
      scopeRoots: ["/Users/me/repos/project-a", "/Users/me/repos/project-b"],
    });
    const refs = resolveFileReferences(tab);
    expect(refs).toEqual(["/Users/me/repos/project-a", "/Users/me/repos/project-b"]);
  });

  it("returns scopeRoot (single) for agent-chat tab", () => {
    const tab = createTab("t4", "agent-chat", "Chat", {
      scopeRoot: "/Users/me/repos/project-a",
    });
    const refs = resolveFileReferences(tab);
    expect(refs).toEqual(["/Users/me/repos/project-a"]);
  });

  it("returns repoPath for git-repository tab", () => {
    const tab = createTab("t5", "git-repository", "project-a", {
      repoPath: "/Users/me/repos/project-a",
    });
    const refs = resolveFileReferences(tab);
    expect(refs).toEqual(["/Users/me/repos/project-a"]);
  });

  it("returns empty array for unscoped tab types", () => {
    const tab = createTab("t6", "terminal", "Terminal");
    const refs = resolveFileReferences(tab);
    expect(refs).toEqual([]);
  });

  it("returns empty array for video tab", () => {
    const tab = createTab("t7", "video", "Video");
    const refs = resolveFileReferences(tab);
    expect(refs).toEqual([]);
  });
});

describe("isFileScopedTab", () => {
  it("returns true for file-viewer with filePath", () => {
    const tab = createTab("t1", "file-viewer", "test.ts", {
      filePath: "/src/test.ts",
    });
    expect(isFileScopedTab(tab)).toBe(true);
  });

  it("returns true for agent-chat with scopeRoots", () => {
    const tab = createTab("t2", "agent-chat", "Chat", {
      scopeRoots: ["/project-a"],
    });
    expect(isFileScopedTab(tab)).toBe(true);
  });

  it("returns true for git-repository with repoPath", () => {
    const tab = createTab("t3", "git-repository", "repo", {
      repoPath: "/repos/project-a",
    });
    expect(isFileScopedTab(tab)).toBe(true);
  });

  it("returns false for terminal tab", () => {
    const tab = createTab("t4", "terminal", "Terminal");
    expect(isFileScopedTab(tab)).toBe(false);
  });

  it("returns false for video tab", () => {
    const tab = createTab("t5", "video", "Video");
    expect(isFileScopedTab(tab)).toBe(false);
  });

  it("returns false for file-viewer without filePath", () => {
    const tab = createTab("t6", "file-viewer", "untitled");
    expect(isFileScopedTab(tab)).toBe(false);
  });
});

describe("parentDirForVisibility", () => {
  it("returns parent directory for file paths", () => {
    expect(parentDirForVisibility("/repos/project-a/src/file.ts")).toBe("/repos/project-a/src");
  });

  it("returns the path as-is for directory-like paths", () => {
    expect(parentDirForVisibility("/repos/project-a")).toBe("/repos/project-a");
  });

  it("handles trailing slash", () => {
    expect(parentDirForVisibility("/repos/project-a/")).toBe("/repos/project-a");
  });

  it("handles root-level file", () => {
    // Root-level files have no parent directory above root
    expect(parentDirForVisibility("/file.ts")).toBe("/file.ts");
  });

  it("handles root-level directory", () => {
    expect(parentDirForVisibility("/")).toBe("");
  });
});

describe("getUncoveredPaths", () => {
  it("returns empty array when all paths are covered by visible worktrees", () => {
    const repoRefs = [
      {
        name: "project-a",
        url: "https://github.com/test/project-a",
        worktrees: ["/Users/me/repos/project-a"],
      },
    ];
    const uncovered = getUncoveredPaths(["/Users/me/repos/project-a/src/file.ts"], repoRefs);
    expect(uncovered).toEqual([]);
  });

  it("returns uncovered paths when no worktrees match", () => {
    const repoRefs = [
      {
        name: "project-b",
        url: "https://github.com/test/project-b",
        worktrees: ["/Users/me/repos/project-b"],
      },
    ];
    const uncovered = getUncoveredPaths(["/Users/me/repos/project-a/src/file.ts"], repoRefs);
    expect(uncovered).toEqual(["/Users/me/repos/project-a/src/file.ts"]);
  });

  it("returns empty because visibility is removed (all repos visible)", () => {
    const repoRefs = [
      {
        name: "project-a",
        url: "https://github.com/test/project-a",
        worktrees: ["/Users/me/repos/project-a"],
      },
    ];
    const uncovered = getUncoveredPaths(["/Users/me/repos/project-a/src/file.ts"], repoRefs);
    expect(uncovered).toEqual([]);
  });

  it("returns empty for any repo with matching worktree (visibility removed)", () => {
    const repoRefs = [
      {
        name: "project-a",
        url: "https://github.com/test/project-a",
        worktrees: ["/Users/me/repos/project-a"],
      },
    ];
    const uncovered = getUncoveredPaths(["/Users/me/repos/project-a/src/file.ts"], repoRefs);
    expect(uncovered).toEqual([]);
  });

  it("returns empty array for empty referenced paths", () => {
    const uncovered = getUncoveredPaths([], []);
    expect(uncovered).toEqual([]);
  });

  it("returns uncovered when referenced path IS a visible worktree root", () => {
    // If the referenced path exactly matches a visible worktree, it's covered
    const repoRefs = [
      {
        name: "project-a",
        url: "https://github.com/test/project-a",
        worktrees: ["/Users/me/repos/project-a"],
      },
    ];
    const uncovered = getUncoveredPaths(["/Users/me/repos/project-a"], repoRefs);
    expect(uncovered).toEqual([]);
  });

  it("returns covered when visible root is a parent of referenced path", () => {
    const repoRefs = [
      {
        name: "project-a",
        url: "https://github.com/test/project-a",
        worktrees: ["/Users/me/repos/project-a"],
      },
    ];
    const uncovered = getUncoveredPaths(["/Users/me/repos/project-a/subdir/file.ts"], repoRefs);
    expect(uncovered).toEqual([]);
  });

  it("handles multiple referenced paths with mixed coverage", () => {
    const repoRefs = [
      {
        name: "project-a",
        url: "https://github.com/test/project-a",
        worktrees: ["/Users/me/repos/project-a"],
      },
    ];
    const uncovered = getUncoveredPaths(
      ["/Users/me/repos/project-a/src/file.ts", "/Users/me/repos/project-b/src/other.ts"],
      repoRefs,
    );
    expect(uncovered).toEqual(["/Users/me/repos/project-b/src/other.ts"]);
  });

  it("handles multiple worktrees across different repos", () => {
    const repoRefs = [
      {
        name: "project-a",
        url: "https://github.com/test/project-a",
        worktrees: ["/Users/me/repos/project-a"],
      },
      {
        name: "project-b",
        url: "https://github.com/test/project-b",
        worktrees: ["/Users/me/repos/project-b"],
      },
    ];
    const uncovered = getUncoveredPaths(
      ["/Users/me/repos/project-a/src/file.ts", "/Users/me/repos/project-b/src/other.ts"],
      repoRefs,
    );
    expect(uncovered).toEqual([]);
  });

  it("handles trailing slashes consistently", () => {
    const repoRefs = [
      {
        name: "project-a",
        url: "https://github.com/test/project-a",
        worktrees: ["/Users/me/repos/project-a/"],
      },
    ];
    const uncovered = getUncoveredPaths(["/Users/me/repos/project-a/src/file.ts"], repoRefs);
    expect(uncovered).toEqual([]);
  });
});
