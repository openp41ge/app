/**
 * Workspace operation dispatcher.
 *
 * Applies operations from operations.ts to the workspace state
 * and broadcasts changes to all open windows.
 */

import type { Workspace } from "../../layout/types.js";

export type BroadcastFn = (serialized: string) => void;

export interface IOperationDispatcher {
  /** Apply a named operation with arguments. Returns true on success. */
  apply(name: string, args: unknown[]): boolean;

  /** Get the current workspace state. */
  getWorkspace(): Workspace;

  /** Set the workspace state (used during initialization). */
  setWorkspace(ws: Workspace): void;

  /** Register a broadcast callback for state updates. */
  setBroadcast(fn: BroadcastFn): void;

  /** Register a callback for terminal cleanup on pane removal. */
  setTerminalCleanup(fn: (paneId: string) => void): void;

  /** Register a callback invoked after every successful apply(). */
  setSaveHandler(fn: (ws: Workspace) => void): void;
}
