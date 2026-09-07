/**
 * Unit tests for log-streams.ts — the named log stream registry.
 *
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
  it("registerLogStream adds a stream with zero entries", () => {
    registerLogStream("test", "alpha");
    const list = listLogStreams();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ system: "test", name: "alpha", entryCount: 0, lastTs: null });
  });

  it("registerLogStream is idempotent", () => {
    registerLogStream("test", "alpha");
    registerLogStream("test", "alpha");
    expect(listLogStreams()).toHaveLength(1);
  });

  it("unregisterLogStream removes a stream", () => {
    registerLogStream("test", "alpha");
    unregisterLogStream("test", "alpha");
    expect(listLogStreams()).toHaveLength(0);
  });

  it("keeps same-named streams from different systems distinct", () => {
    registerLogStream("sys-a", "index");
    registerLogStream("sys-b", "index");
    const list = listLogStreams();
    expect(list).toHaveLength(2);
    expect(list.map((s) => `${s.system}:${s.name}`).sort()).toEqual(["sys-a:index", "sys-b:index"]);
  });

  it("derives per-system entry counts from the buffer", () => {
    registerLogStream("sys-a", "index");
    registerLogStream("sys-b", "index");
    pushLog(LogLevel.INFO, "sys-a", "index", "a1");
    pushLog(LogLevel.INFO, "sys-a", "index", "a2");
    pushLog(LogLevel.INFO, "sys-b", "index", "b1");
    const a = listLogStreams().find((s) => s.system === "sys-a");
    const b = listLogStreams().find((s) => s.system === "sys-b");
    expect(a?.entryCount).toBe(2);
    expect(b?.entryCount).toBe(1);
  });

  it("entryCount and lastTs derive from the log buffer", () => {
    registerLogStream("test", "alpha");
    pushLog(LogLevel.INFO, "test", "alpha", "hello");
    pushLog(LogLevel.WARN, "test", "alpha", "world");
    const info = listLogStreams().find((s) => s.name === "alpha");
    expect(info?.entryCount).toBe(2);
    expect(info?.lastTs).not.toBeNull();
  });

  it("lists streams in registration order", () => {
    registerLogStream("test", "z");
    registerLogStream("test", "a");
    registerLogStream("test", "m");
    expect(listLogStreams().map((s) => s.name)).toEqual(["z", "a", "m"]);
  });

  it("subscribeLogStreams notifies on register and unregister", () => {
    const events: string[] = [];
    const off = subscribeLogStreams(() => events.push("change"));
    registerLogStream("test", "alpha");
    unregisterLogStream("test", "alpha");
    off();
    expect(events).toEqual(["change", "change"]);
  });

  it("a stream is added to the registry only after it actually logs", async () => {
    const { createLogger } = await import("@openp41ge-logger/logger");
    const log = createLogger("test", "my.namespace");
    // Declared but not yet emitted → not listed.
    expect(listLogStreams().map((s) => s.name)).not.toContain("my.namespace");
    log.info("first entry");
    // Once it has produced a stored entry, it appears.
    expect(listLogStreams().map((s) => s.name)).toContain("my.namespace");
    expect(listLogStreams().find((s) => s.name === "my.namespace")?.entryCount).toBe(1);
  });

  it("a debug entry dropped by the capture threshold does not register the stream", async () => {
    const { createLogger } = await import("@openp41ge-logger/logger");
    setMinLevel(LogLevel.INFO);
    const log = createLogger("test", "dropped.debug");
    log.debug("not captured");
    expect(listLogStreams().map((s) => s.name)).not.toContain("dropped.debug");
  });

  it("createLogger rejects an empty system or stream name", async () => {
    const { createLogger } = await import("@openp41ge-logger/logger");
    expect(() => createLogger("", "name")).toThrow(TypeError);
    expect(() => createLogger("test", "")).toThrow(TypeError);
    expect(() => createLogger("test", "   ")).toThrow(TypeError);
  });
});
