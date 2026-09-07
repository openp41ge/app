import type { ICommandBus } from "../interfaces/command-bus";
import { TabActivationHistory } from "./tab-activation-history";

/**
 * Command bus implementation — dispatches operations via the Electron preload bridge.
 *
 * It also records tab activations: `activateTabInCell` is the single canonical
 * "make a tab active" operation, so recording here covers every source of a
 * switch (clicking a tab, double-clicking an already-open file/commit/chat,
 * opening from the tree, etc.) in one place. Because history playback
 * (Back/Forward) sets the current tab *before* dispatching `activateTabInCell`,
 * re-pushing is a safe no-op there.
 */
export class CommandBus implements ICommandBus {
  dispatch(fn: string, ...args: unknown[]): void {
    if (fn === "activateTabInCell" && typeof args[0] === "string" && typeof args[1] === "string") {
      TabActivationHistory.pushActivation(args[0], args[1]);
    }
    window.openp41ge.workspace.dispatch(fn, ...args);
  }
}
