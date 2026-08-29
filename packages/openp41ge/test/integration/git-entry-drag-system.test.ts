// @vitest-environment jsdom
/**
 * Integration tests for the unified git-entry (repo/worktree row) drag wiring
 * in init-drag-system.
 *
 * Verifies:
 *   - mousedown on a [data-repo-row] / [data-worktree-row] starts an
 *     "open-tab" drag with the deferred bitmap start params
 *   - the source row's native draggable is disabled for the gesture and
 *     restored on mouseup
 *   - the first POSITION event fires drag.start with kind "open-tab" and the
 *     openTabData payload (so a cross-window drop can resolve it)
 *   - openp41geTargetResolver routes the open-tab drag over the explorer list
 *     to the ExplorerReorderDropTarget
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  initDragSystem,
  openp41geTargetResolver,
} from "@openp41ge/renderer/services/init-drag-system";
import { DRAG_EVENTS } from "@openp41ge/renderer/openp41ge-tabs-adapter";

type Hooks = {
  getCurrentDragSourceType: () => string | null;
  getGitEntryPendingStart: () => Record<string, unknown> | null;
  getCurrentDragData: () => Record<string, unknown> | null;
  hasGitEntryRowSuppressed: () => boolean;
  restoreGitEntryRowDraggable: () => void;
};

function hooks(): Hooks {
  return (window as unknown as { __openp41geTestHooks: Hooks }).__openp41geTestHooks;
}

function makeRow(tag: "repo" | "worktree", repoName: string, branch?: string): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("draggable", "true");
  if (tag === "repo") {
    row.setAttribute("data-repo-row", "");
  } else {
    row.setAttribute("data-worktree-row", "");
    row.setAttribute("data-branch", branch ?? "main");
  }
  row.setAttribute("data-repo", repoName);
  row.textContent = branch ?? repoName;
  document.body.appendChild(row);
  return row;
}

/** A commit-search result row — drags the git-commit-search app, not the
 * git-repository browser. */
function makeSearchRow(repoName: string, hash: string, shortHash: string): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("draggable", "true");
  row.setAttribute("data-repo-row", "");
  row.setAttribute("data-git-search-result", "");
  row.setAttribute("data-repo", repoName);
  row.setAttribute("data-hash", hash);
  row.setAttribute("data-short-hash", shortHash);
  row.textContent = shortHash;
  document.body.appendChild(row);
  return row;
}

function mouseDown(el: HTMLElement, opts: { x?: number; y?: number; button?: number } = {}) {
  el.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: opts.button ?? 0,
      clientX: opts.x ?? 30,
      clientY: opts.y ?? 30,
      screenX: opts.x ?? 30,
      screenY: opts.y ?? 30,
    }),
  );
}

function firstPosition(x = 60, y = 60): void {
  document.dispatchEvent(
    new CustomEvent(DRAG_EVENTS.POSITION, {
      detail: { screenX: 60, screenY: 60 },
    }),
  );
  void x;
  void y;
}

