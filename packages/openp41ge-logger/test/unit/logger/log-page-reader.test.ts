/**
 * Unit tests for the longest-line helpers + the in-memory page reader's
 * `maxLineChars` (node/main-computed longest rendered line), which anchors the
 * viewer's stable horizontal content width.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  formatLogTime,
  logLineChars,
  MemLogPageReader,
  LOG_PAGE_DEFAULT_LIMIT,
} from "@openp41ge-logger/log-page-reader";
import { pushLog, clearLogBuffer, LogLevel } from "@openp41ge-logger/log-buffer";

beforeEach(() => {
  clearLogBuffer();
});

describe("formatLogTime", () => {
  it("formats as HH:MM:SS with zero padding", () => {
    const d = new Date(2026, 0, 2, 3, 4, 5);
    expect(formatLogTime(d.getTime())).toBe("03:04:05");
  });
});

describe("logLineChars", () => {
  it("counts level + time + [source] + message (no separator spaces)", () => {
    expect(logLineChars({ levelLabel: "INFO", timestamp: 0, source: "app", message: "hi" })).toBe(
      "INFO".length + formatLogTime(0).length + "app".length + 2 + "hi".length,
    );
  });

  it("derives the label from the level when levelLabel is absent", () => {
    expect(logLineChars({ level: LogLevel.ERROR, timestamp: 0, source: "s", message: "x" })).toBe(
      logLineChars({ levelLabel: "ERROR", timestamp: 0, source: "s", message: "x" }),
    );
  });

  it("is dominated by the message (a longer message yields a longer line)", () => {
    const short = logLineChars({ levelLabel: "INFO", timestamp: 0, source: "app", message: "ok" });
    const long = logLineChars({
      levelLabel: "INFO",
      timestamp: 0,
      source: "app",
      message: "x".repeat(120),
    });
    expect(long).toBeGreaterThan(short);
  });
});

describe("MemLogPageReader maxLineChars", () => {
  it("tracks a monotonic max across pages and reports it on loadLatest", async () => {
    pushLog(LogLevel.INFO, "sys", "mod", ["short"]);
    pushLog(LogLevel.INFO, "sys", "mod", ["y".repeat(200)]);
    const reader = new MemLogPageReader();
    const page = await reader.loadLatest(LOG_PAGE_DEFAULT_LIMIT);
    expect(page.maxLineChars).toBeTruthy();
    expect(page.maxLineChars).toBe(
      logLineChars({
        levelLabel: "INFO",
        timestamp: page.entries[0].timestamp,
        source: "mod",
        message: "y".repeat(200),
      }),
    );
  });

  it("grows when an older page contains a longer line", async () => {
    pushLog(LogLevel.INFO, "sys", "mod", ["short"]);
    const reader = new MemLogPageReader();
    const first = await reader.loadLatest(LOG_PAGE_DEFAULT_LIMIT);
    pushLog(LogLevel.INFO, "sys", "mod", ["z".repeat(300)]);
    const second = await reader.loadLatest(LOG_PAGE_DEFAULT_LIMIT);
    expect(second.maxLineChars).toBeGreaterThanOrEqual(first.maxLineChars ?? 0);
    expect(second.maxLineChars).toBeGreaterThan((first.maxLineChars ?? 0) + 100);
  });
});
