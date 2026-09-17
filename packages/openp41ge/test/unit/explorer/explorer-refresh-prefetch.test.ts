/**
 * Tests for the Explorer subtree refresh + prefetch + external-change handling.
 *
 * Covers:
 *  - `refreshDir` clears a directory's cached listing and re-reads it.
 *  - `handleExternalChange` refreshes the cached listing that would show the
 *    change (parent dir, and the changed dir itself when it is cached).
 *  - `refreshRepo` clears + reloads worktree-root listings.
 *  - When `prefetchDepth > 0`, expands go through `file.readTree` (and a
 *    returned snapshot is flattened into the per-path caches).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Side-effect: registers the <openp41ge-repo-tree-item> custom element.
import "../../../src/renderer/components/openp41ge-repo-tree-item";
import type { Openp41geRepoTreeItem } from "../../../src/renderer/components/openp41ge-repo-tree-item";
import type { WorktreeData } from "../../../src/renderer/components/openp41ge-repo-tree-item";
import type { FileEntry } from "openp41ge-filesystem";

type PrivItem = Openp41geRepoTreeItem & {
  _expandedWorktrees: Set<string>;
  _fileLoader: {
    prefetchDepth: number;
    worktreeFiles: Map<string, FileEntry[]>;
    dirContents: Map<string, FileEntry[]>;
    hasDir(dirPath: string): boolean;
    isWorktreeLoaded(branch: string): boolean;
    clearDirContents(branch: string, dirPath: string): void;
    clearWorktreeFiles(branch: string): void;
    clearWorktreeDirs(root: string): void;
    expandDir(branch: string, dirPath: string, onUpdate?: () => void): Promise<boolean>;
    expandWorktreeFiles(
      branch: string,
      root: string,
      repoName: string,
      onUpdate?: () => void,
    ): Promise<boolean>;
    getEntries(branch: string, parentPath?: string): FileEntry[];
  };
  prefetchDepth: number;
  worktrees: WorktreeData[];
  repoName: string;
  refreshDir(branch: string, dirPath: string): Promise<void>;
  refreshWorktree(branch: string): Promise<void>;
  refreshRepo(): Promise<void>;
  handleExternalChange(changedPath: string): boolean;
};

function dir(name: string, path: string): FileEntry {
  return { name, path, isDirectory: true, size: 0, modifiedAt: 0 };
}
function file(name: string, path: string): FileEntry {
  return { name, path, isDirectory: false, size: 1, modifiedAt: 0 };
}

const WORKTREE: WorktreeData[] = [{ branch: "main", path: "/repo/main", exists: true }];

describe("Explorer subtree refresh / prefetch / external changes", () => {
  let host: HTMLElement;
  const ORIG_OPENP41GE: unknown = window.openp41ge;
  const readdir = vi.fn();
  const readTree = vi.fn();

  function stub(): void {
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      file: { readdir, readTree },
    } as unknown as typeof window.openp41ge;
  }

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    readdir.mockReset().mockResolvedValue([]);
    readTree.mockReset().mockResolvedValue({ path: "", entries: [], children: [] });
    stub();
  });

  afterEach(() => {
    (window as unknown as { openp41ge: unknown }).openp41ge = ORIG_OPENP41GE;
    host.remove();
  });

  function makeItem(): PrivItem {
    const el = document.createElement("openp41ge-repo-tree-item") as unknown as PrivItem;
    el.repoName = "org/repo";
    el.worktrees = WORKTREE;
    host.appendChild(el);
    return el;
  }

  it("prefetchDepth > 0 routes expands through file.readTree", async () => {
    const el = makeItem();
    el.prefetchDepth = 2;
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    readTree.mockResolvedValue({
      path: "/repo/main/src",
      entries: [file("a.ts", "/repo/main/src/a.ts"), dir("nested", "/repo/main/src/nested")],
      children: [{ path: "/repo/main/src/nested", entries: [], children: [] }],
    });

    await el.refreshDir("main", "/repo/main/src");

    expect(readTree).toHaveBeenCalledWith("/repo/main/src", 2);
    expect(readdir).not.toHaveBeenCalled();
    // Snapshot flattened into the per-path cache.
    expect(el._fileLoader.dirContents.get("/repo/main/src")?.[0]?.name).toBe("a.ts");
    expect(el._fileLoader.hasDir("/repo/main/src/nested")).toBe(true);
  });

  it("falls back to readdir when the readTree channel fails", async () => {
    const el = makeItem();
    el.prefetchDepth = 2;
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    // A main process predating file:readTree (or an IPC failure) must not
    // leave the worktree empty — the prefetch read falls back to a flat list.
    readTree.mockRejectedValue(new Error("no such channel"));
    readdir.mockImplementation(async (p: string) =>
      p === "/repo/main/src" ? [file("a.ts", "/repo/main/src/a.ts")] : [],
    );

    await el.refreshDir("main", "/repo/main/src");

    expect(readdir).toHaveBeenCalledWith("/repo/main/src");
    expect(el._fileLoader.dirContents.get("/repo/main/src")?.[0]?.name).toBe("a.ts");
  });

  it("falls back to readdir when readTree is not exposed", async () => {
    const el = makeItem();
    el.prefetchDepth = 2;
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    // Strip readTree from the bridge — the loader must degrade to readdir.
    delete (window.openp41ge.file as Record<string, unknown>).readTree;
    readdir.mockImplementation(async (p: string) =>
      p === "/repo/main/src" ? [file("a.ts", "/repo/main/src/a.ts")] : [],
    );

    await el.refreshDir("main", "/repo/main/src");

    expect(readdir).toHaveBeenCalledWith("/repo/main/src");
    expect(el._fileLoader.dirContents.get("/repo/main/src")?.[0]?.name).toBe("a.ts");
  });

  it("refreshDir clears the cached listing and re-reads it", async () => {
    const el = makeItem();
    // Seed a stale cache entry for the dir.
    el._fileLoader.dirContents.set("/repo/main/src", [file("old.ts", "/repo/main/src/old.ts")]);
    readdir.mockImplementation(async (p: string) =>
      p === "/repo/main/src" ? [file("new.ts", "/repo/main/src/new.ts")] : [],
    );

    await el.refreshDir("main", "/repo/main/src");

    expect(readdir).toHaveBeenCalledWith("/repo/main/src");
    expect(el._fileLoader.dirContents.get("/repo/main/src")?.[0]?.name).toBe("new.ts");
  });

  it("handleExternalChange refreshes a cached directory listing", async () => {
    const el = makeItem();
    el._fileLoader.dirContents.set("/repo/main/src", [file("a.ts", "/repo/main/src/a.ts")]);
    el._fileLoader.worktreeFiles.set("main", [dir("src", "/repo/main/src")]);
    readdir.mockResolvedValue([]);

    const handled = el.handleExternalChange("/repo/main/src/a.ts");

    expect(handled).toBe(true);
    // Allow the debounced-ish background refresh to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(readdir).toHaveBeenCalledWith("/repo/main/src");
  });

  it("handleExternalChange reports a worktree-root change as a structure change", () => {
    const el = makeItem();
    const spy = vi.fn();
    el.addEventListener("repo-structure-changed", spy as EventListener);

    const handled = el.handleExternalChange("/repo/main");

    expect(handled).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ detail: { repoName: "org/repo" } }));
  });

  it("handleExternalChange ignores paths outside the repo", () => {
    const el = makeItem();
    expect(el.handleExternalChange("/somewhere/else")).toBe(false);
  });

  it("refreshRepo clears and reloads the worktree-root listing", async () => {
    const el = makeItem();
    el._expandedWorktrees.add("main");
    el._fileLoader.worktreeFiles.set("main", [file("old.ts", "/repo/main/old.ts")]);
    readdir.mockImplementation(async (p: string) =>
      p === "/repo/main" ? [file("new.ts", "/repo/main/new.ts")] : [],
    );

    await el.refreshRepo();

    expect(readdir).toHaveBeenCalledWith("/repo/main");
    expect(el._fileLoader.worktreeFiles.get("main")?.[0]?.name).toBe("new.ts");
  });
});
