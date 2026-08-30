/**
 * Integration tests for CommitFileDiffController — the read-only pane opened
 * when a file result in the Git sidebar commit search is activated.
 *
 * Covers:
 *   - fresh mount fetches hunks, converts them (hunksToDiffDocument) and shows
 *     them through the `<file-editor>` READ-ONLY diff mode (added/removed rows),
 *   - restore-with-cached-diff renders instantly without a refetch,
 *   - an empty fetch shows the no-textual-diff fallback,
 *   - mount without repo/hash/path shows the unavailable prompt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CommitFileDiffController } from "../../src/renderer/apps/commit-file-diff/commit-file-diff-controller";
import { hunksToDiffDocument } from "openp41ge-git";

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

const flush = () => new Promise((r) => setTimeout(r, 60));

const HASH = "af".repeat(20);
const HUNKS = [
  {
    header: "@@ -1,2 +1,3 @@",
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

  it("fetches hunks, converts to a diff document and renders it in the READ-ONLY file editor", async () => {
    controller._fetchDiff = async () => HUNKS;
    (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = {
      repoName: "github.com/example/demo",
      hash: HASH,
      path: "src/app.ts",
    };

    controller.mount(host);
    await flush();

    const doc = hunksToDiffDocument(HUNKS);
    const editor = host.querySelector("file-editor") as HTMLElement & {
      isReadOnly?: boolean;
      isDiffMode?: boolean;
    };
    expect(editor).not.toBeNull();
    expect(editor.isReadOnly).toBe(true); // nothing can be changed in a commit
    expect(editor.isDiffMode).toBe(true);

    const diffHost = host.querySelector('[data-commit-diff]');
    expect(diffHost).not.toBeNull();
    const rows = diffHost ? [...diffHost.querySelectorAll("[data-diff-line]")] : [];

    // Header + 1 context + 1 removed + 2 added.
    const types = rows.map((r) => r.getAttribute("data-diff-line"));
    expect(types).toEqual(["header", "context", "removed", "added", "added"]);

    const textOf = (t: string) =>
      rows
        .filter((r) => r.getAttribute("data-diff-line") === t)
        .map((r) => r.textContent ?? "");
    expect(textOf("added")[1]).toContain("return commitText();");
    expect(textOf("removed")[0]).toContain("export function open() {");

    // Line numbers are assigned: context 1|1 (both starts), removed old=2,
    // added new=2/3.
    const context = rows.find((r) => r.getAttribute("data-diff-line") === "context");
    expect(context?.textContent).toContain("1 1");
    expect(context?.textContent).toContain("crashy");
    const added0 = rows.find(
      (r) => r.getAttribute("data-diff-line") === "added" && (r.textContent ?? "").includes("openHook"),
    );
    expect(added0?.textContent).toContain("2");

    // Read-only diff — no textarea, no caret surface.
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("restore with a cached diff doc paints instantly without refetching", async () => {
    const fetch = bridge().workspaceController.getCommitFileHunks;
    const controller2 = new CommitFileDiffController("diff-tab-2", "commit-file-diff");
    controller2.restore({
      filePath: JSON.stringify({
        repoName: "github.com/example/demo",
        hash: HASH,
        path: "src/app.ts",
      }),
      diff: hunksToDiffDocument(HUNKS),
    });
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    controller2.mount(host2);
    await flush();

    expect(fetch).not.toHaveBeenCalled();
    expect(host2.querySelector('[data-commit-diff]')).not.toBeNull();
    expect(host2.querySelector('[data-diff-line="added"]')).not.toBeNull();
    controller2.unmount();
    host2.remove();
  });

  it("shows the no-textual-diff fallback when the fetch returns nothing", async () => {
    controller._fetchDiff = async () => [];
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
    controller._fetchDiff = async () => {
      throw new Error("boom");
    };
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
