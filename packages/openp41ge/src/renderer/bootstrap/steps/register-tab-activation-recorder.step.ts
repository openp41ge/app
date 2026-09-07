/**
 * RegisterTabActivationRecorderStep — records *new* tab activations into
 * TabActivationHistory.
 *
 * Tab clicks and "activate an existing tab" actions are recorded at the point
 * of dispatch (grid-activate in Openp41geTabsEventHandler, and activateTabInCell
 * in CommandBus). This step covers the one activation that cannot be known at
 * dispatch time: opening a **brand-new** tab, because the new tab id is only
 * generated in the main process and only becomes visible once the workspace
 * state updates.
 *
 * It observes the workspace state and records tabs that newly appear. Crucially
 * it does NOT record active-tab *switches* — closing a tab sets the survivor
 * active, and back/forward navigation also changes the active tab, neither of
 * which is a fresh activation. The very first state observation is used only as
 * a baseline so a restored workspace is not seeded into the history.
 */

import type { IStartupStep } from "../startup-step";
import type { StartupContext } from "../startup-context";
import type { Workspace } from "../../../layout/types";
import { TabActivationHistory } from "../../services/tab-activation-history";

export class RegisterTabActivationRecorderStep implements IStartupStep {
  readonly name = "register-tab-activation-recorder";

  private _knownTabs = new Set<string>();
  private _initialised = false;

  async run(context: StartupContext): Promise<void> {
    // Window-manager windows have no grid tabs to activate.
    if (context.windowType === "window-manager") return;

    context.workspaceState.subscribe((ws) => {
      this._observe(context, ws);
    });
  }

  private _windowId(context: StartupContext): string | null {
    return context.windowId ?? window.openp41ge?.workspace?.getWindowId?.() ?? null;
  }

  private _observe(context: StartupContext, ws: Workspace): void {
    const winId = this._windowId(context);
    if (!winId) return;

    const win = ws.windows.find((w) => w.id === winId);
    if (!win) return;

    const openTabs = new Set<string>();
    for (const pl of win.grid.placements) {
      for (const id of pl.tabIds) openTabs.add(id as string);
    }

    const isFirst = !this._initialised;
    this._initialised = true;

    // Baseline on first observation — don't seed history from a restored
    // workspace (or a fresh empty grid).
    if (isFirst) {
      this._knownTabs = openTabs;
      return;
    }

    // Prune tabs that were closed from the history.
    for (const t of this._knownTabs) {
      if (!openTabs.has(t)) TabActivationHistory.remove(winId, t);
    }

    // Record newly-appeared tabs (user-opened). A new tab is never a side
    // effect of a close, so this is always a genuine activation.
    for (const tabId of openTabs) {
      if (!this._knownTabs.has(tabId)) {
        TabActivationHistory.pushActivation(winId, tabId);
      }
    }

    this._knownTabs = openTabs;
  }
}
