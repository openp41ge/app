/**
 * Integration tests for the Chat sidebar system tab controller.
 *
 * Drives AgentsSystemTabController with TestChatStoreModel (no
 * Electron/IPC). Verifies list rendering, search filtering, tool-call sublist
 * expansion, and the open-in-another-window indicator + Highlight dispatch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentsSystemTabController } from "../../src/renderer/apps/system-tabs/agents-system-tab";
import { TestChatStoreModel } from "../../src/renderer/models/chat-store-model";
import type { Chat } from "openp41ge-agents";

const flush = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/** Click the footer search tool so the search box becomes active. */
function openAgentSearch(host: HTMLElement): void {
  (host.querySelector('button[aria-label="Search chats"]') as HTMLButtonElement).click();
}

function fixtureChats(): Chat[] {
  return [
    {
      id: "chat_1",
      title: "Fix bug",
      providerId: "vllm",
      createdAt: 1,
      updatedAt: 3,
      messages: [
        { id: "m1", role: "user", content: "Find the config bug", timestamp: 1 },
        {
          id: "m2",
          role: "assistant",
          content: "I found it",
          toolCalls: [
            { id: "tc1", name: "read_file", arguments: '{"path":"cfg.json"}', status: "done" },
          ],
          timestamp: 2,
        },
      ],
    },
    {
      id: "chat_2",
      title: "Write tests",
      providerId: "vllm",
      createdAt: 1,
      updatedAt: 2,
      messages: [{ id: "m3", role: "user", content: "Add unit tests", timestamp: 1 }],
    },
  ];
}

function mockBridge(windowId = "win-local"): void {
  (window as unknown as Record<string, unknown>).openp41ge = {
    workspace: { getWindowId: () => windowId },
  };
}

