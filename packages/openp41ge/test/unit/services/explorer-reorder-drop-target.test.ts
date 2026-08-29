// @ts-nocheck
/**
 * Unit tests for ExplorerReorderDropTarget — the explorer repo-reorder drop
 * target used by the unified bitmap drag pipeline.
 *
 * Replaces the legacy native HTML5 dragenter/dragover/drop reorder block.
 * A repo-row drop fires `explorer-reorder-repos` { repoName, fromIndex,
 * dropIndex }; a worktree-row drop cancels (worktrees are not reorderable).
 * onHover draws the thin-focus insertion line between repo rows.
 */

import {
  ExplorerReorderDropTarget,
  EXPLORER_REORDER_EVENT,
} from "@openp41ge/renderer/services/drop-targets/explorer-reorder-drop-target";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeRepoItem(repoName: string, top: number, height = 30): HTMLElement {
  const el = document.createElement("openp41ge-repo-tree-item");
  el.setAttribute("data-repo", repoName);
  const rect = { top, height, bottom: top + height } as DOMRect;
  Object.defineProperty(el, "getBoundingClientRect", { value: () => rect });
  return el;
}

function makeDropZone(rows: number): HTMLElement {
  const zone = document.createElement("div");
  zone.setAttribute("data-explorer-drop-zone", "");
  for (let i = 0; i < rows; i++) {
    const wrapper = document.createElement("div");
    wrapper.appendChild(makeRepoItem(`repo-${i}`, i * 40));
    zone.appendChild(wrapper);
  }
  document.body.appendChild(zone);
  return zone;
}

/** A repo-row open-tab source. */
function repoSource(repoName: string) {
  return {
    type: "open-tab",
    getDragData: () => ({
      type: "open-tab",
      appType: "git-repository",
      title: repoName,
      tabConfig: { repoName },
    }),
    createGhost: () => document.createElement("div"),
    onDragStart: () => {},
    onDragEnd: () => {},
  };
}

/** A worktree-row open-tab source. */
function worktreeSource(repoName: string, branch: string) {
  return {
    type: "open-tab",
    getDragData: () => ({
      type: "open-tab",
      appType: "git-repository",
      title: branch,
      tabConfig: { repoName, branch },
    }),
    createGhost: () => document.createElement("div"),
    onDragStart: () => {},
    onDragEnd: () => {},
  };
}

function captureReorderEvent(zone: HTMLElement): () => Record<string, unknown> | null {
  let detail: Record<string, unknown> | null = null;
  zone.addEventListener(EXPLORER_REORDER_EVENT, (e) => {
    detail = (e as CustomEvent).detail as Record<string, unknown>;
  });
  return () => detail;
}

describe("ExplorerReorderDropTarget", () => {
  let zone: HTMLElement;
  let target: ExplorerReorderDropTarget;

  beforeEach(() => {
    zone = makeDropZone(3);
    target = new ExplorerReorderDropTarget(zone);
  });

  afterEach(() => {
    zone.remove();
    target.onLeave();
  });

  test("repo-row drop fires explorer-reorder-repos with fromIndex/dropIndex", async () => {
    const readDetail = captureReorderEvent(zone);
    // cursor at y=90 → below mid (0*40+15=15, 55, 95) → before 3rd row mid is
    // 95 > 90 → dropIndex 2. Dragging repo-0 there.
    const result = await target.onDrop(repoSource("repo-0"), 100, 90);

    expect(result.success).toBe(true);
    const detail = readDetail();
    expect(detail).toEqual({ repoName: "repo-0", fromIndex: 0, dropIndex: 2 });
  });

  test("repo-row drop at the top reorders to index 0", async () => {
    const readDetail = captureReorderEvent(zone);
    // cursor at y=5 → before first row's midpoint (15) → dropIndex 0
    const result = await target.onDrop(repoSource("repo-2"), 100, 5);

    expect(result.success).toBe(true);
    expect(readDetail()).toEqual({ repoName: "repo-2", fromIndex: 2, dropIndex: 0 });
  });

  test("worktree-row drop cancels and fires no reorder event", async () => {
    const readDetail = captureReorderEvent(zone);
    const result = await target.onDrop(worktreeSource("repo-0", "main"), 100, 90);

    expect(result.success).toBe(false);
    expect(readDetail()).toBeNull();
  });

  test("onHover draws the insertion line for a repo row and removes it onLeave", () => {
    const feedback = target.onHover(repoSource("repo-0"), 100, 90);
    expect(feedback).not.toBeNull();
    expect(zone.querySelector(".explorer-reorder-line")).not.toBeNull();

    target.onLeave();
    expect(zone.querySelector(".explorer-reorder-line")).toBeNull();
  });

  test("onHover returns null for a worktree row (no reorder advertised)", () => {
    const feedback = target.onHover(worktreeSource("repo-0", "main"), 100, 90);
    expect(feedback).toBeNull();
    expect(zone.querySelector(".explorer-reorder-line")).toBeNull();
  });

  test("drop on an empty zone resolves success but fires no reorder (nothing to move)", async () => {
    zone.remove();
    zone = document.createElement("div");
    zone.setAttribute("data-explorer-drop-zone", "");
    document.body.appendChild(zone);
    const t = new ExplorerReorderDropTarget(zone);
    const readDetail = captureReorderEvent(zone);

    const result = await t.onDrop(repoSource("repo-0"), 100, 5);
    expect(result.success).toBe(true);
    // An empty list has no repo to find, so no reorder event is fired.
    expect(readDetail()).toBeNull();
    t.onLeave();
  });
});
