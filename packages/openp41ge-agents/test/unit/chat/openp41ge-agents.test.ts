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

  it("shows token usage in the bottom bar once set", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const bar = el.shadowRoot!.querySelector(".chat-bottombar") as HTMLElement;
    // Before any usage: falls back to the chat title.
    expect(bar.textContent!.trim()).toBe("Agent chat");

    el.setUsage({ promptTokens: 1_200, completionTokens: 34, totalTokens: 1_234 });
    await el.updateComplete;
    const usage = bar.querySelector(".bb-usage") as HTMLElement;
    expect(usage).toBeTruthy();
    // Compact 1K formatting + direction arrows (down = rotated up icon).
    // Three separate stat elements, each carrying its own tooltip.
    const stats = usage.querySelectorAll(".bb-stat");
    expect(stats).toHaveLength(3);
    // Each stat is hovered/annotated via the shared tooltipContent directive.
    expect(stats[0].textContent).toContain("1.2K");
    expect(stats[1].textContent).toContain("34");
    const arrows = usage.querySelectorAll(".bb-arrow");
    expect(arrows).toHaveLength(2);
    expect(arrows[0].classList.contains("down")).toBe(false);
    expect(arrows[1].classList.contains("down")).toBe(true);
    expect(usage.textContent).toContain("K");
    expect(usage.textContent).not.toContain("total");
    expect(usage.textContent).not.toContain("1,200");
  });

  it("shortens large token counts to K/M", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.setUsage({ promptTokens: 1_500_000, completionTokens: 2_300, totalTokens: 1_502_300 });
    await el.updateComplete;
    const usage = el.shadowRoot!.querySelector(".bb-usage") as HTMLElement;
    expect(usage.textContent).toContain("1.5M");
    expect(usage.textContent).toContain("2.3K");
    expect(usage.textContent).not.toContain("total");
  });

  it("shows no empty-state placeholder when there are no messages", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const messages = el.shadowRoot!.querySelector(".chat-messages");
    expect(messages).toBeTruthy();
    // The placeholder text was removed — the message container is empty until
    // the first message is added.
    expect(messages!.querySelector(".tool-empty")).toBeNull();
    expect(messages!.querySelector(".chat-message")).toBeNull();
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

  it("renders a user message as a bubble in the DOM", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    el.addMessage("user", "Hello!");
    await el.updateComplete;

    const msgEls = el.shadowRoot!.querySelectorAll(".chat-message");
    expect(msgEls).toHaveLength(1);
    expect(msgEls[0].querySelector(".msg-content")!.textContent!.trim()).toBe("Hello!");
    expect(msgEls[0].classList.contains("user")).toBe(true);
  });

  it("renders an assistant message inline with markdown in the DOM", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    el.addMessage("assistant", "Hi **there**!");
    await el.updateComplete;

    const msgEls = el.shadowRoot!.querySelectorAll(".chat-message");
    expect(msgEls).toHaveLength(1);
    expect(msgEls[0].classList.contains("assistant")).toBe(true);
    // Assistant responses are rendered as inline markdown, not a bubble.
    expect(msgEls[0].querySelector(".msg-content strong")).not.toBeNull();
  });

  it("adds multiple messages", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    el.addMessage("user", "Hello");
    el.addMessage("assistant", "Hi");
    el.addMessage("user", "How are you?");
    await el.updateComplete;

    expect(el.messages).toHaveLength(3);
    expect(el.shadowRoot!.querySelectorAll(".chat-message")).toHaveLength(3);
  });

  it("shows only detected language matches and lets the user pick one", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    el.addMessage("assistant", "```\nconst x = 1;\n```");
    await el.updateComplete;

    // Inferred block: badge shows the detected language full name.
    const badge = el.shadowRoot!.querySelector(".code-lang") as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent!.trim()).toBe("JavaScript");

    // Open the picker; it should only list detected matches (not all languages).
    badge.click();
    await el.updateComplete;
    const options = el.shadowRoot!.querySelectorAll(".code-lang-option");
    expect(options.length).toBe(2);
    expect(Array.from(options).map((o) => o.textContent!.trim())).toEqual([
      "JavaScript",
      "TypeScript",
    ]);

    // Pick TypeScript → the badge label updates and the picker closes.
    const option = Array.from(options).find((o) => o.textContent!.trim() === "TypeScript")!;
    option.click();
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".code-lang")!.textContent!.trim()).toBe("TypeScript");
    expect(el.shadowRoot!.querySelector(".code-lang-menu")).toBeNull();
  });

  it("toggles line wrapping on a code block", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);

    el.addMessage("assistant", "```js\nconst x = 1;\n```");
    await el.updateComplete;

    const block = el.shadowRoot!.querySelector(".code-block") as HTMLElement;
    expect(block.classList.contains("wrap")).toBe(false);

    const wrapBtn = el.shadowRoot!.querySelector(".code-wrap") as HTMLElement;
    expect(wrapBtn).not.toBeNull();
    wrapBtn.click();
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".code-block")!.classList.contains("wrap")).toBe(true);
  });

  it("attaches horizontal overlay scrollbars to code blocks, but only while unwrapped", async () => {
    // jsdom ships no ResizeObserver, and the component skips attaching without
    // one. Stub it so the sync logic runs and we can assert the lifecycle.
    const RealRO = globalThis.ResizeObserver as unknown;
    // @ts-expect-error jsdom provides no ResizeObserver; install a no-op stub.
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      constructor(_cb: unknown) {}
    };

    try {
      const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
      document.body.appendChild(el);
      el.addMessage("assistant", "```js\nconst x = 1;\n```\n```python\nprint('a')\n```");
      await el.updateComplete;

      const codeBlocks = el.shadowRoot!.querySelectorAll<HTMLElement>(".code-block");
      expect(codeBlocks.length).toBe(2);

      const scrollbars = (el as unknown as { _codeScrollbars: Map<HTMLElement, unknown> })
        ._codeScrollbars;
      expect(scrollbars.size).toBe(2);

      // Toggle wrap ON for the first block → its scrollbar is destroyed.
      el.shadowRoot!.querySelectorAll<HTMLElement>(".code-wrap")[0].click();
      await el.updateComplete;
      expect(scrollbars.size).toBe(1);

      // Toggle wrap back OFF → a scrollbar is re-attached.
      el.shadowRoot!.querySelectorAll<HTMLElement>(".code-wrap")[0].click();
      await el.updateComplete;
      expect(scrollbars.size).toBe(2);
    } finally {
      globalThis.ResizeObserver = RealRO as typeof ResizeObserver;
    }
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
          segments: [
            { type: "tool", toolCall: { id: "tc1", name: "read_file", arguments: '{"path":"/a"}', status: "done" } },
            { type: "text", text: "hello" },
          ],
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

    // Tool calls render inline, interleaved with the response text per `segments`:
    // the tool row comes before the streamed content (no grouped `.tool-calls` container).
    const assistant = shadow.querySelector(".chat-message.assistant")!;
    expect(assistant.querySelector(".tool-calls")).toBeNull();
    const msgContent = assistant.querySelector(".msg-content")!;
    expect(
      toolRow.compareDocumentPosition(msgContent) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

  it("emits chat:tool-open with the tool result when a done card is clicked", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const opened = new Promise<CustomEvent>((resolve) => {
      el.addEventListener("chat:tool-open", (e) => resolve(e as CustomEvent), { once: true });
    });

    el.setToolCallState(
      { id: "tc1", name: "read_file", arguments: '{"path":"/a"}', status: "done" },
      "file contents",
    );
    await el.updateComplete;

    const row = el.shadowRoot!.querySelector(".tool-call-row")! as HTMLElement;
    // The card body is NOT clickable — a right-aligned action row appears.
    const actions = el.shadowRoot!.querySelector(".tool-call-actions")!;
    expect(actions).not.toBeNull();
    // No inline result panel — the result lives in the opened tab.
    expect(el.shadowRoot!.querySelector(".tool-call-result")).toBeNull();

    const openBtn = el.shadowRoot!.querySelector(".tool-call-btn.primary")! as HTMLElement;
    // The buttons are icon-only, below the card (not inside it).
    expect(openBtn.querySelector("svg")).not.toBeNull();
    const copyBtn = el.shadowRoot!.querySelector(".tool-call-btn:not(.primary)")! as HTMLElement;
    expect(copyBtn.querySelector("svg")).not.toBeNull();
    // The actions row is a sibling of the card, rendered below it.
    expect(actions.parentElement?.querySelector(".tool-call-row")).not.toBeNull();
    expect(actions.closest(".tool-call-row")).toBeNull();
    openBtn.click();
    const detail = ((await opened) as CustomEvent<{ toolCall?: { id: string }; result?: string }>)
      .detail!;
    expect(detail.toolCall?.id).toBe("tc1");
    expect(detail.result).toBe("file contents");
  });

  it("does not open a running (no-result) card", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    let opened = false;
    el.addEventListener("chat:tool-open", () => {
      opened = true;
    });

    el.setToolCallState({ id: "tc1", name: "read_file", arguments: '{"path":"/a"}', status: "running" });
    await el.updateComplete;

    // No action row while the tool is still running (no result yet).
    expect(el.shadowRoot!.querySelector(".tool-call-actions")).toBeNull();
    const row = el.shadowRoot!.querySelector(".tool-call-row")! as HTMLElement;
    row.click();
    expect(opened).toBe(false);
  });

  it("shows a friendly second line for read_file and search_files", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.setToolCallState(
      { id: "tc1", name: "read_file", arguments: '{"path":"/repo/src/a.ts"}', status: "running" },
    );
    el.setToolCallState({
      id: "tc2",
      name: "search_files",
      arguments: '{"query":"store","roots":["/x/ascii-drawing-tool/main","/x/tw050x.net/dev"]}',
      status: "running",
    });
    await el.updateComplete;

    const rows = el.shadowRoot!.querySelectorAll(".tool-call-row");
    expect(rows[0].querySelector(".tool-call-args")?.textContent).toBe("/repo/src/a.ts");
    expect(rows[1].querySelector(".tool-call-args")?.textContent).toBe(
      "“store” · ascii-drawing-tool/main, tw050x.net/dev",
    );
  });

  it("renders tool calls inline, interleaved with streamed text in order", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.appendDelta("Let me check. ");
    el.setToolCallState({
      id: "tc1",
      name: "read_file",
      arguments: '{"path":"/a"}',
      status: "done",
    });
    el.appendDelta("It says hello.");
    await el.updateComplete;

    // Segment order is preserved: text → tool call → text.
    const segments = (el.messages as Array<{ segments?: Array<{ type: string }> }>)[0].segments;
    expect(segments?.map((s) => s.type)).toEqual(["text", "tool", "text"]);

    const assistant = el.shadowRoot!.querySelector(".chat-message.assistant")!;
    const contents = assistant.querySelectorAll(".msg-content");
    const toolRow = assistant.querySelector(".tool-call-row")!;
    expect(contents).toHaveLength(2);
    expect(
      contents[0].compareDocumentPosition(toolRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      toolRow.compareDocumentPosition(contents[1]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    expect((el.shadowRoot!.querySelector(".composer-send") as HTMLButtonElement).disabled).toBe(
      true,
    );

    (inputEl as { value: string }).value = "use `read_file` to inspect";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    expect(content.textContent).toContain("use");
    expect(content.querySelector("code")?.textContent).toBe("read_file");
    expect((el.shadowRoot!.querySelector(".composer-send") as HTMLButtonElement).disabled).toBe(
      false,
    );
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
    // The highlight wraps the whole code chip as a unit so it stays continuous.
    const sel = content.querySelector(".composer-highlight") as HTMLElement;
    expect(sel.textContent).toBe("read_file");
    expect(sel.querySelector("code")).toBe(code);
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

    // Activate: the styled tooltip provides the label, so the native-title
    // fallback is cleared (having both would double the tooltip).
    (inputEl as { value: string }).value = "hello";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(sendBtn.disabled).toBe(false);
    expect(sendBtn.getAttribute("title")).toBeNull();

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
      providers: [
        {
          id: "vllm",
          label: "vLLM",
          model: "vicuna-13b",
          baseUrl: "http://localhost:8000/v1",
          models: [{ id: "vicuna-13b" }, { id: "llama-2", contextWindow: 128000 }],
        },
      ],
      activeTools: ["read_file", "run_command"],
    });
    await el.updateComplete;

    const providerBtn = el.shadowRoot!.querySelector(".composer-select") as HTMLButtonElement;
    const modelBtn = el.shadowRoot!.querySelector(
      ".composer-select.composer-model-select",
    ) as HTMLButtonElement;
    expect(providerBtn.querySelector(".composer-select-label")?.textContent).toContain("vLLM");
    expect(modelBtn.querySelector(".composer-select-label")?.textContent).toContain("vicuna-13b");

    // Clicking the provider selector opens a provider list over the text area.
    providerBtn.click();
    await el.updateComplete;
    const items = el.shadowRoot!.querySelectorAll(".composer-provider-menu .provider-item");
    expect(items).toHaveLength(1);
    // Two-row layout: name on the first row, base URL + model count on the second.
    expect(items[0].querySelector(".row-name")?.textContent).toContain("vLLM");
    expect(items[0].querySelector(".row-sub")?.textContent).toContain("http://localhost:8000/v1");
    expect(items[0].querySelector(".row-sub")?.textContent).toContain("2 models");

    // Clicking the model selector opens a model list for the active provider.
    modelBtn.click();
    await el.updateComplete;
    const modelItems = el.shadowRoot!.querySelectorAll(".composer-provider-menu .provider-item");
    expect(modelItems).toHaveLength(2);
    expect(modelItems[0].textContent).toContain("vicuna-13b");

    // The tools toggle is the only `.composer-tool` that carries an SVG icon
    // (the add-content button is a text glyph), so select it via that.
    const toolsBtn = el
      .shadowRoot!.querySelector(".composer-tool svg")
      ?.closest("button") as HTMLElement;
    // The tools button shows no floating count badge.
    expect(toolsBtn.querySelector(".tool-badge")).toBeNull();
  });

  it("selecting a provider dispatches chat:provider-change and closes the dropdown", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.setComposerContext({
      providers: [
        { id: "vllm", label: "vLLM", model: "vicuna-13b" },
        { id: "openai", label: "OpenAI", model: "gpt-4" },
      ],
      activeProviderId: "vllm",
    });
    await el.updateComplete;

    const providerBtn = el.shadowRoot!.querySelector(".composer-select") as HTMLButtonElement;
    providerBtn.click();
    await el.updateComplete;
    expect(el.shadowRoot!.querySelectorAll(".composer-provider-menu .provider-item")).toHaveLength(
      2,
    );

    const handler = vi.fn();
    el.addEventListener("chat:provider-change", handler as EventListener);

    const other = el.shadowRoot!.querySelectorAll(".composer-provider-menu .provider-item")[1];
    (other as HTMLElement).click();
    await el.updateComplete;

    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
      providerId: "openai",
      modelId: "gpt-4",
    });
    // The dropdown stays open (like the tools multi-select); it closes only
    // when the user clicks outside the composer.
    expect(el.shadowRoot!.querySelector(".composer-provider-menu")).not.toBeNull();
    expect(providerBtn.querySelector(".composer-select-label")?.textContent).toContain("OpenAI");
    // The selector buttons are plain buttons (no border/background by default).
    expect(providerBtn.tagName).toBe("BUTTON");
  });

  it("hides the thinking selector and sends nothing when the model has no thinking entries", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.setComposerContext({
      providers: [{ id: "vllm", label: "vLLM", model: "m1" }],
      activeProviderId: "vllm",
    });
    await el.updateComplete;

    // No thinking selector in the toolbar.
    expect(el.shadowRoot!.querySelector(".composer-thinking-select")).toBeNull();

    const handler = vi.fn();
    el.addEventListener("chat:send", handler as EventListener);
    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hi";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;
    (el.shadowRoot!.querySelector(".composer-send") as HTMLElement).click();

    // No thinkingLevel is sent.
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ text: "hi" });
  });

  it("shows only the model's thinking entries and keeps the menu open on select", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.setComposerContext({
      providers: [
        {
          id: "vllm",
          label: "vLLM",
          model: "m1",
          models: [{ id: "m1", thinking: { Light: "low", Deep: "high" }, contextWindow: 128000 }],
        },
      ],
      activeProviderId: "vllm",
    });
    await el.updateComplete;

    const thinkingBtn = el.shadowRoot!.querySelector(
      ".composer-thinking-select",
    ) as HTMLButtonElement;
    expect(thinkingBtn).not.toBeNull();
    // First entry is shown by default.
    expect(thinkingBtn.querySelector(".composer-select-label")?.textContent).toBe("Light");

    // Only the model's entries are listed.
    thinkingBtn.click();
    await el.updateComplete;
    const items = el.shadowRoot!.querySelectorAll(".composer-provider-menu .provider-item");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Light");
    expect(items[1].textContent).toContain("Deep");

    const handler = vi.fn();
    el.addEventListener("chat:thinking-change", handler as EventListener);
    // Selecting an entry updates the button and keeps the menu open.
    (items[1] as HTMLElement).click();
    await el.updateComplete;
    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ thinkingKey: "Deep" });
    expect(el.shadowRoot!.querySelector(".composer-provider-menu")).not.toBeNull();
    expect(thinkingBtn.querySelector(".composer-select-label")?.textContent).toBe("Deep");

    // Sending includes the selected entry's value.
    const sendHandler = vi.fn();
    el.addEventListener("chat:send", sendHandler as EventListener);
    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hi";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;
    (el.shadowRoot!.querySelector(".composer-send") as HTMLElement).click();
    expect((sendHandler.mock.calls[0][0] as CustomEvent).detail).toEqual({
      text: "hi",
      thinkingLevel: "high",
    });
  });

  it("selecting a model dispatches chat:model-change and updates the model label", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.setComposerContext({
      providers: [
        {
          id: "vllm",
          label: "vLLM",
          model: "vicuna-13b",
          models: [{ id: "vicuna-13b" }, { id: "qwen-25" }],
        },
      ],
      activeProviderId: "vllm",
      activeModelId: "vicuna-13b",
    });
    await el.updateComplete;

    const modelBtn = el.shadowRoot!.querySelector(
      ".composer-select.composer-model-select",
    ) as HTMLButtonElement;
    expect(modelBtn.querySelector(".composer-select-label")?.textContent).toContain("vicuna-13b");

    const handler = vi.fn();
    el.addEventListener("chat:model-change", handler as EventListener);

    modelBtn.click();
    await el.updateComplete;
    const items = el.shadowRoot!.querySelectorAll(".composer-provider-menu .provider-item");
    expect(items).toHaveLength(2);

    (items[1] as HTMLElement).click();
    await el.updateComplete;

    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ modelId: "qwen-25" });
    expect(modelBtn.querySelector(".composer-select-label")?.textContent).toContain("qwen-25");
    // The model dropdown stays open (closes only on outside click).
    expect(el.shadowRoot!.querySelector(".composer-provider-menu")).not.toBeNull();
  });

  it("tools multi-select lists all tools, toggles them, and keeps the menu open", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.setComposerContext({
      availableTools: [
        { name: "read_file", description: "Read a file." },
        { name: "search_files", description: "Search files." },
        { name: "run_command", description: "Run a command." },
      ],
      activeTools: ["read_file", "run_command"],
    });
    await el.updateComplete;

    // The tools toggle is the only `.composer-tool` that carries an SVG icon.
    const toolsBtn = el
      .shadowRoot!.querySelector(".composer-tool svg")
      ?.closest("button") as HTMLButtonElement;
    toolsBtn.click();
    await el.updateComplete;

    const items = el.shadowRoot!.querySelectorAll(".composer-tools-menu .tool-item");
    expect(items).toHaveLength(3);
    expect((items[0] as HTMLElement).classList.contains("active")).toBe(true);
    expect((items[1] as HTMLElement).classList.contains("active")).toBe(false);
    // Two-row layout: name row + description row, checkbox icon present.
    expect(items[0].querySelector(".tool-name")?.textContent).toBe("read_file");
    expect(items[0].querySelector(".tool-desc")?.textContent).toBe("Read a file.");
    expect(items[0].querySelector(".tool-check svg")).toBeTruthy();
    expect(items[1].querySelector(".tool-check svg")).toBeTruthy();

    const handler = vi.fn();
    el.addEventListener("chat:tools-change", handler as EventListener);

    // Toggling the middle (disabled) tool enables it and leaves the menu open.
    (items[1] as HTMLElement).click();
    await el.updateComplete;

    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
      tools: ["read_file", "run_command", "search_files"],
    });
    expect(el.shadowRoot!.querySelector(".composer-tools-menu")).toBeTruthy();
  });

  it("sends on Enter (without Shift) and does not send on Shift+Enter", async () => {
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

  it("inserts a newline on Shift+Enter and keeps the caret after it", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const handler = vi.fn();
    el.addEventListener("chat:send", handler as EventListener);

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "first line";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.setSelectionRange(10, 10);
    await el.updateComplete;

    inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }));
    await el.updateComplete;

    expect(inputEl.value).toBe("first line\n");
    expect(inputEl.selectionStart).toBe(11);
    expect(inputEl.selectionEnd).toBe(11);
    expect(handler).not.toHaveBeenCalled();
    // The composer renders the newline as a line break and grows.
    expect(el.shadowRoot!.querySelector(".composer-content")!.textContent).toBe("first line\n");
  });

  it("inserts a newline at the caret (not the end) on Shift+Enter", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hello world";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    // Place the caret after "hello".
    inputEl.setSelectionRange(5, 5);
    await el.updateComplete;

    inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }));
    await el.updateComplete;

    expect(inputEl.value).toBe("hello\n world");
    expect(inputEl.selectionStart).toBe(6);
    expect(inputEl.selectionEnd).toBe(6);
  });

  it("moves the caret to the moving edge even when selectionDirection is 'none'", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hello world foo";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;

    // Anchor the caret at 6 (before "world") so the previous selection is 6,6.
    inputEl.setSelectionRange(6, 6);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(6);

    // Cmd+Shift+Right extends the selection to 11; the browser may leave
    // direction as "none" (macOS word/line select).
    inputEl.setSelectionRange(6, 11);
    (inputEl as unknown as { selectionDirection: string }).selectionDirection = "none";
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(11);

    // Cmd+Shift+Left extends backward to 4; caret must ride the leading edge.
    inputEl.setSelectionRange(4, 11);
    (inputEl as unknown as { selectionDirection: string }).selectionDirection = "none";
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    inputEl.dispatchEvent(
      new KeyboardEvent("keyup", { key: "ArrowLeft", shiftKey: true, metaKey: true }),
    );
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(4);
  });

  it("re-anchors the caret to the top when Cmd+Shift+Up undoes Cmd+Shift+Down", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "aaa\nbbb\nccc";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;

    // Anchor the caret at 4 (start of "bbb") — previous selection is 4,4.
    inputEl.setSelectionRange(4, 4);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    // Cmd+Shift+Down selects 4..end with the browser leaving direction "none";
    // the caret rides the (moving) end at 11.
    inputEl.setSelectionRange(4, 11);
    (inputEl as unknown as { selectionDirection: string }).selectionDirection = "none";
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(11);
    expect((el as unknown as { _selAnchor: number })._selAnchor).toBe(4);

    // Cmd+Shift+Up re-anchors to the top: 0..4, both endpoints moved. The caret
    // must ride the leading edge (0) back to the top, not freeze at the anchor.
    inputEl.setSelectionRange(0, 4);
    (inputEl as unknown as { selectionDirection: string }).selectionDirection = "none";
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(0);
    expect((el as unknown as { _selAnchor: number })._selAnchor).toBe(4);
    expect(
      el.shadowRoot!.querySelector(".composer-content")!.querySelector(".composer-highlight")
        ?.textContent,
    ).toBe("aaa\n");
  });

  it("returns the caret to the top when Cmd+Shift+Up re-anchors with a stale 'forward' direction", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "aaa\nbbb\nccc";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;

    inputEl.setSelectionRange(4, 4);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    // Cmd+Shift+Down selects 4..end; Chrome may leave direction "forward" here.
    inputEl.setSelectionRange(4, 11);
    (inputEl as unknown as { selectionDirection: string }).selectionDirection = "forward";
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(11);
    expect((el as unknown as { _selAnchor: number })._selAnchor).toBe(4);

    // Cmd+Shift+Up re-anchors to 0..4 but CHROME REPORTING direction "forward"
    // (stale). The previous anchor (4) is still the fixed end, so the caret must
    // ride the moving edge (0) back to the top.
    inputEl.setSelectionRange(0, 4);
    (inputEl as unknown as { selectionDirection: string }).selectionDirection = "forward";
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(0);
    expect((el as unknown as { _selAnchor: number })._selAnchor).toBe(4);
    expect(
      el.shadowRoot!.querySelector(".composer-content")!.querySelector(".composer-highlight")
        ?.textContent,
    ).toBe("aaa\n");
  });

  it("moves the caret on a boundary flip even though the endpoints do not change", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "aaa\nbbb\nccc";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;

    // Caret at the very top.
    inputEl.setSelectionRange(0, 0);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    // Cmd+Shift+Down selects the whole document; caret rides the end.
    inputEl.setSelectionRange(0, 11);
    (inputEl as unknown as { selectionDirection: string }).selectionDirection = "forward";
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(11);

    // Cmd+Shift+Up flips the focus to the start even though (0,11) is unchanged.
    // The caret must ride the start, not stay pinned to the (now-stale) anchor.
    inputEl.setSelectionRange(0, 11);
    (inputEl as unknown as { selectionDirection: string }).selectionDirection = "backward";
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(0);
    expect((el as unknown as { _selAnchor: number })._selAnchor).toBe(11);

    // Cmd+Shift+Down flips the focus back to the end.
    inputEl.setSelectionRange(0, 11);
    (inputEl as unknown as { selectionDirection: string }).selectionDirection = "forward";
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(11);
  });

  const mountWithText = async (text: string) => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;
    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = text;
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;
    return { el, inputEl };
  };

  const cmdArrow = (inputEl: HTMLTextAreaElement, key: string, shift: boolean) =>
    inputEl.dispatchEvent(
      new KeyboardEvent("keydown", { key, shiftKey: shift, metaKey: true, cancelable: true }),
    );

  it("Cmd+Shift+Up/Down extends from a fixed anchor and unselects on the way back", async () => {
    // "aaa\nbbb\nccc" — the caret starts at 4 (start of "bbb").
    const { el, inputEl } = await mountWithText("aaa\nbbb\nccc");
    inputEl.setSelectionRange(4, 4);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    // Down: anchor stays at 4, the focus edge runs to the end.
    cmdArrow(inputEl, "ArrowDown", true);
    await el.updateComplete;
    expect([inputEl.selectionStart, inputEl.selectionEnd]).toEqual([4, 11]);
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(11);
    expect((el as unknown as { _selAnchor: number })._selAnchor).toBe(4);

    // Up: the focus edge crosses the anchor — the old selection is dropped and
    // the text above the anchor is selected instead (not re-extended downward).
    cmdArrow(inputEl, "ArrowUp", true);
    await el.updateComplete;
    expect([inputEl.selectionStart, inputEl.selectionEnd]).toEqual([0, 4]);
    expect(inputEl.selectionDirection).toBe("backward");
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(0);
    expect((el as unknown as { _selAnchor: number })._selAnchor).toBe(4);

    // Down again: back to the same selection below the anchor.
    cmdArrow(inputEl, "ArrowDown", true);
    await el.updateComplete;
    expect([inputEl.selectionStart, inputEl.selectionEnd]).toEqual([4, 11]);
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(11);
  });

  it("collapses the selection onto the anchor when Cmd+Shift+Arrow reverses onto it", async () => {
    const { el, inputEl } = await mountWithText("aaa\nbbb\nccc");
    // Caret at the very end: Cmd+Shift+Up selects the whole document.
    inputEl.setSelectionRange(11, 11);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    cmdArrow(inputEl, "ArrowUp", true);
    await el.updateComplete;
    expect([inputEl.selectionStart, inputEl.selectionEnd]).toEqual([0, 11]);
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(0);

    // Cmd+Shift+Down brings the focus edge back onto the anchor: the selection
    // is fully unselected and the caret sits at the bottom again.
    cmdArrow(inputEl, "ArrowDown", true);
    await el.updateComplete;
    expect([inputEl.selectionStart, inputEl.selectionEnd]).toEqual([11, 11]);
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(11);
    expect(el.shadowRoot!.querySelector(".composer-highlight")).toBeNull();
  });

  it("moves the caret with Cmd+Shift+Arrow even when there is nothing left to select", async () => {
    const { el, inputEl } = await mountWithText("aaa\nbbb\nccc");
    // Whole document selected downward from the top: the anchor is at 0.
    inputEl.setSelectionRange(0, 0);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    inputEl.setSelectionRange(0, 11);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(11);

    // Nothing further to select upward, but the caret must still travel to the
    // top (the selection collapses onto the anchor).
    cmdArrow(inputEl, "ArrowUp", true);
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(0);

    cmdArrow(inputEl, "ArrowDown", true);
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(11);
    expect([inputEl.selectionStart, inputEl.selectionEnd]).toEqual([0, 11]);
  });

  it("collapses to the destination on Cmd+Arrow without Shift", async () => {
    const { el, inputEl } = await mountWithText("aaa\nbbb\nccc");
    inputEl.setSelectionRange(4, 11);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    cmdArrow(inputEl, "ArrowUp", false);
    await el.updateComplete;
    expect([inputEl.selectionStart, inputEl.selectionEnd]).toEqual([0, 0]);
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(0);
    expect((el as unknown as { _selAnchor: number })._selAnchor).toBe(0);
  });

  it("Cmd+Shift+Left/Right selects to the line edges without crossing a newline", async () => {
    const { el, inputEl } = await mountWithText("aaa\nbbbbb\nccc");
    // Caret inside "bbbbb" (offset 6 = after the first "b").
    inputEl.setSelectionRange(6, 6);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    cmdArrow(inputEl, "ArrowRight", true);
    await el.updateComplete;
    expect([inputEl.selectionStart, inputEl.selectionEnd]).toEqual([6, 9]);
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(9);

    // Back across the anchor to the start of the same line.
    cmdArrow(inputEl, "ArrowLeft", true);
    await el.updateComplete;
    expect([inputEl.selectionStart, inputEl.selectionEnd]).toEqual([4, 6]);
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(4);
  });

  it("keeps the anchor when a plain Shift+Arrow follows a Cmd+Shift+Arrow", async () => {
    const { el, inputEl } = await mountWithText("hello world");
    inputEl.setSelectionRange(6, 6);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    // Cmd+Shift+Left leaves an explicit "backward" direction, so the browser's
    // own Shift+Right afterwards shrinks the selection from the leading edge.
    cmdArrow(inputEl, "ArrowLeft", true);
    await el.updateComplete;
    expect([inputEl.selectionStart, inputEl.selectionEnd]).toEqual([0, 6]);
    expect(inputEl.selectionDirection).toBe("backward");

    inputEl.setSelectionRange(1, 6, "backward");
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(1);
    expect((el as unknown as { _selAnchor: number })._selAnchor).toBe(6);
  });

  it("shows the thinking… tail while waiting for a reply and hides it once content streams", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    // In-flight request, but no assistant text yet — still "waiting".
    el.setProviderStatus({ streaming: true, providerOk: true });
    el.addMessage("user", "hi");
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".chat-thinking")).not.toBeNull();

    // First streamed token arrives — the indicator disappears.
    el.appendDelta("Hello");
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".chat-thinking")).toBeNull();

    // Streaming ends entirely — no indicator.
    el.setProviderStatus({ streaming: false, providerOk: true });
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".chat-thinking")).toBeNull();
  });

  it("does not show the thinking… tail when an assistant reply is already complete", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    el.addMessage("assistant", "done");
    el.setProviderStatus({ streaming: false, providerOk: true });
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".chat-thinking")).toBeNull();
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

  it("renders the caret as an overlay (not an inline span) at the caret offset", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hello world";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;

    // Collapsed caret in the middle of the text.
    inputEl.setSelectionRange(6, 6);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    const caret = content.querySelector(".composer-caret") as HTMLElement;
    expect(caret).toBeTruthy();
    // The caret is an overlay element, so it never splits/shifts the text.
    expect(content.textContent).toBe("hello world");
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(6);
  });

  it("syncs the highlight + caret when the text-area selection changes (Shift+Arrow)", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hello world";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;

    // Select "world" (forward) and mirror the keyboard path (select + keyup).
    inputEl.setSelectionRange(6, 11);
    (inputEl as unknown as { selectionDirection: string }).selectionDirection = "forward";
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    inputEl.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", shiftKey: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    expect(content.querySelector(".composer-highlight")?.textContent).toBe("world");
    expect(content.querySelector(".composer-caret")).toBeTruthy();
    // Forward selection: caret/focus rides the end of the highlight.
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(11);
  });

  it("places the caret on the leading edge (selectionStart) for a backward Shift+Arrow", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hello world";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;

    // Anchor at 11, focus moves left to 4 (backward), highlight spans 4..11.
    inputEl.setSelectionRange(4, 11);
    (inputEl as unknown as { selectionDirection: string }).selectionDirection = "backward";
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    expect(content.querySelector(".composer-highlight")?.textContent).toBe("o world");
    expect(content.querySelector(".composer-caret")).toBeTruthy();
    // Backward selection: caret/focus rides the leading edge, not the end.
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(4);
  });

  it("collapses the selection (deselect) when an arrow key moves the caret", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hello world";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;

    inputEl.setSelectionRange(6, 11);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(
      el.shadowRoot!.querySelector(".composer-content")!.querySelector(".composer-highlight"),
    ).toBeTruthy();

    // Arrow without shift collapses to a caret (no highlight).
    inputEl.setSelectionRange(11, 11);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(
      el.shadowRoot!.querySelector(".composer-content")!.querySelector(".composer-highlight"),
    ).toBeNull();
  });

  it("schedules a selection sync after a navigation keydown (auto-repeat)", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hello world";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;

    // Spy on the plain-ish `_syncSelection` (accessible at runtime) and drive
    // the keydown handler directly. Navigation keys must schedule a sync so the
    // rendered caret/scroll stay live while a key is held (auto-repeat).
    const spy = vi.fn((el as unknown as { _syncSelection: () => void })._syncSelection.bind(el));
    (el as unknown as Record<string, unknown>)._syncSelection = spy;

    (el as unknown as { _onComposerKeydown: (e: KeyboardEvent) => void })._onComposerKeydown(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not schedule a selection sync for a non-navigation keydown", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    inputEl.focus();
    await el.updateComplete;

    const spy = vi.fn((el as unknown as { _syncSelection: () => void })._syncSelection.bind(el));
    (el as unknown as Record<string, unknown>)._syncSelection = spy;

    (el as unknown as { _onComposerKeydown: (e: KeyboardEvent) => void })._onComposerKeydown(
      new KeyboardEvent("keydown", { key: "x", bubbles: true, composed: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps a code token intact and overlays the caret when it sits inside one", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "use `read_file` now";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;

    // raw offset 7 is inside "read_file" (after "re").
    inputEl.setSelectionRange(7, 7);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    const code = content.querySelector("code");
    expect(code?.textContent).toBe("read_file");
    expect(content.querySelector(".composer-caret")).toBeTruthy();
    expect((el as unknown as { _caretRaw: number })._caretRaw).toBe(7);
  });

  it("does not style text from an unclosed backtick to the end of the line", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    // A single opening backtick with no closing one: nothing should be styled
    // as code, and the backtick itself should stay readable (not vanish).
    (inputEl as { value: string }).value = "use `read_file now";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    expect(content.querySelector("code")).toBeNull();
    expect(content.textContent).toBe("use `read_file now");
    // Submit should be enabled since there is real, non-code text.
    expect((el.shadowRoot!.querySelector(".composer-send") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("only styles between matched backtick pairs, ignoring an unclosed trailing one", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    // "b" is a matched pair; the trailing "d" after the lone backtick is not.
    (inputEl as { value: string }).value = "a `b` c `d";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    expect(content.querySelectorAll("code")).toHaveLength(1);
    expect(content.querySelector("code")?.textContent).toBe("b");
    expect(content.textContent).toBe("a b c `d");
  });

  it("renders backtick content inside an element carrying a background chip", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "use `read_file` now";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await el.updateComplete;

    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    expect(content.querySelector("code")).toBeTruthy();
    // jsdom doesn't apply shadow-DOM styles to getComputedStyle, so assert the
    // chip backdrop is declared in the component's stylesheet.
    const css = el.shadowRoot!.querySelector("style")?.textContent ?? "";
    expect(css).toMatch(
      /composer-content code[^{]*\{[^}]*background: rgba\(255, 255, 255, 0\.06\)/,
    );
  });

  it("drops the blinking caret when the composer loses focus but keeps the highlight", async () => {
    const el = document.createElement("openp41ge-agents") as unknown as Openp41geAgents;
    document.body.appendChild(el);
    await el.updateComplete;

    const inputEl = el.shadowRoot!.querySelector(".chat-input") as HTMLTextAreaElement;
    (inputEl as { value: string }).value = "hello world";
    inputEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    inputEl.focus();
    await el.updateComplete;

    inputEl.setSelectionRange(6, 11);
    inputEl.dispatchEvent(new Event("select", { bubbles: true, composed: true }));
    await el.updateComplete;

    // Blur: caret disappears, highlight remains (and text is not shifted).
    inputEl.dispatchEvent(new FocusEvent("blur"));
    await el.updateComplete;
    const content = el.shadowRoot!.querySelector(".composer-content") as HTMLElement;
    expect(content.querySelector(".composer-caret")).toBeNull();
    expect(content.querySelector(".composer-highlight")?.textContent).toBe("world");
    expect(content.textContent).toBe("hello world");
  });
});
