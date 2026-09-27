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

    // No expandable tool-call pill (tool icon + count + chevron) is rendered.
    expect(host.querySelector(".chat-chevron-btn")).toBeNull();
    expect(host.querySelector(".chat-tool-sublist")).toBeNull();

    const newChatRow = host.querySelector('button.chat-new-row') as HTMLButtonElement;
    expect(newChatRow).toBeTruthy();

    // The footer holds the search tool (new) + this tab's own settings gear.
    const settingsBtn = host.querySelector('button[aria-label="Agent settings"]') as HTMLButtonElement;
    expect(settingsBtn).toBeTruthy();
    const searchBtn = host.querySelector('button[aria-label="Search chats"]') as HTMLButtonElement;
    expect(searchBtn).toBeTruthy();
    // The footer button group is split off by two 1px separator lines flanking
    // the search button; each separator carries a single top overdraw accent
    // (an upward line, so the divider continues past the footer's top border).
    const seps = Array.from(host.querySelectorAll("span.footer-sep"));
    expect(seps).toHaveLength(2);
    for (const sep of seps) {
      const lines = Array.from(sep.querySelectorAll("overdraw-line"));
      expect(lines).toHaveLength(1);
      expect(lines[0].getAttribute("dir")).toBe("up");
    }
    // The buttons themselves carry no overdraw accents — only the separators do.
    for (const btn of [settingsBtn, searchBtn]) {
      expect(btn.querySelectorAll("overdraw-line")).toHaveLength(0);
    }
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

  it("marks the chat-list separator borders for the windowview overdraws", async () => {
    controller.mount(host);
    await flush();

    // "+ New chat" row carries a bottom separator; the last chat row carries
    // both the top (inter-session) and bottom (list-end) separators; the first
    // chat row itself carries none (its separators are the new-chat row's
    // bottom border and the second row's top border).
    const newChatRow = host.querySelector('button.chat-new-row') as HTMLElement;
    expect(newChatRow.dataset.sbSep).toBe("bottom");
    const rows = Array.from(host.querySelectorAll<HTMLElement>(".chat-row"));
    expect(rows).toHaveLength(2);
    expect(rows[0].dataset.sbSep).toBeUndefined();
    expect(rows[1].dataset.sbSep).toBe("top bottom");
  });

  it("does not render the open-in-another-window row icons; clicking still toasts", async () => {
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
    // The right-end indicator + Highlight icons are removed.
    expect(row.textContent).not.toContain("↗");
    expect(row.textContent).not.toContain("✧");
    expect(Array.from(row.querySelectorAll("button")).length).toBe(0);

    // Clicking the row still shows the open-in-another-window toast.
    const clickRowHead = row.querySelector<HTMLElement>(".chat-row-head")!;
    clickRowHead.click();
    await flush();
  });
});
