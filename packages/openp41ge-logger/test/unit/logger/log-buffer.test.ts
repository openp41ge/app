/**
 * Unit tests for log-buffer.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LogLevel,
  LOG_LEVEL_LABELS,
  pushLog,
  getLogBuffer,
  clearLogBuffer,
  subscribeLogs,
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
    pushLog(LogLevel.INFO, "test", ["hello"]);
    expect(getLogBuffer()).toHaveLength(1);
  });

  it("the returned array is a different reference from the internal buffer", () => {
    pushLog(LogLevel.INFO, "test", ["a"]);
    const snapshot = getLogBuffer();
    pushLog(LogLevel.INFO, "test", ["b"]);
    // The old snapshot should be unchanged
    expect(snapshot).toHaveLength(1);
  });
});

describe("pushLog()", () => {
  it("creates an entry with the correct structure", () => {
    pushLog(LogLevel.WARN, "my-module", ["something went wrong"]);

    const entries = getLogBuffer();
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("timestamp");
    expect(entry.level).toBe(LogLevel.WARN);
    expect(entry.name).toBe("my-module");
    expect(entry.text).toBe("something went wrong");
  });

  it("increments ids sequentially", () => {
    pushLog(LogLevel.INFO, "a", ["first"]);
    pushLog(LogLevel.INFO, "a", ["second"]);
    pushLog(LogLevel.INFO, "a", ["third"]);

    const entries = getLogBuffer();
    expect(entries[1].id).toBe(entries[0].id + 1);
    expect(entries[2].id).toBe(entries[1].id + 1);
  });

  it("records a timestamp close to now", () => {
    const before = Date.now();
    pushLog(LogLevel.INFO, "t", ["ts"]);
    const after = Date.now();

    const entry = getLogBuffer()[0];
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
  });

  it("joins multiple args with space", () => {
    pushLog(LogLevel.INFO, "test", ["hello", "world", 42]);
    expect(getLogBuffer()[0].text).toBe("hello world 42");
  });

  it("stringifies objects via JSON.stringify", () => {
    const obj = { foo: "bar", num: 1 };
    pushLog(LogLevel.INFO, "test", ["data:", obj]);
    expect(getLogBuffer()[0].text).toBe('data: {"foo":"bar","num":1}');
  });

  it("handles objects that fail JSON.stringify (circular refs)", () => {
    const a: Record<string, unknown> = { name: "a" };
    const b: Record<string, unknown> = { name: "b" };
    a.ref = b;
    b.ref = a;

    // Should not throw
    pushLog(LogLevel.INFO, "test", [a]);
    const text = getLogBuffer()[0].text;
    // The fallback String() representation will be "[object Object]"
    expect(text).toBe("[object Object]");
  });

  it("notifies subscribed listeners", () => {
    const listener = vi.fn();
    subscribeLogs(listener);

    pushLog(LogLevel.INFO, "test", ["notify"]);
    expect(listener).toHaveBeenCalledTimes(1);
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
      pushLog(LogLevel.INFO, "test", ["error handling"]);
    }).not.toThrow();

    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it("does not notify unsubscribed listeners", () => {
    const listener = vi.fn();
    const unsub = subscribeLogs(listener);
    unsub();

    pushLog(LogLevel.INFO, "test", ["no notify"]);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("buffer capacity (MAX_LOG_ENTRIES)", () => {
  it("trims old entries when buffer exceeds 10_000 entries", () => {
    // Push 10_050 entries for one name
    for (let i = 0; i < 10_050; i++) {
      pushLog(LogLevel.DEBUG, "spam", [`entry ${i}`]);
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
    pushLog(LogLevel.INFO, "a", ["x"]);
    pushLog(LogLevel.INFO, "a", ["y"]);
    expect(entryCount()).toBe(2);

    clearLogBuffer();
    expect(entryCount()).toBe(0);
  });

  it("notifies listeners after clearing", () => {
    pushLog(LogLevel.INFO, "a", ["x"]);
    const listener = vi.fn();
    subscribeLogs(listener);

    clearLogBuffer();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("handles listener errors during clear notification", () => {
    pushLog(LogLevel.INFO, "a", ["x"]);
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

    pushLog(LogLevel.INFO, "test", ["after double unsub"]);
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple listeners simultaneously", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeLogs(a);
    subscribeLogs(b);

    pushLog(LogLevel.INFO, "test", ["multi"]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
