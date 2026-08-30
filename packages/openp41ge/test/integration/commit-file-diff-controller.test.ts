/**
 * Integration tests for CommitFileDiffController — the read-only pane opened
 * when a file result in the Git sidebar commit search is activated.
 *
 * Covers:
 *   - fresh mount fetches the full file content AND hunks, merges them with
 *     buildInlineDiffDocument and shows the ENTIRE file through the
 *     `<file-editor>` READ-ONLY diff mode (additions/deletions injected),
 *   - restore-with-cached-diff renders instantly without a refetch,
 *   - a null content fetch shows the no-textual-content fallback,
 *   - mount without repo/hash/path shows the unavailable prompt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CommitFileDiffController } from "../../src/renderer/apps/commit-file-diff/commit-file-diff-controller";
import { buildInlineDiffDocument } from "openp41ge-git";

type AsyncMock = (() => Promise<unknown>) & ReturnType<typeof vi.fn>;

type MockBridge = {
  workspaceController: {
    getCommitFileHunks: AsyncMock;
    getCommitFileContent: AsyncMock;
  };
};

function bridge(): MockBridge {
  return (window as unknown as { openp41ge: MockBridge }).openp41ge;
}

function installBridge(): void {
  (window as unknown as { openp41ge: MockBridge }).openp41ge = {
    workspaceController: {
      getCommitFileHunks: vi.fn(),
      getCommitFileContent: vi.fn(),
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 60));

const HASH = "af".repeat(20);
/** Full post-commit file content (line 2 changed). */
const CONTENT = [
  "import { crashy } from 'old'",
  "export function openHook() {",
  "return commitText();",
  "after",
  "final",
].join("\n") + "\n";
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

function ctx(): { repoName: string; hash: string; path: string } {
  return { repoName: "github.com/example/demo", hash: HASH, path: "src/app.ts" };
}

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

  it("merges full file content + hunks and renders the WHOLE file in the read-only editor diff", async () => {
    controller._fetchDiff = async () => [CONTENT, HUNKS];
    (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = ctx();

    controller.mount(host);
    await flush();

    const doc = buildInlineDiffDocument(CONTENT, HUNKS);
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
    const types = rows.map((r) => r.getAttribute("data-diff-line"));
    expect(types).toEqual([
      "header", "context", "removed", "added", "added", "context", "context",
    ]);

    // The ENTIRE file is present — lines outside the hunk are included too.
    const texts = rows.map((r) => r.textContent ?? "");
    expect(texts.some((t) => t.includes("after"))).toBe(true);
    expect(texts.some((t) => t.includes("final"))).toBe(true);
    expect(rows.filter((r) => r.getAttribute("data-diff-line") === "context")).toHaveLength(3);

    // Numbers: context 1|1, removed old=2, added new=2/3, tail new=4/5.
    const context = rows.find((r) => r.getAttribute("data-diff-line") === "context")!;
    expect(context.textContent).toContain("1 1");
    const added0 = rows.find(
      (r) => r.getAttribute("data-diff-line") === "added" && (r.textContent ?? "").includes("openHook"),
    )!;
    expect(added0.textContent).toContain("2");
    const tailRow = rows.find((r) => (r.textContent ?? "").includes("after"))!;
    expect(tailRow.textContent).toContain("4");

    // Read-only diff — no textarea, no caret surface.
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("restore with a cached diff doc paints instantly without refetching", async () => {
    const fetch = bridge().workspaceController.getCommitFileHunks;
    const controller2 = new CommitFileDiffController("diff-tab-2", "commit-file-diff");
    controller2.restore({
      filePath: JSON.stringify(ctx()),
      diff: buildInlineDiffDocument(CONTENT, HUNKS),
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

  it("shows the no-textual-content fallback when the content fetch returns null", async () => {
    controller._fetchDiff = async () => [null, []];
    (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = {
      ...ctx(),
      path: "assets/blob.bin",
    };
    controller.mount(host);
    await flush();
    expect(host.textContent).toContain("No textual content for this file at this commit");
  });

  it("shows the unavailable prompt without repo/hash/path", () => {
    controller.mount(host);
    expect(host.textContent).toContain("File diff unavailable");
  });

  it("a throwing fetch falls back to the fallback state (no crash)", async () => {
    controller._fetchDiff = async () => {
      throw new Error("boom");
    };
    (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = ctx();
    controller.mount(host);
    await flush();
    expect(host.textContent).toContain("No textual content for this file at this commit");
  });
});
