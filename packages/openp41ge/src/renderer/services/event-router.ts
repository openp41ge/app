import type { EventGraph, GraphEdge } from "./event-graph";
import type { AppState } from "./app-state";
import type { EventLogBuffer } from "./event-log-buffer";

export type HandlerFn = (payload: any) => Promise<void>;

export interface RouterConfig {
  graph: EventGraph;
  state: AppState;
  logBuffer: EventLogBuffer;
  handlers: Record<string, HandlerFn>;
}

/**
 * Event router — the core of the event system.
 *
 * Receives events (from DOMBridge or programmatic calls), traverses the
 * graph to find matching edges (by event type + state predicate), and
 * dispatches to the configured handlers in order.
 *
 * Handlers are terminal: they never emit events. No cycles.
 */
export class EventRouter {
  private _graph: EventGraph;
  private _state: AppState;
  private _logBuffer: EventLogBuffer;
  private _handlers: Record<string, HandlerFn>;

  constructor(config: RouterConfig) {
    this._graph = config.graph;
    this._state = config.state;
    this._logBuffer = config.logBuffer;
    this._handlers = config.handlers;
  }

  /** Register a handler (called at bootstrap by core and plugins). */
  registerHandler(id: string, fn: HandlerFn): void {
    if (this._handlers[id]) {
      console.warn(`[EventRouter] Overwriting existing handler "${id}".`);
    }
    this._handlers[id] = fn;
  }

  /**
   * Emit an event through the graph.
   *
   * 1. Finds edges matching the event type
   * 2. Evaluates each edge's when predicate against current AppState
   * 3. Picks the first matched edge
   * 4. Dispatches to each target handler in order
   * 5. Logs the dispatch with state snapshot and timing
   */
  async emit(eventType: string, payload: any): Promise<void> {
    const sourceFile = this._captureSourceFile();
    const stateBefore = this._state.snapshot();
    const edges = this._graph.findEdges(eventType);

    // Find first matching edge
    const matchedEdge = this._findMatchingEdge(edges) ?? null;

    // Dispatch handlers
    const handlerResults: { handlerId: string; duration: number; error?: string }[] = [];
    const startTime = performance.now();

    if (matchedEdge) {
      for (const handlerId of matchedEdge.to) {
        const handler = this._handlers[handlerId];
        if (!handler) {
          handlerResults.push({ handlerId, duration: 0, error: `Handler "${handlerId}" not registered.` });
          continue;
        }
        const handlerStart = performance.now();
        try {
          await handler(payload);
          handlerResults.push({ handlerId, duration: performance.now() - handlerStart });
        } catch (err: any) {
          handlerResults.push({ handlerId, duration: performance.now() - handlerStart, error: err.message ?? String(err) });
        }
      }
    }

    const totalDuration = performance.now() - startTime;

    // Notify AppState observers after batch update
    this._state.notify();

    // Log the dispatch
    this._logBuffer.append({
      eventType,
      payload,
      matchedEdge: matchedEdge
        ? { id: matchedEdge.id, from: matchedEdge.from, when: matchedEdge.when, to: matchedEdge.to }
        : null,
      handlerResults,
      totalDuration,
      stateSnapshot: { ...stateBefore },
      sourceFile,
    });
  }

  private _findMatchingEdge(edges: GraphEdge[]): GraphEdge | undefined {
    for (const edge of edges) {
      if (!edge.when || Object.keys(edge.when).length === 0) {
        return edge; // No predicate = always matches
      }
      if (this._matchesPredicate(edge.when)) {
        return edge;
      }
    }
    return undefined;
  }

  private _matchesPredicate(when: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(when)) {
      const stateValue = (this._state as any)[key];
      if (stateValue !== value) return false;
    }
    return true;
  }

  private _captureSourceFile(): string {
    try {
      const stack = new Error().stack;
      if (!stack) return "";
      const lines = stack.split("\n");
      // Find the first non-router caller
      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes("event-router")) continue;
        if (line.includes("EventRouter")) continue;
        return line.replace(/^at\s+/, "");
      }
      return lines[2]?.trim()?.replace(/^at\s+/, "") ?? "";
    } catch {
      return "";
    }
  }
}
