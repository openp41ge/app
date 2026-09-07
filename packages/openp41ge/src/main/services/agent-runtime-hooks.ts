/**
 * AgentRuntimeHooks — the IPC fan-out seam the AgentRuntime needs.
 *
 * The runtime stays Electron-free by depending on these two callbacks instead
 * of importing `electron` or the window manager. The main process wires the
 * real implementations when it constructs the runtime.
 */

export interface AgentRuntimeHooks {
  /** Send an event to a specific window (the chat's owner). */
  sendToWindow(winId: string, event: string, payload: unknown): void;
  /** Broadcast an event to every open window. */
  broadcast(event: string, payload: unknown): void;
}
