/**
 * Unit tests for LogFilePageReader — the file-backed `LogPageReader` used by
 * the grid log tab. It maps pages returned by `window.openp41ge.logs.readBackward`
 * and dedupes live entries picked up by its tail poll.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LogLevel } from "openp41ge-logger";
import { LogFilePageReader } from "@openp41ge/renderer/services/log-file-page-reader";

const ENTRY = {
  timestamp: 1,
  level: 1,
  levelLabel: "INFO",
  system: "openp41ge",
  source: "a",
  message: "m",
  process: "main",
};

beforeEach(() => {
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    logs: {
      readBackward: vi.fn(),
      getPath: vi.fn().mockResolvedValue({
        logsDir: "/logs",
        capabilities: { readBackward: true },
      }),
    },
  };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LogFilePageReader", () => {
  it("loadLatest maps a page and returns its cursor", async () => {
    const readBackward = vi.fn().mockResolvedValue({
      entries: [ENTRY],
      hasOlder: true,
      cursor: { fileIndex: 0, lineCount: 1 },
    });
    (window as any).openp41ge.logs.readBackward = readBackward;

    const reader = new LogFilePageReader();
    const res = await reader.loadLatest();

    expect(readBackward).toHaveBeenCalledWith(null, 300);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]).toMatchObject({ source: "a", message: "m", system: "openp41ge" });
    expect(res.hasOlder).toBe(true);
    expect(res.cursor).toEqual({ fileIndex: 0, lineCount: 1 });
    expect(res.entries[0].level).toBe(LogLevel.INFO);
  });

  it("loadOlder forwards the cursor", async () => {
    const readBackward = vi.fn().mockResolvedValue({
      entries: [ENTRY],
      hasOlder: false,
      cursor: null,
    });
    (window as any).openp41ge.logs.readBackward = readBackward;

    const reader = new LogFilePageReader();
    await reader.loadOlder({ fileIndex: 0, lineCount: 5 }, 10);

    expect(readBackward).toHaveBeenCalledWith({ fileIndex: 0, lineCount: 5 }, 10);
  });

  it("maps nextDay into nextDayCursor and nextDayLabel", async () => {
    const readBackward = vi.fn().mockResolvedValue({
      entries: [ENTRY],
      hasOlder: false,
      cursor: null,
      nextDay: { cursor: { fileIndex: 1, lineCount: 0 }, label: "Load yesterday's logs" },
    });
    (window as any).openp41ge.logs.readBackward = readBackward;

    const reader = new LogFilePageReader();
    const res = await reader.loadOlder({ fileIndex: 0, lineCount: 5 }, 10);

    expect(res.hasOlder).toBe(false);
    expect(res.cursor).toBeNull();
    expect(res.nextDayCursor).toEqual({ fileIndex: 1, lineCount: 0 });
    expect(res.nextDayLabel).toBe("Load yesterday's logs");
  });

  it("omits nextDay fields when the page has no next day", async () => {
    const readBackward = vi.fn().mockResolvedValue({
      entries: [ENTRY],
      hasOlder: false,
      cursor: null,
    });
    (window as any).openp41ge.logs.readBackward = readBackward;

    const reader = new LogFilePageReader();
    const res = await reader.loadOlder({ fileIndex: 0, lineCount: 5 }, 10);

    expect(res.nextDayCursor).toBeUndefined();
    expect(res.nextDayLabel).toBeUndefined();
  });

  it("loadLatest falls back (throws) and never calls readBackward on a stale main", async () => {
    // A stale main serves log:path but does NOT advertise read-backward.
    (window as any).openp41ge.logs.getPath = vi.fn().mockResolvedValue({ logsDir: "/logs" });
    const readBackward = vi.fn();
    (window as any).openp41ge.logs.readBackward = readBackward;

    const reader = new LogFilePageReader();
    await expect(reader.loadLatest()).rejects.toThrow();
    expect(readBackward).not.toHaveBeenCalled();
  });

  it("poll emits only unseen live entries and dedupes repeats", async () => {
    const readBackward = vi.fn().mockResolvedValue({
      entries: [ENTRY],
      hasOlder: false,
      cursor: null,
    });
    (window as any).openp41ge.logs.readBackward = readBackward;

    const reader = new LogFilePageReader();
    const seen: string[] = [];
    const unsubscribe = reader.subscribe((e) => seen.push(e.message));

    await (reader as any)._poll();
    await (reader as any)._poll();

    expect(seen).toEqual(["m"]); // second poll deduped
    unsubscribe();
  });

  it("stops polling when the last subscriber unsubscribes", async () => {
    const readBackward = vi.fn().mockResolvedValue({ entries: [], hasOlder: false, cursor: null });
    (window as any).openp41ge.logs.readBackward = readBackward;

    const reader = new LogFilePageReader();
    const un = reader.subscribe(() => {});
    un();
    expect((reader as any)._timer).toBeNull();
  });

  it("stops polling when readBackward rejects (stale main process)", async () => {
    const readBackward = vi.fn().mockRejectedValue(new Error("No handler registered"));
    (window as any).openp41ge.logs.readBackward = readBackward;

    const reader = new LogFilePageReader();
    reader.subscribe(() => {});
    (reader as any)._startPolling();
    expect((reader as any)._timer).not.toBeNull();

    await (reader as any)._poll();
    expect((reader as any)._timer).toBeNull();
  });
});
