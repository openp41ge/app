/**
 * Unit tests for the chat store search matcher + ChatStoreService.
 *
 * searchChats (pure) is the highest-leverage target: it must match message
 * text (user + assistant) and tool-call commands (name + arguments), and it
 * must NEVER match tool results (role: "tool" content).
 */

import { describe, it, expect, beforeEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";
import {
  ChatStoreService,
  searchChats,
  searchTranscript,
  toSummary,
} from "../../../src/main/services/chat-store-service";
import type { Chat, ChatMessage, ToolCall } from "openp41ge-agents";

const user = (content: string, id = `u-${content.slice(0, 4)}`): ChatMessage => ({
  id,
  role: "user",
  content,
  timestamp: 1,
});
const assistant = (
  content: string,
  toolCalls: ToolCall[] = [],
  id = `a-${toolCalls.length}`,
): ChatMessage => ({
  id,
  role: "assistant",
  content,
  toolCalls,
  timestamp: 2,
});
const toolResult = (content: string, toolCallId: string): ChatMessage => ({
  id: `t-${toolCallId}`,
  role: "tool",
  content,
  toolCallId,
  timestamp: 3,
});

function makeChat(id: string, messages: ChatMessage[]): Chat {
  return { id, title: "chat", providerId: "vllm", createdAt: 1, updatedAt: 1, messages };
}

describe("searchChats", () => {
  const toolCall: ToolCall = {
    id: "tc-1",
    name: "read_file",
    arguments: '{"path":"/a/b.ts"}',
    status: "done",
  };
  const chat = makeChat("chat1", [
    user("Please tidy the imports"),
    assistant("I'll read the file", [toolCall]),
    toolResult("import x from 'x';\nimport y from 'y';", "tc-1"),
  ]);

  it("returns [] for an empty query", () => {
    expect(searchChats([chat], "")).toEqual([]);
    expect(searchChats([chat], "   ")).toEqual([]);
  });

  it("matches user message text", () => {
    const r = searchChats([chat], "tidy");
    expect(r).toEqual([
      {
        chatId: "chat1",
        matchedMessageIds: [user("Please tidy the imports").id],
        matchedToolCallIds: [],
      },
    ]);
  });

  it("matches assistant message text", () => {
    const r = searchChats([chat], "read the file");
    expect(r).toHaveLength(1);
    expect(r[0].matchedMessageIds).toContain("a-1");
  });

  it("matches tool-call names and arguments, never the result", () => {
    // Name match.
    const byName = searchChats([chat], "read_file");
    expect(byName[0].matchedToolCallIds).toEqual(["tc-1"]);
    expect(byName[0].matchedMessageIds).toEqual([]);

    // Argument (command) match — the tool result content does NOT match.
    const byArg = searchChats([chat], "a/b.ts");
    expect(byArg[0].matchedToolCallIds).toEqual(["tc-1"]);

    // The tool RESULT text must never match (result mentions "import x from").
    const byResult = searchChats([chat], "import x from");
    expect(byResult).toEqual([]);
  });

  it("reports both message and tool-call matches for one chat", () => {
    const r = searchChats([chat], "read");
    expect(r[0].matchedMessageIds).toEqual(["a-1"]); // "I'll read the file"
    expect(r[0].matchedToolCallIds).toEqual(["tc-1"]); // read_file
  });

  it("supports case-sensitive matching", () => {
    // Default is case-insensitive: lower-case query matches the capitalised
    // user message.
    expect(searchChats([chat], "tidy")).toHaveLength(1);
    // Case-sensitive: lowercase "tidy" matches the exact text "tidy".
    expect(searchChats([chat], "tidy", { caseSensitive: true })).toHaveLength(1);
    // ...but a different case does not.
    expect(searchChats([chat], "Tidy", { caseSensitive: true })).toEqual([]);
  });

  it("supports regex mode and returns [] for an invalid regex", () => {
    // regex pattern matching "tidy" in the user message.
    const r = searchChats([chat], "tid..", { regex: true });
    expect(r).toHaveLength(1);
    expect(r[0].matchedMessageIds).toContain("u-Plea");

    // regex is case-insensitive by default; caseSensitive makes it exact-case.
    expect(searchChats([chat], "^Please", { regex: true, caseSensitive: true })).toHaveLength(1);
    expect(searchChats([chat], "^please", { regex: true, caseSensitive: true })).toEqual([]);

    // An invalid regex must not throw — it returns no matches.
    expect(searchChats([chat], "(", { regex: true })).toEqual([]);
  });
});

describe("searchTranscript", () => {
  it("returns ordered per-message hits with an accurate running total", () => {
    const chat = makeChat("c1", [user("hello world"), assistant("a world of code")]);
    const r = searchTranscript(chat, "world");
    expect(r.total).toBe(2);
    expect(r.hits).toEqual([
      { messageId: "u-hell", text: "world", order: 0, messageIndex: 0 },
      { messageId: "a-0", text: "world", order: 0, messageIndex: 1 },
    ]);
  });

  it("numbers ordinals per-message and not transcript-wide", () => {
    const chat = makeChat("c1", [
      user("foo bar foo"),
      user("foo"),
      user("bar foo"),
    ]);
    const r = searchTranscript(chat, "foo");
    expect(r.hits.map((h) => ({ m: h.messageId, o: h.order }))).toEqual([
      { m: "u-foo ", o: 0 },
      { m: "u-foo ", o: 1 },
      { m: "u-foo", o: 0 },
      { m: "u-bar ", o: 0 },
    ]);
  });

  it("supports case-sensitive, regex, and rejects an invalid regex", () => {
    const chat = makeChat("c1", [assistant("The quick brown fox")]);
    expect(searchTranscript(chat, "the", { caseSensitive: true }).total).toBe(0);
    expect(searchTranscript(chat, "The", { caseSensitive: true }).total).toBe(1);
    expect(searchTranscript(chat, "q..ck", { regex: true }).total).toBe(1);
    expect(searchTranscript(chat, "(", { regex: true }).total).toBe(0);
  });

  it("returns no hits for an empty chat or blank query", () => {
    expect(searchTranscript(undefined, "x").total).toBe(0);
    expect(searchTranscript(makeChat("c1", [user("hello")]), "").total).toBe(0);
  });
});

describe("toSummary", () => {
  it("counts messages + tool calls and derives a preview", () => {
    const chat = makeChat("c1", [
      user("hello"),
      assistant("hi", [{ id: "t1", name: "search_files", arguments: "{}", status: "done" }]),
    ]);
    const s = toSummary(chat);
    expect(s.messageCount).toBe(2);
    expect(s.toolCallCount).toBe(1);
    expect(s.lastMessagePreview).toBe("hi");
  });
});

describe("ChatStoreService", () => {
  let dir: string;
  let store: ChatStoreService;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-store-test-"));
    store = new ChatStoreService(dir);
    store.init();
  });

  it("creates, lists, gets, renames, and deletes chats", () => {
    const c = store.create({ title: "My Chat" });
    expect(c.title).toBe("My Chat");
    expect(store.list()).toHaveLength(1);
    expect(store.get(c.id)?.id).toBe(c.id);

    const renamed = store.rename(c.id, "Renamed");
    expect(renamed?.title).toBe("Renamed");

    expect(store.delete(c.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
  });

  it("archives a chat: hidden from list/search but still retrievable via get", () => {
    const c = store.create({ title: "Archive me" });
    store.appendMessage(c.id, { id: "u1", role: "user", content: "hello archived" });
    expect(store.list()).toHaveLength(1);
    expect(store.search("hello")).toHaveLength(1);

    expect(store.archive(c.id)).toBe(true);
    // Hidden from the default list and search.
    expect(store.list()).toHaveLength(0);
    expect(store.search("hello")).toHaveLength(0);
    // Still retrievable and persisted (it is a soft-hide, not a delete).
    expect(store.get(c.id)?.archivedAt).toBeTypeOf("number");

    // Archiving again is a no-op.
    expect(store.archive(c.id)).toBe(false);
    // Unknown id is a no-op.
    expect(store.archive("nope")).toBe(false);

    // Archived chat persists across reload (still hidden from list).
    const reloaded = new ChatStoreService(dir);
    reloaded.init();
    expect(reloaded.get(c.id)?.archivedAt).toBeTypeOf("number");
    expect(reloaded.list()).toHaveLength(0);
  });

  it("marks a chat open in one window and reports open-elsewhere", () => {
    const c = store.create();
    expect(store.getOpenWin(c.id)).toBeNull();

    store.markOpen(c.id, "win-a");
    expect(store.getOpenWin(c.id)).toBe("win-a");
    expect(store.isOpenElsewhere(c.id, "win-b")).toBe(true);
    expect(store.isOpenElsewhere(c.id, "win-a")).toBe(false);

    store.markClosed(c.id);
    expect(store.getOpenWin(c.id)).toBeNull();
  });

  it("persists and reloads chats from disk", () => {
    const c = store.create();
    // Appending the first user message auto-titles the chat (plan behaviour).
    store.appendMessage(c.id, { id: "m1", role: "user", content: "hello world" });

    // New store over the same dir.
    const reloaded = new ChatStoreService(dir);
    reloaded.init();
    const chat = reloaded.get(c.id);
    expect(chat?.title).toBe("hello world");
    expect(chat?.messages).toHaveLength(1);
    expect(chat?.messages[0].content).toBe("hello world");
  });

  it("search matches message text + tool commands, not results", () => {
    const c = store.create();
    store.appendMessage(c.id, { id: "u1", role: "user", content: "check the config" });
    store.appendMessage(c.id, {
      id: "a1",
      role: "assistant",
      content: "reading",
      toolCalls: [
        { id: "tc1", name: "read_file", arguments: '{"path":"config.json"}', status: "done" },
      ],
    });
    store.appendMessage(c.id, {
      id: "t1",
      role: "tool",
      toolCallId: "tc1",
      content: '{"model": "gpt"}',
    });

    const byTool = store.search("config.json");
    expect(byTool[0].matchedToolCallIds).toEqual(["tc1"]);
    // Tool result "model" must not match by itself.
    expect(store.search("model")).toEqual([]);
  });

  it("updateToolCall propagates status/error into the matching inline segment", () => {
    const c = store.create();
    store.appendMessage(c.id, {
      id: "a1",
      role: "assistant",
      content: "",
      toolCalls: [
        { id: "tc1", name: "read_file", arguments: "", status: "running" },
      ],
      segments: [
        {
          type: "tool",
          toolCall: { id: "tc1", name: "read_file", arguments: "", status: "running" },
        },
      ],
    });
    store.updateToolCall(c.id, "tc1", (tc) => {
      tc.status = "error";
      tc.error = "boom";
    });
    const msg = store.get(c.id)!.messages[0];
    const seg = msg.segments!.find((s) => s.type === "tool")!;
    expect(seg.toolCall!.status).toBe("error");
    expect(seg.toolCall!.error).toBe("boom");
  });
});
