/**
 * AgentsController — grid pane controller that renders a single chat.
 *
 * Bridges the <openp41ge-agents> Lit component to the chat store +
 * agent runtime through the model seams. Data runs events-up / data-down:
 *   - mount: read chatId, open the chat (opened-once), fetch the transcript,
 *     subscribe to delta/tool/status events for this chat, wire chat:send/abort.
 *   - The component never touches IPC — the controller injects deltas and
 *     tool states and forwards user sends to the runtime.
 *
 * Snapshot/restore persist `{ chatId }` so chat tabs survive window reload.
 * Unmount does NOT emit chat:close blindly — it only closes the chat when the
 * tab is actually removed from the grid (detected via workspace presence).
 */

import { BaseController } from "../../controllers/base-controller";
import type { TabController } from "../../controllers/types";
import type { Openp41geAgents } from "openp41ge-agents";
import { registerOpenp41geAgents } from "openp41ge-agents";
import type { ChatDeltaPayload, ChatStatusPayload, ChatToolPayload, ChatUsagePayload, ToolCall } from "openp41ge-agents";
import { IpcChatStoreModel, type ChatStoreModel } from "../../models/chat-store-model";
import { IpcChatRuntimeModel, type ChatRuntimeModel } from "../../models/chat-runtime-model";
import { createLogger } from "openp41ge-logger";
import { workspaceFileService } from "../../services/workspace-file-service";

const log = createLogger("openp41ge", "AgentsController");

export class AgentsController extends BaseController implements TabController {
  /** The chat id this tab renders. */
  chatId: string = "";

  /** Cwd for tool execution, carried on the tab config (optional). */
  private _cwd: string | undefined;

  /** Public settable DI seams (default Ipc, override in tests). */
  _storeModel: ChatStoreModel = new IpcChatStoreModel();
  _runtimeModel: ChatRuntimeModel = new IpcChatRuntimeModel();

  private _component: Openp41geAgents | null = null;
  private _unsubscribers: Array<() => void> = [];
  private _boundHandlers: Array<{ type: string; handler: EventListener }> = [];
  /** Tools currently enabled for this chat (the composer multi-select). */
  private _activeTools: string[] = [];

  constructor(tabId: string, appType: string) {
    super(tabId, appType);
  }

  mount(container: HTMLElement): void {
    this.container = container;

    // Pick up a chat id set before dispatch (like __pendingGitRepo).
    const pending = (window as unknown as Record<string, unknown>).__pendingChatId as
      string | undefined;
    if (pending && !this.chatId) {
      this.chatId = pending;
      (window as unknown as Record<string, unknown>).__pendingChatId = null;
    }
    if (!this.chatId) {
      this._renderPlaceholder(container, "No chat selected");
      return;
    }

    registerOpenp41geAgents();
    const el = document.createElement("openp41ge-agents") as Openp41geAgents;
    this._component = el;
    container.appendChild(el as unknown as HTMLElement);

    // Subscribe to streamed events for this chat.
    this._subscribe();

    // Wire send/abort.
    el.addEventListener("chat:send", this._onSend as EventListener);
    el.addEventListener("chat:abort", this._onAbort as EventListener);
    el.addEventListener("chat:tools-change", this._onToolsChange as EventListener);
    el.addEventListener("chat:tool-open", this._onToolOpen as EventListener);
    this._boundHandlers.push(
      { type: "chat:send", handler: this._onSend as EventListener },
      { type: "chat:abort", handler: this._onAbort as EventListener },
      { type: "chat:tools-change", handler: this._onToolsChange as EventListener },
      { type: "chat:tool-open", handler: this._onToolOpen as EventListener },
    );

    // Open the chat (opened-once bookkeeping) and fetch its transcript.
    void this._storeModel.open(this.chatId);
    void this._loadChat();

    // Focus the input on open.
    requestAnimationFrame(() => el.focusInput());
  }

