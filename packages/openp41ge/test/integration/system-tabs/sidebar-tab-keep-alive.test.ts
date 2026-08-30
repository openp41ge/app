/**
 * Keep-alive + suspend for sidebar system tabs.
 *
 * The sidebar must NOT tear down and rebuild a tab when you switch away and
 * back (or close/reopen the panel). Each tab gets a persistent host in the
 * content area; switching only toggles a `.visible` class and calls
 * `setVisible(false)` so hidden tabs do no background work (reloads/listeners
 * deferred via a dirty flag, reconciled in place on return).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

// Registers <openp41ge-sidebar>.
import "../../../src/renderer/components/openp41ge-sidebar";
import { registerSystemTabType } from "../../../src/renderer/apps/app-registry";
import type { SystemTabController } from "../../../src/renderer/controllers/types";
import { ExplorerSystemTabController } from "../../../src/renderer/apps/system-tabs/explorer-system-tab";
import { CommitSearchSystemTabController } from "../../../src/renderer/apps/system-tabs/commit-search-system-tab";

/** Minimal controllable SystemTabController for the sidebar keep-alive test. */
class StubSystemTab implements SystemTabController {
  readonly tabId: string;
  readonly appType: string;
  el: HTMLElement | null = null;
  mountCount = 0;
  unmountCount = 0;
  visibleHistory: boolean[] = [];

  constructor(tabId: string, appType: string) {
    this.tabId = tabId;
    this.appType = appType;
  }

  mount(container: HTMLElement): void {
    this.mountCount += 1;
    if (!this.el) {
      this.el = document.createElement("div");
      this.el.dataset.stub = this.appType;
    }
    container.appendChild(this.el);
  }

  unmount(): void {
    this.unmountCount += 1;
    if (this.el?.parentNode) this.el.remove();
  }

  setVisible(visible: boolean): void {
    this.visibleHistory.push(visible);
  }
}

