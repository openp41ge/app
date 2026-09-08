/**
 * Chat IPC handlers — the chat store + agent runtime surface.
 *
 * Handles the renderer → main chat API and broadcasts main → renderer events:
 *   chat:changed, chat:delta, chat:tool, chat:status, chat:open-state,
 *   chat:highlight.
 *
 * "Opened once": main keeps `openChats` (chatId -> winId). A chat may be open
 * in at most one window; opening it in another window is refused (the renderer
 * shows the indicator/highlight UX instead).
 */

import { ipcMain, type WebContents } from "electron";
import type { ChatSearchOptions } from "openp41ge-agents";
import type { ConfigService } from "../../src/main/services/config-service.js";
import type { ChatStoreService } from "../../src/main/services/chat-store-service.js";
import type { ChatProviderRegistry } from "../../src/main/services/chat-provider-registry.js";
import type { AgentRuntime } from "../../src/main/services/agent-runtime.js";
import { openp41geWindows } from "../window-manager.js";
import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge", "chat-handlers");

/** Resolve the openp41ge window id for a webContents, or null. */
function winIdFromSender(sender: WebContents): string | null {
  for (const [id, bw] of openp41geWindows) {
    if (bw.webContents === sender) return id;
  }
  return null;
}

function broadcast(event: string, payload: unknown): void {
  const serialized = JSON.stringify(payload);
  for (const [, bw] of openp41geWindows) {
    try {
      bw.webContents.send(event, serialized);
    } catch {
      // window may be closing
    }
  }
}

function sendToWindow(winId: string, event: string, payload: unknown): void {
  const bw = openp41geWindows.get(winId);
  if (!bw || bw.isDestroyed()) return;
  try {
    bw.webContents.send(event, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function registerChatHandlers(
  store: ChatStoreService,
  runtime: AgentRuntime,
  providers: ChatProviderRegistry,
  config: ConfigService,
): void {
  // ── CRUD ─────────────────────────────────────────────────────────────
  ipcMain.handle("chat:list", async () => store.listSummaries());

  ipcMain.handle("chat:get", async (_e, id: string) => store.get(id));

  ipcMain.handle("chat:create", async (_e, opts?: { providerId?: string; title?: string }) => {
    const chat = store.create(opts ?? {});
    broadcast("chat:changed", {});
    return chat;
  });

  ipcMain.handle("chat:delete", async (_e, id: string) => {
    const existed = store.delete(id);
    if (existed) broadcast("chat:changed", {});
    return existed;
  });

  ipcMain.handle("chat:rename", async (_e, id: string, title: string) => {
    const chat = store.rename(id, title);
    if (chat) broadcast("chat:changed", {});
    return chat;
  });

  ipcMain.handle("chat:archive", async (_e, id: string) => {
    const archived = store.archive(id);
    if (archived) broadcast("chat:changed", {});
    return archived;
  });

  ipcMain.handle("chat:search", async (_e, query: string, opts?: ChatSearchOptions) =>
    store.search(query, opts),
  );

  // ── Send / abort (agent runtime) ─────────────────────────────────────
  ipcMain.handle("chat:send", async (event, id: string, text: string, cwd?: string) => {
    const winId = winIdFromSender(event.sender) ?? store.getOpenWin(id) ?? "";
    if (!winId) return;
    await runtime.send(id, winId, text, cwd);
  });

  ipcMain.handle("chat:abort", async (_e, id: string) => {
    await runtime.abort(id);
  });

  // ── Open-state ("opened once") ───────────────────────────────────────
  ipcMain.handle("chat:open", async (_e, id: string) => {
    const senderWinId = winIdFromSender(_e.sender) ?? "";
    if (!senderWinId || !store.get(id)) return;
    if (store.isOpenElsewhere(id, senderWinId)) {
      // Refuse; broadcast the open-state so the renderer shows the indicator.
      broadcast("chat:open-state", store.getOpenChats());
      return;
    }
    store.markOpen(id, senderWinId);
    broadcast("chat:open-state", store.getOpenChats());
  });

  ipcMain.handle("chat:close", async (_e, id: string) => {
    store.markClosed(id);
    broadcast("chat:open-state", store.getOpenChats());
  });

  ipcMain.handle("chat:getOpenChats", async () => store.getOpenChats());

  // ── Highlight (paint the owning window's tab handle blue, no focus) ──
  ipcMain.handle("chat:highlight", async (_e, id: string) => {
    const owner = store.getOpenWin(id);
    if (owner) sendToWindow(owner, "chat:highlight", { chatId: id });
  });

  // ── Provider connectivity (overlay Test Connection) ──────────────────
  ipcMain.handle("chat:pingProvider", async (_e, providerId?: string) => {
    const pid = providerId ?? (config.get("agent.providerId") as string) ?? providers.defaultId;
    const factory = providers.get(pid);
    if (!factory) return { ok: false, error: "Unknown provider" };
    const cfgRaw = config.get(`agent.providers.${pid}`) as Record<string, unknown> | undefined;
    if (!cfgRaw) return { ok: false, error: "Provider not configured" };
    const cfg = cfgRaw as unknown as Parameters<typeof factory.create>[0];
    const ok = await factory.create(cfg).ping();
    return { ok, error: ok ? undefined : "Provider unreachable" };
  });

  // ── Config (reuse the existing config service for agent settings) ────
  ipcMain.handle("chat:getAgentConfig", async () => {
    return config.get("agent");
  });

  // ── Model listing (auto-detect models from the provider's /models endpoint) ─
  ipcMain.handle(
    "chat:listModels",
    async (_e, opts: { baseUrl: string; apiKey?: string; compatible: "openai" | "anthropic" }) => {
      const url = `${opts.baseUrl.replace(/\/+$/, "")}/models`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (opts.apiKey) {
        if (opts.compatible === "anthropic") headers["x-api-key"] = opts.apiKey;
        else headers["Authorization"] = `Bearer ${opts.apiKey}`;
      }
      let res: Response;
      try {
        res = await fetch(url, { headers });
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
      if (!res.ok) {
        return { ok: false, error: `Model list request failed (${res.status})` };
      }
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      const ids = (body.data ?? []).map((m) => m.id).filter((id) => typeof id === "string");
      log.info(`listed ${ids.length} models from ${url}`);
      return { ok: true, models: ids };
    },
  );

  log.info("chat handlers registered");
}
