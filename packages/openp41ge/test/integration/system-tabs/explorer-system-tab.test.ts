/**
 * Integration tests for ExplorerSystemTabController.
 *
 * Regression guard: the Explorer tab's <openp41ge-worktree-tree> must fill
 * the sidebar width AND height (like the Git tab's controller). It previously
 * only set `flex:1` — which is inert inside the block `.sidebar-content` —
 * and never `height:100%`, so the mounted tree collapsed to height 0 and the
 * repo/worktree/file rows were invisible.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Side-effect: registers the <openp41ge-worktree-tree> custom element so
// document.createElement returns the real component class in jsdom.
import "../../../src/renderer/components/openp41ge-worktree-tree";
import { TestRepoService } from "../../../src/renderer/models/test-models";
import { ExplorerSystemTabController } from "../../../src/renderer/apps/system-tabs/explorer-system-tab";

describe("ExplorerSystemTabController", () => {
  let host: HTMLElement;
  let controller: ExplorerSystemTabController;
  // The tree's async _loadRepos/_loadWorkspaces read these off the preload.
  // jsdom's default stub only has file.*, so give a minimal but sufficient
  // surface for every mount (otherwise the real connectedCallback throws).
  const ORIG_OPENP41GE: unknown = window.openp41ge;
  const ORIG_SCROLL_INTO_VIEW = HTMLElement.prototype.scrollIntoView;
  const stubPreload = () => {
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      ...(ORIG_OPENP41GE as Record<string, unknown>),
      workspace: { getWindowId: () => "test-win" },
      workspaceController: {
        onWorksetRepoRefsChanged: () => () => {},
        loadStore: async () => ({ workspaces: [], lastActiveId: null }),
        createWorkspace: async () => ({ id: "w", title: "Workspace" }),
        listRepos: async () => [],
        getBranches: async () => [],
      },
    };
  };

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    controller = new ExplorerSystemTabController("sys-explorer-test");
    // jsdom doesn't implement scrollIntoView; _setFocusedRow calls it.
    HTMLElement.prototype.scrollIntoView = () => {};
    stubPreload();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = ORIG_SCROLL_INTO_VIEW;
    (window as unknown as { openp41ge: unknown }).openp41ge = ORIG_OPENP41GE;
    controller.unmount();
    host.remove();
  });

  /** Mount the controller as an Explorer tab of a (fake) sidebar — the real
   * component only reports open width/height when inside a sidebar. */
  async function mountInSidebar(): Promise<HTMLElement> {
    const sidebar = document.createElement("openp41ge-sidebar");
    host.appendChild(sidebar);
    await controller.mount(sidebar);
    return sidebar;
  }

  it("mounts an <openp41ge-worktree-tree> styled to fill the sidebar (width + height)", async () => {
    const sidebar = await mountInSidebar();

    const tree = sidebar.querySelector("openp41ge-worktree-tree") as HTMLElement | null;
    expect(tree).not.toBeNull();

    const style = (tree as HTMLElement).style;
    // Regression guard: the tree must claim the full sidebar width/height.
    // Previously only flex:1 was set — no height — so it collapsed to 0.
    expect(style.height).toBe("100%");
    expect(style.width).toBe("100%");
    expect(style.minHeight).toBe("0px");
    // It must never present itself as a collapsed drawer (width 0).
    expect(["0", "0px"]).not.toContain(style.width);
  });

  it("unmount removes the mounted tree", async () => {
    const sidebar = await mountInSidebar();
    controller.unmount();
    expect(sidebar.querySelector("openp41ge-worktree-tree")).toBeNull();
  });

  it("adopts a clicked file node as the focused row (overwrites arrow focus)", async () => {
    // Mount a real <openp41ge-worktree-tree> with a real (in-memory) repo
    // service injected BEFORE it connects, so load/render is deterministic.
    const tree = document.createElement("openp41ge-worktree-tree") as unknown as {
      _repoService: unknown;
      _focusedRowEl: HTMLElement | null;
      _clearAllTreeSelections(): void;
      _setFocusedRow(el: HTMLElement | null): void;
    };
    tree._repoService = new TestRepoService();
    (tree._repoService as TestRepoService).createRepo("test-repo");
    host.appendChild(tree);
    await (tree as unknown as { updateComplete?: Promise<unknown> }).updateComplete;

    // Simulate the file tree the uikit component would render inside its
    // shadow root, plus a prior arrow-key focus on a header row.
    const treeHost = tree as unknown as HTMLElement;
    const headerRow = document.createElement("div");
    headerRow.className = "wt-row-header";
    treeHost.appendChild(headerRow);
    const fileTree = document.createElement("openp41ge-tree");
    const sr = fileTree.attachShadow({ mode: "open" });
    sr.innerHTML = '<div class="tree-node" data-node-id="/repo/file.ts">file.ts</div>';
    const other = document.createElement("div");
    other.className = "tree-node";
    other.dataset.nodeId = "/repo/other.ts";
    other.textContent = "other.ts";
    sr.appendChild(other);
    treeHost.appendChild(fileTree);
    const node = sr.querySelector('[data-node-id="/repo/file.ts"]') as HTMLElement;
    tree._focusedRowEl = headerRow;

    // The uikit tree stops propagation of the DOM click but emits this
    // composed CustomEvent on a real click of a leaf file row.
    node.dispatchEvent(
      new CustomEvent("tree-node-click", {
        bubbles: true,
        composed: true,
        detail: { nodeId: "/repo/file.ts", meta: {} },
      }),
    );

    // Selection must move to the clicked row — NOT stay on the arrow focus.
    expect(tree._focusedRowEl).toBe(node);
    // Right after a click both focus types coincide, so the row shows the
    // faded background AND the blue outline (VS Code).
    expect(node.style.background).not.toBe("");
    expect(node.style.boxShadow).not.toBe("");
    // The owning tree reports the same node as its selectedId.
    expect((fileTree as unknown as { selectedId: string }).selectedId).toBe("/repo/file.ts");

    // Arrow-focus moves to a second file row: the cursor carries the outline,
    // the originally-clicked row keeps only its faded background (no border).
    const nodeB = sr.querySelector('[data-node-id="/repo/other.ts"]') as HTMLElement;
    tree._setFocusedRow(nodeB);
    expect(node.style.boxShadow).toBe("");
    expect(node.style.background).not.toBe("");
    expect(nodeB.style.background).not.toBe("");
    expect(nodeB.style.boxShadow).not.toBe("");

    // Clicking OUTSIDE the explorer hides the cursor row entirely (VS Code
    // behaviour) while the clicked-file fade stays visible.
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(nodeB.style.boxShadow).toBe("");
    expect(nodeB.style.background).toBe("");
    expect(node.style.background).not.toBe(""); // selection fade persists
  });
});
