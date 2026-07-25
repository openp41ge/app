import type { ICommandBus } from "../interfaces/command-bus";

/**
 * Command bus implementation — dispatches operations via the Electron preload bridge.
 */
export class CommandBus implements ICommandBus {
  dispatch(fn: string, ...args: unknown[]): void {
    window.openp41ge.workspace.dispatch(fn, ...args);
  }
}