describe("Sidebar system-tab keep-alive", () => {
  let host: HTMLElement;
  const ORIG_OPENP41GE: unknown = window.openp41ge;

  const stubPreload = () => {
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      ...(ORIG_OPENP41GE as Record<string, unknown>),
      workspace: { getWindowId: () => "test-win" },
      file: {
        readdir: async () => [],
        readFile: async () => ({ content: "", error: null }),
      },
      workspaceController: {
        loadStore: async () => ({ workspaces: [], lastActiveId: null }),
        listRepos: async () => [],
        listWorktrees: async () => [],
        getBranches: async () => [],
        getUntrackedFiles: async () => [],
      },
    } as unknown as typeof window.openp41ge;
  };

  beforeAll(() => {
    registerSystemTabType({
      id: "stub-a",
      label: "A",
      icon: "",
      description: "",
      defaultSide: "left",
      createController: (tid) => new StubSystemTab(tid, "stub-a"),
    });
    registerSystemTabType({
      id: "stub-b",
      label: "B",
      icon: "",
      description: "",
      defaultSide: "left",
      createController: (tid) => new StubSystemTab(tid, "stub-b"),
    });
  });

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    stubPreload();
  });

  afterEach(() => {
    (window as unknown as { openp41ge: unknown }).openp41ge = ORIG_OPENP41GE;
    host.remove();
  });

  type SidebarEl = HTMLElement & {
    side: string;
    windowId: string;
    systemTabs: Array<{ id: string; title: string; appType: string; pinned: boolean }>;
    activeTabId: string | null;
    isOpen: boolean;
    updateComplete: Promise<unknown>;
  };

  /** Create a mounted sidebar with two stub tabs. */
  async function makeSidebar(): Promise<SidebarEl> {
    const sidebar = document.createElement("openp41ge-sidebar") as SidebarEl;
    sidebar.side = "left";
    sidebar.windowId = "w";
    host.appendChild(sidebar);
    sidebar.systemTabs = [
      { id: "t-a", title: "A", appType: "stub-a", pinned: false },
      { id: "t-b", title: "B", appType: "stub-b", pinned: false },
    ];
    sidebar.activeTabId = "t-a";
    sidebar.isOpen = true;
    await sidebar.updateComplete;
    return sidebar;
  }

  const ctrlOf = (sidebar: HTMLElement, appType: string): StubSystemTab => {
    const ctrls = (sidebar as unknown as { _controllers: Map<string, SystemTabController> })
      ._controllers;
    for (const c of ctrls.values()) {
      if (c.appType === appType) return c as StubSystemTab;
    }
    throw new Error("controller not found: " + appType);
  };

  it("switching tabs re-shows the same mounted element — no remount", async () => {
    const sidebar = await makeSidebar();

    // Active host is visible and mounted once.
    const hostA = sidebar.querySelector('[data-tab-host="t-a"]') as HTMLElement;
    expect(hostA.classList.contains("visible")).toBe(true);
    const childA = hostA.firstElementChild;
    expect(childA).not.toBeNull();
    expect(ctrlOf(sidebar, "stub-a").mountCount).toBe(1);
    expect(ctrlOf(sidebar, "stub-a").visibleHistory).toEqual([true]);

    // Switch to tab B → host A hidden but still alive (same element kept).
    sidebar.activeTabId = "t-b";
    await sidebar.updateComplete;

    expect(hostA.classList.contains("visible")).toBe(false);
    const hostB = sidebar.querySelector('[data-tab-host="t-b"]') as HTMLElement;
    expect(hostB.classList.contains("visible")).toBe(true);
    expect(hostA.firstElementChild).toBe(childA); // same node, still in DOM
    expect(ctrlOf(sidebar, "stub-a").mountCount).toBe(1); // not remounted
    expect(ctrlOf(sidebar, "stub-a").visibleHistory.at(-1)).toBe(false); // suspended

    // Switch back to A → visible again, still the same node, not remounted.
    sidebar.activeTabId = "t-a";
    await sidebar.updateComplete;

    expect(hostA.classList.contains("visible")).toBe(true);
    expect(hostA.firstElementChild).toBe(childA);
    expect(ctrlOf(sidebar, "stub-a").mountCount).toBe(1);
    expect(ctrlOf(sidebar, "stub-a").visibleHistory.at(-1)).toBe(true);
  });

  it("closing/reopening the sidebar keeps hosts and controllers alive", async () => {
    const sidebar = await makeSidebar();

    sidebar.isOpen = false;
    await sidebar.updateComplete;

    // Hosts remain in the DOM; the active one is hidden (panel is closed).
    expect(sidebar.querySelector('[data-tab-host="t-a"]')).not.toBeNull();
    expect(
      (sidebar.querySelector('[data-tab-host="t-a"]') as HTMLElement).classList.contains("visible"),
    ).toBe(false);
    expect(ctrlOf(sidebar, "stub-a").mountCount).toBe(1);

    sidebar.isOpen = true;
    await sidebar.updateComplete;

    expect(
      (sidebar.querySelector('[data-tab-host="t-a"]') as HTMLElement).classList.contains("visible"),
    ).toBe(true);
    expect(ctrlOf(sidebar, "stub-a").mountCount).toBe(1);
  });

  it("removing a tab from window state destroys its host + controller", async () => {
    const sidebar = await makeSidebar();

    sidebar.activeTabId = "t-b";
    await sidebar.updateComplete;
    const ctrlB = ctrlOf(sidebar, "stub-b");
    expect(sidebar.querySelector('[data-tab-host="t-b"]')).not.toBeNull();

    // Tab B is gone from the window state → reconcile removes it.
    sidebar.systemTabs = [{ id: "t-a", title: "A", appType: "stub-a", pinned: false }];
    await sidebar.updateComplete;

    expect(sidebar.querySelector('[data-tab-host="t-b"]')).toBeNull();
    expect(ctrlB.unmountCount).toBe(1);
    expect(ctrlOf(sidebar, "stub-a").unmountCount).toBe(0);
  });

  it("hidden tabs do no background work; returning reconciles a dirty change", async () => {
    // Explorer suspends its reload triggers via setVisible.
    const container = document.createElement("div");
    host.appendChild(container);
    const explorer = new ExplorerSystemTabController("t-explorer");
    await explorer.mount(container);
    const tree = container.querySelector("openp41ge-worktree-tree") as unknown as {
      _suspended: boolean;
      _suspendDirty: boolean;
      setVisible(v: boolean): void;
    };
    expect(tree._suspended).toBe(false);

    explorer.setVisible(false);
    expect(tree._suspended).toBe(true);
    expect(tree._suspendDirty).toBe(false);

    // A project switch while hidden must NOT reload — it just marks the tab
    // dirty (no listener-driven work while inactive).
    document.dispatchEvent(new CustomEvent("project:changed", { bubbles: true }));
    expect(tree._suspendDirty).toBe(true);

    // Returning clears the dirty flag and resumes (in-place refresh).
    explorer.setVisible(true);
    expect(tree._suspended).toBe(false);
    expect(tree._suspendDirty).toBe(false);
  });

  it("Git tab defers git:refresh while hidden and reloads on return if dirty", async () => {
    const container = document.createElement("div");
    host.appendChild(container);
    const git = new CommitSearchSystemTabController("t-git") as unknown as {
      _suspended: boolean;
      _suspendDirty: boolean;
      setVisible(v: boolean): void;
      mount(container: HTMLElement): Promise<unknown>;
    };
    await git.mount(container);
    expect(git._suspended).toBe(false);

    git.setVisible(false);
    expect(git._suspended).toBe(true);

    document.dispatchEvent(new CustomEvent("git:refresh", { bubbles: true }));
    expect(git._suspendDirty).toBe(true);

    git.setVisible(true);
    expect(git._suspended).toBe(false);
    expect(git._suspendDirty).toBe(false);
  });
});
