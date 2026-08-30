/**
 * Integration tests for CommitFileDiffController — the read-only pane opened
 * when a file result in the Git sidebar commit search is activated.
 *
 * Covers:
 *   - fresh mount (pending context) fetches hunks via
 *     window.openp41ge.workspaceController.getCommitFileHunks and renders them
 *     with the green/red/diff styling,
 *   - restore-with-cached-hunks renders instantly without a refetch,
 *   - an empty fetch shows the no-textual-diff fallback,
 *   - mount without repo/hash/path shows the unavailable prompt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CommitFileDiffController } from "../../src/renderer/apps/commit-file-diff/commit-file-diff-controller";

type AsyncMock = (() => Promise<unknown>) & ReturnType<typeof vi.fn>;

type MockBridge = { workspaceController: { getCommitFileHunks: AsyncMock } };

function bridge(): MockBridge {
  return (window as unknown as { openp41ge: MockBridge }).openp41ge;
}

function installBridge(): void {
  (window as unknown as { openp41ge: MockBridge }).openp41ge = {
    workspaceController: { getCommitFileHunks: vi.fn() },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 30));

const HASH = "af".repeat(20);
const HUNKS = [
  {
    header: "@@ -1,3 +1,4 @@",
    lines: [
      { type: " ", text: "import { crashy } from 'old'" },
      { type: "-", text: "export function open() {" },
      { type: "+", text: "export function openHook() {" },
      { type: "+", text: "return commitText();" },
    ],
  },
];

describe("CommitFileDiffController", () => {
  let host: HTMLElement;
  let controller: CommitFileDiffController;

  beforeEach(() => {
    installBridge();
    host = document.createElement("div");
    document.body.appendChild(host);
    controller = new CommitFileDiffController("diff-tab-1", "commit-file-diff");
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
    (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = null;
    (window as unknown as Record<string, unknown>).__openp41geTestHooks = undefined;
  });

  it("fresh mount fetches hunks and renders green/red diff lines read-only", async () => {
    bridge().workspaceController.getCommitFileHunks.mockResolvedValue(HUNKS);

    (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = {
      repoName: "github.com/example/demo",
      hash: HASH,
      path: "src/app.ts",
    };

    controller.mount(host);
    await flush();

    expect(bridge().workspaceController.getCommitFileHunks).toHaveBeenCalledWith(
      "github.com/example/demo",
      HASH,
      "src/app.ts",
      "",
      { regex: false, caseSensitive: false },
    );

    const header = host.querySelector('[data-diff-header]');
    expect(header?.textContent).toBe("@@ -1,3 +1,4 @@");
    const lines = host.querySelectorAll('[data-commit-diff] div');
    expect(lines.length).toBeGreaterThanOrEqual(4);

    const byText = (t: string) =>
      [...lines].find((l) => l.textContent === t) as HTMLElement | undefined;
    const minus = byText("-export function open() {");
    const plus = byText("+export function openHook() {");
    const context = byText(" import { crashy } from 'old'");
    expect(minus?.style.color).toBe("rgb(248, 81, 73)"); // red
    expect(plus?.style.color).toBe("rgb(63, 185, 80)"); // green
    expect(context?.style.color).toBe("var(--text-secondary,#aaa)");

    // Read-only by construction: the view contains no textarea / caret target.
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.querySelector("file-editor")).toBeNull();
  });

  it("restore with cached hunks paints instantly without refetching", async () => {
    const fetch = bridge().workspaceController.getCommitFileHunks;
    const controller2 = new CommitFileDiffController("diff-tab-2", "commit-file-diff");
    controller2.restore({
      filePath: JSON.stringify({
        repoName: "github.com/example/demo",
        hash: HASH,
        path: "src/app.ts",
      }),
      hunks: HUNKS,
    });
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    controller2.mount(host2);
    await flush();

    expect(fetch).not.toHaveBeenCalled();
    expect(host2.querySelector('[data-commit-diff]')).not.toBeNull();
    expect(host2.textContent).toContain("+return commitText();");
    controller2.unmount();
    host2.remove();
  });

  it("shows the no-textual-diff fallback when the fetch returns nothing", async () => {
    bridge().workspaceController.getCommitFileHunks.mockResolvedValue([]);
    (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = {
      repoName: "github.com/example/demo",
      hash: HASH,
      path: "assets/blob.bin",
    };
    controller.mount(host);
    await flush();
    expect(host.textContent).toContain("No textual diff for this file at this commit");
  });

  it("shows the unavailable prompt without repo/hash/path", () => {
    controller.mount(host);
    expect(host.textContent).toContain("File diff unavailable");
  });

  it("a throwing fetch falls back to the empty state (no crash)", async () => {
    bridge().workspaceController.getCommitFileHunks.mockRejectedValue(new Error("boom"));
    (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = {
      repoName: "github.com/example/demo",
      hash: HASH,
      path: "src/app.ts",
    };
    controller.mount(host);
    await flush();
    expect(host.textContent).toContain("No textual diff for this file at this commit");
  });
});