  unmount(): void {
    for (const { type, handler } of this._boundHandlers) {
      this._component?.removeEventListener(type, handler);
    }
    this._boundHandlers = [];
    for (const un of this._unsubscribers) un();
    this._unsubscribers = [];
    this._component = null;
    this.container = null;

    // Close the chat only when the tab is genuinely removed from the grid, not
    // on a tab switch (which also calls unmount). Check workspace presence.
    void this._closeIfRemoved();
  }

  setVisible(_visible: boolean): void {
    // No special handling.
  }

  snapshot(): Record<string, unknown> {
    return { chatId: this.chatId };
  }

  restore(state: Record<string, unknown>): void {
    const id = state.chatId;
    if (id && typeof id === "string") this.chatId = id;
    const cwd = state.cwd;
    if (typeof cwd === "string") this._cwd = cwd;
  }

  // ─── Event wiring ───────────────────────────────────────────────────

  private _subscribe(): void {
    const chatId = this.chatId;
    this._unsubscribers.push(
      this._runtimeModel.onDelta((payload: ChatDeltaPayload) => {
        if (payload.chatId !== chatId || !this._component) return;
        this._component.appendDelta(payload.delta);
      }),
      this._runtimeModel.onTool((payload: ChatToolPayload) => {
        if (payload.chatId !== chatId || !this._component) return;
        this._component.setToolCallState(payload.toolCall, payload.result);
      }),
      this._runtimeModel.onStatus((payload: ChatStatusPayload) => {
        if (payload.chatId !== chatId || !this._component) return;
        this._component.setProviderStatus(payload.status);
      }),
      this._runtimeModel.onUsage((payload: ChatUsagePayload) => {
        if (payload.chatId !== chatId || !this._component) return;
        this._component.setUsage(payload.usage);
      }),
      this._storeModel.onChanged(() => {
        if (!this._component) return;
        void this._refreshIfTitleChanged();
      }),
    );
  }

  private async _refreshIfTitleChanged(): Promise<void> {
    const chat = await this._storeModel.get(this.chatId);
    if (chat && this._component && chat.title !== this._component.title) {
      this._component.setTitle(chat.title);
    }
  }

  private async _loadChat(): Promise<void> {
    try {
      const chat = await this._storeModel.get(this.chatId);
      if (!this._component) return;
      if (chat) {
        this._component.setChat(chat);
        void this._loadComposerContext(chat.providerId ?? "vllm");
      } else {
        this._component.setChat({
          id: this.chatId,
          title: "Chat not found",
          providerId: "vllm",
          createdAt: 0,
          updatedAt: 0,
          messages: [],
        });
      }
    } catch (err) {
      log.warn("failed to load chat", (err as Error).message);
    }
  }

  /** Populate the composer's provider/model selector and active-tools list. */
  private async _loadComposerContext(activeProviderId: string): Promise<void> {
    // v1 toolset exposed by the backend executor (main process).
    const DEFAULT_TOOLS: Array<{ name: string; description: string }> = [
      { name: "read_file", description: "Read the contents of a text file." },
      { name: "search_files", description: "Search for files matching a substring." },
    ];
    try {
      const cfg = await window.openp41ge.chat.getAgentConfig();
      const providers = Object.entries(cfg.providers).map(([id, p]) => {
        const pv = p as {
          name?: string;
          model?: string;
          baseUrl?: string;
          models?: Array<{
            id: string;
            thinking?: Record<string, string>;
            contextWindow?: number;
            maxTokens?: number;
          }>;
        };
        return {
          id,
          label: pv.name ?? id,
          model: pv.model ?? "",
          models: (pv.models ?? []).map((m) => ({
            id: m.id,
            thinking: m.thinking,
            contextWindow: m.contextWindow,
            maxTokens: m.maxTokens,
          })),
          baseUrl: pv.baseUrl ?? "",
        };
      });
      if (!providers.some((p) => p.id === activeProviderId)) {
        providers.push({
          id: activeProviderId,
          label: activeProviderId,
          model: "",
          models: [],
          baseUrl: "",
        });
      }
      const active = providers.find((p) => p.id === activeProviderId);
      // Resolve the selectable toolset from the backend registry. Fall back to
      // the built-in set when the IPC is unavailable, so the composer always
      // has a list to show.
      let availableTools: Array<{ name: string; description: string }> = [];
      try {
        availableTools = await window.openp41ge.chat.listTools();
      } catch {
        availableTools = [];
      }
      const saved = workspaceFileService.getEnabledAgentTools();
      if (!availableTools.length && !saved) availableTools = [...DEFAULT_TOOLS];
      // The workspace defines which tools this chat may use — hide the disabled
      // ones from the composer. When the workspace has no explicit config (or no
      // open workspace), every registered tool is available, matching the
      // pre-settings behaviour.
      if (saved) {
        availableTools = availableTools.filter((t) => saved.includes(t.name));
      }
      // Preserve any user selection; otherwise default to the enabled subset.
      if (this._activeTools.length) {
        this._activeTools = this._activeTools.filter((n) =>
          availableTools.some((t) => t.name === n),
        );
      } else {
        this._activeTools = availableTools.map((t) => t.name);
      }
      this._component?.setComposerContext({
        providers,
        activeProviderId,
        activeModelId: active?.model ?? "",
        availableTools,
        activeTools: this._activeTools,
      });
    } catch (err) {
      log.warn("failed to load agent composer context", (err as Error).message);
    }
  }

