/**
 * openp41ge-agents — canonical chat data model types.
 *
 * These are plain, dependency-free TypeScript types shared by:
 *   - the <openp41ge-agents> UI component (rendering),
 *   - the openp41ge platform renderer (controllers, sidebar, overlay),
 *   - the Electron main process (chat store, agent runtime, providers).
 *
 * Nothing in this file imports Lit or the platform — it is the single
 * source of truth for the chat data shape.
 */

/** Status of a single tool call. */
export type ToolCallStatus = "running" | "done" | "error";

/** A tool invocation recorded in the transcript (name + arguments, not result). */
export interface ToolCall {
  id: string;
  name: string;
  /** Raw command string (e.g. `cat package.json`) or structured JSON arguments. */
  arguments: string | Record<string, unknown>;
  status: ToolCallStatus;
  /** Set when status === "error". */
  error?: string;
}

/** A single message in a chat transcript. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content?: string;
  /** Only present on assistant messages that called tools. */
  toolCalls?: ToolCall[];
  /** For role === "tool": the id of the tool call this result answers. */
  toolCallId?: string;
  timestamp: number;
}

/** A full chat conversation. */
export interface Chat {
  id: string;
  title: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  /** Optional AI-written one-line summary shown in the sidebar. */
  description?: string;
  /** Set when the chat is archived — hidden from the default sidebar list. */
  archivedAt?: number;
}

/** Lightweight chat listing entry for the sidebar / search. */
export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  toolCallCount: number;
  lastMessagePreview?: string;
  /** AI-written one-line summary; shown as "No description" when absent. */
  description?: string;
}

/** Search hit for a chat: which messages and tool calls matched. */
export interface ChatSearchResult {
  chatId: string;
  matchedMessageIds: string[];
  matchedToolCallIds: string[];
}

/** Options for chat search: regex mode + case sensitivity. */
export interface ChatSearchOptions {
  /** Treat the query as a regular expression. */
  regex?: boolean;
  /** Enable case-sensitive matching (default is case-insensitive). */
  caseSensitive?: boolean;
}

/** Provider reachability / streaming status surfaced in the chat pane. */
export interface ChatRuntimeStatus {
  streaming: boolean;
  /** null = unknown/not yet checked; true/false = reachable/ping failed. */
  providerOk: boolean | null;
  providerLabel?: string;
}

/** Broadcast payload for `chat:delta` (streamed assistant text). */
export interface ChatDeltaPayload {
  chatId: string;
  delta: string;
}

/** Broadcast payload for `chat:tool` (tool-call state change). */
export interface ChatToolPayload {
  chatId: string;
  toolCall: ToolCall;
}

/** Broadcast payload for `chat:status` (streaming/provider connection). */
export interface ChatStatusPayload {
  chatId: string;
  status: ChatRuntimeStatus;
}

/**
 * A short, human-readable preview of a chat's latest activity.
 * Used by the sidebar rows and ChatSummary.lastMessagePreview.
 */
export function chatLastPreview(chat: Chat): string {
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const m = chat.messages[i];
    if (m.role === "user" && m.content) return m.content.slice(0, 80);
    if (m.role === "assistant" && m.content) return m.content.slice(0, 80);
    if (m.role === "tool" && m.toolCalls?.length) {
      return `Tool: ${m.toolCalls.map((t) => t.name).join(", ")}`;
    }
  }
  return "";
}
