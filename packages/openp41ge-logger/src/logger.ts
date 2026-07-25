/**
 * logger.ts — Logger interface and factory.
 *
 * Usage:
 *   import { createLogger } from "openp41ge-logger";
 *   const log = createLogger("my-module");
 *   log.error("Something went wrong:", err);
 */

import { LogLevel, pushLog } from "./log-buffer";

export interface ILogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// ── Factory ──

/**
 * Create a named logger instance.
 *
 * Each call writes to:
 *   1. The global log buffer (for <openp41ge-log-viewer>)
 *   2. The browser console (for developer tooling)
 *      via the matching console method so source-mapped stacks are preserved.
 */
export function createLogger(name: string): ILogger {
  const prefix = `[${name}]`;

  function emit(
    level: LogLevel,
    consoleFn: (...args: unknown[]) => void,
    ...args: unknown[]
  ): void {
    pushLog(level, name, args);
    consoleFn(prefix, ...args);
  }

  return {
    debug(...args: unknown[]) {
      emit(LogLevel.DEBUG, console.debug, ...args);
    },
    info(...args: unknown[]) {
      emit(LogLevel.INFO, console.info, ...args);
    },
    warn(...args: unknown[]) {
      emit(LogLevel.WARN, console.warn, ...args);
    },
    error(...args: unknown[]) {
      emit(LogLevel.ERROR, console.error, ...args);
    },
  };
}

/** A no-op logger for tests or silent mode. */
export function createNoopLogger(): ILogger {
  return {
    debug() {
      /* noop */
    },
    info() {
      /* noop */
    },
    warn() {
      /* noop */
    },
    error() {
      /* noop */
    },
  };
}
