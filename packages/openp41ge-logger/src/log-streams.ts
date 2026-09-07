/**
 * log-streams.ts — registry of log streams, each belonging to a system.
 *
 * A stream is the logger namespace within a **system** (a plugin id or an
 * internal subsystem). It is registered the first time it actually emits a
 * stored log entry (see `logger.ts` emitters), so the Logs sidebar lists
 * streams that have produced logs — not every declared namespace. The registry
 * stores only names + registration order; entry counts and last-timestamps are
 * derived live from the global log buffer (single source of truth).
 */

import { getLogBuffer } from "./log-buffer";

export interface LogStreamInfo {
  /** The system (plugin id / subsystem) this stream belongs to. */
  system: string;
  /** Logger namespace (the `source` of the stream's entries). */
  name: string;
  /** Number of buffered log entries emitted by this stream. */
  entryCount: number;
  /** Timestamp of the stream's most recent entry, or null if none yet. */
  lastTs: number | null;
}

type StreamListener = () => void;

interface StreamKey {
  system: string;
  name: string;
}

const _streams = new Map<string, StreamKey>(); // `${system}\u0000${name}` -> key
let _streamOrder = 0;
const _order = new Map<string, number>(); // `${system}\u0000${name}` -> registration order
const _listeners = new Set<StreamListener>();

function _key(system: string, name: string): string {
  return `${system}\u0000${name}`;
}

/** Register a log stream (idempotent). Notifies subscribers on first registration. */
export function registerLogStream(system: string, name: string): void {
  if (!name || !name.trim()) return;
  const k = _key(system, name);
  if (!_streams.has(k)) {
    _streams.set(k, { system, name });
    _order.set(k, _streamOrder++);
    for (const fn of _listeners) fn();
  }
}

/** Remove a stream from the registry. Notifies subscribers. */
export function unregisterLogStream(system: string, name: string): void {
  const k = _key(system, name);
  if (_streams.delete(k)) {
    _order.delete(k);
    for (const fn of _listeners) fn();
  }
}

/**
 * List all registered streams in registration order, each with its live
 * entry count + most-recent timestamp (derived from the log buffer).
 */
export function listLogStreams(): LogStreamInfo[] {
  const counts = new Map<string, number>();
  const lastTs = new Map<string, number>();
  for (const e of getLogBuffer()) {
    const k = _key(e.system, e.source);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    lastTs.set(k, e.timestamp);
  }

  return Array.from(_streams.entries())
    .sort((a, b) => (_order.get(a[0]) ?? 0) - (_order.get(b[0]) ?? 0))
    .map(([k, value]) => {
      const c = counts.get(k);
      return {
        system: value.system,
        name: value.name,
        entryCount: c ?? 0,
        lastTs: c ? (lastTs.get(k) ?? null) : null,
      };
    });
}

/** Subscribe to stream registration/unregistration. Returns unsubscribe. */
export function subscribeLogStreams(listener: StreamListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/** Reset all registry state (for tests). */
export function _resetLogStreams(): void {
  _streams.clear();
  _order.clear();
  _streamOrder = 0;
  _listeners.clear();
}
