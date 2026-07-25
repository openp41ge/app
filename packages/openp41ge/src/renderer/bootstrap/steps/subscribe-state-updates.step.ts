/**
 * Subscribe to workspace state updates from the main process.
 *
 * Two subscriptions:
 *   1. IPC subscription: receives state updates pushed from the main process
 *      (e.g., after another window makes a change) and updates the local state.
 *   2. Render subscription: calls _render() whenever workspace state changes.
 *
 * The render subscription MUST be registered before any setState() call so
 * that the initial render happens deterministically.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import { isOpenp41geWindowview } from "../../interfaces/element-guards";
import type { Openp41geWindowviewElement } from "../../interfaces/element-guards";
import { createLogger } from "openp41ge-logger";

const log = createLogger("bootstrap:subscribe-state-updates");

export class SubscribeStateUpdatesStep implements IStartupStep {
  readonly name = "subscribe-state-updates";

  async run(context: StartupContext): Promise<void> {
    // Subscribe to state updates from main process
    window.openp41ge.workspace.onStateUpdate((stateJson: string) => {
      context.workspaceState.setState(JSON.parse(stateJson));
    });

    // Subscribe to state changes → render
    context.workspaceState.subscribe((_ws) => {
      this._render(context);
    });

    log.info("state update subscriptions registered");
  }

  /** Render the current workspace state into the DOM. */
  private _render(context: StartupContext): void {
    const root = document.getElementById("root");
    const ws = context.workspaceState.getWorkspace();
    if (!root || !ws) return;

    // Resolve window ID: prefer the one from FetchInitialStateStep, fall back
    // to polling the preload bridge (which gets set via the openp41ge:init IPC
    // message on did-finish-load).
    let windowId = context.windowId;
    if (!windowId) {
      windowId = window.openp41ge.workspace.getWindowId();
    }
    // Final fallback: first window in workspace (always correct for single window)
    if (!windowId && ws.windows.length > 0) {
      windowId = ws.windows[0].id;
    }

    const myWindow = windowId ? ws.windows.find((w) => w.id === windowId) : null;

    if (!myWindow) {
      log.warn("window not found for id:", windowId);
      return;
    }

    root.dataset.workspace = JSON.stringify(ws);

    // Find existing element (mounted by _mountUI) or create one
    let el = root.querySelector("openp41ge-windowview");
    if (!el) {
      const created = document.createElement("openp41ge-windowview");
      if (!isOpenp41geWindowview(created)) {
        log.error("failed to create openp41ge-windowview element");
        return;
      }
      root.appendChild(created);
      el = created;
    }

    (el as Openp41geWindowviewElement).windowData = myWindow;
    (el as Openp41geWindowviewElement).workspaceData = ws;
    (el as Openp41geWindowviewElement).layouts = context.workspaceState.getLayouts();
  }
}