describe("git-entry drag wiring (init-drag-system)", () => {
  let cleanup: () => void;
  let dragStart: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const drag = {
      start: vi.fn(),
      move: vi.fn(),
      end: vi.fn(),
      activate: vi.fn(),
      ghostForward: vi.fn(),
      check: vi.fn().mockResolvedValue(null),
      getActive: vi.fn().mockResolvedValue(null),
      endSession: vi.fn(),
      onEndSession: vi.fn().mockReturnValue(() => {}),
      onGhostShow: vi.fn().mockReturnValue(() => {}),
      onDragState: vi.fn().mockReturnValue(() => {}),
    };
    (window as unknown as { openp41ge: any }).openp41ge = {
      workspace: {
        getWindowId: vi.fn().mockReturnValue("win-1"),
        dispatch: vi.fn(),
      },
      drag,
      workspaceController: {},
      file: { readRange: vi.fn() },
    };
    dragStart = drag.start;
    cleanup = initDragSystem();
  });

  afterEach(() => {
    hooks().resetTestDragState();
    cleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("mousedown on a repo row starts an open-tab drag and defers the bitmap start", () => {
    const row = makeRow("repo", "acme");
    mouseDown(row);

    expect(hooks().getCurrentDragSourceType()).toBe("open-tab");
    expect(hooks().getCurrentDragData()).toEqual({
      type: "open-tab",
      appType: "git-repository",
      title: "acme",
      tabConfig: { repoName: "acme" },
    });

    const pending = hooks().getGitEntryPendingStart();
    expect(pending).not.toBeNull();
    expect((pending as { repoName: string; branch?: string }).repoName).toBe("acme");
    expect((pending as { branch?: string }).branch).toBeUndefined();

    // Native draggable disabled for the gesture; drag.start NOT fired yet.
    expect(row.getAttribute("draggable")).toBe("false");
    expect(hooks().hasGitEntryRowSuppressed()).toBe(true);
    expect(dragStart).not.toHaveBeenCalled();
  });

  it("mousedown on a worktree row defers a branch-scoped open-tab start", () => {
    const row = makeRow("worktree", "acme", "main");
    mouseDown(row);

    const pending = hooks().getGitEntryPendingStart();
    expect((pending as { repoName: string }).repoName).toBe("acme");
    expect((pending as { branch?: string }).branch).toBe("main");
    expect(hooks().getCurrentDragData()).toEqual({
      type: "open-tab",
      appType: "git-repository",
      title: "main",
      tabConfig: { repoName: "acme", branch: "main" },
    });
  });

  it("right-button mousedown never starts a git-entry drag", () => {
    const row = makeRow("repo", "acme");
    mouseDown(row, { button: 2 });
    expect(hooks().getCurrentDragSourceType()).toBeNull();
    expect(hooks().getGitEntryPendingStart()).toBeNull();
    expect(row.getAttribute("draggable")).toBe("true");
  });

  it("first POSITION event fires drag.start with kind open-tab and the openTabData payload", () => {
    const row = makeRow("worktree", "acme", "main");
    mouseDown(row);
    firstPosition();

    expect(dragStart).toHaveBeenCalledTimes(1);
    const args = dragStart.mock.calls[0];
    expect(args[11]).toBe("open-tab"); // dragType
    expect(args[13]).toBeTypeOf("object"); // captureRect
    expect(args[14]).toBe(2); // TAB_GHOST_CAPTURE_INSET
    // openTabData (last arg) carries the payload for cross-window resolution
    expect(args[15]).toEqual({
      appType: "git-repository",
      tabConfig: { repoName: "acme", branch: "main" },
    });
  });

  it("mouseup restores the row's native draggable and clears the deferred start", () => {
    const row = makeRow("repo", "acme");
    mouseDown(row);
    firstPosition();
    expect(row.getAttribute("draggable")).toBe("false");

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    expect(row.getAttribute("draggable")).toBe("true");
    expect(hooks().getGitEntryPendingStart()).toBeNull();
    expect(hooks().getCurrentDragSourceType()).toBeNull();
    expect(hooks().hasGitEntryRowSuppressed()).toBe(false);
  });

  it("openp41geTargetResolver routes an open-tab drag over the explorer list to the reorder target", () => {
    const row = makeRow("repo", "acme");
    mouseDown(row);

    // jsdom lacks elementFromPoint — stub it to fake the cursor over the
    // explorer drop zone.
    const zone = document.createElement("div");
    zone.setAttribute("data-explorer-drop-zone", "");
    const item = document.createElement("openp41ge-repo-tree-item");
    item.setAttribute("data-repo", "acme");
    zone.appendChild(item);
    document.body.appendChild(zone);
    (
      document as unknown as { elementFromPoint: (x: number, y: number) => HTMLElement }
    ).elementFromPoint = () => item;

    try {
      const target = openp41geTargetResolver(300, 300);
      expect(target).not.toBeNull();
      expect((target as { type: string }).type).toBe("explorer-reorder");
    } finally {
      zone.remove();
      delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    }
  });

  it("openp41geTargetResolver returns null over empty space for an open-tab drag", () => {
    const row = makeRow("repo", "acme");
    mouseDown(row);

    (
      document as unknown as { elementFromPoint: (x: number, y: number) => HTMLElement }
    ).elementFromPoint = () => document.createElement("div");

    try {
      const target = openp41geTargetResolver(300, 300);
      expect(target).toBeNull();
    } finally {
      delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    }
    row.remove();
  });

  it("cross-window open-tab drop over the grid opens the git-repository pane (session ended)", async () => {
    // Seed a remote open-tab drag session (as if another window dragged a
    // worktree row) and drop it over THIS window's grid.
    const grid = document.createElement("tab-grid");
    (grid as HTMLElement & { winId: string; cols: number }).winId = "win-2";
    (grid as HTMLElement & { winId: string; cols: number }).cols = 2;
    const rect = {
      left: 0,
      top: 0,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
    grid.getBoundingClientRect = () => rect;
    Object.defineProperty(grid, "dropTarget", {
      value: {
        type: "grid",
        element: grid,
        onHover: () => null,
        onDrop: () => Promise.resolve({ success: true as const }),
        onLeave: () => {},
      },
      configurable: true,
      writable: true,
    });
    document.body.appendChild(grid);

    (
      document as unknown as { elementFromPoint: (x: number, y: number) => HTMLElement }
    ).elementFromPoint = () => grid;

    const openp41ge = window.openp41ge as unknown as {
      drag: {
        getActive: () => Promise<unknown>;
        endSession: () => void;
        // remaining preload methods are mocked in beforeEach
      };
      workspace: { dispatch: ReturnType<typeof vi.fn> };
    };
    openp41ge.drag.getActive = vi.fn().mockResolvedValue({
      sourceWinId: "win-1",
      label: "main",
      dragData: {
        type: "open-tab",
        appType: "git-repository",
        title: "main",
        tabConfig: { repoName: "acme", branch: "main" },
      },
    });
    const dispatch = openp41ge.workspace.dispatch as ReturnType<typeof vi.fn>;
    openp41ge.drag.endSession = vi.fn();

    const hooks = (window as unknown as { __openp41geTestHooks: any }).__openp41geTestHooks;
    await hooks.callHandleCrossWindowDrop(200, 200, 200, 200); // cell-center of col 0

    expect(dispatch).toHaveBeenCalledWith(
      "actionOpenFile",
      "win-2",
      "git-repository",
      "main",
      "acme",
      0,
      true,
    );
    expect(openp41ge.drag.endSession).toHaveBeenCalled();

    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    grid.remove();
  });

  it("mousedown on a commit-search result row defers an open-tab start for the git-commit-search app", () => {
    const row = makeSearchRow("acme", "af".repeat(20), "abdef01");
    mouseDown(row);

    expect(hooks().getCurrentDragData()).toEqual({
      type: "open-tab",
      appType: "git-commit-search",
      title: "abdef01",
      tabConfig: { repoName: "acme", hash: "af".repeat(20) },
    });
    const pending = hooks().getGitEntryPendingStart() as {
      appType?: string;
      hash?: string;
    };
    expect(pending.appType).toBe("git-commit-search");
    expect(pending.hash).toBe("af".repeat(20));
    expect(row.getAttribute("draggable")).toBe("false");
  });

  it("first POSITION for a search row fires drag.start with git-commit-search openTabData", () => {
    makeSearchRow("acme", "af".repeat(20), "abdef01");
    const row = document.querySelector("[data-git-search-result]") as HTMLElement;
    mouseDown(row);
    firstPosition();

    expect(dragStart).toHaveBeenCalledTimes(1);
    const args = dragStart.mock.calls[0];
    expect(args[11]).toBe("open-tab");
    expect(args[15]).toEqual({
      appType: "git-commit-search",
      tabConfig: { repoName: "acme", hash: "af".repeat(20) },
    });
  });

  it("cross-window open-tab drop of a git-commit-search row opens the placeholder app scoped to repo + commit", async () => {
    const grid = document.createElement("tab-grid");
    (grid as HTMLElement & { winId: string; cols: number }).winId = "win-2";
    (grid as HTMLElement & { winId: string; cols: number }).cols = 2;
    const rect = {
      left: 0,
      top: 0,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
    grid.getBoundingClientRect = () => rect;
    Object.defineProperty(grid, "dropTarget", {
      value: {
        type: "grid",
        element: grid,
        onHover: () => null,
        onDrop: () => Promise.resolve({ success: true as const }),
        onLeave: () => {},
      },
      configurable: true,
      writable: true,
    });
    document.body.appendChild(grid);
    (
      document as unknown as { elementFromPoint: (x: number, y: number) => HTMLElement }
    ).elementFromPoint = () => grid;

    const openp41ge = window.openp41ge as unknown as {
      drag: { getActive: () => Promise<unknown>; endSession: () => void };
      workspace: { dispatch: ReturnType<typeof vi.fn> };
    };
    openp41ge.drag.getActive = vi.fn().mockResolvedValue({
      sourceWinId: "win-1",
      label: "abdef01",
      dragData: {
        type: "open-tab",
        appType: "git-commit-search",
        title: "abdef01",
        tabConfig: { repoName: "acme", hash: "af".repeat(20), shortHash: "abdef01" },
      },
    });
    const dispatch = openp41ge.workspace.dispatch as ReturnType<typeof vi.fn>;
    openp41ge.drag.endSession = vi.fn();

    const hooks = (window as unknown as { __openp41geTestHooks: any }).__openp41geTestHooks;
    await hooks.callHandleCrossWindowDrop(200, 200, 200, 200);

    expect(dispatch).toHaveBeenCalledWith(
      "actionOpenFile",
      "win-2",
      "git-commit-search",
      "abdef01",
      JSON.stringify({ repoName: "acme", hash: "af".repeat(20) }),
      0,
      true,
    );
    expect(openp41ge.drag.endSession).toHaveBeenCalled();

    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    grid.remove();
  });
});
