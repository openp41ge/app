/**
 * Unit tests for log-streams.ts — the system-keyed log stream registry.
 *
 * A stream is a system (platform / plugin); subsystems (logger namespaces)
 * are the entry `source` inside a system's stream, not separate streams.
 * Verifies registration/idempotency, listing with live entry counts derived
 * from the log buffer, unregistration, ordering, and subscription.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerLogStream,
  unregisterLogStream,
  listLogStreams,
  subscribeLogStreams,
  _resetLogStreams,
} from "@openp41ge-logger/log-streams";
import {
  pushLog,
  clearLogBuffer,
  setMinLevel,
  LogLevel,
  getLogBuffer,
} from "@openp41ge-logger/log-buffer";

beforeEach(() => {
  clearLogBuffer();
  setMinLevel(LogLevel.DEBUG);
  _resetLogStreams();
});

describe("log stream registry", () => {
  it("registerLogStream adds a system stream with zero entries", () => {
    registerLogStream("test");
    const list = listLogStreams();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ system: "test", entryCount: 0, lastTs: null });
  });

  it("registerLogStream is idempotent per system", () => {
    registerLogStream("test");
    registerLogStream("test");
    expect(listLogStreams()).toHaveLength(1);
  });

  it("all subsystems (different names) collapse into one system stream", () => {
    registerLogStream("test", "alpha");
    registerLogStream("test", "beta");
    expect(listLogStreams()).toHaveLength(1);
    expect(listLogStreams()[0].system).toBe("test");
  });

  it("unregisterLogStream removes a system stream", () => {
    registerLogStream("test");
    unregisterLogStream("test");
    expect(listLogStreams()).toHaveLength(0);
  });

  it("keeps different systems distinct", () => {
    registerLogStream("sys-a", "index");
    registerLogStream("sys-b", "index");
    const list = listLogStreams();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.system).sort()).toEqual(["sys-a", "sys-b"]);
  });

  it("derives per-system entry counts across all subsystems from the buffer", () => {
    registerLogStream("sys-a");
    registerLogStream("sys-b");
    pushLog(LogLevel.INFO, "sys-a", "alpha", "a1");
    pushLog(LogLevel.INFO, "sys-a", "beta", "a2");
    pushLog(LogLevel.INFO, "sys-b", "index", "b1");
    const a = listLogStreams().find((s) => s.system === "sys-a");
    const b = listLogStreams().find((s) => s.system === "sys-b");
    expect(a?.entryCount).toBe(2);
    expect(b?.entryCount).toBe(1);
  });

  it("entryCount and lastTs derive from the log buffer", () => {
    registerLogStream("test");
    pushLog(LogLevel.INFO, "test", "alpha", "hello");
    pushLog(LogLevel.WARN, "test", "alpha", "world");
    const info = listLogStreams().find((s) => s.system === "test");
    expect(info?.entryCount).toBe(2);
    expect(info?.lastTs).not.toBeNull();
  });

  it("lists streams in registration order", () => {
    registerLogStream("z");
    registerLogStream("a");
    registerLogStream("m");
    expect(listLogStreams().map((s) => s.system)).toEqual(["z", "a", "m"]);
  });

  it("subscribeLogStreams notifies on register and unregister", () => {
    const events: string[] = [];
    const off = subscribeLogStreams(() => events.push("change"));
    registerLogStream("test");
    unregisterLogStream("test");
    off();
    expect(events).toEqual(["change", "change"]);
  });

  it("a system is added to the registry only after it actually logs (lazy)", async () => {
    const { createLogger } = await import("@openp41ge-logger/logger");
    const log = createLogger("test", "my.namespace");
    // Declared but not yet emitted → not listed.
    expect(listLogStreams().map((s) => s.system)).not.toContain("test");
    log.info("first entry");
    // Once it has produced a stored entry, the SYSTEM appears.
    expect(listLogStreams().map((s) => s.system)).toContain("test");
    expect(listLogStreams().find((s) => s.system === "test")?.entryCount).toBe(1);
  });

  it("a second subsystem's first entry does not create a duplicate stream", async () => {
    const { createLogger } = await import("@openp41ge-logger/logger");
    createLogger("test", "alpha").info("a");
    createLogger("test", "beta").info("b");
    expect(listLogStreams()).toHaveLength(1);
    expect(listLogStreams()[0].entryCount).toBe(2);
  });

  it("a debug entry dropped by the capture threshold does not register the system", async () => {
    const { createLogger } = await import("@openp41ge-logger/logger");
    setMinLevel(LogLevel.INFO);
    const log = createLogger("test", "dropped.debug");
    log.debug("not captured");
    expect(listLogStreams().map((s) => s.system)).not.toContain("test");
  });

  it("createLogger rejects an empty system or stream name", async () => {
    const { createLogger } = await import("@openp41ge-logger/logger");
    expect(() => createLogger("", "name")).toThrow(TypeError);
    expect(() => createLogger("test", "")).toThrow(TypeError);
    expect(() => createLogger("test", "   ")).toThrow(TypeError);
  });
});
