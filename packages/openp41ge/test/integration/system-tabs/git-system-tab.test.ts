/**
 * Integration tests for GitSystemTabController.
 *
 * Mounts the controller into a live DOM container against a mocked
 * window.openp41ge bridge and verifies it renders the repository list
 * with per-repo change summaries, plus empty/error states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitSystemTabController } from "../../../src/renderer/apps/system-tabs/git-system-tab";

type MockBridge = {
  workspaceController: {
    listRepos: (() => Promise<unknown>) & ReturnType<typeof vi.fn>;
    getDiffStat: (() => Promise<unknown>) & ReturnType<typeof vi.fn>;
    getUntrackedFiles: (() => Promise<unknown>) & ReturnType<typeof vi.fn>;
    listWorktrees: (() => Promise<unknown>) & ReturnType<typeof vi.fn>;
  };
};

function bridge(): MockBridge {
  return (window as unknown as { openp41ge: MockBridge }).openp41ge;
}

function installBridge(): void {
  (window as unknown as { openp41ge: MockBridge }).openp41ge = {
    workspaceController: {
      listRepos: vi.fn(),
      getDiffStat: vi.fn(),
      getUntrackedFiles: vi.fn(),
      listWorktrees: vi.fn(),
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 50));

describe("GitSystemTabController", () => {
  let host: HTMLElement;
  let controller: GitSystemTabController;

  beforeEach(() => {
    installBridge();
    host = document.createElement("div");
    document.body.appendChild(host);
    controller = new GitSystemTabController("sys-git-test");
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
  });

  it("renders the REPOSITORIES header and repo rows with summary + worktrees", async () => {
    bridge().workspaceController.listRepos.mockResolvedValue([
      { path: "/w/acme", name: "acme", url: "git@example.com:acme.git" },
    ]);
    bridge().workspaceController.getDiffStat.mockResolvedValue([
      { filePath: "a.txt", added: 2, deleted: 1, status: "modified" },
    ]);
    bridge().workspaceController.getUntrackedFiles.mockResolvedValue(["u.txt"]);
    bridge().workspaceController.listWorktrees.mockResolvedValue([
      { branch: "main", path: "/w/acme/main", exists: true },
    ]);

    await controller.mount(host);
    await flush();

    const text = host.textContent;
    expect(text).toContain("REPOSITORIES");
    expect(text).toContain("acme");
    await expect.poll(() => host.textContent?.includes("2 changed")).toBe(true);
    await expect.poll(() => host.textContent?.includes("+2")).toBe(true);
    await expect.poll(() => host.textContent?.includes("−1")).toBe(true);
    await expect.poll(() => host.textContent?.includes("1 untracked")).toBe(true);
    await expect.poll(() => host.textContent?.includes("main")).toBe(true);
    // No undefined custom elements leaked.
    expect(host.querySelector("repo-row, side-header")).toBeNull();
  });

  it("renders an empty state when there are no repositories", async () => {
    bridge().workspaceController.listRepos.mockResolvedValue([]);

    await controller.mount(host);
    await flush();

    expect(host.textContent).toContain("REPOSITORIES");
    expect(host.textContent).toContain("No repositories");
  });

  it("renders a 'no local clone' summary when stat lookup fails", async () => {
    bridge().workspaceController.listRepos.mockResolvedValue([
      { path: "/w/acme", name: "acme", url: "git@example.com:acme.git" },
    ]);
    bridge().workspaceController.getDiffStat.mockRejectedValue(new Error("not a repo"));
    bridge().workspaceController.listWorktrees.mockResolvedValue([]);

    await controller.mount(host);
    await flush();

    await expect.poll(() => host.textContent?.includes("acme")).toBe(true);
    await expect.poll(() => host.textContent?.includes("No local clone")).toBe(true);
  });

  it("renders a failure message when listing repos throws", async () => {
    bridge().workspaceController.listRepos.mockRejectedValue(new Error("boom"));

    await controller.mount(host);
    await flush();

    expect(host.textContent).toContain("Failed to load: boom");
  });

  it("unmounts: removes the view and stops listening for git:refresh", async () => {
    bridge().workspaceController.listRepos.mockResolvedValue([]);
    await controller.mount(host);
    await flush();

    expect(host.children.length).toBeGreaterThan(0);
    const listenerEvent = new CustomEvent("git:refresh", { bubbles: true });
    controller.unmount();
    expect(host.children.length).toBe(0);
    // After unmount, a refresh event must not re-add content.
    document.dispatchEvent(listenerEvent);
    await flush();
    expect(host.children.length).toBe(0);
  });
});