  private _onToolsChange = (e: Event): void => {
    const tools = (e as CustomEvent<{ tools?: string[] }>).detail?.tools;
    if (tools) this._activeTools = tools;
  };

  /**
   * The set of tools this chat may use. The workspace's per-workspace enabled
   * set acts as a capability gate, so disabling a tool in the Agents settings
   * takes effect even for an already-open chat that still lists it.
   */
  private _effectiveEnabledTools(): string[] {
    const saved = workspaceFileService.getEnabledAgentTools();
    if (!saved) return this._activeTools;
    return this._activeTools.filter((n) => saved.includes(n));
  }

  private _onSend = (e: Event): void => {
    const detail = (e as CustomEvent<{ text?: string; thinkingLevel?: string }>).detail;
    const text = detail?.text;
    if (!text) return;
    // Only forward a thinking level when the composer provided one (i.e. the
    // active model has thinking entries). When absent, nothing is sent.
    void this._runtimeModel.send(
      this.chatId,
      text,
      this._cwd,
      this._effectiveEnabledTools(),
      detail?.thinkingLevel,
    );
  };

  private _onAbort = (): void => {
    void this._runtimeModel.abort(this.chatId);
  };

  /**
   * A completed tool-call card was clicked — forward it to the window-level
   * tool-result open handler, which opens the result in an unpinned tab in the
   * cell to the right of THIS chat tab.
   */
  private _onToolOpen = (e: Event): void => {
    const detail = (e as CustomEvent<{ toolCall?: ToolCall; result?: string }>).detail;
    const tc = detail?.toolCall;
    if (!tc) return;
    document.dispatchEvent(
      new CustomEvent("openp41ge:open-tool-result", {
        detail: {
          chatTabId: this.tabId,
          toolCallId: tc.id,
          name: tc.name,
          arguments: tc.arguments,
          result: detail.result,
        },
      }),
    );
  };

  private async _closeIfRemoved(): Promise<void> {
    if (!this.chatId) return;
    try {
      const stateJson = await window.openp41ge.workspace.getState();
      const ws = JSON.parse(stateJson) as {
        windows?: Array<{ grid?: { placements?: Array<{ tabIds?: string[] }> } }>;
      } | null;
      const present = ws?.windows?.some((w) =>
        w.grid?.placements?.some((p) => p.tabIds?.includes(this.tabId)),
      );
      if (!present) {
        await this._storeModel.close(this.chatId);
      }
    } catch {
      // workspace may be unavailable; do nothing.
    }
  }

  private _renderPlaceholder(container: HTMLElement, message: string): void {
    container.style.cssText =
      "width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;";
    container.innerHTML = `<div style="color:var(--text-muted);font-size:12px;">${message}</div>`;
  }
}
