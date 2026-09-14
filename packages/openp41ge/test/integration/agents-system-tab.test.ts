/**
 * Integration tests for the Chat sidebar system tab controller.
 *
 * Drives AgentsSystemTabController with TestChatStoreModel (no
 * Electron/IPC). Verifies list rendering, search filtering, tool-call sublist
 * expansion, and the open-in-another-window indicator + Highlight dispatch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentsSystemTabController } from "../../src/renderer/apps/system-tabs/agents-system-tab";
import "../../src/renderer/components/openp41ge-settings-drawer-host";
import { TestChatStoreModel } from "../../src/renderer/models/chat-store-model";
import type { Chat } from "openp41ge-agents";

const flush = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/** Mount a drawer host (in beforeEach) and click the search tool to open the search drawer. */
function openAgentSearchDrawer(host2: HTMLElement, drawerHost: HTMLElement): HTMLElement {
  (host2.querySelector('button[aria-label="Search chats"]') as HTMLButtonElement).click();
  return drawerHost;
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
  let drawerHost: HTMLElement;

  beforeEach(() => {
    mockBridge();
    host = document.createElement("div");
    document.body.appendChild(host);
    drawerHost = document.createElement("openp41ge-settings-drawer-host") as HTMLElement;
    document.body.appendChild(drawerHost);
    storeModel = new TestChatStoreModel(fixtureChats());
    controller = new AgentsSystemTabController("sys-1");
    controller._storeModel = storeModel;
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
    drawerHost.remove();
  });

  it("mounts and lists chats; the footer holds the search tool and this tab's settings button", async () => {
    controller.mount(host);
    await flush();

    const rows = host.querySelectorAll(".chat-row");
    expect(rows.length).toBe(2);

    // Text is left-aligned; a merged tool-call pill (tool icon + count +
    // chevron) sits on the right and appears only for expandable rows (those
    // with tool calls).
    const toolsRow = Array.from(rows).find((r) => r.textContent?.includes("Fix bug"))!;
    const noToolsRow = Array.from(rows).find((r) => r.textContent?.includes("Write tests"))!;
    const chevronBtn = toolsRow.querySelector(".chat-chevron-btn");
    expect(chevronBtn).toBeTruthy();
    expect(chevronBtn?.tagName).toBe("BUTTON");
    // The chevron button is the rightmost element of the row head.
    const toolsHead = toolsRow.querySelector(".chat-row-head")!;
    expect(toolsHead.lastElementChild).toBe(chevronBtn);
    expect(noToolsRow.querySelector(".chat-chevron-btn")).toBeNull();

    // The New Chat is a clickable row at the top of the tab.
    const newChatRow = host.querySelector('button.chat-new-row') as HTMLButtonElement;
    expect(newChatRow).toBeTruthy();

    // The footer holds the search tool (new) + this tab's own settings gear.
    const settingsBtn = host.querySelector('button[aria-label="Agent settings"]') as HTMLButtonElement;
    expect(settingsBtn).toBeTruthy();
    expect(host.querySelector('button[aria-label="Search chats"]')).toBeTruthy();
    const openEventSpy = vi.fn();
    document.addEventListener("openp41ge:open-agents-settings-drawer", openEventSpy);
    settingsBtn.click();
    document.removeEventListener("openp41ge:open-agents-settings-drawer", openEventSpy);
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

  it("opens a search drawer from the footer search tool (no inline bar)", async () => {
    controller.mount(host);
    await flush();

    // No inline search box at the top of the sidebar anymore.
    expect(host.querySelector("input")).toBeNull();

    const drawerHost2 = openAgentSearchDrawer(host, drawerHost);
    await flush();

    // The shared search drawer opened, carrying the shared input row + toggles.
    expect(drawerHost2.textContent).toContain("Search chats");
    const input = drawerHost2.querySelector('input[placeholder="Search chats…"]');
    expect(input).toBeTruthy();
    expect(drawerHost2.querySelector('button[title="Regex search"]')).toBeTruthy();
    expect(drawerHost2.querySelector('button[title="Match case (case-sensitive)"]')).toBeTruthy();

    // Pressing the footer search tool again closes the drawer (toggle).
    (host.querySelector('button[aria-label="Search chats"]') as HTMLButtonElement).click();
    await flush();
    expect((drawerHost2 as unknown as { isOpen: boolean }).isOpen).toBe(false);
  });

  it("passes regex/case options to the store search", async () => {
    controller.mount(host);
    await flush();
    const drawerHost2 = openAgentSearchDrawer(host, drawerHost);
    await flush();

    const input = drawerHost2.querySelector('input[placeholder="Search chats…"]') as HTMLInputElement;
    input.value = "tests";
    input.dispatchEvent(new Event("input"));
    await flush(300); // debounce is 200ms

    // Toggle match-case on.
    drawerHost2
      .querySelector('button[title="Match case (case-sensitive)"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush(300);
    expect(storeModel.calls.filter((c) => c.op === "search").at(-1)?.args[1]).toMatchObject({
      regex: false,
      caseSensitive: true,
    });

    // Toggle regex on.
    drawerHost2
      .querySelector('button[title="Regex search"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush(300);
    expect(storeModel.calls.filter((c) => c.op === "search").at(-1)?.args[1]).toMatchObject({
      regex: true,
      caseSensitive: true,
    });
  });

  it("filters chats by query in the search drawer", async () => {
    controller.mount(host);
    await flush();
    const drawerHost2 = openAgentSearchDrawer(host, drawerHost);
    await flush();

    const input = drawerHost2.querySelector('input[placeholder="Search chats…"]') as HTMLInputElement;
    input.value = "tests";
    input.dispatchEvent(new Event("input"));
    await flush(300); // debounce is 200ms

    const rows = drawerHost2.querySelectorAll(".chat-result-row");
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
    const chevron = row.querySelector(".chat-chevron-btn") as HTMLElement;
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
