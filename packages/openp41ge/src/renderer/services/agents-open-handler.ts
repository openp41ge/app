/**
 * AgentsOpenHandler — handles opening chats into the grid for the
 * `openp41ge:open-chat` event (Chat sidebar rows + New Chat).
 *
 * Mirrors FileOpenHandler/CommitOpenHandler's VS Code preview model:
 *   - unpinned: single-click opens an unpinned preview agents tab.
 *   - pinned: second click / double-click pins it (permanent).
 *   - An existing agents tab for the same chat in the target cell is
 *     activated instead of duplicating (open-once within a window).
 *
 * "Opened once" across windows is handled by the sidebar: when a chat is open
 * in another window, the sidebar shows the indicator + Highlight instead of
 * dispatching open here.
 */

import type { ICommandBus } from "../interfaces/command-bus";
import type { IWorkspaceStateManager } from "../interfaces/workspace-state-manager";
import type { Tab } from "../../layout/types";
import { createLogger } from "openp41ge-logger";
import { Openp41geTabsEventHandler } from "./openp41ge-tabs-event-handler";

const log = createLogger("openp41ge", "agents-open-handler");

export class AgentsOpenHandler {
  private _commandBus: ICommandBus | null = null;
  private _workspaceState: IWorkspaceStateManager | null = null;

  init(commandBus: ICommandBus, workspaceState: IWorkspaceStateManager): void {
    this._commandBus = commandBus;
    this._workspaceState = workspaceState;
  }

  handleOpenChat(e: CustomEvent): void {
    const detail = (e.detail ?? {}) as {
      chatId?: string;
      title?: string;
      cwd?: string;
      pinned?: boolean;
      mode?: string;
      col?: number;
    };
    const chatId = detail.chatId;
    if (!chatId) return;

    let pinned: boolean;
    if (typeof detail.pinned === "boolean") {
      pinned = detail.pinned;
    } else {
      pinned = (detail.mode || "preview") !== "preview";
    }

    const myWindowId = window.openp41ge.workspace.getWindowId();
    if (!myWindowId) {
      log.warn("open-chat skipped — no window context");
      return;
    }
    const targetCol = detail.col !== undefined ? detail.col : this._getLastActiveCellCol();

    // Step 1: an existing agents tab for this chat in the target cell →
    // activate it; a second click on the same preview promotes it to pinned.
    const existingTabId = this._findChatTabInCell(chatId, targetCol);
    if (existingTabId) {
      const tab = this._getTab(existingTabId);
      if (tab && tab.isPreview && pinned) {
        log.info("pin chat preview via second click", existingTabId);
        this._commandBus!.dispatch("pinTabInCell", myWindowId, targetCol, existingTabId);
      } else {
        log.info("activate existing chat tab", existingTabId);
        this._commandBus!.dispatch("activateTabInCell", myWindowId, existingTabId);
      }
      return;
    }

    // Step 2 + 3: set the pending chat id so AgentsController mount picks it
    // up, then open a preview (replaces the cell's preview slot when unpinned)
    // or a permanent tab.
    // The tab handle reads "Agent" (not the chat's title); the pane itself loads
    // the chat by chatId and shows its own header/title.
    (window as unknown as Record<string, unknown>).__pendingChatId = chatId;
    log.info("open chat tab", chatId, pinned ? "pinned" : "unpinned");
    this._commandBus!.dispatch(
      "actionOpenFile",
      myWindowId,
      "agents",
      "Agent",
      chatId,
      targetCol,
      pinned,
      detail.cwd ? { chatId, cwd: detail.cwd } : { chatId },
    );
  }

