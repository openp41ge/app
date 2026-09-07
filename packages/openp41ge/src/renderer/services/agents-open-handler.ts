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
    // The tab handle reads "Agents" (not the chat's title); the pane itself loads
    // the chat by chatId and shows its own header/title.
    (window as unknown as Record<string, unknown>).__pendingChatId = chatId;
    log.info("open chat tab", chatId, pinned ? "pinned" : "unpinned");
    this._commandBus!.dispatch(
      "actionOpenFile",
      myWindowId,
      "agents",
      "Agents",
      chatId,
      targetCol,
      pinned,
      detail.cwd ? { chatId, cwd: detail.cwd } : { chatId },
    );
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
