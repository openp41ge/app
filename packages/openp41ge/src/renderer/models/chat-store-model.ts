/**
 * ChatStoreModel — the DI seam for the chat store (sidebar list + open state).
 *
 * Two implementations:
 *   - IpcChatStoreModel  (production): delegates to window.openp41ge.chat.*.
 *   - TestChatStoreModel (tests): pure in-memory store with the same semantics.
 *
 * The sidebar/controller depends on the interface via a public settable
 * property (project convention), so unit tests can inject TestChatStoreModel.
 */

/* eslint-disable max-classes-per-file */

import { defaultChatTitle } from "openp41ge-constants";
import { searchTranscript } from "openp41ge-agents";
import type { Chat, ChatHeader, ChatSearchOptions, ChatSearchResult, ChatSummary, ChatTranscriptPage, ChatTranscriptSearch } from "openp41ge-agents";

/** Narrow read/write contract for the chat store. */
export interface ChatStoreModel {
  list(): Promise<ChatSummary[]>;
  get(id: string): Promise<Chat | null>;
  getHeader(id: string): Promise<ChatHeader | null>;
  getMessages(id: string, offset: number, count: number): Promise<ChatTranscriptPage>;
  create(opts?: { providerId?: string; title?: string }): Promise<Chat>;
  delete(id: string): Promise<boolean>;
  archive(id: string): Promise<boolean>;
  rename(id: string, title: string): Promise<Chat | null>;
  search(q: string, opts?: ChatSearchOptions): Promise<ChatSearchResult[]>;
  searchTranscript(id: string, q: string, opts?: ChatSearchOptions): Promise<ChatTranscriptSearch>;
  open(id: string): Promise<void>;
  close(id: string): Promise<void>;
  highlight(id: string): Promise<void>;
  getOpenChats(): Promise<Record<string, string>>;
  onChanged(cb: () => void): () => void;
  onOpenState(cb: (openChats: Record<string, string>) => void): () => void;
  onHighlight(cb: (payload: { chatId: string }) => void): () => void;
}

// ─── Production: IPC-backed ───────────────────────────────────────────────

export class IpcChatStoreModel implements ChatStoreModel {
  list(): Promise<ChatSummary[]> {
    return window.openp41ge.chat.list();
  }
  get(id: string): Promise<Chat | null> {
    return window.openp41ge.chat.get(id);
  }
  getHeader(id: string): Promise<ChatHeader | null> {
    return window.openp41ge.chat.getHeader(id);
  }
  getMessages(id: string, offset: number, count: number): Promise<ChatTranscriptPage> {
    return window.openp41ge.chat.getMessages(id, offset, count);
  }
  create(opts?: { providerId?: string; title?: string }): Promise<Chat> {
    return window.openp41ge.chat.create(opts);
  }
  delete(id: string): Promise<boolean> {
    return window.openp41ge.chat.delete(id);
  }
  archive(id: string): Promise<boolean> {
    return window.openp41ge.chat.archive(id);
  }
  rename(id: string, title: string): Promise<Chat | null> {
    return window.openp41ge.chat.rename(id, title);
  }
  search(q: string, opts?: ChatSearchOptions): Promise<ChatSearchResult[]> {
    return window.openp41ge.chat.search(q, opts);
  }
  searchTranscript(id: string, q: string, opts?: ChatSearchOptions): Promise<ChatTranscriptSearch> {
    return window.openp41ge.chat.searchTranscript(id, q, opts);
  }
  open(id: string): Promise<void> {
    return window.openp41ge.chat.open(id);
  }
  close(id: string): Promise<void> {
    return window.openp41ge.chat.close(id);
  }
  highlight(id: string): Promise<void> {
    return window.openp41ge.chat.highlight(id);
  }
  getOpenChats(): Promise<Record<string, string>> {
    return window.openp41ge.chat.getOpenChats();
  }
  onChanged(cb: () => void): () => void {
    return window.openp41ge.chat.onChanged(cb);
  }
  onOpenState(cb: (openChats: Record<string, string>) => void): () => void {
    return window.openp41ge.chat.onOpenState(cb);
  }
  onHighlight(cb: (payload: { chatId: string }) => void): () => void {
    return window.openp41ge.chat.onHighlight(cb);
  }
}

// ─── Test: in-memory fixture store ────────────────────────────────────────

/**
 * In-memory ChatStoreModel for tests. Mirrors the main-process semantics:
 * chats are stored in a Map, summaries computed, open-state tracked with
 * open-once (a chat can be open in at most one window).
 */
export class TestChatStoreModel implements ChatStoreModel {
  chats = new Map<string, Chat>();
  openChats = new Map<string, string>();
  /** Record of every mutation call for assertions. */
  calls: Array<{ op: string; args: unknown[] }> = [];
  private readonly _changed = new Set<() => void>();
  private readonly _openState = new Set<(openChats: Record<string, string>) => void>();
  private readonly _highlight = new Set<(payload: { chatId: string }) => void>();
  private _seq = 0;

  constructor(fixtures: Chat[] = []) {
    for (const f of fixtures) this.chats.set(f.id, f);
  }

  setFixtures(fixtures: Chat[]): void {
    this.chats.clear();
    for (const f of fixtures) this.chats.set(f.id, f);
  }

  private _id(): string {
    this._seq += 1;
    return `chat_${this._seq}`;
  }

