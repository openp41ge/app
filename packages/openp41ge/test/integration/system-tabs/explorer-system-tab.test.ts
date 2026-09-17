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
import "../../../src/renderer/components/openp41ge-repo-tree-item";
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
    workspaceFileService.openFilePath = "/w/test.openp41ge-workspace";
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
    workspaceFileService.openFilePath = null; // no workspace selected
    const sidebar = document.createElement("openp41ge-sidebar");
    host.appendChild(sidebar);
    await controller.mount(sidebar);

    const tree = sidebar.querySelector("openp41ge-worktree-tree") as HTMLElement | null;
    expect(tree).not.toBeNull();
    expect(tree!.textContent).toContain("Select a workspace to get started");

    // Selecting a workspace swaps the placeholder for the tree skeleton.
    workspaceFileService.openFilePath = "/w/test.openp41ge-workspace";
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

  it("repo/worktree headers take selection again; selected row is grey, cursor stays blue", async () => {
    const tree = document.createElement("openp41ge-worktree-tree") as unknown as {
      _repoService: unknown;
      _selectedRowEl: HTMLElement | null;
      _focusedRowEl: HTMLElement | null;
      _navFocusVisible: boolean;
      _navigableRows(): HTMLElement[];
      _setFocusedRow(el: HTMLElement | null): void;
      _repaintSelection(): void;
    };
    tree._repoService = new TestRepoService();
    (tree._repoService as TestRepoService).createRepo("test-repo");
    host.appendChild(tree);
    await (tree as unknown as { updateComplete?: Promise<unknown> }).updateComplete;

    const el = tree as unknown as HTMLElement;
    // Repo + worktree headers are .wt-row-header rows; file rows are tree-nodes.
    const repoHeader = document.createElement("div");
    repoHeader.className = "wt-row-header";
    repoHeader.setAttribute("data-repo", "github.com/x/y");
    const wtHeader = document.createElement("div");
    wtHeader.className = "wt-row-header";
    wtHeader.setAttribute("data-worktree-row", "");
    el.appendChild(repoHeader);
    el.appendChild(wtHeader);
    const fileTree = document.createElement("openp41ge-tree");
    const sr = fileTree.attachShadow({ mode: "open" });
    const node = document.createElement("div");
    node.className = "tree-node";
    node.dataset.nodeId = "/repo/a.ts";
    sr.appendChild(node);
    el.appendChild(fileTree);

    // Header rows are navigable again alongside file rows and the
    // add-worktree/add-repository rows.
    expect(tree._navigableRows().map((r) => r.className).sort()).toEqual([
      "tree-node",
      "wt-add-row flex items-center h-[30px] pr-2 cursor-pointer select-none text-sm text-muted gap-[2px] transition-[color,background] duration-100",
      "wt-row-header",
      "wt-row-header",
    ]);

    // Click a repo header: it takes the cursor (blue) and stays selected (grey).
    tree._selectedRowEl = repoHeader;
    tree._setFocusedRow(repoHeader);
    expect(tree._focusedRowEl).toBe(repoHeader);
    expect(repoHeader.classList.contains("wt-row-focused")).toBe(true);

    // Arrow to a file row: the repo header becomes the stationary grey row.
    tree._setFocusedRow(node);
    expect(repoHeader.classList.contains("wt-row-focused")).toBe(false);
    expect(repoHeader.classList.contains("wt-row-selected")).toBe(true);
    expect(node.style.background).toContain("74, 158, 255"); // blue cursor
    expect(node.style.boxShadow).toContain("4a9eff"); // blue cursor outline

    // Repo header (stationary) carries the grey class value in CSS; focus is now
    // on the file row, which also owns the tree selection.
    expect(tree._focusedRowEl).toBe(node);
    expect(
      (fileTree as unknown as { selectedId: string | null }).selectedId,
    ).toBe("/repo/a.ts");

    // The grey/blue split: the stationary header is wt-row-selected (grey), and a
    // focused header paints wt-row-focused (blue) — CSS colors, asserted on the
    // class pair rather than computed styles (jsdom doesn't resolve them).
  });

  it("arrows reach the add-worktree and add-repository rows; Enter begins the inline edit", async () => {
    // The repo-tree-item renders in light DOM (createRenderRoot → this), so the
    // panel's _navigableRows walker recurses into it to reach its add-worktree row.
    const tree = document.createElement("openp41ge-worktree-tree") as unknown as {
      _navigableRows(): HTMLElement[];
      _setFocusedRow(el: HTMLElement | null): void;
      _focusedRowEl: HTMLElement | null;
      updateComplete: Promise<unknown>;
    };
    const item = document.createElement("openp41ge-repo-tree-item") as unknown as {
      repoName: string;
      worktrees: unknown[];
      _expanded: boolean;
      _showingAddWorktree: boolean;
      updateComplete: Promise<unknown>;
    };
    item.repoName = "org/repo";
    item.worktrees = [];
    host.appendChild(tree);
    tree.appendChild(item as never);
    // Expand the repo so it renders its per-repo add-worktree row (set after
    // mount, matching the pattern in the explorer unit tests).
    item._expanded = true;
    await tree.updateComplete;
    await item.updateComplete;

    const rows = tree._navigableRows();
    const addWt = rows.find((r) => r.classList.contains("add-worktree-row"));
    const addRepo = rows.find(
      (r) => r.classList.contains("wt-add-row") && !r.classList.contains("add-worktree-row"),
    );
    expect(addWt).toBeDefined();
    expect(addRepo).toBeDefined();

    // Arrow-focus the add-worktree row: the cursor is painted inline (blue).
    tree._setFocusedRow(addWt!);
    expect(addWt!.style.background).toContain("74, 158, 255");
    expect(addWt!.style.boxShadow).toContain("inset");
    expect(tree._focusedRowEl).toBe(addWt);

    // Enter activates the row and begins the inline branch-name input.
    tree.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await item.updateComplete;
    expect(item._showingAddWorktree).toBe(true);
    expect(item.querySelector("#wt-addwt-input")).not.toBeNull();
  });

  it.each([
    ["add-worktree", "#wt-addwt-input", "add-worktree-row"],
    ["add-repository", "#wt-addrepo-input", "add-repo-label"],
  ])(
    "Escape from the %s inline input restores the arrow cursor and panel focus",
    async (_label, inputSelector, rowMarker) => {
      const tree = document.createElement("openp41ge-worktree-tree") as unknown as {
        _navigableRows(): HTMLElement[];
        _setFocusedRow(el: HTMLElement | null): void;
        _focusedRowEl: HTMLElement | null;
        _findAddRepoRow(): HTMLElement | null;
        _navFocusVisible: boolean;
        updateComplete: Promise<unknown>;
      };
      const item = document.createElement("openp41ge-repo-tree-item") as unknown as {
        repoName: string;
        worktrees: unknown[];
        _expanded: boolean;
        _showingAddWorktree: boolean;
        updateComplete: Promise<unknown>;
      };
      item.repoName = "org/repo";
      item.worktrees = [];
      host.appendChild(tree);
      tree.appendChild(item as never);
      item._expanded = true;
      await tree.updateComplete;
      await item.updateComplete;

      const rows = tree._navigableRows();
      const isAddRepo = rowMarker === "add-repo-label";
      const addRow = isAddRepo
        ? rows.find((r) => r.classList.contains("wt-add-row") && !r.classList.contains("add-worktree-row"))!
        : rows.find((r) => r.classList.contains("add-worktree-row"))!;
      expect(addRow).toBeDefined();

      // Arrow-focus the add row, then Enter to begin its inline input.
      tree._navFocusVisible = true;
      tree._setFocusedRow(addRow);
      expect(tree._focusedRowEl).toBe(addRow);
      tree.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      await tree.updateComplete;
      await item.updateComplete;
      const input = tree.querySelector<HTMLInputElement>(inputSelector);
      expect(input).not.toBeNull();

      // Escape dismisses the input and must restore the arrow cursor on the
      // (now idle) add row so ArrowUp/Down continues from where it was.
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
      );
      await new Promise((r) => setTimeout(r, 30));
      await tree.updateComplete;
      await item.updateComplete;

      const idle = isAddRepo
        ? tree._findAddRepoRow()
        : item.querySelector<HTMLElement>("[class*='add-worktree-row']");
      expect(tree._focusedRowEl).toBe(idle);
      expect(idle!.style.background).toContain("74, 158, 255");
      // The panel must own DOM focus so the next arrow reaches _onKeyDown.
      expect(document.activeElement).toBe(tree);
    },
  );

  it("clears the arrow cursor when a create row enters edit mode and restores it on Escape", async () => {
    // Regression guard for two bugs in create-row keyboard navigation:
    //  1. Entering the inline input (arrow + Enter) must NOT leave the blue
    //     arrow cursor framing the text being typed.
    //  2. Escape must hand the arrow cursor back to the create row so the user
    //     can keep arrowing (previously the cursor was lost entirely).
    const tree = document.createElement("openp41ge-worktree-tree") as unknown as {
      _setFocusedRow(el: HTMLElement | null): void;
      _focusedRowEl: HTMLElement | null;
      _selectedRowEl: HTMLElement | null;
      _navFocusVisible: boolean;
      updateComplete: Promise<unknown>;
    };
    host.appendChild(tree);
    const fileTree = document.createElement("openp41ge-tree");
    const sr = fileTree.attachShadow({ mode: "open" });
    sr.innerHTML =
      '<div class="tree-node" data-node-id="new:main::/root::folder">+ add folder</div>';
    const createRow = sr.querySelector('[data-node-id="new:main::/root::folder"]') as HTMLElement;
    tree.appendChild(fileTree);
    await (tree as unknown as { updateComplete?: Promise<unknown> }).updateComplete;

    // Arrow-focus the create row → blue cursor painted (inline, like a node).
    tree._navFocusVisible = true;
    tree._setFocusedRow(createRow);
    expect(createRow.style.background).toContain("74, 158, 255");
    expect(createRow.style.boxShadow).toContain("inset");
    expect(tree._focusedRowEl).toBe(createRow);

    // Enter: the repo item dispatches create-row-edit(editing=true). The panel
    // must drop its cursor/selection for this row so the input isn't framed.
    tree.dispatchEvent(
      new CustomEvent("create-row-edit", {
        bubbles: true,
        composed: true,
        detail: { nodeId: createRow.dataset.nodeId, editing: true },
      }),
    );
    expect(tree._focusedRowEl).toBeNull();
    expect(tree._selectedRowEl).toBeNull();
    expect(createRow.style.background).toBe("");
    expect(createRow.style.boxShadow).toBe("");

    // Escape: create-row-edit(editing=false) restores the cursor. The restore
    // is deferred via setTimeout so the inline input is re-rendered out first
    // (a synchronous paint would be wiped by _paintRow's input guard).
    tree.dispatchEvent(
      new CustomEvent("create-row-edit", {
        bubbles: true,
        composed: true,
        detail: { nodeId: createRow.dataset.nodeId, editing: false },
      }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(tree._focusedRowEl).toBe(createRow);
    expect(createRow.style.background).toContain("74, 158, 255");
    expect(createRow.style.boxShadow).toContain("inset");
    // The panel must re-grab DOM focus (it has tabindex=-1) so the next
    // ArrowUp/Down is caught by _onKeyDown instead of scrolling the page.
    expect(document.activeElement).toBe(tree);
  });

  it("never paints the grey stationary bar on add rows (even if they were selected)", async () => {
    // Add rows ("+ new file/folder", add worktree, add repository) are actions,
    // not files — only the blue arrow cursor may appear. The grey "selected"
    // bar must not linger on them after the cursor moves away, while a plain
    // file/folder row keeps its grey bar (VS Code active-file selection).
    const tree = document.createElement("openp41ge-worktree-tree") as unknown as {
      _setFocusedRow(el: HTMLElement | null): void;
      _focusedRowEl: HTMLElement | null;
      _selectedRowEl: HTMLElement | null;
      _navFocusVisible: boolean;
      updateComplete: Promise<unknown>;
    };
    host.appendChild(tree);
    const fileTree = document.createElement("openp41ge-tree");
    const sr = fileTree.attachShadow({ mode: "open" });
    sr.innerHTML =
      '<div class="tree-node" data-node-id="/repo/a.ts">a.ts</div>' +
      '<div class="tree-node" data-node-id="new:main::/root::file">+ add file</div>';
    const normal = sr.querySelector('[data-node-id="/repo/a.ts"]') as HTMLElement;
    const createRow = sr.querySelector('[data-node-id="new:main::/root::file"]') as HTMLElement;
    tree.appendChild(fileTree);
    await (tree as unknown as { updateComplete?: Promise<unknown> }).updateComplete;

    // Click the normal row (adopts it as the selected/active row).
    normal.dispatchEvent(
      new CustomEvent("tree-node-click", {
        bubbles: true,
        composed: true,
        detail: { nodeId: "/repo/a.ts", meta: {} },
      }),
    );
    await new Promise((r) => setTimeout(r, 80));
    expect(tree._selectedRowEl).toBe(normal);

    // Arrow-focus the create row: blue cursor only (no grey). The clicked
    // normal row is now selected-but-not-focused → grey bar persists.
    tree._navFocusVisible = true;
    tree._setFocusedRow(createRow);
    expect(createRow.style.background).toContain("74, 158, 255");
    expect(normal.style.background).toContain("color-mix");

    // Arrow away from the create row: it must NOT be painted grey.
    tree._setFocusedRow(normal);
    expect(createRow.style.background).toBe("");
    expect(createRow.style.boxShadow).toBe("");
    expect(normal.style.background).not.toBe("");
    expect(tree._selectedRowEl).toBe(normal);
  });
});
