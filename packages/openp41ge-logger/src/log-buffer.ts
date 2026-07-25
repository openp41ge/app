/**
 * log-buffer.ts — Global log buffer shared across all logger instances.
 *
 * Every log entry is pushed to a central buffer that the
 * <openp41ge-log-viewer> component subscribes to for rendering.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  name: string;
  text: string;
}

/** Human-readable label for each level. */
export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

// ── Global buffer (module-level singleton) ──

const _buffer: LogEntry[] = [];
let _nextId = 0;
const _listeners = new Set<() => void>();

const MAX_LOG_ENTRIES = 10_000;

/**
 * Push a new entry to the global log buffer.
 * Notifies all subscribed listeners.
 */
export function pushLog(level: LogLevel, name: string, args: unknown[]): void {
  const text = args.map((a) => (typeof a === "object" ? _tryStringify(a) : String(a))).join(" ");
  const entry: LogEntry = { id: _nextId++, timestamp: Date.now(), level, name, text };
  _buffer.push(entry);

  // Trim oldest entries when buffer exceeds capacity
  if (_buffer.length > MAX_LOG_ENTRIES) {
    _buffer.splice(0, _buffer.length - MAX_LOG_ENTRIES);
  }

  for (const listener of _listeners) {
    try {
      listener();
    } catch {
      // Silently ignore listener errors to avoid cascading failures
    }
  }
}

function _tryStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

/** Return a snapshot of the current log buffer. */
export function getLogBuffer(): readonly LogEntry[] {
  return [..._buffer];
}

/** Clear all log entries. */
export function clearLogBuffer(): void {
  _buffer.length = 0;
  for (const listener of _listeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

/**
 * Subscribe to log buffer changes.
 * Returns an unsubscribe function.
 */
export function subscribeLogs(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}
