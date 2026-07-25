/**
 * Command bus — abstraction over workspace dispatch.
 *
 * Encapsulates the IPC dispatch mechanism so components don't
 * depend on window.openp41ge.workspace.dispatch directly.
 */

export interface ICommandBus {
  /**
   * Dispatch a named operation with arguments.
   * The operation is applied to the workspace state in the main process.
   */
  dispatch(fn: string, ...args: unknown[]): void;
}
