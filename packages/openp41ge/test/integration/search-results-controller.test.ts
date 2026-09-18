/**
 * Integration tests for SearchResultsController — the pane opened when a
 * `search_files` tool-call card is clicked.
 *
 * A search result is a LIST of matching file paths, not file content — so it
 * must NOT render a `<file-editor>`. It renders the matches as read-only rows,
 * with a bottom bar containing the line-wrap toggle, and clicking a row
 * dispatches `openp41ge:open-search-result-file` so the file opens in the next
 * cell.
 *
 * Covers:
 *   - rows render for each result path (and no file-editor is created),
 *   - the bottom bar has the line-wrap toggle and there is no top header,
 *   - toggling wrap flips the `wrapped` class + active state on the button,
 *   - clicking a row dispatches the file-open event with the row's path,
 *   - empty result shows the no-matches fallback,
 *   - restore() re-parses the serialised context.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SearchResultsController } from "../../src/renderer/apps/search-results/search-results-controller";

function pending(ctx: Record<string, unknown>): void {
  (window as unknown as Record<string, unknown>).__pendingToolResult = ctx;
}

describe("SearchResultsController", () => {
  let host: HTMLElement;
  let controller: SearchResultsController;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    controller = new SearchResultsController("search-tab-1", "search-results");
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
    (window as unknown as Record<string, unknown>).__pendingToolResult = null;
  });

  it("renders the matching paths as rows — NOT a file editor", () => {
    pending({
      toolName: "search_files",
      argsString: JSON.stringify({ query: "store", roots: ["/x/ascii-drawing-tool/main"] }),
      result: "/repo/src/store.ts\n/repo/src/store/actions.ts\n/repo/src/store/index.ts",
      hint: 'search_files · "store"',
    });
    controller.mount(host);
    const rows = host.querySelectorAll(".sr-row");
    expect(rows).toHaveLength(3);
    expect(host.querySelector("file-editor")).toBeNull();
    expect(host.textContent).toContain("/repo/src/store.ts");
    expect(host.textContent).toContain("/repo/src/store/actions.ts");
    // No top header; a bottom bar holds the line-wrap toggle.
    expect(host.querySelector(".sr-bottom")).not.toBeNull();
    expect(host.querySelector(".sr-wrap-btn")).not.toBeNull();
  });

  it("bottom-bar wrap toggle flips the wrapped class and active state", () => {
    pending({
      toolName: "search_files",
      argsString: JSON.stringify({ query: "store" }),
      result: "/repo/src/a/very/long/path/that/should/wrap.ts\n/repo/src/store.ts",
      hint: 'search_files · "store"',
    });
    controller.mount(host);
    const list = host.querySelector(".sr-list")!;
    const btn = host.querySelector(".sr-wrap-btn")! as HTMLButtonElement;
    expect(list.classList.contains("wrapped")).toBe(false);
    expect(btn.classList.contains("active")).toBe(false);
    btn.click();
    expect(list.classList.contains("wrapped")).toBe(true);
    expect(btn.classList.contains("active")).toBe(true);
    btn.click();
    expect(list.classList.contains("wrapped")).toBe(false);
    expect(btn.classList.contains("active")).toBe(false);
  });

  it("clicking a row dispatches open-search-result-file with that path", () => {
    pending({
      toolName: "search_files",
      argsString: JSON.stringify({ query: "store" }),
      result: "/repo/src/a.ts\n/repo/src/b.ts",
      hint: 'search_files · "store"',
    });
    controller.mount(host);
    let opened: { sourceTabId?: string; path?: string } | null = null;
    const onOpen = ((e: CustomEvent) => {
      opened = e.detail;
    }) as EventListener;
    document.addEventListener("openp41ge:open-search-result-file", onOpen);
    const rows = host.querySelectorAll(".sr-row");
    (rows[1] as HTMLButtonElement).click();
    expect(opened).toEqual({ sourceTabId: "search-tab-1", path: "/repo/src/b.ts" });
    document.removeEventListener("openp41ge:open-search-result-file", onOpen);
  });

  it("flags each row with data-file-path so the shared drag pipeline can drag it to the grid", () => {
    pending({
      toolName: "search_files",
      argsString: JSON.stringify({ query: "store" }),
      result: "/repo/src/a.ts\n/repo/src/b.ts",
      hint: 'search_files · "store"',
    });
    controller.mount(host);
    const rows = host.querySelectorAll(".sr-row") as NodeListOf<HTMLElement>;
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("data-file-path")).toBe("/repo/src/a.ts");
    expect(rows[1].getAttribute("data-file-path")).toBe("/repo/src/b.ts");
  });

  it("empty result shows the no-matches fallback", () => {
    pending({
      toolName: "search_files",
      argsString: JSON.stringify({ query: "zzz" }),
      result: "(no matching files)",
      hint: 'search_files · "zzz"',
    });
    controller.mount(host);
    expect(host.querySelectorAll(".sr-row")).toHaveLength(0);
    expect(host.textContent).toContain("No matching files");
  });

  it("restore() re-parses the serialised context", () => {
    const controller2 = new SearchResultsController("search-tab-2", "search-results");
    controller2.restore({
      filePath: JSON.stringify({
        toolName: "search_files",
        argsString: JSON.stringify({ query: "store" }),
        result: "/repo/src/store.ts",
        hint: 'search_files · "store"',
      }),
    });
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    controller2.mount(host2);
    expect(host2.querySelectorAll(".sr-row")).toHaveLength(1);
    expect(host2.textContent).toContain("/repo/src/store.ts");
    controller2.unmount();
    host2.remove();
  });
});
