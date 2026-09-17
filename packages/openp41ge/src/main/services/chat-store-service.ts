/**
 * ChatStoreService — CRUD + search + open-state for the shared chat store,
 * persisted atomically to ~/.openp41ge/chats.json.
 *
 * Mirrors WorkspaceStateStore's write strategy. The store is the single
 * source of truth for chats across all windows. "Opened once" bookkeeping
 * (`openChats`) lives here so no chat is ever open in two windows.
 */

import fs from "fs";
import path from "path";
import { createLogger } from "openp41ge-logger";
import { CHATS_FILENAME, defaultChatTitle } from "openp41ge-constants";
import type {
  Chat,
  ChatMessage,
  ChatSearchOptions,
  ChatSearchResult,
  ChatSummary,
  ToolCall,
  ToolCallStatus,
} from "openp41ge-agents";

const log = createLogger("openp41ge", "ChatStoreService");

let _seq = 0;
function generateId(prefix: string): string {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// ─── Pure search matcher (unit-testable, no I/O) ──────────────────────────

/**
 * Search chats by message text (user + assistant) and by tool-call command
 * (name + arguments). Tool results (role: "tool" content) are NEVER matched.
 * Returns per-chat matched message + tool-call ids.
 */
export function searchChats(
  chats: Chat[],
  query: string,
  opts: ChatSearchOptions = {},
): ChatSearchResult[] {
  const q = query.trim();
  if (!q) return [];

  let re: RegExp | null = null;
  if (opts.regex) {
    try {
      re = new RegExp(q, opts.caseSensitive ? "" : "i");
    } catch {
      return []; // invalid regex → nothing matches
    }
  }
  const needle = opts.caseSensitive ? q : q.toLowerCase();
  const matches = (text: string): boolean => {
    if (re) return re.test(text);
    return (opts.caseSensitive ? text : text.toLowerCase()).includes(needle);
  };

  const results: ChatSearchResult[] = [];
  for (const chat of chats) {
    const matchedMessageIds: string[] = [];
    const matchedToolCallIds: string[] = [];
    for (const msg of chat.messages) {
      if (msg.role === "user" || msg.role === "assistant") {
        if (matches(msg.content ?? "")) matchedMessageIds.push(msg.id);
      }
      for (const tc of msg.toolCalls ?? []) {
        if (matches(tc.name) || matches(stringifyArgs(tc.arguments))) {
          matchedToolCallIds.push(tc.id);
        }
      }
    }
    if (matchedMessageIds.length > 0 || matchedToolCallIds.length > 0) {
      results.push({ chatId: chat.id, matchedMessageIds, matchedToolCallIds });
    }
  }
  return results;
}

function stringifyArgs(args: ToolCall["arguments"]): string {
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

/** Build a ChatSummary from a Chat (user/assistant content + tool call counts). */
export function toSummary(chat: Chat): ChatSummary {
  let toolCallCount = 0;
  let messageCount = 0;
  let lastMessagePreview: string | undefined;
  for (const m of chat.messages) {
    messageCount += 1;
    toolCallCount += m.toolCalls?.length ?? 0;
    if (m.role === "user" || m.role === "assistant") {
      if ((m.content ?? "").trim()) lastMessagePreview = m.content!.slice(0, 80);
    }
  }
  return {
    id: chat.id,
    title: chat.title,
    updatedAt: chat.updatedAt,
    messageCount,
    toolCallCount,
    lastMessagePreview,
    description: chat.description,
  };
}

// ─── ChatStoreService ────────────────────────────────────────────────────

export class ChatStoreService {
  private readonly _filePath: string;
  private _chats = new Map<string, Chat>();
  private readonly _openChats = new Map<string, string>(); // chatId -> winId
  private _openStateListeners = new Set<() => void>();

  constructor(openp41geDir: string) {
    this._filePath = path.join(openp41geDir, CHATS_FILENAME);
  }

  /** Load persisted chats from disk. Creates an empty store if missing/corrupt. */
  init(): void {
    try {
      if (!fs.existsSync(this._filePath)) return;
      const raw = fs.readFileSync(this._filePath, "utf-8");
      const parsed = JSON.parse(raw) as { chats?: Chat[]; openChats?: Record<string, string> };
      for (const c of parsed.chats ?? []) {
        this._chats.set(c.id, c);
      }
      if (parsed.openChats) {
        for (const [chatId, winId] of Object.entries(parsed.openChats)) {
          this._openChats.set(chatId, winId);
        }
      }
      log.info(`Chat store loaded: ${this._chats.size} chats`);
    } catch (err) {
      log.error("Failed to load chat store:", err);
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────

  list(): Chat[] {
    return Array.from(this._chats.values())
      .filter((c) => !c.archivedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  listSummaries(): ChatSummary[] {
    return this.list().map(toSummary);
  }

  get(id: string): Chat | null {
    return this._chats.get(id) ?? null;
  }

  create(opts: { providerId?: string; title?: string } = {}): Chat {
    const now = Date.now();
    const chat: Chat = {
      id: generateId("chat"),
      title: opts.title?.trim() || defaultChatTitle(now),
      providerId: opts.providerId ?? "vllm",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this._chats.set(chat.id, chat);
    this._persist();
    return structureClone(chat);
  }

  delete(id: string): boolean {
    const existed = this._chats.delete(id);
    this._openChats.delete(id);
    if (existed) this._persist();
    return existed;
  }

  /**
   * Archive a chat: mark it archived so it is hidden from the default list and
   * search. It is NOT deleted — it remains retrievable via get() and persisted.
   */
  archive(id: string): boolean {
    const chat = this._chats.get(id);
    if (!chat || chat.archivedAt) return false;
    const draft = structureClone(chat);
    draft.archivedAt = Date.now();
    this._chats.set(id, draft);
    this._persist();
    return true;
  }

  rename(id: string, title: string): Chat | null {
    return this._update(id, (chat) => {
      const t = title.trim();
      if (t) chat.title = t;
    });
  }

  // ── Message / tool-call mutations (used by AgentRuntime) ─────────────

  appendMessage(id: string, msg: Omit<ChatMessage, "timestamp">): Chat | null {
    return this._update(id, (chat) => {
      chat.messages.push({ ...msg, timestamp: Date.now() });
      if (msg.role === "user" && chat.messages.filter((m) => m.role === "user").length === 1) {
        const preview = (msg.content ?? "").slice(0, 40);
        if (preview) chat.title = preview;
      }
    });
  }

  /** Update a message in place (used for streaming assistant content + tool status). */
  updateMessage(id: string, messageId: string, fn: (msg: ChatMessage) => void): Chat | null {
    return this._update(id, (chat) => {
      const msg = chat.messages.find((m) => m.id === messageId);
      if (msg) fn(msg);
    });
  }

  updateToolCall(id: string, toolCallId: string, fn: (tc: ToolCall) => void): Chat | null {
    return this._update(id, (chat) => {
      for (const m of chat.messages) {
        const tc = m.toolCalls?.find((t) => t.id === toolCallId);
        if (tc) {
          fn(tc);
          if (m.segments) {
            m.segments = m.segments.map((s) =>
              s.type === "tool" && s.toolCall?.id === toolCallId
                ? { ...s, toolCall: { ...s.toolCall, status: tc.status, ...(tc.error ? { error: tc.error } : {}) } }
                : s,
            );
          }
          return;
        }
      }
    });
  }

  setLastToolCallStatus(chatId: string, status: ToolCallStatus, error?: string): Chat | null {
    return this._update(chatId, (chat) => {
      const msg = chat.messages[chat.messages.length - 1];
      if (!msg) return;
      const tc = msg.toolCalls?.[msg.toolCalls.length - 1];
      if (tc) {
        tc.status = status;
        if (error !== undefined) tc.error = error;
      }
    });
  }

  /** Replace the entire message list (used to replace the in-flight assistant reply). */
  setMessages(id: string, messages: ChatMessage[]): Chat | null {
    return this._update(id, (chat) => {
      chat.messages = messages;
    });
  }

  // ── Search ───────────────────────────────────────────────────────────

  search(query: string, opts?: ChatSearchOptions): ChatSearchResult[] {
    return searchChats(this.list(), query, opts);
  }

  // ── Open-state ("opened once") ───────────────────────────────────────

  markOpen(chatId: string, winId: string): void {
    if (this._openChats.get(chatId) === winId) return;
    this._openChats.set(chatId, winId);
    this._persist();
    this._notifyOpen();
  }

  markClosed(chatId: string): void {
    if (!this._openChats.delete(chatId)) return;
    this._persist();
    this._notifyOpen();
  }

  getOpenWin(chatId: string): string | null {
    return this._openChats.get(chatId) ?? null;
  }

  /** True when the chat is open in a window other than `winId`. */
  isOpenElsewhere(chatId: string, winId: string): boolean {
    const owner = this._openChats.get(chatId);
    return owner !== undefined && owner !== winId;
  }

  /** All open-chat window ids (for broadcast targeting). */
  getOpenChatWindowIds(): string[] {
    return Array.from(this._openChats.values());
  }

  /** The full openChats map (chatId -> winId), for broadcast snapshots. */
  getOpenChats(): Record<string, string> {
    return Object.fromEntries(this._openChats);
  }

  onOpenStateChange(cb: () => void): () => void {
    this._openStateListeners.add(cb);
    return () => this._openStateListeners.delete(cb);
  }

  // ── Persistence ──────────────────────────────────────────────────────

  private _update(id: string, fn: (chat: Chat) => void): Chat | null {
    const chat = this._chats.get(id);
    if (!chat) return null;
    const draft = structureClone(chat);
    fn(draft);
    draft.updatedAt = Date.now();
    this._chats.set(id, draft);
    this._persist();
    return structureClone(draft);
  }

  private _persist(): void {
    try {
      const dir = path.dirname(this._filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = JSON.stringify(
        {
          chats: Array.from(this._chats.values()),
          openChats: Object.fromEntries(this._openChats),
        },
        null,
        2,
      );
      const tmp = this._filePath + ".tmp";
      fs.writeFileSync(tmp, payload, "utf-8");
      fs.renameSync(tmp, this._filePath);
    } catch (err) {
      log.error("Failed to persist chat store:", err);
    }
  }

  private _notifyOpen(): void {
    for (const cb of this._openStateListeners) {
      try {
        cb();
      } catch {
        // ignore listener errors
      }
    }
  }
}

/** Clone a chat (and nested messages/tool calls) so stored objects stay mutable-safe. */
function structureClone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
