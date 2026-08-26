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
import { ExplorerSystemTabController } from "../../../src/renderer/apps/system-tabs/explorer-system-tab";

describe("ExplorerSystemTabController", () => {
  let host: HTMLElement;
  let controller: ExplorerSystemTabController;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    controller = new ExplorerSystemTabController("sys-explorer-test");
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
  });

  it("mounts an <openp41ge-worktree-tree> styled to fill the sidebar (width + height)", async () => {
    await controller.mount(host);

    const tree = host.querySelector("openp41ge-worktree-tree") as HTMLElement | null;
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
    await controller.mount(host);
    controller.unmount();
    expect(host.querySelector("openp41ge-worktree-tree")).toBeNull();
  });
});
