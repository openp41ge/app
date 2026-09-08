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

  it("renders file rows with per-match sublist rows and dispatches open at the instance", async () => {
    model.results = RESULTS;
    const input = tree.querySelector("input") as HTMLInputElement;
    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    await tree.updateComplete;

    // File rows (2) for the files that matched.
    const fileRows = tree.querySelectorAll(".explorer-result-file");
    expect(fileRows.length).toBe(2);

    // Match sublist rows: 2 for app.ts + 1 for README.md.
    const matchRows = tree.querySelectorAll(".explorer-result-match");
    expect(matchRows.length).toBe(3);

    // Clicking the second app.ts match dispatches open-file with line/column.
    const opened: Record<string, unknown> = { count: 0 };
    const onOpen = (e: Event) => {
      opened.count++;
      Object.assign(opened, (e as CustomEvent).detail);
    };
    document.addEventListener("openp41ge:open-file", onOpen);
    try {
      (matchRows[1] as HTMLElement).click();
      expect(opened.count).toBe(1);
      expect(opened.path).toBe("/repo/main/src/app.ts");
      expect(opened.line).toBe(9);
      expect(opened.column).toBe(3);
    } finally {
      document.removeEventListener("openp41ge:open-file", onOpen);
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
