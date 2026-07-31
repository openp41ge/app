import type { HandlerFn } from "../services/event-router";
import type { AppState } from "../services/app-state";

/**
 * Focus-state handlers for the core event system.
 *
 * These are registered with the EventRouter and dispatched when matching
 * graph edges fire. Each handler updates a single slice of AppState.
 */

export function createFocusHandlers(state: AppState): Record<string, HandlerFn> {
  return {
    "focus/set-focused": async () => {
      state.windowFocused = true;
    },

    "focus/set-blurred": async () => {
      state.windowFocused = false;
      state.focusedSide = null;
    },

    "focus/set-sidebar-right": async () => {
      state.focusedSide = "right";
    },

    "focus/set-sidebar-left": async () => {
      state.focusedSide = "left";
    },

    "focus/clear-sidebar": async () => {
      state.focusedSide = null;
    },
  };
}
