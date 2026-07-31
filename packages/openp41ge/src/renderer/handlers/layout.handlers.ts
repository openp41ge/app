import type { HandlerFn } from "../services/event-router";
import type { ICommandBus } from "../interfaces/command-bus";

/**
 * Layout operation handlers for the event system.
 */
export function createLayoutHandlers(commandBus: ICommandBus): Record<string, HandlerFn> {
  return {
    "layout/toggle-sidebar": async (payload) => {
      const { windowId, side } = payload;
      commandBus.dispatch("toggleSidebar", windowId, side);
    },

    "layout/open-sidebar": async (payload) => {
      const { windowId, side, appType } = payload;
      commandBus.dispatch("openSidebar", windowId, side, appType);
    },

    "layout/set-sidebar-width": async (payload) => {
      const { side, width } = payload;
      // Sidebar width is persisted to localStorage, no IPC needed
      localStorage.setItem(`openp41ge:sidebar-width-${side}`, String(width));
    },
  };
}
