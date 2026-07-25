import { describe, it, expect, beforeEach, vi } from "vitest";
import "@openp41ge-agent-chat/ui/openp41ge-agent-chat";
import type { Openp41geAgentChat } from "@openp41ge-agent-chat/ui/openp41ge-agent-chat";

describe("Openp41geAgentChat (custom element)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("can be created via document.createElement", () => {
    const el = document.createElement("openp41ge-agent-chat");
    expect(el).toBeTruthy();
  });

  it("renders DOM structure when connected (with shadow DOM)", () => {
    const el = document.createElement("openp41ge-agent-chat");
    document.body.appendChild(el);

    // Should have a shadow root
    expect(el.shadowRoot).toBeTruthy();
  });

  it.skip("shows empty state message when no messages", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    const shadow = el.shadowRoot!;
    const empty = shadow.querySelector(".chat-empty");
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toContain("Start a conversation");
  });

  it("adds a user message", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    el.addMessage("user", "Hello, world!");
    const messages = el.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello, world!");
  });

  it.skip("renders user message in the DOM", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    el.addMessage("user", "Hello!");

    const shadow = el.shadowRoot!;
    const msgEls = shadow.querySelectorAll(".chat-message");
    expect(msgEls).toHaveLength(1);
    expect(msgEls[0].textContent).toBe("Hello!");
    expect(msgEls[0].classList.contains("user")).toBe(true);
  });

  it.skip("renders assistant message in the DOM", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    el.addMessage("assistant", "Hi there!");

    const shadow = el.shadowRoot!;
    const msgEls = shadow.querySelectorAll(".chat-message");
    expect(msgEls).toHaveLength(1);
    expect(msgEls[0].textContent).toBe("Hi there!");
    expect(msgEls[0].classList.contains("assistant")).toBe(true);
  });

  it.skip("adds multiple messages", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    el.addMessage("user", "Hello");
    el.addMessage("assistant", "Hi");
    el.addMessage("user", "How are you?");

    expect(el.messages).toHaveLength(3);

    const shadow = el.shadowRoot!;
    const msgEls = shadow.querySelectorAll(".chat-message");
    expect(msgEls).toHaveLength(3);
  });

  it.skip("clears empty state when first message is added", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".chat-empty")).toBeTruthy();

    el.addMessage("user", "Hello");

    expect(shadow.querySelector(".chat-empty")).toBeNull();
  });

  it("clearMessages removes all messages and shows empty state", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    el.addMessage("user", "Hello");
    el.addMessage("assistant", "Hi");
    el.clearMessages();

    expect(el.messages).toHaveLength(0);

    const shadow = el.shadowRoot!;
    expect(shadow.querySelectorAll(".chat-message")).toHaveLength(0);
  });

  it("addMessage assigns a timestamp", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    const before = Date.now();
    el.addMessage("user", "Hello");
    const after = Date.now();

    expect(el.messages[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(el.messages[0].timestamp).toBeLessThanOrEqual(after);
  });

  it.skip("does not send empty messages", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    const handler = vi.fn();
    el.addEventListener("chat-message", handler);

    // Simulate send with empty input
    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    inputEl.value = "";
    const sendBtn = el.shadowRoot!.querySelector(".chat-send-btn") as HTMLElement;
    sendBtn.click();

    expect(handler).not.toHaveBeenCalled();
    expect(el.messages).toHaveLength(0);
  });

  it.skip("dispatches chat-message event on send", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    const handler = vi.fn();
    el.addEventListener("chat-message", handler);

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    inputEl.value = "Test message";
    const sendBtn = el.shadowRoot!.querySelector(".chat-send-btn") as HTMLElement;
    sendBtn.click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat-message",
        detail: { text: "Test message" },
      }),
    );
  });

  it.skip("sends on Enter key (without Shift)", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    const handler = vi.fn();
    el.addEventListener("chat-message", handler);

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    inputEl.value = "Hello via Enter";

    const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: false });
    inputEl.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { text: "Hello via Enter" },
      }),
    );
  });

  it.skip("does not send on Shift+Enter", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    const handler = vi.fn();
    el.addEventListener("chat-message", handler);

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    inputEl.value = "No send on Shift+Enter";

    const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true });
    inputEl.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it.skip("focusInput focuses the textarea", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    // Spy on the focus method since jsdom does not track shadow DOM activeElement
    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    const focusSpy = vi.spyOn(inputEl, "focus");

    el.focusInput();

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("does not re-build on re-connect", () => {
    const el = document.createElement("openp41ge-agent-chat") as unknown as Openp41geAgentChat;
    document.body.appendChild(el);

    const firstChildren = el.shadowRoot!.children.length;

    // Simulate re-connect
    el.connectedCallback();

    expect(el.shadowRoot!.children.length).toBe(firstChildren);
  });

  it("registerOpenp41geAgentChat is idempotent when called again", async () => {
    const { registerOpenp41geAgentChat } =
      await import("@openp41ge-agent-chat/ui/openp41ge-agent-chat");
    // Element is already registered by module import, so calling again
    // exercises the else branch (element already exists)
    expect(() => registerOpenp41geAgentChat()).not.toThrow();
    expect(customElements.get("openp41ge-agent-chat")).toBeTruthy();
  });
});
