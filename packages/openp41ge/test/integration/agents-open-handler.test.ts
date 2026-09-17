/**
 * Integration tests for AgentsOpenHandler's tool-result routing.
 *
 * A `search_files` tool call must open the dedicated `search-results` pane
 * (a list of matching paths), NOT the `tool-result` file-editor viewer.
 * A `read_file` (file content) call opens the `tool-result` viewer.
 * A search-result row click opens the chosen file via `file-viewer`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AgentsOpenHandler } from "../../src/renderer/services/agents-open-handler";
import type { ICommandBus } from "../../src/renderer/interfaces/command-bus";

class CaptureBus implements ICommandBus {
  calls: { fn: string; args: unknown[] }[] = [];
  dispatch(fn: string, ...args: unknown[]): void {
    this.calls.push({ fn, args });
  }
}

function installWindow(): void {
  (window as unknown as Record<string, unknown>).openp41ge = {
    workspace: { getWindowId: () => "win-agents-0" },
  };
}

describe("AgentsOpenHandler — tool result routing", () => {
  let handler: AgentsOpenHandler;
  let bus: CaptureBus;

  beforeEach(() => {
    installWindow();
    bus = new CaptureBus();
    handler = new AgentsOpenHandler();
    handler.init(bus as unknown as never, null as never);
  });

  afterEach(() => {
    (window as unknown as Record<string, unknown>).__pendingToolResult = null;
  });

  it("routes a search_files call to the search-results pane", () => {
    handler.handleOpenToolResult(
      new CustomEvent("openp41ge:open-tool-result", {
        detail: {
          chatTabId: "chat-1",
          name: "search_files",
          arguments: JSON.stringify({ query: "store" }),
          result: "/repo/src/store.ts\n/repo/src/store/actions.ts",
        },
      }),
    );
    const call = bus.calls.find((c) => c.fn === "openTabInNextCell");
    expect(call).toBeDefined();
    expect(call!.args[1]).toBe("chat-1");
    expect(call!.args[2]).toBe("search-results");
    expect(call!.args[5]).toBe(false); // unpinned preview
    // The result list is snapshotted in the tab config (not re-read later).
    expect(String(call!.args[4])).toContain("/repo/src/store.ts");
  });

  it("routes a read_file call to the tool-result file viewer", () => {
    handler.handleOpenToolResult(
      new CustomEvent("openp41ge:open-tool-result", {
        detail: {
          chatTabId: "chat-1",
          name: "read_file",
          arguments: JSON.stringify({ path: "/repo/src/a.ts" }),
          result: "export const x = 1;\n",
        },
      }),
    );
    const call = bus.calls.find((c) => c.fn === "openTabInNextCell");
    expect(call).toBeDefined();
    expect(call!.args[2]).toBe("tool-result");
  });

  it("opens a search result row's file via file-viewer in the next cell", () => {
    handler.handleOpenSearchResultFile(
      new CustomEvent("openp41ge:open-search-result-file", {
        detail: { sourceTabId: "search-1", path: "/repo/src/store.ts" },
      }),
    );
    const call = bus.calls.find((c) => c.fn === "openTabInNextCell");
    expect(call).toBeDefined();
    expect(call!.args[1]).toBe("search-1");
    expect(call!.args[2]).toBe("file-viewer");
    expect(call!.args[4]).toBe("/repo/src/store.ts");
    expect(call!.args[5]).toBe(false);
  });
});
