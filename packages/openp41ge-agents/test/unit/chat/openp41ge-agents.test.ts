import { describe, it, expect, beforeEach, vi } from "vitest";
import "@openp41ge-agents/ui/openp41ge-agents";
import type { Openp41geAgents } from "@openp41ge-agents/ui/openp41ge-agents";

describe("Openp41geAgents (custom element)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("can be created via document.createElement", () => {
    const el = document.createElement("openp41ge-agents");
    expect(el).toBeTruthy();
  });

  it("renders DOM structure when connected (with shadow DOM)", () => {
    const el = document.createElement("openp41ge-agents");
    document.body.appendChild(el);

    // Should have a shadow root
    expect(el.shadowRoot).toBeTruthy();
  });

  it.skip("shows empty state message when no messages", () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    const shadow = el.shadowRoot!;
    const empty = shadow.querySelector(".chat-empty");
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toContain("Start a conversation");
  });

  it("adds a user message", () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    el.addMessage("user", "Hello, world!");
    const messages = el.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello, world!");
  });

  it.skip("renders user message in the DOM", () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    el.addMessage("user", "Hello!");

    const shadow = el.shadowRoot!;
    const msgEls = shadow.querySelectorAll(".chat-message");
    expect(msgEls).toHaveLength(1);
    expect(msgEls[0].textContent).toBe("Hello!");
    expect(msgEls[0].classList.contains("user")).toBe(true);
  });

  it.skip("renders assistant message in the DOM", () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    el.addMessage("assistant", "Hi there!");

    const shadow = el.shadowRoot!;
    const msgEls = shadow.querySelectorAll(".chat-message");
    expect(msgEls).toHaveLength(1);
    expect(msgEls[0].textContent).toBe("Hi there!");
    expect(msgEls[0].classList.contains("assistant")).toBe(true);
  });

  it.skip("adds multiple messages", () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
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
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".chat-empty")).toBeTruthy();

    el.addMessage("user", "Hello");

    expect(shadow.querySelector(".chat-empty")).toBeNull();
  });

  it("clearMessages removes all messages and shows empty state", () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    el.addMessage("user", "Hello");
    el.addMessage("assistant", "Hi");
    el.clearMessages();

    expect(el.messages).toHaveLength(0);

    const shadow = el.shadowRoot!;
    expect(shadow.querySelectorAll(".chat-message")).toHaveLength(0);
  });

  it("addMessage assigns a timestamp", () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    const before = Date.now();
    el.addMessage("user", "Hello");
    const after = Date.now();

    expect(el.messages[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(el.messages[0].timestamp).toBeLessThanOrEqual(after);
  });

  it.skip("does not send empty messages", () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
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
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
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
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
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
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
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
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    // Spy on the focus method since jsdom does not track shadow DOM activeElement
    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    const focusSpy = vi.spyOn(inputEl, "focus");

    el.focusInput();

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("does not re-build on re-connect", () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    const firstChildren = el.shadowRoot!.children.length;

    // Simulate re-connect
    el.connectedCallback();

    expect(el.shadowRoot!.children.length).toBe(firstChildren);
  });

  it("registerOpenp41geAgents is idempotent when called again", async () => {
    const { registerOpenp41geAgents } = await import("@openp41ge-agents/ui/openp41ge-agents");
    // Element is already registered by module import, so calling again
    // exercises the else branch (element already exists)
    expect(() => registerOpenp41geAgents()).not.toThrow();
    expect(customElements.get("openp41ge-agents")).toBeTruthy();
  });

  // ── Controller imperative API (setChat / appendDelta / setToolCallState) ──

  it("setChat renders the transcript and tool rows", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.setChat({
      id: "chat_1",
      title: "Hello",
      providerId: "vllm",
      createdAt: 0,
      updatedAt: 0,
      messages: [
        { id: "m1", role: "user", content: "hi", timestamp: 1 },
        {
          id: "m2",
          role: "assistant",
          content: "hello",
          toolCalls: [{ id: "tc1", name: "read_file", arguments: '{"path":"/a"}', status: "done" }],
          timestamp: 2,
        },
      ],
    });

    await el.updateComplete;
    const shadow = el.shadowRoot!;
    expect(shadow.querySelectorAll(".chat-message.user")).toHaveLength(1);
    expect(shadow.querySelectorAll(".chat-message.assistant")).toHaveLength(1);
    const toolRow = shadow.querySelector(".tool-call-row") as HTMLElement;
    expect(toolRow.textContent).toContain("read_file");
    expect(toolRow.textContent).toContain("/a");
  });

  it("appendDelta creates and grows the assistant message", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.appendDelta("Hello");
    el.appendDelta(" world");

    const messages = el.messages as Array<{ role: string; content?: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content).toBe("Hello world");
  });

  it("setToolCallState adds a running tool call then transitions to done", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.setToolCallState({
      id: "tc1",
      name: "run_command",
      arguments: '{"command":"ls"}',
      status: "running",
    });
    const running = (el.messages as Array<{ toolCalls?: Array<{ status: string }> }>)[0]
      .toolCalls![0];
    expect(running.status).toBe("running");

    el.setToolCallState({
      id: "tc1",
      name: "run_command",
      arguments: '{"command":"ls"}',
      status: "done",
    });
    const done = (el.messages as Array<{ toolCalls?: Array<{ status: string }> }>)[0].toolCalls![0];
    expect(done.status).toBe("done");
  });

  it("dispatches chat:send with the typed text", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const handler = vi.fn();
    el.addEventListener("chat:send", handler as EventListener);

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hello agent";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;
    const sendBtn = el.shadowRoot!.querySelector(".composer-send") as HTMLElement;
    sendBtn.click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { text: "hello agent" } }),
    );
  });

  it("renders typed text into the composer content and enables submit", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    expect(
      (el.shadowRoot!.querySelector(".composer-send") as HTMLButtonElement).disabled,
    ).toBe(true);

    (inputEl as { value: string }).value = "use `read_file` to inspect";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    expect(content.textContent).toContain("use");
    expect(content.querySelector("code")?.textContent).toBe("read_file");
    expect(
      (el.shadowRoot!.querySelector(".composer-send") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("does not send when the composer is empty", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const handler = vi.fn();
    el.addEventListener("chat:send", handler as EventListener);

    (el.shadowRoot!.querySelector(".composer-send") as HTMLButtonElement).click();
    expect(handler).not.toHaveBeenCalled();
  });

  it("highlights the selected textarea range in the composer content", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "use `read_file` now";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;

    // Select the backticked token (raw range "`read_file`").
    inputEl.setSelectionRange(4, 15);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    const code = content.querySelector("code") as HTMLElement;
    const sel = code.querySelector(".composer-highlight") as HTMLElement;
    expect(sel.textContent).toBe("read_file");
    expect(content.querySelectorAll(".composer-highlight")).toHaveLength(1);
    expect(content.textContent).toContain("use");
    expect(content.textContent).toContain("now");
  });

  it("splits a selection that crosses a code boundary into per-segment highlights", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "a `b` c";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;

    // Select from 'a ' into the code token: raw range "a `b`".
    inputEl.setSelectionRange(0, 5);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    const sel = Array.from(content.querySelectorAll(".composer-highlight")).map(
      (m) => m.textContent,
    );
    expect(sel).toEqual(["a ", "b"]);
  });

  it("uses a span (not a styled mark) so the highlight never shifts layout", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "use `read_file` now";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;

    inputEl.setSelectionRange(4, 15);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    // The global <mark> rule adds padding/border/font that shifts the text;
    // the highlight must be a plain <span> so layout stays stable.
    expect(content.innerHTML).not.toContain("<mark");
    expect(content.querySelectorAll("span.composer-highlight")).toHaveLength(1);
  });

  it("clears the highlight when the selection collapses to a caret", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hello world";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;

    inputEl.setSelectionRange(0, 5);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelectorAll(".composer-highlight")).toHaveLength(1);

    // Collapse back to a caret (e.g. clicking once).
    inputEl.setSelectionRange(3, 3);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelectorAll(".composer-highlight")).toHaveLength(0);
  });

  it("tooltips the submit button when it is deactivated", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    const sendBtn = el.shadowRoot!.querySelector(".composer-send") as HTMLButtonElement;

    // Deactivated (empty draft): a tooltip explains why the button is inert.
    expect(sendBtn.disabled).toBe(true);
    expect(sendBtn.getAttribute("title")).toBe("Type a message to send");

    // Activate: the tooltip reverts to the send action label.
    (inputEl as { value: string }).value = "hello";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(sendBtn.disabled).toBe(false);
    expect(sendBtn.getAttribute("title")).toBe("Send message");

    // Clearing the draft deactivates it again.
    (inputEl as { value: string }).value = "";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(sendBtn.disabled).toBe(true);
    expect(sendBtn.getAttribute("title")).toBe("Type a message to send");
  });

  it("setComposerContext populates providers and active tools", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.setComposerContext({
      providers: [{ id: "vllm", label: "vLLM", model: "vicuna-13b" }],
      activeTools: ["read_file", "run_command"],
    });
    await el.updateComplete;

    const select = el.shadowRoot!.querySelector(".composer-select") as HTMLSelectElement;
    expect(select.options).toHaveLength(1);
    expect(select.options[0].textContent).toContain("vLLM");
    expect(select.value).toBe("vllm");

    const toolsBtn = el.shadowRoot!.querySelector(".composer-tool[title='Active tools']") as HTMLElement;
    expect(toolsBtn.querySelector(".tool-badge")?.textContent).toBe("2");
  });

  it("sends on Enter (without Shift) and not on Shift+Enter", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const handler = vi.fn();
    el.addEventListener("chat:send", handler as EventListener);

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hello";
    inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: false }));
    expect(handler).toHaveBeenCalledTimes(1);

    (inputEl as { value: string }).value = "again";
    inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("setProviderStatus shows a status strip when unreachable", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.setProviderStatus({ streaming: false, providerOk: false, providerLabel: "vLLM" });
    await el.updateComplete;
    const status = el.shadowRoot!.querySelector(".chat-status") as HTMLElement;
    expect(status).toBeTruthy();
    expect(status.textContent).toContain("unreachable");
  });
});
