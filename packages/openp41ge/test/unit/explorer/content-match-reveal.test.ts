/**
 * Unit tests for the Explorer content-match directory reveal behaviour.
 *
 * Verifies that `_revealContentDirs` expands the ancestor directory chain for
 * every file that currently has content matches. Search results stream in, so
 * the matched-file set grows over time; the reveal step must run again for new
 * matches (no one-time "already revealed" guard) — otherwise folders that only
 * appear in a later chunk stay open with no children until the user re-opens
 * their repo/worktree.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Side-effect: registers the <openp41ge-repo-tree-item> custom element.
import "../../../src/renderer/components/openp41ge-repo-tree-item";

type RepoTreeItem = HTMLElement & {
  contentIndex: Map<string, { path: string; name: string; dir: string; count: number }>;
  repoName: string;
};

function makeItem(): RepoTreeItem {
  const item = document.createElement("openp41ge-repo-tree-item") as unknown as RepoTreeItem;
  item.repoName = "test-repo";
  // contentIndex is a @property with a default Map; set a fresh one.
  item.contentIndex = new Map();
  return item;
}

/** The streamed index entry for a matched file (counts only, no match lines). */
function entry(path: string, count = 1) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return { path, name, dir: path.slice(0, path.lastIndexOf("/")), count };
}

describe("ExportGroupMatchReveal", () => {
  let host: HTMLElement;
  const readdir = vi.fn();

  beforeEach(() => {
    readdir.mockReset();
    // readdir returns an empty listing for every dir so expandDir completes.
    readdir.mockResolvedValue([]);
    const ORIG = (window as unknown as { openp41ge?: unknown }).openp41ge;
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      ...(ORIG as Record<string, unknown>),
      file: { readdir },
    };
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    (window as unknown as { openp41ge?: unknown }).openp41ge = undefined;
  });

  it("reveals the ancestor dir chain for a match", async () => {
    const item = makeItem();
    item.contentIndex.set("/repo/main/src/nested/app.ts", entry("/repo/main/src/nested/app.ts", 2));
    host.appendChild(item);
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    // Access the private reveal step against the loader's real expandDir.
    (item as unknown as { _revealContentDirs(b: string, p: string): void })._revealContentDirs(
      "main",
      "/repo/main",
    );

    // Let the async readdir calls resolve.
    await new Promise((r) => setTimeout(r, 20));

    const called = readdir.mock.calls.map((c) => c[0]);
    expect(called).toContain("/repo/main/src");
    expect(called).toContain("/repo/main/src/nested");
  });

  it("forwards only matched files from the virtual window as a prefetch", async () => {
    const item = makeItem();
    item.contentIndex.set("/repo/main/src/app.ts", entry("/repo/main/src/app.ts", 2));
    host.appendChild(item);
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const seen: string[][] = [];
    item.addEventListener("content-match-prefetch", (e) => {
      seen.push((e as CustomEvent).detail.filePaths);
    });

    // Rows scrolled into view: a directory, a matched file, an unmatched file.
    (item as unknown as { _onVisibleNodes(e: Event): void })._onVisibleNodes(
      new CustomEvent("tree-visible-nodes", {
        detail: {
          nodeIds: ["/repo/main/src", "/repo/main/src/app.ts", "/repo/main/src/other.ts"],
        },
      }),
    );
    expect(seen).toEqual([["/repo/main/src/app.ts"]]);

    // Nothing matched in view → no event at all.
    (item as unknown as { _onVisibleNodes(e: Event): void })._onVisibleNodes(
      new CustomEvent("tree-visible-nodes", { detail: { nodeIds: ["/repo/main/src"] } }),
    );
    expect(seen).toHaveLength(1);
  });

  it("reveals directories that only appear in a later streaming chunk", async () => {
    const item = makeItem();
    item.contentIndex.set("/repo/main/src/app.ts", entry("/repo/main/src/app.ts", 2));
    host.appendChild(item);
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    const reveal = (branch: string, path: string) =>
      (item as unknown as { _revealContentDirs(b: string, p: string): void })._revealContentDirs(
        branch,
        path,
      );

    // First batch: only src/app.ts matched → reveal src.
    reveal("main", "/repo/main");
    await new Promise((r) => setTimeout(r, 20));
    expect(readdir.mock.calls.map((c) => c[0])).toContain("/repo/main/src");

    // Second batch streams in a match under a brand-new directory. The reveal
    // step must pick it up WITHOUT a one-time guard (the old behaviour left the
    // folder open with no children until close/reopen).
    item.contentIndex.set("/repo/main/docs/guide.md", entry("/repo/main/docs/guide.md"));
    reveal("main", "/repo/main");
    await new Promise((r) => setTimeout(r, 20));

    const called = readdir.mock.calls.map((c) => c[0]);
    expect(called).toContain("/repo/main/docs");
  });
});
