/**
 * Unit tests for error-capture-service logging.
 *
 * Verifies the P2 instrumentation: uncaught errors / unhandled rejections emit
 * a `log.error` entry into the log bus (so they land in the bus + on-disk file),
 * while still only adding a single toast entry (the console.error replay from
 * `log.error` is suppressed so it isn't double-counted).
 *
 * Errors surface via a NON-BLOCKING persistent toast plus a reactive error
 * store (subscribeErrors) that the manager's "Errors" tab renders as a grid.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  installErrorCapture,
  clearCapturedErrors,
  subscribeErrors,
  getCapturedErrors,
  removeCapturedError,
  OPEN_ERROR_GRID_EVENT,
  type CapturedError,
} from "@openp41ge/renderer/services/error-capture-service";
import { subscribeLogs, setMinLevel, LogLevel, type LogEntry } from "openp41ge-logger";

function errorEntries(entries: LogEntry[]): LogEntry[] {
  return entries.filter((e) => e.level === LogLevel.ERROR);
}

function fireError(message: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.onerror as any)(message, "b.js", 1, 2, new Error(message));
}

describe("error-capture-service logging", () => {
  beforeEach(() => {
    setMinLevel(LogLevel.DEBUG);
    installErrorCapture();
  });

  afterEach(() => {
    clearCapturedErrors();
    setMinLevel(LogLevel.INFO);
    // Clear leftover toast items (keep the container; the service caches it).
    document.querySelector("openp41ge-toast")?.replaceChildren();
  });

  it("emits a log.error entry when window.onerror fires (uncaught exception)", () => {
    const entries: LogEntry[] = [];
    const unsub = subscribeLogs((e) => e && entries.push(e));

    fireError("boom message");

    unsub();

    const errEntry = errorEntries(entries).find((e) => e.data?.message === "boom message");
    expect(errEntry).toBeDefined();
    expect(errEntry?.message).toContain("uncaught-error");
    expect(errEntry?.data?.source).toBe("b.js");
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

  it("shows a non-blocking error toast on an uncaught error", () => {
    fireError("toast test boom");

    const container = document.querySelector("openp41ge-toast");
    expect(container).not.toBeNull();
    const item = container!.querySelector(".openp41ge-toast-error");
    expect(item).not.toBeNull();
    expect(item!.textContent).toContain("toast test boom");
    // It must never be a blocking full-screen overlay.
    expect(document.getElementById("_openp41ge-error-overlay")).toBeNull();
  });

  it("does not auto-dismiss error toasts", () => {
    vi.useFakeTimers();
    try {
      fireError("persist boom");
      expect(document.querySelector("openp41ge-toast .openp41ge-toast-error")).not.toBeNull();
      vi.advanceTimersByTime(100_000);
      // Still present long after any auto-dismiss window.
      expect(document.querySelector("openp41ge-toast .openp41ge-toast-error")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("wraps long error messages at 180 chars in the toast preview", () => {
    fireError("x".repeat(300));
    const item = document.querySelector("openp41ge-toast .openp41ge-toast-error");
    expect(item!.textContent).toContain("…");
    // 180 preview + "Error: " prefix + dismiss glyph, so well under the raw 300.
    expect(item!.textContent!.length).toBeLessThan(200);
  });

  it("dispatches the open-error-grid event when the error toast is clicked", () => {
    let fired = false;
    const listener = (): void => {
      fired = true;
    };
    document.addEventListener(OPEN_ERROR_GRID_EVENT, listener);
    try {
      fireError("grid boom");
      (document.querySelector("openp41ge-toast .openp41ge-toast-error") as HTMLElement).click();
      expect(fired).toBe(true);
    } finally {
      document.removeEventListener(OPEN_ERROR_GRID_EVENT, listener);
    }
  });

  it("does not count an error twice through the console replay", () => {
    fireError("double count boom");
    const errors = getCapturedErrors();
    expect(errors.filter((e) => e.message.includes("double count boom"))).toHaveLength(1);
  });
});

describe("error-capture-service error store", () => {
  beforeEach(() => {
    setMinLevel(LogLevel.DEBUG);
    installErrorCapture();
  });

  afterEach(() => {
    clearCapturedErrors();
    setMinLevel(LogLevel.INFO);
    document.querySelector("openp41ge-toast")?.replaceChildren();
  });

  function withListener(cb: (errors: CapturedError[]) => void): {
    seen: number[];
    unsubscribe: () => void;
  } {
    const seen: number[] = [];
    const unsubscribe = subscribeErrors((errs: CapturedError[]) => {
      seen.push(errs.length);
      cb(errs);
    });
    return { seen, unsubscribe };
  }

  it("subscribes to the current list and to subsequent changes", () => {
    const { seen, unsubscribe } = withListener(() => {});
    expect(seen).toContain(0);

    fireError("store boom");
    expect(seen.at(-1)).toBe(1);
    expect(getCapturedErrors().length).toBe(1);
    unsubscribe();
  });

  it("prepends new errors (newest first) and notifies subscribers", () => {
    let latest: CapturedError[] = [];
    const unsubscribe = subscribeErrors((errs) => {
      latest = errs;
    });
    fireError("first");
    fireError("second");

    expect(latest[0].message).toBe("second");
    expect(latest[1].message).toBe("first");
    expect(getCapturedErrors().length).toBe(2);
    unsubscribe();
  });

  it("removeCapturedError removes a single error by index", () => {
    fireError("first");
    fireError("second");
    expect(getCapturedErrors().length).toBe(2);

    removeCapturedError(0); // newest ("second")
    const list = getCapturedErrors();
    expect(list.length).toBe(1);
    expect(list[0].message).toBe("first");

    removeCapturedError(99); // out of range — no-op
    expect(getCapturedErrors().length).toBe(1);
  });

  it("clearCapturedErrors empties the store and removes the persisted copy", () => {
    fireError("clear boom");
    expect(getCapturedErrors().length).toBe(1);
    expect(sessionStorage.getItem("openp41ge:captured-errors")).not.toBeNull();

    clearCapturedErrors();
    expect(getCapturedErrors()).toHaveLength(0);
    expect(sessionStorage.getItem("openp41ge:captured-errors")).toBeNull();
  });
});