  /**
   * Open a tool call's result in an unpinned tab in the cell immediately to
   * the right of the chat that issued it, creating that cell if the chat is
   * already the rightmost one.
   *
   * Fired by the agents chat when a completed tool-call card is clicked (the
   * card no longer expands inline). The tab is a `tool-result` viewer holding
   * the snapshotted result text.
   */
  handleOpenToolResult(e: CustomEvent): void {
    const detail = (e.detail ?? {}) as {
      chatTabId?: string;
      toolCallId?: string;
      name?: string;
      arguments?: string;
      result?: string;
    };
    const chatTabId = detail.chatTabId;
    if (!chatTabId) return;

    const myWindowId = window.openp41ge.workspace.getWindowId();
    if (!myWindowId) {
      log.warn("open-tool-result skipped — no window context");
      return;
    }

    const title = this._titleForTool(detail.name, detail.arguments);
    const config = JSON.stringify({
      toolName: detail.name ?? "tool",
      argsString: detail.arguments ?? "",
      result: detail.result ?? "",
      hint: title,
    });

    // `search_files` produces a LIST of matching paths — route it to the
    // dedicated search-results pane (not the file editor). Everything else
    // (read_file and file-content tools) opens the read-only tool-result
    // viewer over the snapshotted content.
    const appType = detail.name === "search_files" ? "search-results" : "tool-result";

    // Set the pending context so the controller mount picks it up, then
    // open an UNPINNED (preview) tab in the next cell.
    (window as unknown as Record<string, unknown>).__pendingToolResult = {
      toolName: detail.name ?? "tool",
      argsString: detail.arguments ?? "",
      result: detail.result ?? "",
      hint: title,
    };
    log.info("open tool result", title, "next-cell", appType);
    this._commandBus!.dispatch(
      "openTabInNextCell",
      myWindowId,
      chatTabId,
      appType,
      title,
      config,
      false, // unpinned
    );
  }

  /**
   * Open a file selected from a search-results pane in the editor, in the
   * cell immediately to the right of the results pane (creating that cell if
   * it is the rightmost one).
   */
  handleOpenSearchResultFile(e: CustomEvent): void {
    const detail = (e.detail ?? {}) as { sourceTabId?: string; path?: string };
    const sourceTabId = detail.sourceTabId;
    const filePath = detail.path;
    if (!sourceTabId || !filePath) return;

    const myWindowId = window.openp41ge.workspace.getWindowId();
    if (!myWindowId) {
      log.warn("open-search-result-file skipped — no window context");
      return;
    }
    const name = filePath.split("/").filter(Boolean).pop() || filePath;
    log.info("open search result file", filePath, "next-cell");
    this._commandBus!.dispatch(
      "openTabInNextCell",
      myWindowId,
      sourceTabId,
      "file-viewer",
      name,
      filePath,
      false, // unpinned preview
    );
  }

  /** Friendly tab title for a tool result, e.g. `read_file · src/a.ts`. */
  private _titleForTool(name: string | undefined, argumentsStr?: string): string {
    const label = name || "tool";
    let args: Record<string, unknown> = {};
    try {
      args = argumentsStr ? JSON.parse(argumentsStr) : {};
    } catch {
      args = {};
    }
    const path = typeof args.path === "string" ? args.path : undefined;
    const query = typeof args.query === "string" ? args.query : undefined;
    if (path) {
      const short = path.split("/").filter(Boolean).pop() || path;
      return `${label} · ${short}`;
    }
    if (query) return `${label} · "${query}"`;
    return label;
  }

  private _getLastActiveCellCol(): number {
    const myWindowId = window.openp41ge.workspace.getWindowId();
    if (!myWindowId) return 0;
    const col = Openp41geTabsEventHandler.getLastFocusedCol(myWindowId);
    const ws = this._workspaceState?.getWorkspace();
    if (ws) {
      const win = ws.windows.find((w) => w.id === myWindowId);
      if (win) {
        const hasCol = win.grid.placements.some(
          (p) => p.position.row === 0 && p.position.col === col,
        );
        if (hasCol) return col;
        const fallback = win.grid.placements.find((p) => p.position.row === 0);
        if (fallback) return fallback.position.col;
      }
    }
    return 0;
  }

  private _findChatTabInCell(chatId: string, col: number): string | null {
    const ws = this._workspaceState?.getWorkspace();
    if (!ws) return null;
    const myWindowId = window.openp41ge.workspace.getWindowId();
    const win = ws.windows.find((w) => w.id === myWindowId);
    if (!win) return null;

    const pl = win.grid.placements.find((p) => p.position.row === 0 && p.position.col === col);
    if (!pl) return null;

    const tabs = ws.editorTabs as Record<string, Tab | undefined>;
    for (const tabId of pl.tabIds) {
      const tab = tabs[tabId];
      if (tab && tab.appType === "agents" && tab.config?.chatId === chatId) {
        return tabId;
      }
    }
    return null;
  }

  private _getTab(tabId: string): Tab | null {
    const ws = this._workspaceState?.getWorkspace();
    if (!ws) return null;
    const tabs = ws.editorTabs as Record<string, Tab | undefined>;
    return tabs[tabId] ?? null;
  }
}
