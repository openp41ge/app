/**
 * Integration tests for AgentsController.
 *
 * Drives the grid chat pane controller with TestChatStoreModel +
 * TestChatRuntimeModel (no Electron/IPC). Verifies mount reads the chat id,
 * send/abort route to the runtime, streamed deltas/tool/status reach the
 * <openp41ge-agents> component, and snapshot/restore round-trips.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentsController } from "../../src/renderer/apps/agents/agents-controller";
import { TestChatStoreModel } from "../../src/renderer/models/chat-store-model";
import { TestChatRuntimeModel } from "../../src/renderer/models/chat-runtime-model";
import type { Chat } from "openp41ge-agents";

const flush = () => new Promise((r) => setTimeout(r, 30));

function mockBridge(windowId = "win-1"): void {
  (window as unknown as Record<string, unknown>).openp41ge = {
    workspace: {
      getWindowId: () => windowId,
      getState: async () =>
        JSON.stringify({ windows: [{ id: windowId, grid: { placements: [] } }] }),
    },
  };
}

function fixtureChat(): Chat {
  return {
    id: "chat_1",
    title: "Fix bug",
    providerId: "vllm",
    createdAt: 1,
    updatedAt: 1,
    messages: [
      { id: "m1", role: "user", content: "Help me", timestamp: 1 },
      { id: "m2", role: "assistant", content: "Sure", timestamp: 2 },
    ],
  };
}

describe("AgentsController", () => {
  let host: HTMLElement;
  let controller: AgentsController;
  let storeModel: TestChatStoreModel;
  let runtimeModel: TestChatRuntimeModel;

  beforeEach(() => {
    mockBridge();
    host = document.createElement("div");
    document.body.appendChild(host);
    storeModel = new TestChatStoreModel([fixtureChat()]);
    runtimeModel = new TestChatRuntimeModel();
    controller = new AgentsController("ctab-1", "agents");
    controller._storeModel = storeModel;
    controller._runtimeModel = runtimeModel;
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
    (window as unknown as Record<string, unknown>).__pendingChatId = null;
  });

  it("mounts the chat pane and loads the transcript", async () => {
    (window as unknown as Record<string, unknown>).__pendingChatId = "chat_1";
    controller.mount(host);
    await flush();

    const el = host.querySelector("openp41ge-agents") as HTMLElement & {
      messages?: readonly Chat["messages"];
    };
    expect(el).toBeTruthy();
    expect(el.messages).toHaveLength(2);
    expect(el.messages![0]).toMatchObject({ role: "user", content: "Help me" });
  });

  it("forwards a chat:send event to the runtime", async () => {
    (window as unknown as Record<string, unknown>).__pendingChatId = "chat_1";
    controller.mount(host);
    await flush();

    const el = host.querySelector("openp41ge-agents") as HTMLElement;
    el.dispatchEvent(new CustomEvent("chat:send", { detail: { text: "hello" }, bubbles: true }));
    await flush();

    expect(runtimeModel.calls.some((c) => c.op === "send" && c.args[0] === "chat_1")).toBe(true);
  });

  it("forwards a chat:tool-open event to the window-level tool-result event", async () => {
    (window as unknown as Record<string, unknown>).__pendingChatId = "chat_1";
    controller.mount(host);
    await flush();

    let detail: Record<string, unknown> | null = null;
    const handler = (e: CustomEvent) => {
      detail = e.detail as Record<string, unknown>;
    };
    document.addEventListener("openp41ge:open-tool-result", handler as EventListener);
    try {
      const el = host.querySelector("openp41ge-agents") as HTMLElement;
      el.dispatchEvent(
        new CustomEvent("chat:tool-open", {
          detail: {
            toolCall: { id: "tc1", name: "read_file", arguments: '{"path":"/a"}' },
            result: "file contents",
          },
          bubbles: true,
        }),
      );
      await flush();

      expect(detail).not.toBeNull();
      expect((detail as { chatTabId?: string }).chatTabId).toBe("ctab-1");
      expect((detail as { name?: string }).name).toBe("read_file");
      expect((detail as { result?: string }).result).toBe("file contents");
    } finally {
      document.removeEventListener("openp41ge:open-tool-result", handler as EventListener);
    }
  });

  it("appends streamed deltas to the component", async () => {
    (window as unknown as Record<string, unknown>).__pendingChatId = "chat_1";
    controller.mount(host);
    await flush();

    const el = host.querySelector("openp41ge-agents") as HTMLElement & {
      messages?: readonly Chat["messages"];
    };
    runtimeModel.emitDelta("chat_1", "Assembling");
    await flush();
    // The message list now ends with the streamed assistant text.
    const last = el.messages![el.messages!.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.content).toContain("Assembling");
  });

  it("forwards token usage to the component's bottom bar", async () => {
    (window as unknown as Record<string, unknown>).__pendingChatId = "chat_1";
    controller.mount(host);
    await flush();

    const el = host.querySelector("openp41ge-agents") as HTMLElement & {
      _usage?: unknown;
    };
    runtimeModel.emitUsage("chat_1", { promptTokens: 120, completionTokens: 34, totalTokens: 154 });
    await flush();
    expect(el._usage).toEqual({ promptTokens: 120, completionTokens: 34, totalTokens: 154 });

    // Usage for another chat is ignored (per-chat subscription).
    runtimeModel.emitUsage("chat_2", { promptTokens: 1, completionTokens: 1, totalTokens: 2 });
    await flush();
    expect(el._usage).toEqual({ promptTokens: 120, completionTokens: 34, totalTokens: 154 });
  });

  it("populates the composer provider/model selector from the agent config", async () => {
    (window as unknown as Record<string, unknown>).openp41ge = {
      ...(window as unknown as Record<string, unknown>).openp41ge,
      chat: {
        getAgentConfig: async () => ({
          providerId: "vllm",
          providers: {
            vllm: { baseUrl: "http://localhost:8000/v1", model: "vicuna-13b", name: "vLLM" },
          },
        }),
        listTools: async () => [
          { name: "read_file", description: "Read a file." },
          { name: "search_files", description: "Search files." },
        ],
      },
    };
    (window as unknown as Record<string, unknown>).__pendingChatId = "chat_1";
    controller.mount(host);
    await flush();

    const el = host.querySelector("openp41ge-agents") as HTMLElement;
    await flush();
    const providerBtn = (el.shadowRoot as ShadowRoot).querySelector(
      ".composer-select",
    ) as HTMLButtonElement;
    expect(providerBtn).toBeTruthy();
    expect(providerBtn.querySelector(".composer-select-label")?.textContent).toContain("vLLM");

    // Clicking the selector opens the custom provider dropdown list.
    providerBtn.click();
    await flush();
    const item = (el.shadowRoot as ShadowRoot).querySelector(
      ".composer-provider-menu .provider-item",
    );
    expect(item).toBeTruthy();
    expect(item?.textContent).toContain("vLLM");
  });

  it("snapshot/restore persists the chat id", () => {
    controller.restore({ chatId: "chat_7", cwd: "/repo" });
    expect(controller.snapshot()).toEqual({ chatId: "chat_7" });
    const restored = new AgentsController("ctab-2", "agents");
    restored.restore(controller.snapshot());
    expect(restored.chatId).toBe("chat_7");
  });
});