describe("AgentsSystemTabController", () => {
  let host: HTMLElement;
  let controller: AgentsSystemTabController;
  let storeModel: TestChatStoreModel;

  beforeEach(() => {
    mockBridge();
    host = document.createElement("div");
    document.body.appendChild(host);
    storeModel = new TestChatStoreModel(fixtureChats());
    controller = new AgentsSystemTabController("sys-1");
    controller._storeModel = storeModel;
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
  });

  it("mounts and lists chats; the footer holds the search tool and this tab's settings button", async () => {
    controller.mount(host);
    await flush();

    const rows = host.querySelectorAll(".chat-row");
    expect(rows.length).toBe(2);

    // The New Chat is a clickable row at the top of the tab.
    const newChatRow = host.querySelector('button.chat-new-row') as HTMLButtonElement;
    expect(newChatRow).toBeTruthy();

    // The footer holds the search tool (new) + this tab's own settings gear.
    const settingsBtn = host.querySelector('button[aria-label="Agent settings"]') as HTMLButtonElement;
    expect(settingsBtn).toBeTruthy();
    expect(host.querySelector('button[aria-label="Search chats"]')).toBeTruthy();
    const openEventSpy = vi.fn();
    document.addEventListener("openp41ge:open-agents-settings", openEventSpy);
    settingsBtn.click();
    document.removeEventListener("openp41ge:open-agents-settings", openEventSpy);
    expect(openEventSpy).toHaveBeenCalledOnce();
    const detail = (openEventSpy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.appType).toBe("agent");
    expect(detail.title).toBe("Agents");
  });

  it("creates a new chat when the top New chat row is clicked", async () => {
    controller.mount(host);
    await flush();

    const before = storeModel.calls.filter((c) => c.op === "create").length;
    const openChatSpy = vi.fn();
    document.addEventListener("openp41ge:open-chat", openChatSpy);
    (host.querySelector('button.chat-new-row') as HTMLButtonElement).click();
    await flush();
    document.removeEventListener("openp41ge:open-chat", openChatSpy);

    expect(storeModel.calls.filter((c) => c.op === "create")).toHaveLength(before + 1);
    expect(openChatSpy).toHaveBeenCalledOnce();
    const detail = (openChatSpy.mock.calls[0][0] as CustomEvent).detail;
    expect(typeof detail.chatId).toBe("string");
    expect(detail.pinned).toBe(true);
  });

  it("hides the search box by default and reveals it via the footer search tool", async () => {
    controller.mount(host);
    await flush();

    const input = host.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();
    // The search box is hidden until the search tool is toggled on.
    expect(input?.parentElement?.style.display).toBe("none");

    // The New Chat is a clickable row at the top, NOT a footer button.
    expect(host.querySelector('button.chat-new-row')).toBeTruthy();

    // Toggling the footer search tool reveals the search box with toggles.
    const searchBtn = host.querySelector('button[aria-label="Search chats"]') as HTMLButtonElement;
    searchBtn.click();
    await flush();
    expect(input?.parentElement?.style.display).toBe("flex");
    const header = input?.parentElement;
    expect(header?.querySelector('button[title="Regex search"]')).toBeTruthy();
    expect(header?.querySelector('button[title="Match case (case-sensitive)"]')).toBeTruthy();

    // Toggling off hides it again.
    searchBtn.click();
    await flush();
    expect(input?.parentElement?.style.display).toBe("none");
  });

  it("passes regex/case options to the store search", async () => {
    controller.mount(host);
    await flush();
    openAgentSearch(host);

    const input = host.querySelector("input") as HTMLInputElement;
    input.value = "tests";
    input.dispatchEvent(new Event("input"));
    await flush(300); // debounce is 200ms

    // Toggle match-case on.
    host
      .querySelector('button[title="Match case (case-sensitive)"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(storeModel.calls.filter((c) => c.op === "search").at(-1)?.args[1]).toMatchObject({
      regex: false,
      caseSensitive: true,
    });

    // Toggle regex on.
    host
      .querySelector('button[title="Regex search"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(storeModel.calls.filter((c) => c.op === "search").at(-1)?.args[1]).toMatchObject({
      regex: true,
      caseSensitive: true,
    });
  });

  it("filters by search query (message text)", async () => {
    controller.mount(host);
    await flush();
    openAgentSearch(host);

    const input = host.querySelector("input") as HTMLInputElement;
    input.value = "tests";
    input.dispatchEvent(new Event("input"));
    await flush(300); // debounce is 200ms

    const rows = host.querySelectorAll(".chat-row");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("Write tests");
  });

  it("expands a row to show its tool-call sublist", async () => {
    controller.mount(host);
    await flush();

    // Expand the "Fix bug" row by mimicking the header click.
    const row = Array.from(host.querySelectorAll<HTMLElement>(".chat-row")).find((r) =>
      r.textContent?.includes("Fix bug"),
    )!;
    const chevron = row.querySelector(".chat-chevron") as HTMLElement;
    chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    // Re-query: the toggle re-rendered the list, so the original row is detached.
    const sub = host.querySelector(
      '.chat-row[data-chat-id="chat_1"] .chat-tool-sublist',
    ) as HTMLElement;
    expect(sub).toBeTruthy();
    expect(sub.textContent).toContain("read_file");
    expect(sub.textContent).toContain("cfg.json");
  });

  it("archives a chat after the confirmation (soft-hide, not delete)", async () => {
    controller.mount(host);
    await flush();

    const row = Array.from(host.querySelectorAll<HTMLElement>(".chat-row")).find((r) =>
      r.textContent?.includes("Write tests"),
    )!;
    const archiveBtn = row.querySelector(".chat-archive") as HTMLButtonElement;
    expect(archiveBtn).toBeTruthy();

    // Stub the confirm modal to approve.
    controller._confirm = async () => true;
    archiveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    // Archive was recorded, not delete.
    expect(storeModel.calls.some((c) => c.op === "archive" && c.args[0] === "chat_2")).toBe(true);
    expect(storeModel.calls.some((c) => c.op === "delete")).toBe(false);
    expect((await storeModel.get("chat_2"))?.archivedAt).toBeTypeOf("number");

    // The archived chat is no longer listed.
    const rows = host.querySelectorAll(".chat-row");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("Fix bug");
    expect(host.textContent).not.toContain("Write tests");
  });

  it("does not archive when the confirmation is cancelled", async () => {
    controller.mount(host);
    await flush();

    const row = Array.from(host.querySelectorAll<HTMLElement>(".chat-row")).find((r) =>
      r.textContent?.includes("Write tests"),
    )!;
    const archiveBtn = row.querySelector(".chat-archive") as HTMLButtonElement;

    controller._confirm = async () => false;
    archiveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    expect(storeModel.calls.some((c) => c.op === "archive")).toBe(false);
    expect(host.querySelectorAll(".chat-row").length).toBe(2);
  });

  it("shows the open-in-another-window indicator + Highlight dispatch", async () => {
    mockBridge("win-local");
    // Open chat_1 in a different window.
    storeModel.setCurrentWinId("win-other");
    await storeModel.open("chat_1");
    // Re-mount so the controller picks up the open-state after refresh.
    controller.mount(host);
    await flush();

    const row = Array.from(host.querySelectorAll<HTMLElement>(".chat-row")).find((r) =>
      r.textContent?.includes("Fix bug"),
    )!;
    expect(row.textContent).toContain("↗");

    const hlBtn = Array.from(row.querySelectorAll("button")).find((b) => b.textContent === "✧");
    expect(hlBtn).toBeTruthy();
    const openCountBefore = storeModel.calls.filter((c) => c.op === "highlight").length;
    hlBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(storeModel.calls.filter((c) => c.op === "highlight")).toHaveLength(openCountBefore + 1);
  });
});
