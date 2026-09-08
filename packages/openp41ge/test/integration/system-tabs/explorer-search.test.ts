/**
 * Integration tests for Explorer content-search + name filter.
 *
 * Pins the behaviour of the new Explorer search box:
 *   - the search bar renders at the top of the drawer
 *   - typing routes a debounced content search through the injected
 *     IExplorerSearchModel with the visible repo/worktree disk roots
 *   - results render as file rows with per-match sublist rows, and clicking a
 *     match row dispatches openp41ge:open-file with the matching line/column
 *   - the name filter is forwarded to each <openp41ge-repo-tree-item>
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Side-effect: registers the <openp41ge-worktree-tree> custom element.
import "../../../src/renderer/components/openp41ge-worktree-tree";
import "../../../src/renderer/components/openp41ge-repo-tree-item";
import { workspaceFileService } from "../../../src/renderer/services/workspace-file-service";
import type { IExplorerSearchModel } from "../../../src/renderer/models/explorer-search-model";
import { TestExplorerSearchModel } from "../../../src/renderer/models/test-models";

type Tree = HTMLElement & {
  _searchModel: IExplorerSearchModel;
  _repos: Array<{ path: string; name: string; url: string }>;
  _worktreesByRepo: Map<string, Array<{ branch: string; path: string; exists: boolean }>>;
  _hasWorkspace: boolean;
  requestUpdate: () => Promise<unknown>;
};

const RESULTS = [
  {
    path: "/repo/main/src/app.ts",
    name: "app.ts",
    dir: "src",
    matches: [
      { lineNumber: 2, column: 5, startIndex: 0, endIndex: 5, lineText: "  const alpha = 1;" },
      { lineNumber: 9, column: 3, startIndex: 0, endIndex: 5, lineText: "alpha();" },
    ],
  },
  {
    path: "/repo/main/README.md",
    name: "README.md",
    dir: ".",
    matches: [{ lineNumber: 1, column: 1, startIndex: 0, endIndex: 7, lineText: "# alpha docs" }],
  },
];

describe("ExplorerSystemTab search", () => {
  let host: HTMLElement;
  let tree: Tree;
  let model: TestExplorerSearchModel;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    workspaceFileService.openFilePath = "/w/test.openp41ge-workspace";
    model = new TestExplorerSearchModel();

    tree = document.createElement("openp41ge-worktree-tree") as unknown as Tree;
    tree._searchModel = model;
    tree._hasWorkspace = true;
    tree._repos = [{ path: "/repo", name: "test-repo", url: "https://github.com/x/test-repo" }];
    tree._worktreesByRepo = new Map([
      ["test-repo", [{ branch: "main", path: "/repo/main", exists: true }]],
    ]);
    host.appendChild(tree);
  });

  afterEach(() => {
    tree.remove();
    host.remove();
    workspaceFileService.openFilePath = null;
  });

  it("renders a search input at the top of the drawer", () => {
    const input = tree.querySelector("input[placeholder='Filter repos and files…']");
    expect(input).not.toBeNull();
  });

  it("routes a debounced content search over the visible repo/worktree roots", async () => {
    model.results = RESULTS;
    const input = tree.querySelector("input") as HTMLInputElement;
    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));

    // Debounced by 200ms; allow time to fire.
    await new Promise((r) => setTimeout(r, 300));

    expect(model.calls.length).toBe(1);
    expect(model.calls[0].query).toBe("alpha");
    // Roots = repo path + every worktree path visible in the explorer.
    expect(model.calls[0].rootPaths).toEqual(["/repo", "/repo/main"]);
    expect(model.calls[0].options).toEqual({ regex: false, caseSensitive: false });
  });

  it("integrates content matches as match sub-rows under file rows and dispatches open at the instance", async () => {
    // The repo-tree-item lazily loads worktree files via window.openp41ge.file,
    // so stub a small listing that includes both matched files.
    const ORIG = window.openp41ge;
    const ORIG_SCROLL = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = () => {};
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      ...(ORIG as Record<string, unknown>),
      file: {
        readdir: async (dir: string) => {
          if (dir === "/repo/main") {
            return [
              { path: "/repo/main/src", name: "src", isDirectory: true },
              { path: "/repo/main/README.md", name: "README.md", isDirectory: false },
            ];
          }
          if (dir === "/repo/main/src") {
            return [{ path: "/repo/main/src/app.ts", name: "app.ts", isDirectory: false }];
          }
          return [];
        },
      },
      workspaceController: {
        getBranches: async () => [],
        getUntrackedFiles: async () => [],
      },
    };

    model.results = RESULTS;
    const input = tree.querySelector("input") as HTMLInputElement;
    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    await tree.updateComplete;
    // Let the repo-tree-item load the worktree + reveal the src dir.
    await new Promise((r) => setTimeout(r, 80));
    await tree.updateComplete;
    await new Promise((r) => setTimeout(r, 80));
    await tree.updateComplete;

    // The content-match map is forwarded to the repo-tree-item.
    const item = tree.querySelector("openp41ge-repo-tree-item") as unknown as {
      contentMatches: Map<string, { matches: unknown[] }>;
      filter: string;
      _expanded: boolean;
      requestUpdate(): void;
      updateComplete: Promise<unknown>;
    };
    expect(item).not.toBeNull();
    expect(item.contentMatches.size).toBe(2);
    expect(item.filter).toBe("alpha");

    // Expand the repo + worktree so the uikit file tree (with match sub-rows) renders.
    item._expanded = true;
    item.requestUpdate();
    await item.updateComplete;
    await new Promise((r) => setTimeout(r, 80));
    await item.updateComplete;

    // The file tree exposes its TreeNode[]; assert the matched files carry
    // their match instances as child rows.
    const treeEl = tree.querySelector("openp41ge-tree") as unknown as {
      nodes: Array<{
        label: string;
        children?: Array<{
          label: string;
          meta?: { line?: number; column?: number; match?: boolean; filePath?: string };
        }>;
      }>;
      dispatchEvent(e: Event): boolean;
    };
    expect(treeEl).not.toBeNull();
    const readmeNode = treeEl.nodes.find((n) => n.label === "README.md");
    expect(readmeNode?.children).toHaveLength(1);
    expect(readmeNode?.children?.[0]?.meta?.line).toBe(1);

    const srcNode = treeEl.nodes.find((n) => n.label === "src");
    expect(srcNode).toBeDefined();
    const appNode = srcNode?.children?.find((n) => n.label === "app.ts");
    expect(appNode?.children).toHaveLength(2);

    // Clicking the second app.ts match dispatches open-file with line/column.
    const opened: Record<string, unknown> = { count: 0 };
    const onOpen = (e: Event) => {
      opened.count++;
      Object.assign(opened, (e as CustomEvent).detail);
    };
    document.addEventListener("openp41ge:open-file", onOpen);
    try {
      const appMatch = appNode?.children?.[1]?.meta;
      treeEl.dispatchEvent(
        new CustomEvent("tree-node-click", {
          bubbles: true,
          composed: true,
          detail: { meta: appMatch },
        }),
      );
      expect(opened.count).toBe(1);
      expect(opened.path).toBe("/repo/main/src/app.ts");
      expect(opened.line).toBe(9);
      expect(opened.column).toBe(3);
      expect(opened.search).toEqual({
        query: "alpha",
        regex: false,
        caseSensitive: false,
      });
    } finally {
      document.removeEventListener("openp41ge:open-file", onOpen);
      HTMLElement.prototype.scrollIntoView = ORIG_SCROLL;
      (window as unknown as { openp41ge: unknown }).openp41ge = ORIG;
    }
  });

  it("forwards the name filter to each matching repo-tree-item", async () => {
    model.results = [];
    const input = tree.querySelector("input") as HTMLInputElement;
    // "test" matches the repo name, so the repo item keeps rendering.
    input.value = "test";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    await tree.updateComplete;

    const item = tree.querySelector("openp41ge-repo-tree-item") as unknown as {
      filter: string;
      filterRegex: boolean;
      filterCase: boolean;
    };
    expect(item).not.toBeNull();
    expect(item.filter).toBe("test");
    expect(item.filterRegex).toBe(false);
    expect(item.filterCase).toBe(false);

    // Toggle the case option and re-type — the item carries it through.
    const caseBtn = tree.querySelector("[data-filter-case]") as HTMLElement;
    caseBtn.click();
    await tree.updateComplete;
    expect((item as unknown as { filterCase: boolean }).filterCase).toBe(true);
  });

  it("hides repo rows that match neither the repo nor any worktree name", async () => {
    model.results = [];
    const input = tree.querySelector("input") as HTMLInputElement;
    input.value = "nomatch";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    await tree.updateComplete;

    expect(tree.querySelector("openp41ge-repo-tree-item")).toBeNull();
    expect(tree.textContent).toContain("No matches");
  });
});
