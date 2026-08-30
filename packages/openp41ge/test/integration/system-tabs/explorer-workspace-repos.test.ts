/**
 * Explorer is backed by the ACTIVE WORKSPACE's `repos` list — repos belong to
 * the workspace, not to any window-global list. Regression guards for the
 * 2026-08 "repos belong to the workspace" migration:
 *
 *  - only repos listed in the active workspace render (a disk repo that is not
 *    in the workspace is hidden — the old repoRefs auto-registration is gone)
 *  - worktree rows come from DECLARED worktrees (repos[].worktrees), not from
 *    enumerating git branches — a freshly cloned bare repo shows zero rows
 *  - a declared worktree whose folder is missing stays as a clickable warning
 *    that dispatches openp41ge:focus-workspace-repo (→ Workspaces overlay)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import "../../../src/renderer/components/openp41ge-worktree-tree";
import "../../../src/renderer/components/openp41ge-repo-tree-item";
import { TestRepoService, TestRepositoryModel } from "../../../src/renderer/models/test-models";
import { workspaceFileService } from "../../../src/renderer/services/workspace-file-service";

type TreeEl = HTMLElement & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _repoService: TestRepoService;
  updateComplete: Promise<unknown>;
};

const WIDGET = { name: "github.com/acme/widget", url: "https://github.com/acme/widget.git" };

describe("Explorer workspace-backed repos", () => {
  let host: HTMLElement;
  const ORIG_PRELOAD: unknown = window.openp41ge;
  const ORIG_SCROLL = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    localStorage.clear(); // deterministic expansion/UI state between tests
    HTMLElement.prototype.scrollIntoView = () => {}; // jsdom lacks it
    host = document.createElement("div");
    document.body.appendChild(host);
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      ...(ORIG_PRELOAD as Record<string, unknown>),
      workspace: { getWindowId: () => "test-win" },
      workspaceController: {
        getBranches: async () => [],
        listRepos: async () => [],
      },
    };
    workspaceFileService.activeFilePath = null;
    workspaceFileService.activeData = null;
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = ORIG_SCROLL;
    (window as unknown as { openp41ge: unknown }).openp41ge = ORIG_PRELOAD;
    workspaceFileService.activeFilePath = null;
    workspaceFileService.activeData = null;
    host.remove();
  });

  function setWorkspace(repos: Array<{ url: string; worktrees: string[] }>): void {
    workspaceFileService.activeFilePath = "/w/t.openp41ge-workspace";
    workspaceFileService.activeData = {
      id: "w",
      name: "Test",
      version: 1,
      createdAt: "",
      dataDir: "",
      repos,
    };
  }

  async function mountTree(svc: TestRepoService): Promise<TreeEl> {
    const tree = document.createElement("openp41ge-worktree-tree") as unknown as TreeEl;
    tree._repoService = svc;
    host.appendChild(tree);
    // Let Lit paint + the async loader run (connectedCallback → updated() kick).
    await tree.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await tree.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    return tree;
  }

  /** Expand the repo header so its worktree rows are in the DOM. */
  async function expandRepo(tree: TreeEl): Promise<void> {
    const item = tree.querySelector("openp41ge-repo-tree-item") as unknown as {
      _expanded: boolean;
      requestUpdate(): void;
      updateComplete: Promise<unknown>;
    } | null;
    if (item && !item._expanded) {
      item._expanded = true;
      item.requestUpdate();
    }
    await item?.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await (tree as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  }

  function repoModels(svc: TestRepoService): void {
    svc.addRepoModel(new TestRepositoryModel(WIDGET.name, WIDGET.url));
  }

  it("renders only repos listed in the active workspace", async () => {
    const svc = new TestRepoService();
    // Disk has TWO repos; the workspace lists only widget.
    svc.addRepoModel(new TestRepositoryModel(WIDGET.name, WIDGET.url));
    svc.addRepoModel(
      new TestRepositoryModel("github.com/acme/other", "https://github.com/acme/other.git"),
    );
    setWorkspace([{ url: WIDGET.url, worktrees: [] }]);

    const tree = await mountTree(svc);

    const text = tree.textContent ?? "";
    expect(text).toContain(WIDGET.name);
    expect(text).not.toContain("acme/other");
  });

  it("a fresh bare clone (no declared worktrees) shows zero worktree rows", async () => {
    const svc = new TestRepoService();
    repoModels(svc); // disk model, NO worktrees set
    setWorkspace([{ url: WIDGET.url, worktrees: [] }]);

    const tree = await mountTree(svc);
    await expandRepo(tree);

    expect(tree.querySelectorAll("[data-worktree-row]").length).toBe(0);
    // No phantom "main"/"master" row from branch enumeration.
    expect(tree.querySelector('[data-branch="main"]')).toBeNull();
  });

  it("declared worktrees render; a declared worktree with a missing folder warns", async () => {
    const svc = new TestRepoService();
    repoModels(svc); // disk has NO worktree folder for "main"
    setWorkspace([{ url: WIDGET.url, worktrees: ["main"] }]);

    const tree = await mountTree(svc);
    await expandRepo(tree);

    const row = tree.querySelector<HTMLElement>('[data-worktree-row][data-branch="main"]');
    expect(row).not.toBeNull();
    // Folder missing → the warning icon renders on the row.
    expect(row!.querySelector(".wt-warn")).not.toBeNull();
  });

  it("a declared worktree whose folder EXISTS shows no warning", async () => {
    const svc = new TestRepoService();
    const repo = new TestRepositoryModel(WIDGET.name, WIDGET.url);
    repo.setWorktree("main"); // folder exists on disk
    svc.addRepoModel(repo);
    setWorkspace([{ url: WIDGET.url, worktrees: ["main"] }]);

    const tree = await mountTree(svc);
    await expandRepo(tree);

    const row = tree.querySelector<HTMLElement>('[data-worktree-row][data-branch="main"]');
    expect(row).not.toBeNull();
    expect(row!.querySelector(".wt-warn")).toBeNull();
  });

  it("clicking a worktree warning dispatches openp41ge:focus-workspace-repo with the repo", async () => {
    const svc = new TestRepoService();
    repoModels(svc);
    setWorkspace([{ url: WIDGET.url, worktrees: ["main"] }]);

    const tree = await mountTree(svc);
    await expandRepo(tree);

    const received: Array<{ repoName?: string }> = [];
    const onDoc = (e: Event) => received.push((e as CustomEvent).detail ?? {});
    document.addEventListener("openp41ge:focus-workspace-repo", onDoc);
    try {
      const warn = tree.querySelector<HTMLElement>(".wt-warn");
      expect(warn).not.toBeNull();
      warn!.click();
      await new Promise((r) => setTimeout(r, 0));
      expect(received.length).toBe(1);
      expect(received[0].repoName).toBe(WIDGET.name);
    } finally {
      document.removeEventListener("openp41ge:focus-workspace-repo", onDoc);
    }
  });
});
