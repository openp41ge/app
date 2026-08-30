/**
 * Integration tests for GitCommitSearchController — the pane opened when a
 * commit-search result row is dragged onto the grid.
 *
 * Covers:
 *   - fresh mount (pending context) fetches the commit message via
 *     window.openp41ge.workspaceController.getCommitMessage and shows it in a
 *     READ-ONLY <file-editor>,
 *   - restore-with-cached-message renders instantly without a refetch,
 *   - a null/error fetch falls back to an inline message,
 *   - mount without repo/hash shows the prompt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitCommitSearchController } from "../../src/renderer/apps/git-commit-search/git-commit-search-controller";

type AsyncMock = (() => Promise<unknown>) & ReturnType<typeof vi.fn>;

type MockBridge = { workspaceController: { getCommitMessage: AsyncMock } };

function bridge(): MockBridge {
  return (window as unknown as { openp41ge: MockBridge }).openp41ge;
}

function installBridge(): void {
  (window as unknown as { openp41ge: MockBridge }).openp41ge = {
    workspaceController: { getCommitMessage: vi.fn() },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 80));

const HASH = "af".repeat(20);
const MESSAGE = ["feat: pipeline runner", "", "Implements the runner end-to-end."].join("\n");

describe("GitCommitSearchController", () => {
  let host: HTMLElement;
  let controller: GitCommitSearchController;

  beforeEach(() => {
    installBridge();
    host = document.createElement("div");
    document.body.appendChild(host);
    controller = new GitCommitSearchController("git-search-tab-1", "git-commit-search");
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
    (window as unknown as Record<string, unknown>).__pendingGitCommitSearch = null;
    (window as unknown as Record<string, unknown>).__openp41geTestHooks = undefined;
  });

  it("fetches the commit message and shows it in a read-only file editor", async () => {
    bridge().workspaceController.getCommitMessage.mockResolvedValue({
      hash: HASH,
      shortHash: HASH.slice(0, 7),
      authorName: "rk",
      authorEmail: "rk@dev",
      date: "2026-08-30T00:00:00Z",
      relativeDate: "5 minutes ago",
      message: "feat: pipeline runner",
      fullMessage: MESSAGE,
      refs: [],
      parents: [],
    });

    (window as unknown as Record<string, unknown>).__pendingGitCommitSearch = {
      repoName: "github.com/example/demo",
      hash: HASH,
    };

    controller.mount(host);
    await flush();

    expect(bridge().workspaceController.getCommitMessage).toHaveBeenCalledWith(
      "github.com/example/demo",
      HASH,
    );

    const editor = host.querySelector("file-editor") as HTMLElement & {
      isReadOnly: boolean;
      textContentModel: { getValue(): string };
    };
    expect(editor).toBeTruthy();
    expect(editor.isReadOnly).toBe(true);
    expect(editor.textContentModel.getValue()).toContain("Implements the runner end-to-end.");
    expect(editor.textContentModel.getValue()).toContain("feat: pipeline runner");
  });

  it("shows the short hash and repo in the header", async () => {
    bridge().workspaceController.getCommitMessage.mockResolvedValue({
      hash: HASH,
      shortHash: HASH.slice(0, 7),
      authorName: "rk",
      authorEmail: "rk@dev",
      date: "2026-08-30T00:00:00Z",
      relativeDate: "",
      message: "feat: pipeline runner",
      fullMessage: MESSAGE,
      refs: [],
      parents: [],
    });
    (window as unknown as Record<string, unknown>).__pendingGitCommitSearch = {
      repoName: "github.com/example/demo",
      hash: HASH,
    };

    controller.mount(host);
    await flush();

    const headerText = (host.firstElementChild as HTMLElement).textContent || "";
    expect(headerText).toContain("github.com/example/demo");
    expect(headerText).toContain(HASH.slice(0, 7));
  });

  it("restore with a cached message renders without refetching", async () => {
    controller.restore({
      filePath: JSON.stringify({ repoName: "github.com/example/demo", hash: HASH }),
      repoName: "github.com/example/demo",
      hash: HASH,
      message: MESSAGE,
      messageAuthor: "rk",
      messageDate: "2026-08-30T00:00:00Z",
    });

    controller.mount(host);
    await flush();

    expect(bridge().workspaceController.getCommitMessage).not.toHaveBeenCalled();
    const editor = host.querySelector("file-editor") as HTMLElement & {
      isReadOnly: boolean;
      textContentModel: { getValue(): string };
    };
    expect(editor).toBeTruthy();
    expect(editor.isReadOnly).toBe(true);
    expect(editor.textContentModel.getValue()).toContain("Implements the runner end-to-end.");
  });

  it("restore parses repo/hash from the JSON config slot", async () => {
    controller.restore({
      filePath: JSON.stringify({ repoName: "github.com/example/demo", hash: HASH }),
    });
    bridge().workspaceController.getCommitMessage.mockResolvedValue({
      hash: HASH,
      shortHash: HASH.slice(0, 7),
      authorName: "rk",
      authorEmail: "rk@dev",
      date: "",
      relativeDate: "",
      message: "feat: pipeline runner",
      fullMessage: MESSAGE,
      refs: [],
      parents: [],
    });

    controller.mount(host);
    await flush();

    expect(bridge().workspaceController.getCommitMessage).toHaveBeenCalledWith(
      "github.com/example/demo",
      HASH,
    );
    expect(host.querySelector("file-editor")).toBeTruthy();
  });

  it("snapshot/restore round-trips repoName, hash and cached message", async () => {
    bridge().workspaceController.getCommitMessage.mockResolvedValue({
      hash: HASH,
      shortHash: HASH.slice(0, 7),
      authorName: "rk",
      authorEmail: "rk@dev",
      date: "2026-08-30T00:00:00Z",
      relativeDate: "",
      message: "feat: pipeline runner",
      fullMessage: MESSAGE,
      refs: [],
      parents: [],
    });
    (window as unknown as Record<string, unknown>).__pendingGitCommitSearch = {
      repoName: "github.com/example/demo",
      hash: HASH,
    };

    controller.mount(host);
    await flush();

    const snap = controller.snapshot();
    expect(snap.repoName).toBe("github.com/example/demo");
    expect(snap.hash).toBe(HASH);
    expect(snap.message).toBe(MESSAGE);
    expect(snap.messageAuthor).toBe("rk");

    // A fresh controller restores the snapshot → renders instantly.
    const c2 = new GitCommitSearchController("git-search-tab-2", "git-commit-search");
    c2.restore(snap);
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    c2.mount(host2);
    await flush();
    expect(bridge().workspaceController.getCommitMessage).toHaveBeenCalledTimes(1); // only the first mount fetched
    const editor2 = host2.querySelector("file-editor") as HTMLElement & {
      textContentModel: { getValue(): string };
    };
    expect(editor2.textContentModel.getValue()).toContain("feat: pipeline runner");
    c2.unmount();
    host2.remove();
  });

  it("shows an inline fallback when the commit message cannot be fetched", async () => {
    bridge().workspaceController.getCommitMessage.mockResolvedValue(null);

    (window as unknown as Record<string, unknown>).__pendingGitCommitSearch = {
      repoName: "github.com/example/demo",
      hash: HASH,
    };

    controller.mount(host);
    await flush();

    expect(host.querySelector("file-editor")).toBeFalsy();
    expect(host.textContent).toContain("Commit message unavailable");
  });

  it("shows the prompt when mounted without repo/hash", () => {
    controller.mount(host);
    expect(host.textContent).toContain("Commit search result");
    expect(host.querySelector("file-editor")).toBeFalsy();
  });
});
