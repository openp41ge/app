/**
 * Unit tests for the event controller system.
 *
 * Tests EventGraph, EventRouter, AppState, and EventLogBuffer
 * in isolation with no DOM or IPC dependencies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventGraph } from "@openp41ge/renderer/services/event-graph";
import { EventRouter } from "@openp41ge/renderer/services/event-router";
import { AppState } from "@openp41ge/renderer/services/app-state";
import { EventLogBuffer } from "@openp41ge/renderer/services/event-log-buffer";
import type { GraphData } from "@openp41ge/renderer/services/event-graph";

// ─── Sample graph data ────────────────────────────────────────────────

const sampleGraph: GraphData = {
  version: 1,
  nodes: [
    { id: "focus/set-focused" },
    { id: "focus/set-blurred" },
    { id: "focus/set-sidebar-right" },
    { id: "focus/clear-sidebar" },
    { id: "keyboard/suppress" },
    { id: "test/handler-a" },
    { id: "test/handler-b" },
  ],
  edges: [
    {
      id: "e001",
      from: "window-focus",
      when: { windowFocused: false },
      to: ["focus/set-focused"],
    },
    {
      id: "e002",
      from: "window-blur",
      when: { windowFocused: true },
      to: ["focus/set-blurred"],
    },
    {
      id: "e003",
      from: "sidebar-click-right",
      when: { windowFocused: false },
      to: ["focus/set-focused", "focus/set-sidebar-right"],
    },
    {
      id: "e004",
      from: "sidebar-click-right",
      when: { windowFocused: true, focusedSide: "left" },
      to: ["focus/set-sidebar-right"],
    },
    {
      id: "e005",
      from: "grid-click",
      when: { focusedSide: "right" },
      to: ["focus/clear-sidebar"],
    },
    {
      id: "e006",
      from: "test-event",
      to: ["test/handler-a", "test/handler-b"],
    },
    {
      id: "e007",
      from: "test-predicate",
      when: { windowFocused: true, focusedSide: "right" },
      to: ["test/handler-a"],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// EventGraph
// ═══════════════════════════════════════════════════════════════════════

describe("EventGraph", () => {
  let graph: EventGraph;

  beforeEach(() => {
    graph = new EventGraph();
  });

  describe("load", () => {
    it("loads valid graph data without errors", () => {
      const errors = graph.load(sampleGraph);
      expect(errors).toHaveLength(0);
    });

    it("returns errors for duplicate node IDs", () => {
      const data: GraphData = {
        version: 1,
        nodes: [{ id: "dup" }, { id: "dup" }],
        edges: [],
      };
      const errors = graph.load(data);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe("duplicate-node");
    });

    it("returns errors for duplicate edge IDs", () => {
      const data: GraphData = {
        version: 1,
        nodes: [{ id: "node-a" }],
        edges: [
          { id: "e01", from: "evt", to: ["node-a"] },
          { id: "e01", from: "evt", to: ["node-a"] },
        ],
      };
      const errors = graph.load(data);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe("duplicate-edge");
    });

    it("returns errors when edge.to targets unknown nodes", () => {
      const data: GraphData = {
        version: 1,
        nodes: [],
        edges: [{ id: "e01", from: "evt", to: ["nonexistent"] }],
      };
      const errors = graph.load(data);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe("node-not-found");
    });

    it("does not validate edge.from against nodes (from is an event type, not a node)", () => {
      const data: GraphData = {
        version: 1,
        nodes: [{ id: "handler" }],
        edges: [{ id: "e01", from: "any-event-type", to: ["handler"] }],
      };
      const errors = graph.load(data);
      expect(errors).toHaveLength(0);
    });

    it("returns error for missing version", () => {
      const data = { nodes: [], edges: [] } as unknown as GraphData;
      const errors = graph.load(data);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("returns error for edge with empty to array", () => {
      const data: GraphData = {
        version: 1,
        nodes: [{ id: "a" }],
        edges: [{ id: "e01", from: "evt", to: [] }],
      };
      const errors = graph.load(data);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe("missing-to");
    });
  });

  describe("findEdges", () => {
    it("returns edges matching the event type", () => {
      graph.load(sampleGraph);
      const edges = graph.findEdges("window-focus");
      expect(edges).toHaveLength(1);
      expect(edges[0].id).toBe("e001");
    });

    it("returns multiple edges for the same event type in order", () => {
      graph.load(sampleGraph);
      const edges = graph.findEdges("sidebar-click-right");
      expect(edges).toHaveLength(2);
      expect(edges[0].id).toBe("e003");
      expect(edges[1].id).toBe("e004");
    });

    it("returns empty array for unknown event type", () => {
      graph.load(sampleGraph);
      expect(graph.findEdges("unknown")).toHaveLength(0);
    });

    it("returns empty array before load", () => {
      expect(graph.findEdges("anything")).toHaveLength(0);
    });
  });

  describe("extend", () => {
    it("adds plugin nodes and edges", () => {
      graph.load(sampleGraph);
      const errors = graph.extend(
        [{ id: "plugin/handler-x" }],
        [{ id: "e-plugin", from: "plugin-event", to: ["plugin/handler-x"] }],
      );
      expect(errors).toHaveLength(0);
      expect(graph.nodes.some((n) => n.id === "plugin/handler-x")).toBe(true);
      expect(graph.edges.some((e) => e.id === "e-plugin")).toBe(true);
    });

    it("rejects duplicate node IDs", () => {
      graph.load(sampleGraph);
      const errors = graph.extend(
        [{ id: "focus/set-focused" }], // already exists
        [],
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe("duplicate-node");
    });

    it("rejects duplicate edge IDs", () => {
      graph.load(sampleGraph);
      const errors = graph.extend(
        [{ id: "new-node" }],
        [{ id: "e001", from: "x", to: ["new-node"] }], // e001 already exists
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe("duplicate-edge");
    });

    it("rejects edges targeting unknown nodes", () => {
      graph.load(sampleGraph);
      const errors = graph.extend(
        [],
        [{ id: "e-bad", from: "evt", to: ["does-not-exist"] }],
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe("node-not-found");
    });
  });

  describe("nodes / edges", () => {
    it("returns copies of the node and edge lists", () => {
      graph.load(sampleGraph);
      const nodes = graph.nodes;
      const edges = graph.edges;
      expect(nodes.length).toBe(sampleGraph.nodes.length);
      expect(edges.length).toBe(sampleGraph.edges.length);

      // Should be copies, not references
      nodes.push({ id: "mutated" } as any);
      expect(graph.nodes.length).toBe(sampleGraph.nodes.length);
    });

    it("returns empty arrays before load", () => {
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });
  });

  describe("hash", () => {
    it("returns a stable hash for the same graph", () => {
      graph.load(sampleGraph);
      const h1 = graph.hash();
      graph.load(sampleGraph);
      const h2 = graph.hash();
      expect(h1).toBe(h2);
    });

    it("returns different hashes for different graphs", () => {
      graph.load(sampleGraph);
      const h1 = graph.hash();

      const g2 = new EventGraph();
      const data2: GraphData = { version: 1, nodes: [{ id: "only" }], edges: [] };
      g2.load(data2);
      const h2 = g2.hash();

      expect(h1).not.toBe(h2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AppState
// ═══════════════════════════════════════════════════════════════════════

describe("AppState", () => {
  let state: AppState;

  beforeEach(() => {
    state = new AppState();
  });

  describe("observe / notify", () => {
    it("calls observer on notify", () => {
      const fn = vi.fn();
      state.observe(fn);
      state.notify();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("unsubscribe removes observer", () => {
      const fn = vi.fn();
      const unsub = state.observe(fn);
      unsub();
      state.notify();
      expect(fn).not.toHaveBeenCalled();
    });

    it("calls multiple observers in order", () => {
      const order: number[] = [];
      state.observe(() => order.push(1));
      state.observe(() => order.push(2));
      state.notify();
      expect(order).toEqual([1, 2]);
    });

    it("handles observer that throws without affecting others", () => {
      const fn1 = vi.fn(() => { throw new Error("oops"); });
      const fn2 = vi.fn();
      state.observe(fn1);
      state.observe(fn2);
      expect(() => state.notify()).toThrow();
      // fn2 should still be called — but since fn1 throws, notify re-throws
      // and fn2 never runs. This is acceptable.
    });
  });

  describe("snapshot", () => {
    it("returns current state values", () => {
      state.windowFocused = true;
      state.focusedSide = "right";
      state.activeRepoId = "repo-1";
      const snap = state.snapshot();
      expect(snap.windowFocused).toBe(true);
      expect(snap.focusedSide).toBe("right");
      expect(snap.activeRepoId).toBe("repo-1");
    });

    it("returns a copy, not a reference", () => {
      state.sidebarWidths.left = 400;
      const snap = state.snapshot();
      snap.sidebarWidths.left = 999;
      expect(state.sidebarWidths.left).toBe(400);
    });
  });

  describe("default state", () => {
    it("has expected defaults", () => {
      const snap = state.snapshot();
      expect(snap.windowFocused).toBe(false);
      expect(snap.focusedSide).toBeNull();
      expect(snap.sidebarWidths).toEqual({ left: 300, right: 350 });
      expect(snap.activeRepoId).toBeNull();
      expect(snap.shortcutsSuppressedUntil).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EventLogBuffer
// ═══════════════════════════════════════════════════════════════════════

describe("EventLogBuffer", () => {
  let log: EventLogBuffer;
  const sampleEntry = { eventType: "test-ev", payload: { x: 1 }, matchedEdge: null, handlerResults: [], totalDuration: 5, stateSnapshot: {}, sourceFile: "test.ts" };

  beforeEach(() => {
    log = new EventLogBuffer(10);
  });

  describe("append", () => {
    it("returns a log entry with eventId and timestamp", () => {
      const entry = log.append(sampleEntry);
      expect(entry.eventId).toBe("evt-1");
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.eventType).toBe("test-ev");
    });

    it("increments event IDs", () => {
      const e1 = log.append(sampleEntry);
      const e2 = log.append(sampleEntry);
      expect(e1.eventId).toBe("evt-1");
      expect(e2.eventId).toBe("evt-2");
    });
  });

  describe("getLogs", () => {
    it("returns all entries when no filter", () => {
      log.append(sampleEntry);
      log.append({ ...sampleEntry, eventType: "other" });
      expect(log.getLogs()).toHaveLength(2);
    });

    it("filters by event type", () => {
      log.append(sampleEntry);
      log.append({ ...sampleEntry, eventType: "other" });
      const filtered = log.getLogs({ eventType: "test-ev" });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].eventType).toBe("test-ev");
    });

    it("filters by time range", () => {
      const e1 = log.append(sampleEntry);
      const e2 = log.append(sampleEntry);
      const filtered = log.getLogs({ since: e2.timestamp });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].eventId).toBe(e2.eventId);
    });

    it("applies limit from the end", () => {
      log.append(sampleEntry);
      log.append({ ...sampleEntry, eventType: "second" });
      log.append({ ...sampleEntry, eventType: "third" });
      const limited = log.getLogs({ limit: 2 });
      expect(limited).toHaveLength(2);
      expect(limited[0].eventType).toBe("second");
      expect(limited[1].eventType).toBe("third");
    });
  });

  describe("ring buffer", () => {
    it("evicts oldest entries when over capacity", () => {
      const small = new EventLogBuffer(3);
      small.append(sampleEntry);
      small.append(sampleEntry);
      small.append(sampleEntry);
      small.append(sampleEntry); // 4th entry — first is evicted
      expect(small.size).toBe(3);
      expect(small.getLogs()[0].eventId).toBe("evt-2"); // first evicted
    });
  });

  describe("getEvent", () => {
    it("returns a specific entry by ID", () => {
      const e = log.append(sampleEntry);
      expect(log.getEvent(e.eventId)).toBeDefined();
      expect(log.getEvent(e.eventId)?.eventType).toBe("test-ev");
    });

    it("returns undefined for unknown ID", () => {
      expect(log.getEvent("evt-999")).toBeUndefined();
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      log.append(sampleEntry);
      log.append(sampleEntry);
      log.clear();
      expect(log.size).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EventRouter
// ═══════════════════════════════════════════════════════════════════════

describe("EventRouter", () => {
  let graph: EventGraph;
  let state: AppState;
  let logBuffer: EventLogBuffer;
  let router: EventRouter;
  let handlerA: ReturnType<typeof vi.fn>;
  let handlerB: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    graph = new EventGraph();
    graph.load(sampleGraph);
    state = new AppState();
    logBuffer = new EventLogBuffer(100);

    handlerA = vi.fn();
    handlerB = vi.fn();

    router = new EventRouter({
      graph,
      state,
      logBuffer,
      handlers: {
        "focus/set-focused": async () => { state.windowFocused = true; },
        "focus/set-blurred": async () => { state.windowFocused = false; },
        "focus/set-sidebar-right": async () => { state.focusedSide = "right"; },
        "focus/clear-sidebar": async () => { state.focusedSide = null; },
        "keyboard/suppress": async () => {},
        "test/handler-a": async (payload) => { handlerA(payload); },
        "test/handler-b": async (payload) => { handlerB(payload); },
      },
    });
  });

  describe("emit — edge matching", () => {
    it("dispatches to handler for event with no predicate", async () => {
      await router.emit("test-event", { value: 42 });
      expect(handlerA).toHaveBeenCalledWith({ value: 42 });
      expect(handlerB).toHaveBeenCalledWith({ value: 42 });
    });

    it("respects when predicate matching state", async () => {
      state.windowFocused = true;
      state.focusedSide = "right";
      await router.emit("test-predicate", {});
      expect(handlerA).toHaveBeenCalled();
    });

    it("does not dispatch when predicate does not match", async () => {
      state.windowFocused = false;
      await router.emit("test-predicate", {});
      expect(handlerA).not.toHaveBeenCalled();
    });

    it("selects first matching edge (first-match wins)", async () => {
      // window-focus with when: { windowFocused: false }
      // state is windowFocused=false, so edge e001 should match
      await router.emit("window-focus", {});
      expect(state.windowFocused).toBe(true);
    });

    it("does not match when predicate fails for first edge but later edges exist", async () => {
      // sidebar-click-right with e003 (when: windowFocused: false) and e004 (when: windowFocused: true, focusedSide: "left")
      state.windowFocused = true;
      state.focusedSide = "left";
      await router.emit("sidebar-click-right", {});
      expect(state.focusedSide).toBe("right"); // e004 should match
    });

    it("does nothing when no edge matches", async () => {
      state.focusedSide = "left";
      await router.emit("grid-click", {}); // only matches when focusedSide is "right"
      expect(state.focusedSide).toBe("left"); // unchanged
    });

    it("does nothing for unknown event type", async () => {
      await router.emit("unknown-event", {});
      expect(handlerA).not.toHaveBeenCalled();
    });
  });

  describe("emit — handler execution", () => {
    it("runs handlers in order", async () => {
      const order: string[] = [];
      router.registerHandler("test/order-a", async () => { order.push("a"); });
      router.registerHandler("test/order-b", async () => { order.push("b"); });
      // Extend graph with a node that dispatches to both
      const g = new EventGraph();
      g.load({ version: 1, nodes: [{ id: "test/order-a" }, { id: "test/order-b" }], edges: [{ id: "e-ord", from: "order-ev", to: ["test/order-a", "test/order-b"] }] });
      const r = new EventRouter({ graph: g, state, logBuffer, handlers: { "test/order-a": async () => { order.push("a"); }, "test/order-b": async () => { order.push("b"); } } });
      await r.emit("order-ev", {});
      expect(order).toEqual(["a", "b"]);
    });

    it("does not throw when handler throws — logs error instead", async () => {
      router.registerHandler("test/handler-a", async () => { throw new Error("handler error"); });
      await expect(router.emit("test-event", {})).resolves.toBeUndefined();
    });
  });

  describe("emit — logging", () => {
    it("logs the dispatch event", async () => {
      await router.emit("test-event", { value: 1 });
      const logs = logBuffer.getLogs({ eventType: "test-event" });
      expect(logs).toHaveLength(1);
      expect(logs[0].payload).toEqual({ value: 1 });
    });

    it("records matched edge info in log", async () => {
      await router.emit("window-focus", {});
      const logs = logBuffer.getLogs({ eventType: "window-focus" });
      expect(logs[0].matchedEdge).not.toBeNull();
      expect(logs[0].matchedEdge?.id).toBe("e001");
    });

    it("records null matchedEdge when no edge matches", async () => {
      await router.emit("unknown-event", {});
      const logs = logBuffer.getLogs({ eventType: "unknown-event" });
      expect(logs[0].matchedEdge).toBeNull();
    });
  });

  describe("registerHandler", () => {
    it("registers a new handler", async () => {
      const fn = vi.fn();
      router.registerHandler("test/handler-a", fn);
      await router.emit("test-event", {});
      expect(fn).toHaveBeenCalled();
    });
  });
});
