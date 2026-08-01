import type { HandlerFn } from "../services/event-router";
import type { ICommandBus } from "../interfaces/command-bus";

/**
 * Tab operation handlers for the event system.
 *
 * These are registered with the EventRouter and dispatched when matching
 * graph edges fire. Each handler calls the CommandBus to dispatch IPC
 * operations to the main process.
 */
export function createTabHandlers(commandBus: ICommandBus): Record<string, HandlerFn> {
  return {
    "tabs/open-system-tab": async (payload) => {
      const { windowId, side, appType, title } = payload;
      commandBus.dispatch("openSystemTab", windowId, side, appType, title);
    },

    "tabs/activate-tab": async (payload) => {
      const { windowId, side, tabId } = payload;
      commandBus.dispatch("activateSystemTab", windowId, side, tabId);
    },

    "tabs/close-tab": async (payload) => {
      const { windowId, side, tabId, force } = payload;
      commandBus.dispatch("closeSystemTab", windowId, side, tabId, force ?? true);
    },

    "tabs/pin-tab": async (payload) => {
      const { tabId, pinned } = payload;
      commandBus.dispatch("pinSystemTab", tabId, pinned);
    },

    "tabs/open-in-cell": async (payload) => {
      const { windowId, appType, title, config, col, insertBefore, replaceExisting } = payload;
      commandBus.dispatch("openTabInCell", windowId, appType, title, config, col, insertBefore, replaceExisting);
    },

    "tabs/remove-from-cell": async (payload) => {
      const { windowId, paneId } = payload;
      commandBus.dispatch("removeTabFromCell", windowId, paneId);
    },

    "tabs/remove-column-tab": async (payload) => {
      const { windowId, tabId } = payload;
      commandBus.dispatch("removeColumnTab", windowId, tabId);
    },

    "tabs/add-column-tab-at": async (payload) => {
      const { windowId, appType, title, label, col } = payload;
      commandBus.dispatch("addColumnTabAt", windowId, appType, title, label, col);
    },

    "layout/resize-grid": async (payload) => {
      const { windowId, paneWinId, cols } = payload;
      commandBus.dispatch("resizeGrid", windowId, paneWinId, 1, cols);
    },

    // ── Editor System Tab Handlers ──────────────────────────────────

    "system-tabs/open-tab": async (payload) => {
      const { windowId, appType } = payload;
      commandBus.dispatch("openEditorSystemTab", windowId, appType);
      // Expand the bottom pane when a system tab is opened
      const wv = document.querySelector("openp41ge-windowview");
      if (wv) {
        wv.dispatchEvent(new CustomEvent("bp-expand", { bubbles: true, composed: true }));
      }
    },

    "system-tabs/close-tab": async (payload) => {
      const { windowId, tabId } = payload;
      commandBus.dispatch("closeEditorSystemTab", windowId, tabId);
    },

    "system-tabs/activate-tab": async (payload) => {
      const { windowId, tabId } = payload;
      commandBus.dispatch("activateEditorSystemTab", windowId, tabId);
      // Expand the bottom pane when a system tab is activated
      const wv = document.querySelector("openp41ge-windowview");
      if (wv) {
        wv.dispatchEvent(new CustomEvent("bp-expand", { bubbles: true, composed: true }));
      }
    },

    "system-tabs/reorder-tabs": async (payload) => {
      const { windowId, tabId, targetIndex } = payload;
      commandBus.dispatch("reorderEditorSystemTabs", windowId, tabId, targetIndex);
    },
  };
}
