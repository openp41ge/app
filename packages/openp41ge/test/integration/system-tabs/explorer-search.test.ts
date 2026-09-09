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
  _searching: boolean;
  _contentIndexByPath: Map<string, unknown>;
  _matchDetailsByPath: Map<string, unknown>;
  updateComplete: Promise<unknown>;
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

/** The streamed index entry (counts only) for one canned result. */
function indexEntry(r: (typeof RESULTS)[number]) {
  return { path: r.path, name: r.name, dir: r.dir, count: r.matches.length };
}

describe("ExplorerSystemTab search", () => {
  let host: HTMLElement;
  let tree: Tree;
  let model: TestExplorerSearchModel;

  /** Click the search tool icon so the search bar renders below the tools bar. */
  async function openSearch(tree: Tree): Promise<void> {
    const btn = tree.querySelector<HTMLElement>("[data-explorer-tool='search']");
    expect(btn).not.toBeNull();
    btn?.click();
    await tree.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }

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

  it("hides the search bar by default and reveals it via the search tool in the bottom bar", async () => {
    // All tools are off by default — the search input is not rendered.
    expect(tree.querySelector("input[placeholder='Filter repos and files…']")).toBeNull();
    const toolBtn = tree.querySelector("[data-explorer-tool='search']");
    expect(toolBtn).not.toBeNull();
    expect(toolBtn?.getAttribute("aria-pressed")).toBe("false");

    // The tool button lives in the bottom bar, right-aligned after the flex
    // spacer, with the settings gear kept left-aligned.
    const bottomBar = tree.querySelector(".sb-bottom-bar");
    expect(bottomBar).not.toBeNull();
    expect(bottomBar?.contains(toolBtn as Node)).toBe(true);
    const settingsBtn = bottomBar?.querySelector("button[aria-label='Explorer Settings']");
    expect(settingsBtn).not.toBeNull();
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(settingsBtn?.compareDocumentPosition(toolBtn as Node) & FOLLOWING).toBe(FOLLOWING);

    // Clicking the search tool reveals the search bar at the top of the drawer.
    await openSearch(tree);
    const input = tree.querySelector("input[placeholder='Filter repos and files…']");
    expect(input).not.toBeNull();
    expect(toolBtn?.getAttribute("aria-pressed")).toBe("true");
    const drawer = tree.querySelector(".wt-drawer");
    expect(drawer?.querySelector("input[placeholder='Filter repos and files…']")).toBe(input);
    // The search bar sits above the tree content.
    const wrapper = tree.querySelector(".wt-tree-scroll-wrapper");
    expect(input?.compareDocumentPosition(wrapper as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    // Clicking the active tool again toggles it off — the search bar hides.
    await openSearch(tree);
    expect(tree.querySelector("input[placeholder='Filter repos and files…']")).toBeNull();
    expect(toolBtn?.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggling off search unfilters the tree and clears live content results", async () => {
    model.results = RESULTS;
    await openSearch(tree);
    const input = tree.querySelector("input") as HTMLInputElement;
    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    await tree.updateComplete;

    // Content matches are present while the search tool is active.
    expect(tree._contentIndexByPath.size).toBe(2);
    const item = tree.querySelector("openp41ge-repo-tree-item") as unknown as { filter: string };
    expect(item.filter).toBe("alpha");

    // Click the active tool icon to toggle it off.
    const toolBtn = tree.querySelector<HTMLElement>("[data-explorer-tool='search']");
    toolBtn?.click();
    await tree.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    // The search bar hides, the tree unfilters, and live results are dropped.
    expect(tree.querySelector("input")).toBeNull();
    expect(tree._contentIndexByPath.size).toBe(0);
    expect(tree._searching).toBe(false);
    const itemAfter = tree.querySelector("openp41ge-repo-tree-item") as unknown as {
      filter: string;
    };
    expect(itemAfter.filter).toBe("");
  });

  it("toggling search back on restores the query and re-runs the content search", async () => {
    model.results = RESULTS;
    await openSearch(tree);
    const input = tree.querySelector("input") as HTMLInputElement;
    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    await tree.updateComplete;
    expect(model.calls.length).toBe(1);

    const toolBtn = tree.querySelector<HTMLElement>("[data-explorer-tool='search']");
    toolBtn?.click();
    await tree.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    expect(model.calls.length).toBe(1);

    toolBtn?.click();
    await tree.updateComplete;
    await new Promise((r) => setTimeout(r, 300));

    // The query text is preserved in the input and the search re-runs.
    const inputAfter = tree.querySelector("input") as HTMLInputElement;
    expect(inputAfter.value).toBe("alpha");
    expect(model.calls.length).toBe(2);
    expect(model.calls[1].query).toBe("alpha");
    await tree.updateComplete;
    await new Promise((r) => setTimeout(r, 20));
    expect(tree._contentIndexByPath.size).toBe(2);
  });

  it("routes a debounced content search over the visible repo/worktree roots", async () => {
    model.results = RESULTS;
    await openSearch(tree);
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
    await openSearch(tree);
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
      contentIndex: Map<string, { count: number }>;
      filter: string;
      _expanded: boolean;
      requestUpdate(): void;
      updateComplete: Promise<unknown>;
    };
    expect(item).not.toBeNull();
    expect(item.contentIndex.size).toBe(2);
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
        badge?: string;
        children?: Array<{
          label: string;
          badge?: string;
          meta?: { line?: number; column?: number; match?: boolean; filePath?: string };
        }>;
      }>;
      dispatchEvent(e: Event): boolean;
    };
    expect(treeEl).not.toBeNull();
    const readmeNode = treeEl.nodes.find((n) => n.label === "README.md");
    expect(readmeNode?.children).toHaveLength(1);
    expect(readmeNode?.children?.[0]?.meta?.line).toBe(1);
    // Each matched file row shows its match count as a right-aligned badge.
    expect(readmeNode?.badge).toBe("1");

    const srcNode = treeEl.nodes.find((n) => n.label === "src");
    expect(srcNode).toBeDefined();
    // The folder row shows the accumulated match count of its descendants.
    expect(srcNode?.badge).toBe("2");
    const appNode = srcNode?.children?.find((n) => n.label === "app.ts");
    expect(appNode?.children).toHaveLength(2);
    expect(appNode?.badge).toBe("2");

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
    await openSearch(tree);
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
    await openSearch(tree);
    const input = tree.querySelector("input") as HTMLInputElement;
    input.value = "nomatch";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    await tree.updateComplete;

    expect(tree.querySelector("openp41ge-repo-tree-item")).toBeNull();
    expect(tree.textContent).toContain("No matches");
  });

  it("cancels a superseded streaming search and clears the searching state only for the latest", async () => {
    model.deferStreaming = true;
    model.results = RESULTS;
    await openSearch(tree);
    const input = tree.querySelector("input") as HTMLInputElement;

    // Type "al"; the debounced search starts and stays pending.
    input.value = "al";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    expect(model.calls.length).toBe(1);
    expect(tree._searching).toBe(true);

    // Type "alp"; the newer search must cancel the previous session.
    input.value = "alp";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    expect(model.calls.length).toBe(2);
    expect(model.cancelledStreaming).toContain("al");
    expect(tree._searching).toBe(true);

    // Resolve only the latest search; the indicator must clear.
    const latest = model.pendingStreaming[model.pendingStreaming.length - 1];
    latest.resolve({ total: 0 });
    await tree.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    expect(tree._searching).toBe(false);
  });

  it("streams counts only and fetches match lines per file", async () => {
    model.results = RESULTS;
    await openSearch(tree);
    const input = tree.querySelector("input") as HTMLInputElement;
    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));

    // The walk delivered index entries — counts, no match lines.
    expect(tree._contentIndexByPath.size).toBe(2);
    const entry = tree._contentIndexByPath.get(RESULTS[0].path) as { count: number };
    expect(entry.count).toBe(2);

    // Lines are fetched separately, once per matched file (both are inside the
    // auto-expand window, so both are requested).
    await new Promise((r) => setTimeout(r, 20));
    expect(model.fetchCalls.map((c) => c.filePath).sort()).toEqual(
      [RESULTS[0].path, RESULTS[1].path].sort(),
    );
    expect(model.fetchCalls.every((c) => c.query === "alpha")).toBe(true);
    expect(tree._matchDetailsByPath.size).toBe(2);
  });

  it("leaves matched files past the auto-expand window collapsed until toggled", async () => {
    // 25 matching files — more than the 20 that open automatically.
    model.results = Array.from({ length: 25 }, (_, i) => ({
      path: `/repo/main/src/f${i}.ts`,
      name: `f${i}.ts`,
      dir: "src",
      matches: [{ lineNumber: 1, column: 1, startIndex: 0, endIndex: 5, lineText: "alpha" }],
    }));
    await openSearch(tree);
    const input = tree.querySelector("input") as HTMLInputElement;
    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    await new Promise((r) => setTimeout(r, 20));

    // Every file is indexed, but only the leading window fetched its lines.
    expect(tree._contentIndexByPath.size).toBe(25);
    expect(model.fetchCalls.length).toBe(20);
    const late = "/repo/main/src/f24.ts";
    expect(tree._matchDetailsByPath.has(late)).toBe(false);

    // Opening a collapsed row is what asks for its lines. The row lives in the
    // repo-tree-item, which bubbles the toggle up to the panel.
    await tree.updateComplete;
    const item = tree.querySelector("openp41ge-repo-tree-item") as HTMLElement;
    item.dispatchEvent(
      new CustomEvent("content-match-toggle", {
        bubbles: true,
        composed: true,
        detail: { filePath: late },
      }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(model.fetchCalls.map((c) => c.filePath)).toContain(late);
    expect(tree._matchDetailsByPath.has(late)).toBe(true);
  });

  it("prefetches match lines for rows scrolled into the virtual window", async () => {
    // 25 matching files: 20 auto-expand, the rest are fetched only when their
    // rows scroll into view.
    model.results = Array.from({ length: 25 }, (_, i) => ({
      path: `/repo/main/src/f${i}.ts`,
      name: `f${i}.ts`,
      dir: "src",
      matches: [{ lineNumber: 1, column: 1, startIndex: 0, endIndex: 5, lineText: "alpha" }],
    }));
    await openSearch(tree);
    const input = tree.querySelector("input") as HTMLInputElement;
    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    await new Promise((r) => setTimeout(r, 20));
    expect(model.fetchCalls.length).toBe(20);

    // The virtualized tree announces the rows in its window and the repo item
    // forwards the matched files among them; their lines load before anyone
    // opens a row.
    await tree.updateComplete;
    const item = tree.querySelector("openp41ge-repo-tree-item") as HTMLElement;
    item.dispatchEvent(
      new CustomEvent("content-match-prefetch", {
        bubbles: true,
        composed: true,
        detail: { filePaths: ["/repo/main/src/f23.ts", "/repo/main/src/f24.ts"] },
      }),
    );
    await new Promise((r) => setTimeout(r, 20));

    const fetched = model.fetchCalls.map((c) => c.filePath);
    expect(fetched).toContain("/repo/main/src/f23.ts");
    expect(fetched).toContain("/repo/main/src/f24.ts");
    // Already-cached files are not re-fetched.
    expect(model.fetchCalls.length).toBe(22);
  });

  it("cancels the running search as soon as the query changes, before the replacement is debounced", async () => {
    // Regression: typing "d" then "r" left the "d" walk running for the whole
    // debounce window, so partial-keystroke searches piled up and the Explorer
    // stuck on "Searching…".
    model.deferStreaming = true;
    await openSearch(tree);
    const input = tree.querySelector("input") as HTMLInputElement;

    input.value = "d";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    expect(model.calls.length).toBe(1);

    // Second keystroke: the previous walk is cancelled immediately, and the
    // replacement has not been issued yet (still inside the debounce window).
    input.value = "dr";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    expect(model.cancelledStreaming).toContain("d");
    expect(model.calls.length).toBe(1);

    // Clearing the query also stops the walk rather than leaving it running.
    await new Promise((r) => setTimeout(r, 300));
    expect(model.calls.length).toBe(2);
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    expect(model.cancelledStreaming).toContain("dr");
    expect(tree._searching).toBe(false);
  });

  it("applies a burst of streamed chunks in one batch rather than per chunk", async () => {
    // Regression: applying each chunk on arrival re-rendered the whole tree —
    // rebuilding a highlighted row for every match found so far — once per
    // file, which starved the main thread and blocked typing.
    model.deferStreaming = true;
    await openSearch(tree);
    const input = tree.querySelector("input") as HTMLInputElement;
    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));

    const session = model.pendingStreaming[0];
    session.emit([indexEntry(RESULTS[0])]);
    session.emit([indexEntry(RESULTS[1])]);
    // Nothing is applied synchronously — the chunks are buffered.
    expect(tree._contentIndexByPath.size).toBe(0);

    await new Promise((r) => setTimeout(r, 50));
    expect(tree._contentIndexByPath.size).toBe(2);
  });

  it("streams results in as they arrive and ignores chunks from a superseded search", async () => {
    model.deferStreaming = true;
    await openSearch(tree);
    const input = tree.querySelector("input") as HTMLInputElement;

    input.value = "alpha";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    const first = model.pendingStreaming[0];

    // Results appear before the walk finishes (the session is still pending).
    first.emit([indexEntry(RESULTS[0])]);
    await new Promise((r) => setTimeout(r, 50));
    expect(tree._contentIndexByPath.has(RESULTS[0].path)).toBe(true);
    expect(tree._searching).toBe(true);

    first.emit([indexEntry(RESULTS[1])]);
    await new Promise((r) => setTimeout(r, 50));
    expect(tree._contentIndexByPath.size).toBe(2);

    // Supersede the search; late chunks from the old walk are dropped.
    input.value = "alphab";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 300));
    expect(tree._contentIndexByPath.size).toBe(0);
    first.emit([indexEntry(RESULTS[0])]);
    await new Promise((r) => setTimeout(r, 50));
    expect(tree._contentIndexByPath.size).toBe(0);
  });
});
