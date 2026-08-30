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
import { workspaceFileService } from "../../../src/renderer/services/workspace-file-service";

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
    workspaceFileService.activeFilePath = "/w/test.openp41ge-workspace";
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

  it("shows a disabled placeholder with no workspace, and the tree once one is selected", async () => {
    workspaceFileService.activeFilePath = null; // no workspace selected
    const sidebar = document.createElement("openp41ge-sidebar");
    host.appendChild(sidebar);
    await controller.mount(sidebar);

    const tree = sidebar.querySelector("openp41ge-worktree-tree") as HTMLElement | null;
    expect(tree).not.toBeNull();
    expect(tree!.textContent).toContain("Select a workspace to get started");

    // Selecting a workspace swaps the placeholder for the tree skeleton.
    workspaceFileService.activeFilePath = "/w/test.openp41ge-workspace";
    document.dispatchEvent(new CustomEvent("workspace-file-changed", { bubbles: true }));
    await (tree as unknown as { updateComplete?: Promise<unknown> }).updateComplete;
    expect(tree!.textContent).not.toContain("Select a workspace to get started");
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

    // A click that goes straight INTO the editor with NO arrowing: selector
    // and cursor share the row (sel === focus), so clicking outside must NOT
    // wipe the fade — the clicked row keeps its background, border cleared.
    nodeB.dispatchEvent(
      new CustomEvent("tree-node-click", {
        bubbles: true,
        composed: true,
        detail: { nodeId: "/repo/other.ts", meta: {} },
      }),
    );
    expect(tree._focusedRowEl).toBe(nodeB);
    expect(tree._navFocusVisible).toBe(true);
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(tree._navFocusVisible).toBe(false);
    expect(nodeB.style.boxShadow).toBe(""); // cursor hidden with the row
    expect(nodeB.style.background).not.toBe(""); // clicked-row fade persists
  });

  it("selection/focus is file-folder-only: header rows never take the cursor", async () => {
    const tree = document.createElement("openp41ge-worktree-tree") as unknown as {
      _focusedRowEl: HTMLElement | null;
      _navFocusVisible: boolean;
      _navigableRows(): HTMLElement[];
      _setFocusedRow(el: HTMLElement | null): void;
      _clearAllTreeSelections(): void;
      _onPanelClick(e: Event): void;
    };
    tree._repoService = new TestRepoService();
    (tree._repoService as TestRepoService).createRepo("test-repo");
    host.appendChild(tree);
    await (tree as unknown as { updateComplete?: Promise<unknown> }).updateComplete;

    const el = tree as unknown as HTMLElement;
    // Repo + worktree headers are .wt-row-header rows.
    const repoHeader = document.createElement("div");
    repoHeader.className = "wt-row-header";
    repoHeader.setAttribute("data-repo", "github.com/x/y");
    const wtHeader = document.createElement("div");
    wtHeader.className = "wt-row-header";
    wtHeader.setAttribute("data-worktree-row", "");
    el.appendChild(repoHeader);
    el.appendChild(wtHeader);
    // File rows live inside the uikit <openp41ge-tree> shadow root.
    const fileTree = document.createElement("openp41ge-tree");
    const sr = fileTree.attachShadow({ mode: "open" });
    const node = document.createElement("div");
    node.className = "tree-node";
    node.dataset.nodeId = "/repo/a.ts";
    sr.appendChild(node);
    el.appendChild(fileTree);

    // Arrow navigation must only traverse file/folder rows — headers excluded.
    expect(tree._navigableRows().map((r) => r.className)).toEqual(["tree-node"]);

    // Clicking a repo or worktree header must NOT paint a cursor/selection.
    tree._onPanelClick(new MouseEvent("click", { bubbles: true }));
    repoHeader.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(tree._focusedRowEl).toBeNull();
    wtHeader.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(tree._focusedRowEl).toBeNull();

    // Header rows never gain a highlight class either.
    expect(repoHeader.classList.contains("wt-row-focused")).toBe(false);
    expect(repoHeader.classList.contains("wt-row-selected")).toBe(false);

    // Clicking a file row still focuses it (blue cursor on the coincident
    // sel+focus row), then arrowing away leaves the ORIGINAL row with the
    // new light-grey (border-derived) selection background.
    const nodeB = document.createElement("div");
    nodeB.className = "tree-node";
    nodeB.dataset.nodeId = "/repo/b.ts";
    sr.appendChild(nodeB);
    // Simulate the click path: selection adopts the row, then focus follows.
    (tree as unknown as { _selectedRowEl: HTMLElement | null })._selectedRowEl = node;
    tree._setFocusedRow(node);
    expect(tree._focusedRowEl).toBe(node);
    expect(node.style.background).toContain("74, 158, 255"); // blue cursor
    expect(node.style.boxShadow).toContain("4a9eff"); // blue cursor outline

    // Arrow away: station-kept row goes grey (border color), cursor row is blue.
    tree._setFocusedRow(nodeB);
    expect(node.style.background).toContain("color-mix"); // border-derived grey
    expect(node.style.background).not.toContain("74, 158, 255"); // no longer blue
    expect(node.style.boxShadow).toBe("");
    expect(nodeB.style.background).toContain("74, 158, 255"); // blue cursor
    expect(nodeB.style.boxShadow).toContain("4a9eff");

    // Repo/worktree headers stay clean even after a repaint sweep.
    tree._clearAllTreeSelections();
    expect(repoHeader.classList.contains("wt-row-focused")).toBe(false);
    expect(repoHeader.classList.contains("wt-row-selected")).toBe(false);
  });
});
