/**
 * Fetch the initial workspace state from the main process.
 *
 * The UI has already been rendered (empty, waiting for data).
 * This step fetches the state and publishes it to the workspace state manager,
 * which triggers a re-render via the subscriber registered in step 6.
 *
 * If this fails, the UI stays in its empty state until a state update arrives
 * via the IPC subscription (step 6).
 *
 * Window ID resolution:
 *   - The openp41ge:init IPC (which sets _windowId in the preload) fires on
 *     did-finish-load, AFTER deferred module scripts execute.
 *   - The state fetch (getState) works either way — it returns the cached
 *     initial state if init arrived, or fires a fresh IPC call.
 *   - But getWindowId() returns null until init arrives.
 *   - We must await waitForInit() before resolving windowId, otherwise the
 *     fallback uses ws.windows[0].id and the WRONG window's data is rendered.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import type { Workspace } from "../../../layout/types";
import { createLogger } from "openp41ge-logger";

const log = createLogger("bootstrap:fetch-initial-state");

export class FetchInitialStateStep implements IStartupStep {
  readonly name = "fetch-initial-state";

  async run(context: StartupContext): Promise<void> {
    // If a project was selected via the CheckProjectStep, the main process
    // already switched state via project:switch. We need a fresh fetch to get
    // the updated state, not the pre-started promise (which fired before
    // project selection).
    const projectSelected = !!window.__openp41geProjectName;
    const statePromise = projectSelected
      ? window.openp41ge.workspace.getState()
      : (context.initialStatePromise ?? window.openp41ge.workspace.getState());

    // Fire state fetch AND waitForInit in parallel — the state fetch
    // might already have the data (via cached initial state) while
    // waitForInit ensures windowId is ready.
    const [json] = await Promise.all([
      statePromise,
      window.openp41ge.workspace.waitForInit(),
    ]);
    const ws: Workspace = JSON.parse(json);

    // Resolve window ID — waitForInit ensures getWindowId() is ready.
    // Fall through to the first-window fallback only if getWindowId()
    // somehow still returns null or the ID doesn't match (defensive).
    const rawId = window.openp41ge.workspace.getWindowId();
    let windowId: string | null = null;

    if (rawId && ws.windows.find((w) => w.id === rawId)) {
      windowId = rawId;
    } else {
      log.warn("window ID not resolved yet, using first window");
      if (ws.windows.length > 0) {
        windowId = ws.windows[0].id;
      }
    }

    context.initialWorkspace = ws;
    context.windowId = windowId;

    // Publish state — this triggers the render subscriber
    if (windowId) {
      context.workspaceState.setState(ws);
    }

    log.info("initial state received, window:", windowId);
  }
}
