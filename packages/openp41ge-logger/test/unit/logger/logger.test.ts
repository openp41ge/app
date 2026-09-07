/**
 * Unit tests for logger.ts
 *
 * NOTE: the console transport is installed automatically when logger.ts is
 * imported, so `log.*` calls replay to console synchronously via the bus.
 * DEBUG capture is gated: entries are only captured (and replayed) while
 * `setMinLevel(LogLevel.DEBUG)` is active. Tests below assert both behaviours.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger, createNoopLogger, type ILogger } from "@openp41ge-logger/logger";
import { LogLevel, getLogBuffer, clearLogBuffer, setMinLevel } from "@openp41ge-logger/log-buffer";

beforeEach(() => {
  clearLogBuffer();
  setMinLevel(LogLevel.DEBUG); // capture everything for these tests
});

// ── createLogger ──

describe("createLogger()", () => {
  it("returns an object with debug, info, warn, error methods", () => {
    const log = createLogger("test", "test");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("calls console.debug with prefix when debug() is called", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createLogger("test", "my-module");
    log.debug("hello", "world");

    expect(spy).toHaveBeenCalledWith("[my-module]", "hello", "world");
    spy.mockRestore();
  });

  it("does not call console.debug for dropped DEBUG by default", () => {
    setMinLevel(LogLevel.INFO);
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createLogger("test", "my-module");
    log.debug("hello", "world");

    expect(spy).not.toHaveBeenCalled();
    expect(getLogBuffer()).toHaveLength(0);
    spy.mockRestore();
  });

  it("calls console.info with prefix when info() is called", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("test", "my-module");
    log.info("info message", 42);

    expect(spy).toHaveBeenCalledWith("[my-module]", "info message", 42);
    spy.mockRestore();
  });

  it("calls console.warn with prefix when warn() is called", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createLogger("test", "my-module");
    log.warn("warning");

    expect(spy).toHaveBeenCalledWith("[my-module]", "warning");
    spy.mockRestore();
  });

  it("calls console.error with prefix when error() is called", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createLogger("test", "my-module");
    log.error("error occurred");

    expect(spy).toHaveBeenCalledWith("[my-module]", "error occurred");
    spy.mockRestore();
  });

  it("writes entries to the log buffer at the correct level", () => {
    const log = createLogger("test", "buf-test");

    // Suppress console output
    const spies = [
      vi.spyOn(console, "debug").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];

    log.debug("debug msg");
    log.info("info msg");
    log.warn("warn msg");
    log.error("error msg");

    const entries = getLogBuffer();
    expect(entries).toHaveLength(4);
    expect(entries[0].level).toBe(LogLevel.DEBUG);
    expect(entries[0].name).toBe("buf-test");
    expect(entries[0].text).toBe("debug msg");
    expect(entries[1].level).toBe(LogLevel.INFO);
    expect(entries[1].text).toBe("info msg");
    expect(entries[2].level).toBe(LogLevel.WARN);
    expect(entries[2].text).toBe("warn msg");
    expect(entries[3].level).toBe(LogLevel.ERROR);
    expect(entries[3].text).toBe("error msg");

    spies.forEach((s) => s.mockRestore());
  });

  it("detaches a structured data payload from the trailing plain object", () => {
    const log = createLogger("test", "drag");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});

    log.debug("mousemove", { x: 12, y: 40, isBoundary: true });

    const entry = getLogBuffer()[0];
    expect(entry.data).toEqual({ x: 12, y: 40, isBoundary: true });
    // Console replay keeps the original call shape (including the object)
    expect(spy).toHaveBeenCalledWith("[drag]", "mousemove", { x: 12, y: 40, isBoundary: true });
    spy.mockRestore();
  });

  it("does not treat Errors or plain trailing non-objects as data", () => {
    const log = createLogger("test", "err");
    const err = new Error("boom");
    log.error("something failed:", err);

    const entry = getLogBuffer()[0];
    expect(entry.data).toBeUndefined();
    expect(entry.text).toBe("something failed: Error: boom");
  });

  it("passes all args to both console and log buffer", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("test", "multi-arg");

    log.info("a", 1, true, null);

    expect(spy).toHaveBeenCalledWith("[multi-arg]", "a", 1, true, null);

    const entry = getLogBuffer()[0];
    expect(entry.text).toBe("a 1 true null");
    spy.mockRestore();
  });
});

// ── createNoopLogger ──

describe("createNoopLogger()", () => {
  it("returns an object with debug, info, warn, error methods", () => {
    const log = createNoopLogger();
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("does not call any console methods", () => {
    const spy = vi.spyOn(console, "log");
    const log = createNoopLogger();

    log.debug("should not log");
    log.info("should not log");
    log.warn("should not log");
    log.error("should not log");

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not write to the log buffer", () => {
    const log = createNoopLogger();

    log.debug("x");
    log.info("y");
    log.warn("z");
    log.error("w");

    expect(getLogBuffer()).toHaveLength(0);
  });

  it("returns the same shape as createLogger (implements ILogger)", () => {
    const real = createLogger("test", "real");
    const noop = createNoopLogger();

    const methods = ["debug", "info", "warn", "error"] as const;
    for (const m of methods) {
      expect(typeof noop[m]).toBe(typeof real[m]);
    }
  });

  it("can be called with various argument types without throwing", () => {
    const log = createNoopLogger();
    expect(() => {
      log.debug();
      log.info(undefined);
      log.warn(null);
      log.error({ complex: "object" }, [1, 2, 3]);
    }).not.toThrow();
  });
});
