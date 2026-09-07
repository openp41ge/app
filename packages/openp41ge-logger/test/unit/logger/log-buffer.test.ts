/**
 * Unit tests for log-buffer.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LogLevel,
  LOG_LEVEL_LABELS,
  pushLog,
  getLogBuffer,
  queryLog,
  clearLogBuffer,
  subscribeLogs,
  setMinLevel,
  getMinLevel,
  type LogEntry,
} from "@openp41ge-logger/log-buffer";

// ── Helpers ──

/** Number of entries currently in the buffer after test setup */
function entryCount(): number {
  return getLogBuffer().length;
}

// ── Tests ──

beforeEach(() => {
  clearLogBuffer();
  setMinLevel(LogLevel.INFO); // default capture — DEBUG dropped
});

describe("LogLevel enum", () => {
  it("has DEBUG = 0", () => {
    expect(LogLevel.DEBUG).toBe(0);
  });

  it("has INFO = 1", () => {
    expect(LogLevel.INFO).toBe(1);
  });

  it("has WARN = 2", () => {
    expect(LogLevel.WARN).toBe(2);
  });

  it("has ERROR = 3", () => {
    expect(LogLevel.ERROR).toBe(3);
  });
});

describe("LOG_LEVEL_LABELS", () => {
  it("maps each level to its human-readable label", () => {
    expect(LOG_LEVEL_LABELS[LogLevel.DEBUG]).toBe("DEBUG");
    expect(LOG_LEVEL_LABELS[LogLevel.INFO]).toBe("INFO");
    expect(LOG_LEVEL_LABELS[LogLevel.WARN]).toBe("WARN");
    expect(LOG_LEVEL_LABELS[LogLevel.ERROR]).toBe("ERROR");
  });

  it("contains exactly all four levels", () => {
    expect(Object.keys(LOG_LEVEL_LABELS).length).toBe(4);
  });
});

describe("getLogBuffer()", () => {
  it("returns an empty array when no logs have been pushed", () => {
    expect(getLogBuffer()).toEqual([]);
  });

  it("returns a snapshot that reflects pushed entries", () => {
    pushLog(LogLevel.INFO, "test", "test", ["hello"]);
    expect(getLogBuffer()).toHaveLength(1);
  });

  it("the returned array is a different reference from the internal buffer", () => {
    pushLog(LogLevel.INFO, "test", "test", ["a"]);
    const snapshot = getLogBuffer();
    pushLog(LogLevel.INFO, "test", "test", ["b"]);
    // The old snapshot should be unchanged
    expect(snapshot).toHaveLength(1);
  });
});

