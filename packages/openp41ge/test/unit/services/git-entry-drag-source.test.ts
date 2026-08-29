// @ts-nocheck
/**
 * Unit tests for GitEntryDragSource — the explorer repo/worktree row drag
 * source.
 *
 * The visible ghost is the main-process DragGhostManager window (a captured
 * bitmap of the source row), so the in-DOM ghost is invisible and the source
 * row is NOT dimmed — identical to FileDragSource.
 *
 * The ACTION is decided by drop location: over the grid the `open-tab`
 * payload opens a git-repository pane (branch-scoped for a worktree row);
 * over the explorer the host fires explorer-reorder-repos.
 */

import { GitEntryDragSource } from "@openp41ge/renderer/services/drag-sources/git-entry-drag-source";

describe("GitEntryDragSource", () => {
  test("repo row: getDragData reports an open-tab payload without a branch", () => {
    const source = new GitEntryDragSource("acme", "acme");
    expect(source.getDragData()).toEqual({
      type: "open-tab",
      appType: "git-repository",
      title: "acme",
      tabConfig: { repoName: "acme" },
    });
  });

  test("worktree row: getDragData carries the branch for a branch-scoped browser", () => {
    const source = new GitEntryDragSource("acme", "main", "main");
    expect(source.getDragData()).toEqual({
      type: "open-tab",
      appType: "git-repository",
      title: "main",
      tabConfig: { repoName: "acme", branch: "main" },
    });
  });

  test("createGhost returns an invisible, pointer-inert element (visual is the BrowserWindow bitmap)", () => {
    const source = new GitEntryDragSource("acme", "acme");
    const ghost = source.createGhost();

    expect(ghost.style.pointerEvents).toBe("none");
    expect(ghost.style.opacity).toBe("0");
  });

  test("onDragStart does not touch the source row (bitmap is captured at full opacity)", () => {
    const source = new GitEntryDragSource("acme", "acme");
    // GitEntryDragSource has no row reference — onDragStart must be a no-op
    // (the bitmap ghost is captured from the row by the main process).
    expect(() => source.onDragStart()).not.toThrow();
  });

  test("onDragEnd removes the in-DOM ghost", () => {
    const source = new GitEntryDragSource("acme", "acme");
    const ghost = source.createGhost();
    document.body.appendChild(ghost);

    source.onDragEnd({ success: false });
    expect(ghost.parentNode).toBeNull();
  });
});
