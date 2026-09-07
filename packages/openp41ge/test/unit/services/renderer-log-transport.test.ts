/**
 * Unit tests for renderer-log-transport.ts — coalesced renderer → main IPC.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clearLogBuffer, pushLog, LogLevel, setMinLevel } from "openp41ge-logger";
import {
  initRendererLogTransport,
  _resetRendererLogTransportForTests,
} from "@openp41ge/renderer/services/renderer-log-transport";

let appendMock: ReturnType<typeof vi.fn>;

function installBridge(winId: string | null = "win-42"): void {
  (window as unknown as Record<string, unknown>).openp41ge = {
    logs: { append: appendMock },
    workspace: { getWindowId: () => winId },
  };
}

function removeBridge(): void {
  delete (window as unknown as Record<string, unknown>).openp41ge;
}

beforeEach(() => {
  clearLogBuffer();
  setMinLevel(LogLevel.DEBUG); // transport forwards whatever the bus captures
  appendMock = vi.fn();
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  _resetRendererLogTransportForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
  removeBridge();
});

describe("renderer-log-transport", () => {
  it("forwards entries already in the buffer at init (early bootstrap logs)", () => {
    pushLog(LogLevel.INFO, "test", "bootstrap", ["early"]);
    installBridge();

    initRendererLogTransport();

    expect(appendMock).toHaveBeenCalledTimes(1);
    const batch = appendMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({
      source: "bootstrap",
      message: "early",
      level: LogLevel.INFO,
      process: "renderer",
      winId: "win-42",
    });
    // Internal fields must not be forwarded.
    expect(batch[0]).not.toHaveProperty("args");
    expect(batch[0]).not.toHaveProperty("text");
  });

  it("forwards new entries on the coalescing interval", () => {
    vi.useFakeTimers();
    installBridge();
    initRendererLogTransport();
    appendMock.mockClear();

    pushLog(LogLevel.WARN, "test", "drag", ["ghost-issue"]);
    expect(appendMock).not.toHaveBeenCalled(); // not yet flushed

    vi.advanceTimersByTime(150); // past FLUSH_INTERVAL_MS
    expect(appendMock).toHaveBeenCalledTimes(1);
    expect((appendMock.mock.calls[0][0] as unknown[])[0]).toMatchObject({
      source: "drag",
      message: "ghost-issue",
    });
  });

  it("flushes early when the batch reaches its cap", () => {
    vi.useFakeTimers();
    installBridge();
    initRendererLogTransport();
    appendMock.mockClear();

    for (let i = 0; i < 200; i++) {
      pushLog(LogLevel.INFO, "test", "spam", [`entry ${i}`]);
    }
    // 200 >= MAX_BATCH triggers an eager flush.
    expect(appendMock).toHaveBeenCalledTimes(1);
  });

  it("omits winId when it cannot be resolved", () => {
    vi.useFakeTimers();
    installBridge(null); // getWindowId returns null
    initRendererLogTransport();
    appendMock.mockClear();

    pushLog(LogLevel.INFO, "test", "a", ["no winid yet"]);
    vi.advanceTimersByTime(150);

    expect(appendMock).toHaveBeenCalledTimes(1);
    const batch = appendMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(batch[0]).not.toHaveProperty("winId");
  });

  it("is a no-op when the preload bridge is missing", () => {
    removeBridge();
    expect(() => initRendererLogTransport()).not.toThrow();
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("stops forwarding after cleanup", () => {
    vi.useFakeTimers();
    installBridge();
    const stop = initRendererLogTransport();
    appendMock.mockClear();

    stop();
    pushLog(LogLevel.INFO, "test", "after", ["cleanup"]);
    vi.advanceTimersByTime(300);
    expect(appendMock).not.toHaveBeenCalled();
  });
});