  async list(): Promise<ChatSummary[]> {
    return Array.from(this.chats.values())
      .filter((c) => !c.archivedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(toTestSummary);
  }

  async get(id: string): Promise<Chat | null> {
    return this.chats.get(id) ?? null;
  }

  async getHeader(id: string): Promise<ChatHeader | null> {
    const chat = this.chats.get(id);
    if (!chat) return null;
    return {
      id: chat.id,
      title: chat.title,
      providerId: chat.providerId,
      totalMessages: chat.messages.length,
      description: chat.description,
    };
  }

  async getMessages(id: string, offset: number, count: number): Promise<ChatTranscriptPage> {
    this.calls.push({ op: "getMessages", args: [id, offset, count] });
    const chat = this.chats.get(id);
    if (!chat) return { chatId: id, start: 0, total: 0, messages: [] };
    const total = chat.messages.length;
    const start = Math.max(0, Math.min(offset, total));
    const end = Math.min(total, start + Math.max(0, count));
    return { chatId: id, start, total, messages: chat.messages.slice(start, end) };
  }

  async create(opts: { providerId?: string; title?: string } = {}): Promise<Chat> {
    this.calls.push({ op: "create", args: [opts] });
    const now = Date.now();
    const chat: Chat = {
      id: this._id(),
      title: opts.title?.trim() || defaultChatTitle(now),
      providerId: opts.providerId ?? "vllm",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.chats.set(chat.id, chat);
    this._emitChanged();
    return chat;
  }

  async delete(id: string): Promise<boolean> {
    this.calls.push({ op: "delete", args: [id] });
    const ok = this.chats.delete(id);
    this.openChats.delete(id);
    if (ok) this._emitChanged();
    return ok;
  }

  async archive(id: string): Promise<boolean> {
    this.calls.push({ op: "archive", args: [id] });
    const chat = this.chats.get(id);
    if (!chat || chat.archivedAt) return false;
    chat.archivedAt = Date.now();
    chat.updatedAt = Date.now();
    this._emitChanged();
    return true;
  }

  async rename(id: string, title: string): Promise<Chat | null> {
    this.calls.push({ op: "rename", args: [id, title] });
    const chat = this.chats.get(id);
    if (!chat) return null;
    const t = title.trim();
    if (t) chat.title = t;
    chat.updatedAt = Date.now();
    this._emitChanged();
    return chat;
  }

  async search(q: string, opts: ChatSearchOptions = {}): Promise<ChatSearchResult[]> {
    this.calls.push({ op: "search", args: [q, opts] });
    const needle = q.trim();
    if (!needle) return [];
    let re: RegExp | null = null;
    if (opts.regex) {
      try {
        re = new RegExp(needle, opts.caseSensitive ? "" : "i");
      } catch {
        return [];
      }
    }
    const low = opts.caseSensitive ? needle : needle.toLowerCase();
    const matches = (text: string): boolean => {
      if (re) return re.test(text);
      return (opts.caseSensitive ? text : text.toLowerCase()).includes(low);
    };
    const results: ChatSearchResult[] = [];
    for (const chat of this.chats.values()) {
      if (chat.archivedAt) continue;
      const matchedMessageIds: string[] = [];
      const matchedToolCallIds: string[] = [];
      for (const m of chat.messages) {
        if (m.role === "user" || m.role === "assistant") {
          if (matches(m.content ?? "")) matchedMessageIds.push(m.id);
        }
        for (const tc of m.toolCalls ?? []) {
          if (matches(tc.name) || matches(stringifyArgs(tc.arguments))) {
            matchedToolCallIds.push(tc.id);
          }
        }
      }
      if (matchedMessageIds.length || matchedToolCallIds.length) {
        results.push({ chatId: chat.id, matchedMessageIds, matchedToolCallIds });
      }
    }
    return results;
  }

  async searchTranscript(id: string, q: string, opts: ChatSearchOptions = {}): Promise<ChatTranscriptSearch> {
    this.calls.push({ op: "searchTranscript", args: [id, q, opts] });
    return searchTranscript(this.chats.get(id), q, opts);
  }

  async open(id: string): Promise<void> {
    this.calls.push({ op: "open", args: [id] });
    const winId = this._currentWinId ?? "w1";
    if (this.openChats.get(id) !== winId) {
      this.openChats.set(id, winId);
      this._emitOpenState();
    }
  }

  async close(id: string): Promise<void> {
    this.calls.push({ op: "close", args: [id] });
    if (this.openChats.delete(id)) this._emitOpenState();
  }

  async highlight(id: string): Promise<void> {
    this.calls.push({ op: "highlight", args: [id] });
    for (const cb of this._highlight) cb({ chatId: id });
  }
  async getOpenChats(): Promise<Record<string, string>> {
    return Object.fromEntries(this.openChats);
  }

  onChanged(cb: () => void): () => void {
    this._changed.add(cb);
    return () => this._changed.delete(cb);
  }
  onOpenState(cb: (openChats: Record<string, string>) => void): () => void {
    this._openState.add(cb);
    return () => this._openState.delete(cb);
  }
  onHighlight(cb: (payload: { chatId: string }) => void): () => void {
    this._highlight.add(cb);
    return () => this._highlight.delete(cb);
  }

  /** For tests: set the window id used by open()/markOpen. */
  setCurrentWinId(winId: string): void {
    this._currentWinId = winId;
  }
  private _currentWinId = "w1";

  /** Expose open-state for assertions. */
  isOpenElsewhere(id: string, winId: string): boolean {
    const owner = this.openChats.get(id);
    return owner !== undefined && owner !== winId;
  }

  private _emitChanged(): void {
    for (const cb of this._changed) cb();
  }
  private _emitOpenState(): void {
    const state = Object.fromEntries(this.openChats);
    for (const cb of this._openState) cb(state);
  }
}

function toTestSummary(chat: Chat): ChatSummary {
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

function stringifyArgs(args: string | Record<string, unknown>): string {
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}
