/**
 * logger.ts — Logger interface and factory.
 *
 * Usage:
 *   import { createLogger } from "openp41ge-logger";
 *   const log = createLogger("my-module");
 *   log.error("Something went wrong:", err);
 *
 * Every call writes a structured entry to the global log bus (log-buffer.ts),
 * which fans out to the in-memory ring buffer, the log viewer / debug overlay,
 * the console (console-transport.ts), and — via the platform transports — the
 * on-disk files under ~/.openp41ge/logs/.
 *
 * Structured data: if the LAST argument is a plain object (not an array,
 * Error, Date, etc.), it is detached as the entry's structured `data` payload
 * (queryable + persisted as JSON):
 *
 *   log.debug("mousemove", { x: 12, y: 340, isBoundary: true });
 *   // entry.message === 'mousemove {"x":12,"y":340,"isBoundary":true}'
 *   // entry.data    === { x: 12, y: 340, isBoundary: true }
 *
 * Levels: INFO/WARN/ERROR are always captured; DEBUG is captured only while a
 * debug session is enabled (setMinLevel(LogLevel.DEBUG)).
 */

import { LogLevel, pushLog } from "./log-buffer";
import { installConsoleTransport } from "./console-transport";

export interface ILogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// ── Console transport is the default sink — installed once on first import ──
installConsoleTransport();

// ── Factory ──

/**
 * True when `v` looks like a structured-data payload: a plain object, not an
 * array / Error / Date / RegExp / etc. The last such argument becomes the
 * entry's `data`.
 */
function isDataCandidate(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  if (v instanceof Error || v instanceof Date || v instanceof RegExp) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Create a named logger instance.
 *
 * Each call writes to:
 *   1. The global log bus (in-memory buffer + transports: log viewer,
 *      debug overlay, IPC → disk files)
 *   2. The browser/Node console, replayed by the console transport with the
 *      original arguments so source-mapped stacks are preserved.
 */
export function createLogger(name: string): ILogger {
  function emit(level: LogLevel, ...args: unknown[]): void {
    let data: Record<string, unknown> | undefined;
    if (args.length >= 2 && isDataCandidate(args[args.length - 1])) {
      data = args[args.length - 1] as Record<string, unknown>;
    }
    // Pass the full original args so the console replay preserves the exact
    // developer call (including the data object); the detached `data` payload
    // stays queryable / persisted separately.
    pushLog(level, name, args, data);
  }

  return {
    debug(...args: unknown[]) {
      emit(LogLevel.DEBUG, ...args);
    },
    info(...args: unknown[]) {
      emit(LogLevel.INFO, ...args);
    },
    warn(...args: unknown[]) {
      emit(LogLevel.WARN, ...args);
    },
    error(...args: unknown[]) {
      emit(LogLevel.ERROR, ...args);
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
