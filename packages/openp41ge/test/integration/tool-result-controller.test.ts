/**
 * Integration tests for ToolResultController — the read-only pane opened when
 * a tool-call card in an agent chat is clicked.
 *
 * The buffer must be built from the SNAPSHOTTED result captured when the tool
 * ran (NOT re-read from disk at open time), and the synthetic editor URI must
 * end with the real file's name so the editor's language detection applies the
 * right grammar for syntax highlighting.
 *
 * Covers:
 *   - read_file result: model content == captured result, uri/title carry the
 *     real filename (extension present → highlighting can engage),
 *   - search_files result (no path): no bogus extension, generic title,
 *   - no result: shows the "No tool result" fallback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToolResultController } from "../../src/renderer/apps/tool-result/tool-result-controller";

const flush = () => new Promise((r) => setTimeout(r, 120));

function pending(ctx: Record<string, unknown>): void {
  (window as unknown as Record<string, unknown>).__pendingToolResult = ctx;
}

type EditorLike = HTMLElement & {
  isReadOnly?: boolean;
  filePath?: string;
  fileName?: string;
  textContentModel?: { getValue(): string; uri: string };
  setStatusInfo?: (t: string | null) => void;
};

describe("ToolResultController", () => {
  let host: HTMLElement;
  let controller: ToolResultController;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    controller = new ToolResultController("tool-tab-1", "tool-result");
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
    (window as unknown as Record<string, unknown>).__pendingToolResult = null;
  });

  it("read_file: shows the SNAPSHOTTED result content and a filename with an extension", async () => {
    const result = "export function main() {\n  const x = 42;\n  return x;\n}\n";
    pending({
      toolName: "read_file",
      argsString: JSON.stringify({ path: "/repo/src/a.ts" }),
      result,
      hint: "read_file · a.ts",
    });

    controller.mount(host);
    await flush();

    const editor = host.querySelector("file-editor") as EditorLike | null;
    expect(editor).not.toBeNull();
    // Read-only viewer.
    expect(editor!.isReadOnly).toBe(true);
    // Content is the captured result — NOT re-read from disk.
    expect(editor!.textContentModel?.getValue()).toBe(result);
    expect(editor!.textContentModel?.getValue()).toContain("export function main()");
    // The synthetic URI keeps the real filename (extension included) so the
    // editor can detect the language. No disk path is referenced.
    expect(editor!.filePath).toBe("toolresult://repo/src/a.ts");
    expect(editor!.fileName).toBe("a.ts");
  });

  it("search_files: no path → generic uri, no bogus extension, content preserved", async () => {
    const result = "/repo/src/store.ts\n/repo/src/store/actions.ts\n";
    pending({
      toolName: "search_files",
      argsString: JSON.stringify({ query: "store", roots: ["/x/ascii-drawing-tool/main"] }),
      result,
      hint: 'search_files · "store"',
    });

    controller.mount(host);
    await flush();

    const editor = host.querySelector("file-editor") as EditorLike | null;
    expect(editor).not.toBeNull();
    expect(editor!.textContentModel?.getValue()).toBe(result);
    expect(editor!.filePath).toBe("toolresult://search_files");
    expect(editor!.fileName).toBe("search_files");
  });

  it("empty result: shows the no-result fallback instead of an editor", async () => {
    pending({ toolName: "read_file", argsString: '{"path":"/a.ts"}', result: "" });
    controller.mount(host);
    await flush();
    expect(host.querySelector("file-editor")).toBeNull();
  });
});
