/**
 * Integration tests for GitSystemTabController.
 *
 * Mounts the controller into a live DOM container against a mocked
 * window.openp41ge bridge and verifies it renders repo/worktree rows
 * (expandable), that rows are draggable into the central tab system
 * (correct drag payload), plus empty/error/unmount states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitSystemTabController } from "../../../src/renderer/apps/system-tabs/git-system-tab";

type MockBridge = {
  workspaceController: {
    listRepos: (() => Promise<unknown>) & ReturnType<typeof vi.fn>;
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
      listWorktrees: vi.fn(),
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 50));

interface FakeDataTransfer {
  data: Record<string, string>;
  effectAllowed: string;
  dropEffect: string;
  readonly types: string[];
  setData(type: string, value: string): void;
  getData(type: string): string;
}

/** Minimal DataTransfer stand-in (jsdom has none). */
function fakeDataTransfer(): FakeDataTransfer {
  const data: Record<string, string> = {};
  return {
    data,
    effectAllowed: "",
    dropEffect: "",
    get types() {
      return Object.keys(data);
    },
    setData(type, value) {
      data[type] = value;
    },
    getData(type) {
      return data[type] ?? "";
    },
  };
}

/** Dispatch a dragstart and capture the resulting DataTransfer payload. */
function dragstartPayload(el: HTMLElement): FakeDataTransfer {
  const dt = fakeDataTransfer();
  // jsdom lacks DragEvent; a plain Event with a fake dataTransfer is enough
  // for our handler (setData/effectAllowed/dropEffect on the stub).
  const ev = new Event("dragstart", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "dataTransfer", { value: dt });
  el.dispatchEvent(ev);
  return dt;
}

function repoRows(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>("[data-repo-row]")).map(
    (l) => l.parentElement as HTMLElement,
  );
}

function worktreeRows(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>("[data-worktree-row]")).map(
    (l) => l.parentElement as HTMLElement,
  );
}

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

  it("renders repo rows (collapsed by default) that are draggable", async () => {
    bridge().workspaceController.listRepos.mockResolvedValue([
      { path: "/w/acme", name: "acme", url: "git@example.com:acme.git" },
    ]);
    bridge().workspaceController.listWorktrees.mockResolvedValue([
      { branch: "main", path: "/w/acme/main", exists: true },
      { branch: "dev", path: "/w/acme/dev", exists: true },
    ]);

    await controller.mount(host);
    await flush();

    expect(host.textContent).toContain("REPOSITORIES");
    await expect.poll(() => host.querySelector("[data-repo-row]")).toBeTruthy();

    const rows = repoRows(host);
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("acme");
    expect(rows[0].textContent).toContain("2"); // worktree count badge
    expect(rows[0].draggable).toBe(true);

    // Worktrees hidden until expanded.
    expect(worktreeRows(host).length).toBe(0);
    expect(host.textContent).not.toContain("main");

    // Dragging the repo row carries the grid-compatible payload.
    const dt = dragstartPayload(rows[0]);
    expect(dt.getData("application/x-openp41ge-repo")).toBe("acme");
    expect(dt.effectAllowed).toBe("move");
  });

  it("expands a repo row to reveal draggable worktree rows", async () => {
    bridge().workspaceController.listRepos.mockResolvedValue([
      { path: "/w/acme", name: "acme", url: "git@example.com:acme.git" },
    ]);
    bridge().workspaceController.listWorktrees.mockResolvedValue([
      { branch: "main", path: "/w/acme/main", exists: true },
    ]);

    await controller.mount(host);
    await flush();
    await expect.poll(() => host.querySelector("[data-repo-row]")).toBeTruthy();

    // Expand.
    repoRows(host)[0].click();
    await flush();

    expect(host.textContent).toContain("main");
    const wt = worktreeRows(host);
    expect(wt.length).toBe(1);
    expect(wt[0].draggable).toBe(true);

    // Dragging a worktree row carries its own worktree payload (repo + branch),
    // so the grid can open a branch-scoped git tab.
    const dt = dragstartPayload(wt[0]);
    expect(dt.getData("application/x-openp41ge-repo")).toBe("");
    expect(dt.getData("application/x-openp41ge-worktree")).toBe("acme\u0000main");
    expect(dt.effectAllowed).toBe("move");

    // Collapse hides them again.
    repoRows(host)[0].click();
    await flush();
    expect(host.textContent).not.toContain("main");
  });

  it("renders an empty state when there are no repositories", async () => {
    bridge().workspaceController.listRepos.mockResolvedValue([]);

    await controller.mount(host);
    await flush();

    expect(host.textContent).toContain("REPOSITORIES");
    expect(host.textContent).toContain("No repositories");
  });

  it("renders 'No worktrees' under an expanded repo without worktrees", async () => {
    bridge().workspaceController.listRepos.mockResolvedValue([
      { path: "/w/acme", name: "acme", url: "git@example.com:acme.git" },
    ]);
    bridge().workspaceController.listWorktrees.mockResolvedValue([]);

    await controller.mount(host);
    await flush();
    await expect.poll(() => host.querySelector("[data-repo-row]")).toBeTruthy();

    expect(worktreeRows(host).length).toBe(0);
    repoRows(host)[0].click();
    await flush();
    expect(host.textContent).toContain("No worktrees");
  });

  it("renders a failure message when listing repos throws", async () => {
    bridge().workspaceController.listRepos.mockRejectedValue(new Error("boom"));

    await controller.mount(host);
    await flush();

    expect(host.textContent).toContain("Failed to load: boom");
  });

  it("isolates a failing repo's worktree load instead of failing the tab", async () => {
    bridge().workspaceController.listRepos.mockResolvedValue([
      { path: "/w/acme", name: "acme", url: "git@example.com:acme.git" },
    ]);
    bridge().workspaceController.listWorktrees.mockRejectedValue(new Error("boom"));

    await controller.mount(host);
    await flush();

    await expect.poll(() => host.querySelector("[data-repo-row]")).toBeTruthy();
    expect(host.textContent).toContain("acme");
  });

  it("unmounts: removes the view and stops listening for git:refresh", async () => {
    bridge().workspaceController.listRepos.mockResolvedValue([]);
    await controller.mount(host);
    await flush();

    expect(host.children.length).toBeGreaterThan(0);
    controller.unmount();
    expect(host.children.length).toBe(0);
    // After unmount, a refresh event must not re-add content.
    document.dispatchEvent(new CustomEvent("git:refresh", { bubbles: true }));
    await flush();
    expect(host.children.length).toBe(0);
  });
});
