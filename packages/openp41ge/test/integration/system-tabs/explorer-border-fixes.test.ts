/**
 * Regression guards for the Explorer sidebar border fixes:
 *
 * 1. Double border at the drawer bottom — the last tree row (add repository)
 *    owns a bottom border and the new 24px bottom bar owns a top border; when
 *    the tree fills the drawer they stack into a 2px line. The tree toggles a
 *    `full` class when the content reaches the bottom edge and a CSS rule
 *    drops the last child's bottom border (same mechanism as the Workspaces
 *    overlay list).
 *
 * 2. Boundary below an open worktree's borderless file block — the expanded
 *    file tree gets exactly one bottom border on its own block (a wrapper),
 *    so whichever row follows (next worktree header, add-worktree row, next
 *    repo header, or add-repo row) renders below a single 1px line and no row
 *    ever doubles.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Side-effects: register the components (incl. openp41ge-uikit + openp41ge-
// filesystem bindings) so document.createElement returns the real classes.
import "../../../src/renderer/components/openp41ge-worktree-tree";
import "../../../src/renderer/components/openp41ge-repo-tree-item";
import type { Openp41geRepoTreeItem } from "../../../src/renderer/components/openp41ge-repo-tree-item";
import type { WorktreeData } from "../../../src/renderer/components/openp41ge-repo-tree-item";

// openp41ge-repo-tree-item is a real LitElement with private helpers we must
// drive from the test; cast through an unknown interface.
type PrivItem = Openp41geRepoTreeItem & {
  _expanded: boolean;
  _expandedWorktrees: Set<string>;
  _toggleWorktreeFiles(branch: string, path: string): Promise<void>;
};
type PrivTree = HTMLElement & {
  _treeEl: HTMLElement | null;
  _repoService: unknown;
  _syncScrollbar(): void;
};

describe("Explorer sidebar border fixes", () => {
  let host: HTMLElement;
  const ORIG_OPENP41GE: unknown = window.openp41ge;
  const ORIG_SCROLL_INTO_VIEW = HTMLElement.prototype.scrollIntoView;

  const stubPreload = (files: { name: string; path: string; isDirectory?: boolean }[] = []) => {
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      ...(ORIG_OPENP41GE as Record<string, unknown>),
      workspace: { getWindowId: () => "test-win" },
      file: {
        readdir: async () => files,
        readFile: async () => ({ content: "", error: null }),
      },
      workspaceController: {
        loadStore: async () => ({ workspaces: [], lastActiveId: null }),
        listRepos: async () => [],
        getBranches: async () => [],
        getUntrackedFiles: async () => [],
        createWorkspace: async () => ({ id: "w", title: "Workspace" }),
      },
    } as unknown as typeof window.openp41ge;
  };

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    HTMLElement.prototype.scrollIntoView = () => {};
    stubPreload();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = ORIG_SCROLL_INTO_VIEW;
    (window as unknown as { openp41ge: unknown }).openp41ge = ORIG_OPENP41GE;
    host.remove();
  });

  // ── Issue 1: full class + last-row border rule ──────────────────────────

  async function mountTree(): Promise<PrivTree> {
    const tree = document.createElement("openp41ge-worktree-tree") as unknown as PrivTree;
    host.appendChild(tree);
    await (tree as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    // Ensure the DOM ref is present before we touch _syncScrollbar.
    (tree as PrivTree)._treeEl = tree.querySelector(".wt-tree-scroll");
    return tree as unknown as PrivTree;
  }

  async function stubScroll(el: HTMLElement, scroll: number, client: number): Promise<void> {
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: scroll });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: client });
  }

  it("applies the full class only when the tree content reaches the bottom edge", async () => {
    const tree = await mountTree();
    const scrollEl = tree._treeEl!;
    expect(scrollEl.className).not.toContain("full");

    // Content shorter than the viewport → not full, border stays.
    await stubScroll(scrollEl, 100, 200);
    tree._syncScrollbar();
    expect(scrollEl.classList.contains("full")).toBe(false);

    // Content taller than the viewport → full, border dropped.
    await stubScroll(scrollEl, 300, 200);
    tree._syncScrollbar();
    expect(scrollEl.classList.contains("full")).toBe(true);

    // Shrinking back removes the flag again (e.g. after a collapse).
    await stubScroll(scrollEl, 100, 200);
    tree._syncScrollbar();
    expect(scrollEl.classList.contains("full")).toBe(false);
  });

  it("injects the CSS rule that strips the last row's border when full", () => {
    const style = document.getElementById("wt-scrollbar-style");
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain(
      ".wt-tree-scroll.full .wt-tree-scroll-content > :last-child { border-bottom: 0; }",
    );
  });

  // ── Issue 2: single separator below an open worktree's file block ────────

  function makeItem(repoName: string, worktrees: WorktreeData[]): PrivItem {
    const el = document.createElement("openp41ge-repo-tree-item") as unknown as PrivItem;
    el.repoName = repoName;
    el.worktrees = worktrees;
    host.appendChild(el);
    return el;
  }

  it("draws one bottom border on the open worktree block only (no top borders elsewhere)", async () => {
    const worktrees: WorktreeData[] = [
      { name: "wt-a", branch: "wt-a", header: "wt-a", path: "/repo/a", exists: false },
      { name: "wt-b", branch: "wt-b", header: "wt-b", path: "/repo/b", exists: false },
    ];
    const item = makeItem("repo", worktrees); // connectedCallback ran; collapse state
    (item as unknown as { _expanded: boolean })._expanded = true; // show the worktree rows

    // Nothing expanded yet: no file block wrapper, no tree.
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const first = () => item.querySelector(".wt-expanded-wt-block");
    expect(item.querySelector("openp41ge-tree")).toBeNull();

    // Expand the first worktree with one file present.
    stubPreload([{ name: "a.ts", path: "/repo/a/a.ts", isDirectory: false }]);
    await item._toggleWorktreeFiles("wt-a", "/repo/a");
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    // The open block is wrapped in a single bottom-border container.
    const wrapper = item.querySelector("div.wt-expanded-wt-block.border-b.border-\\[\\#232323\\]");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.querySelector("openp41ge-tree")).not.toBeNull();
    // wrapper owns the boundary: bottom border only — never a top border.
    expect(wrapper!.className).toContain("border-b");
    expect(wrapper!.className).not.toMatch(/border-t/);
    // The uikit tree itself stays borderless (border lives on the wrapper).
    expect(wrapper!.querySelector("openp41ge-tree")!.className).not.toMatch(/border/);

    // The next worktree header is NOT the source of a separator (no top
    // border anywhere — the boundary lives on the open block's bottom border).
    const headerRows = item.querySelectorAll(".wt-row-header");
    expect(headerRows.length).toBeGreaterThanOrEqual(2); // repo + worktree headers
    for (const row of Array.from(headerRows)) {
      const outer = row.closest("div[class]") as HTMLElement | null;
      expect(outer?.className ?? "").not.toMatch(/border-t/);
    }

    // Collapse → the boundary wrapper disappears again.
    await item._toggleWorktreeFiles("wt-a", "/repo/a");
    await (item as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(item.querySelector("openp41ge-tree")).toBeNull();
    expect(first()).toBeNull();
  });
});
