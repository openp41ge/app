/**
 * Unit tests for error-capture-service logging.
 *
 * Verifies the P2 instrumentation: uncaught errors / unhandled rejections emit
 * a `log.error` entry into the log bus (so they land in the bus + on-disk file),
 * while still only adding a single overlay entry (the console.error replay from
 * `log.error` is suppressed so it isn't double-counted).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  installErrorCapture,
  clearCapturedErrors,
} from "@openp41ge/renderer/services/error-capture-service";
import { subscribeLogs, setMinLevel, LogLevel, type LogEntry } from "openp41ge-logger";

function errorEntries(entries: LogEntry[]): LogEntry[] {
  return entries.filter((e) => e.level === LogLevel.ERROR);
}

describe("error-capture-service logging", () => {
  beforeEach(() => {
    setMinLevel(LogLevel.DEBUG);
    installErrorCapture();
  });

  afterEach(() => {
    clearCapturedErrors();
    setMinLevel(LogLevel.INFO);
  });

  it("emits a log.error entry when window.onerror fires (uncaught exception)", () => {
    const entries: LogEntry[] = [];
    const unsub = subscribeLogs((e) => e && entries.push(e));

    // Fire the installed handler directly with a non-benign message.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.onerror as any)("boom message", "bundle.js", 10, 2, new Error("boom message"));

    unsub();

    const errEntry = errorEntries(entries).find((e) => e.data?.message === "boom message");
    expect(errEntry).toBeDefined();
    expect(errEntry?.message).toContain("uncaught-error");
    expect(errEntry?.data?.source).toBe("bundle.js");
  });

  it("emits a log.error entry for unhandled rejections", () => {
    const entries: LogEntry[] = [];
    const unsub = subscribeLogs((e) => e && entries.push(e));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.onunhandledrejection as any)({
      reason: new Error("rejection reason"),
    });

    unsub();

    const errEntry = errorEntries(entries).find(
      (e) => e.message.includes("unhandled-rejection") && e.data?.message === "rejection reason",
    );
    expect(errEntry).toBeDefined();
    expect(errEntry?.data?.message).toBe("rejection reason");
  });

  it("does not log benign renderer diagnostics (ResizeObserver loop)", () => {
    const entries: LogEntry[] = [];
    const unsub = subscribeLogs((e) => e && entries.push(e));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.onerror as any)(
      "ResizeObserver loop completed with undelivered notifications",
      undefined,
      undefined,
      undefined,
      undefined,
    );

    unsub();

    expect(errorEntries(entries)).toHaveLength(0);
  });
});