describe("pushLog()", () => {
  it("creates an entry with the correct structure", () => {
    pushLog(LogLevel.WARN, "test", "my-module", ["something went wrong"]);

    const entries = getLogBuffer();
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("timestamp");
    expect(entry.level).toBe(LogLevel.WARN);
    expect(entry.name).toBe("my-module");
    expect(entry.source).toBe("my-module");
    expect(entry.text).toBe("something went wrong");
    expect(entry.message).toBe("something went wrong");
    expect(["main", "renderer"]).toContain(entry.process);
  });

  it("accepts a plain string message", () => {
    pushLog(LogLevel.INFO, "test", "str-module", "a plain string");
    const entry = getLogBuffer()[0];
    expect(entry.message).toBe("a plain string");
    expect(entry.text).toBe("a plain string");
  });

  it("detaches a structured data payload when provided", () => {
    pushLog(LogLevel.INFO, "test", "data-module", "something happened", {
      x: 1,
      label: "ghost-update",
    });
    const entry = getLogBuffer()[0];
    expect(entry.data).toEqual({ x: 1, label: "ghost-update" });
    expect(entry.message).toBe("something happened");
  });

  it("increments ids sequentially", () => {
    pushLog(LogLevel.INFO, "test", "a", ["first"]);
    pushLog(LogLevel.INFO, "test", "a", ["second"]);
    pushLog(LogLevel.INFO, "test", "a", ["third"]);

    const entries = getLogBuffer();
    expect(entries[1].id).toBe(entries[0].id + 1);
    expect(entries[2].id).toBe(entries[1].id + 1);
  });

  it("records a timestamp close to now", () => {
    const before = Date.now();
    pushLog(LogLevel.INFO, "test", "t", ["ts"]);
    const after = Date.now();

    const entry = getLogBuffer()[0];
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
  });

  it("joins multiple args with space", () => {
    pushLog(LogLevel.INFO, "test", "test", ["hello", "world", 42]);
    expect(getLogBuffer()[0].text).toBe("hello world 42");
  });

  it("stringifies objects via JSON.stringify", () => {
    const obj = { foo: "bar", num: 1 };
    pushLog(LogLevel.INFO, "test", "test", ["data:", obj]);
    expect(getLogBuffer()[0].text).toBe('data: {"foo":"bar","num":1}');
  });

  it("handles objects that fail JSON.stringify (circular refs)", () => {
    const a: Record<string, unknown> = { name: "a" };
    const b: Record<string, unknown> = { name: "b" };
    a.ref = b;
    b.ref = a;

    // Should not throw
    pushLog(LogLevel.INFO, "test", "test", [a]);
    const text = getLogBuffer()[0].text;
    // The fallback String() representation will be "[object Object]"
    expect(text).toBe("[object Object]");
  });

  it("notifies subscribed listeners with the new entry", () => {
    const listener = vi.fn();
    subscribeLogs(listener);

    pushLog(LogLevel.INFO, "test", "test", ["notify"]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ level: LogLevel.INFO, source: "test" });
  });

  it("notifies listeners with null when the buffer is cleared", () => {
    const listener = vi.fn();
    subscribeLogs(listener);

    pushLog(LogLevel.INFO, "test", "test", ["a"]);
    clearLogBuffer();
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("handles listener errors gracefully without affecting other listeners", () => {
    const throwingListener = vi.fn(() => {
      throw new Error("listener error");
    });
    const goodListener = vi.fn();

    subscribeLogs(throwingListener);
    subscribeLogs(goodListener);

    // Should not throw despite the failing listener
    expect(() => {
      pushLog(LogLevel.INFO, "test", "test", ["error handling"]);
    }).not.toThrow();

    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it("does not notify unsubscribed listeners", () => {
    const listener = vi.fn();
    const unsub = subscribeLogs(listener);
    unsub();

    pushLog(LogLevel.INFO, "test", "test", ["no notify"]);
    expect(listener).not.toHaveBeenCalled();
  });
});

// ── Capture levels (session debug gating) ──

describe("capture levels (setMinLevel / getMinLevel)", () => {
  it("defaults to INFO capture (DEBUG dropped)", () => {
    expect(getMinLevel()).toBe(LogLevel.INFO);
    const pushed = pushLog(LogLevel.DEBUG, "test", "dbg", ["should be dropped"]);
    expect(pushed).toBeNull();
    expect(entryCount()).toBe(0);
  });

  it("captures INFO/WARN/ERROR automatically", () => {
    pushLog(LogLevel.INFO, "test", "a", ["i"]);
    pushLog(LogLevel.WARN, "test", "a", ["w"]);
    pushLog(LogLevel.ERROR, "test", "a", ["e"]);
    expect(entryCount()).toBe(3);
  });

  it("captures DEBUG when the debug session is enabled", () => {
    setMinLevel(LogLevel.DEBUG);
    const pushed = pushLog(LogLevel.DEBUG, "test", "dbg", ["captured"]);
    expect(pushed).not.toBeNull();
    expect(entryCount()).toBe(1);
  });

  it("does not notify listeners for dropped entries", () => {
    const listener = vi.fn();
    subscribeLogs(listener);
    pushLog(LogLevel.DEBUG, "test", "dbg", ["dropped"]);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("queryLog()", () => {
  beforeEach(() => {
    setMinLevel(LogLevel.DEBUG); // capture everything for query tests
  });

  it("returns all entries with no filter", () => {
    pushLog(LogLevel.INFO, "test", "a", ["1"]);
    pushLog(LogLevel.WARN, "test", "a", ["2"]);
    expect(queryLog()).toHaveLength(2);
  });

  it("filters by source", () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["2"]);
    const result = queryLog({ source: "alpha" });
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("alpha");
  });

  it("filters by source set", () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["2"]);
    pushLog(LogLevel.INFO, "test", "gamma", ["3"]);
    expect(queryLog({ source: ["alpha", "gamma"] })).toHaveLength(2);
  });

  it("filters by minimum level", () => {
    pushLog(LogLevel.INFO, "test", "a", ["i"]);
    pushLog(LogLevel.WARN, "test", "a", ["w"]);
    pushLog(LogLevel.ERROR, "test", "a", ["e"]);
    const result = queryLog({ minLevel: LogLevel.WARN });
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.level)).toEqual([LogLevel.WARN, LogLevel.ERROR]);
  });

  it("filters by maximum level", () => {
    pushLog(LogLevel.INFO, "test", "a", ["i"]);
    pushLog(LogLevel.WARN, "test", "a", ["w"]);
    const result = queryLog({ maxLevel: LogLevel.INFO });
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe(LogLevel.INFO);
  });

  it("filters by search across source and message", () => {
    pushLog(LogLevel.INFO, "test", "drag", ["ghost-update"]);
    pushLog(LogLevel.INFO, "test", "drag", ["mousemove"]);
    pushLog(LogLevel.INFO, "test", "other", ["ghost-update"]);
    const result = queryLog({ search: "ghost" });
    expect(result).toHaveLength(2);
  });

  it("filters by process", () => {
    pushLog(LogLevel.INFO, "test", "a", ["1"]);
    const result = queryLog({ process: "renderer" });
    // jsdom counts as "renderer"
    expect(result).toHaveLength(1);
    expect(queryLog({ process: "main" })).toHaveLength(0);
  });

  it("caps to the most recent matches with limit", () => {
    pushLog(LogLevel.INFO, "test", "a", ["1"]);
    pushLog(LogLevel.INFO, "test", "a", ["2"]);
    pushLog(LogLevel.INFO, "test", "a", ["3"]);
    const result = queryLog({ limit: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("2");
    expect(result[1].text).toBe("3");
  });

  it("filters by since timestamp", () => {
    const spy = vi.spyOn(Date, "now").mockReturnValue(1000);
    pushLog(LogLevel.INFO, "test", "a", ["old"]);
    spy.mockReturnValue(2000);
    pushLog(LogLevel.INFO, "test", "a", ["recent"]);
    spy.mockRestore();
    const result = queryLog({ since: 1500 });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("recent");
  });
});

describe("buffer capacity (MAX_LOG_ENTRIES)", () => {
  it("trims old entries when buffer exceeds 10_000 entries", () => {
    setMinLevel(LogLevel.DEBUG);
    // Push 10_050 entries for one name
    for (let i = 0; i < 10_050; i++) {
      pushLog(LogLevel.DEBUG, "test", "spam", [`entry ${i}`]);
    }

    const entries = getLogBuffer();
    // Should have been trimmed to max 10_000
    expect(entries.length).toBeLessThanOrEqual(10_000);

    // The oldest entry should no longer be entry 0
    expect(entries[0].text).not.toBe("entry 0");
    // The newest entry should be present
    expect(entries[entries.length - 1].text).toBe("entry 10049");
  });
});

describe("clearLogBuffer()", () => {
  it("removes all entries", () => {
    pushLog(LogLevel.INFO, "test", "a", ["x"]);
    pushLog(LogLevel.INFO, "test", "a", ["y"]);
    expect(entryCount()).toBe(2);

    clearLogBuffer();
    expect(entryCount()).toBe(0);
  });

  it("notifies listeners after clearing", () => {
    pushLog(LogLevel.INFO, "test", "a", ["x"]);
    const listener = vi.fn();
    subscribeLogs(listener);

    clearLogBuffer();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("handles listener errors during clear notification", () => {
    pushLog(LogLevel.INFO, "test", "a", ["x"]);
    subscribeLogs(() => {
      throw new Error("clear error");
    });

    expect(() => clearLogBuffer()).not.toThrow();
    expect(entryCount()).toBe(0);
  });
});

describe("subscribeLogs()", () => {
  it("returns an unsubscribe function", () => {
    const unsub = subscribeLogs(() => {});
    expect(typeof unsub).toBe("function");
  });

  it("unsubscribe does nothing when called multiple times", () => {
    const listener = vi.fn();
    const unsub = subscribeLogs(listener);
    unsub();
    unsub(); // should not throw

    pushLog(LogLevel.INFO, "test", "test", ["after double unsub"]);
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple listeners simultaneously", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeLogs(a);
    subscribeLogs(b);

    pushLog(LogLevel.INFO, "test", "test", ["multi"]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
