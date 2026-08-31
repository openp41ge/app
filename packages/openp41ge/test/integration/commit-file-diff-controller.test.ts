/**
 * Integration tests for CommitFileDiffController — the pane opened when a
 * file result in the Git sidebar commit search is activated.
 *
 * Fetches the file's full content + hunks at that commit, merges them with
 * buildInlineDiffFile, LOADS the result as a real read-only buffer in a
 * `<file-editor>` and decorates it as an inline diff: added rows green,
 * re-injected deleted rows red, the whole file present (nothing cropped), no
 * @@ headers, and (via the loader) full syntax highlighting.
 *
 * Covers:
 *   - fresh mount fetches BOTH content + hunks, shows the whole file inline,
 *   - restore-with-cached text/rows renders instantly without a refetch,
 *   - a null content fetch shows the no-textual-content fallback,
 *   - mount without repo/hash/path shows the unavailable prompt,
 *   - a throwing fetch falls back (no crash).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CommitFileDiffController } from "../../src/renderer/apps/commit-file-diff/commit-file-diff-controller";
import { buildInlineDiffFile } from "openp41ge-git";

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

const flush = () => new Promise((r) => setTimeout(r, 120));

const HASH = "af".repeat(20);
/** Full post-commit file content (old line 1 "old" became "new"). */
const CONTENT = ["new", "after", "final"].join("\n") + "\n";
const HUNKS = [
  {
    header: "@@ -1,1 +1,1 @@",
    lines: [{ type: "-", text: "old" }, { type: "+", text: "new" }],
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

  it("merges full file + hunks, loads the WHOLE file read-only and inlines the changes", async () => {
    controller._fetchDiff = async () => [CONTENT, HUNKS];
    (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = ctx();

    controller.mount(host);
    await flush();

    const editor = host.querySelector("file-editor") as HTMLElement & {
      isReadOnly?: boolean;
      hasInlineDiff?: boolean;
      textContentModel?: { getValue(): string; lineCount: number };
    };
    expect(editor).not.toBeNull();
    expect(editor.isReadOnly).toBe(true); // nothing can change in a commit
    expect(editor.hasInlineDiff).toBe(true); // real buffer + inline decorations

    // The merged document IS the editor's model: the removed line is spliced
    // back in, and the full file (tail lines beyond the hunk) is present.
    const merged = buildInlineDiffFile(CONTENT, HUNKS);
    expect(editor.textContentModel?.getValue()).toBe(merged.text);
    expect(editor.textContentModel?.getValue()).toContain("old"); // spliced removal
    expect(editor.textContentModel?.getValue()).toContain("after");
    expect(editor.textContentModel?.getValue()).toContain("final");
    expect(editor.textContentModel?.lineCount).toBe(merged.rows.length);

    // No @@ section headers anywhere in the rendered view.
    const viewportText = [...(host.querySelectorAll(".view-line") ?? [])]
      .map((v) => v.textContent ?? "")
      .join("\n");
    expect(viewportText).not.toContain("@@");

    // Red/green row tints painted for the visible band (lines 1-2 in jsdom).
    expect(host.querySelectorAll(".fe-inline-diff-removed").length).toBeGreaterThanOrEqual(1);
    expect(host.querySelectorAll(".fe-inline-diff-added").length).toBeGreaterThanOrEqual(1);

    // Gutter: TWO line-number columns. Middle = NEW (AFTER) numbers,
    // left = OLD (BEFORE) numbers. The number CELLS carry the colour (red
    // BEFORE cell on the deleted row, green AFTER cell on the added row) —
    // no +/- sign column. (jsdom paints only the visible band = 2 lines.)
    const middle = [...(host.querySelectorAll(".fe-gutter .line-number") ?? [])].map(
      (n) => n.textContent ?? "",
    );
    const left = [...(host.querySelectorAll(".fe-inline-left .fe-inline-left-label") ?? [])].map(
      (n) => n.textContent ?? "",
    );
    // BEFORE (left) / AFTER (middle): deleted row has before only, added row
    // has after only — never both on one row.
    expect(middle).toEqual(["", "1"]); // after — added row only
    expect(left).toEqual(["1", ""]); // before — deleted row only
    // Coloured cells: deleted row's BEFORE cell red, added row's AFTER cell
    // green. Sign column is gone.
    const leftCls = [...(host.querySelectorAll(".fe-inline-left .fe-inline-left-label") ?? [])].map(
      (n) => n.className,
    );
    const midCls = [...(host.querySelectorAll(".fe-gutter .line-number") ?? [])].map(
      (n) => n.className,
    );
    expect(leftCls[0]).toContain("fe-inline-removed-cell"); // deleted row -> red BEFORE cell
    expect(leftCls[1]).not.toContain("fe-inline-removed-cell");
    expect(midCls[0]).not.toContain("fe-inline-added-cell");
    expect(midCls[1]).toContain("fe-inline-added-cell"); // added row -> green AFTER cell
    expect(host.querySelector(".fe-inline-sign")).toBeNull();
    // Leftmost column uses the EDITOR background (separate group from the
    // gutter column).
    expect(host.querySelector(".fe-inline-left")?.style?.background).toContain("var(--fe-bg");
  });

  it("restore with cached text/rows paints instantly without refetching", async () => {
    const merged = buildInlineDiffFile(CONTENT, HUNKS);
    const controller2 = new CommitFileDiffController("diff-tab-2", "commit-file-diff");
    controller2.restore({
      filePath: JSON.stringify(ctx()),
      text: merged.text,
      rows: merged.rows,
    });
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    controller2.mount(host2);
    await flush();

    expect(bridge().workspaceController.getCommitFileHunks).not.toHaveBeenCalled();
    expect(bridge().workspaceController.getCommitFileContent).not.toHaveBeenCalled();
    const editor = host2.querySelector("file-editor") as HTMLElement & {
      hasInlineDiff?: boolean;
    };
    expect(editor).not.toBeNull();
    expect(editor.hasInlineDiff).toBe(true);
    expect(host2.querySelectorAll(".fe-inline-diff-added").length).toBeGreaterThanOrEqual(1);
    controller2.unmount();
    host2.remove();
  });

  it("fetches both content and hunks in parallel", async () => {
    controller._fetchDiff = null; // exercise the real dual-IPC path
    bridge().workspaceController.getCommitFileContent.mockResolvedValue(CONTENT);
    bridge().workspaceController.getCommitFileHunks.mockResolvedValue(HUNKS);
    (window as unknown as Record<string, unknown>).__pendingCommitFileDiff = ctx();

    controller.mount(host);
    await flush();

    expect(bridge().workspaceController.getCommitFileContent).toHaveBeenCalledWith(
      "github.com/example/demo",
      HASH,
      "src/app.ts",
    );
    expect(bridge().workspaceController.getCommitFileHunks).toHaveBeenCalled();
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
