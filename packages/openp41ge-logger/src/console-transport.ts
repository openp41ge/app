/**
 * console-transport.ts — bus → console.
 *
 * Subscribes to the global log bus and replays every captured entry to the
 * browser/Node console, preserving the original call shape so source-mapped
 * stacks and DevTools filtering keep working.
 *
 * Debug entries only reach the console when a debug session is enabled (the
 * bus drops them below the capture threshold), matching the rule that debug
 * content is captured only while enabled.
 *
 * Installed automatically when `logger.ts` (and therefore `createLogger`)
 * is imported.
 */

import { LogLevel, LOG_LEVEL_LABELS, subscribeLogs } from "./log-buffer";

const LOG_METHODS: Record<LogLevel, keyof Console> = {
  [LogLevel.DEBUG]: "debug",
  [LogLevel.INFO]: "info",
  [LogLevel.WARN]: "warn",
  [LogLevel.ERROR]: "error",
};

let _installed = false;

/** Register the default console transport exactly once. */
export function installConsoleTransport(): void {
  if (_installed) return;
  _installed = true;

  subscribeLogs((entry) => {
    if (!entry) return; // buffer cleared — nothing to replay
    const method = LOG_METHODS[entry.level];
    const prefix = `[${entry.name}]`;
    const args = entry.args && entry.args.length > 0 ? entry.args : [entry.message];
    const fn = (console as unknown as Record<string, unknown>)[method];
    if (typeof fn === "function") {
      (fn as (...a: unknown[]) => void).apply(console, [prefix, ...args]);
    }
  });
}

export { LOG_LEVEL_LABELS };
