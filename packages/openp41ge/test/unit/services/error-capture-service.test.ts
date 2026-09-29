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
  setErrorCaptureDevMode,
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
    setErrorCaptureDevMode(true);
    setMinLevel(LogLevel.INFO);
    // Clear leftover toast items (keep the container; the service caches it).
    document.querySelector("openp41ge-toast")?.replaceChildren();
    document.getElementById("_openp41ge-error-modal")?.remove();
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

  it("shows a non-blocking error toast on an uncaught error", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.onerror as any)("toast test boom", "bundle.js", 1, 2, new Error("toast test boom"));

    const container = document.querySelector("openp41ge-toast");
    expect(container).not.toBeNull();
    const item = container!.querySelector(".openp41ge-toast-error");
    expect(item).not.toBeNull();
    expect(item!.textContent).toContain("toast test boom");
    // It must never be a blocking full-screen overlay.
    expect(document.getElementById("_openp41ge-error-overlay")).toBeNull();
  });

  it("opens the detail modal when the error toast is clicked in dev", () => {
    setErrorCaptureDevMode(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.onerror as any)("modal boom", "b.js", 1, 2, new Error("modal boom"));

    const toast = document.querySelector("openp41ge-toast .openp41ge-toast-error") as HTMLElement;
    toast.click();

    const modal = document.getElementById("_openp41ge-error-modal");
    expect(modal).not.toBeNull();
    expect(modal!.style.display).toBe("flex");
    expect(modal!.textContent).toContain("modal boom");
  });

  it("does not open the detail modal in production (toast is not clickable)", () => {
    setErrorCaptureDevMode(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.onerror as any)("prod boom", "b.js", 1, 2, new Error("prod boom"));

    const toast = document.querySelector("openp41ge-toast .openp41ge-toast-error") as HTMLElement;
    toast.click();

    expect(document.getElementById("_openp41ge-error-modal")).toBeNull();
  });
});

describe("error-capture-service detail modal", () => {
  beforeEach(() => {
    setMinLevel(LogLevel.DEBUG);
    installErrorCapture();
    setErrorCaptureDevMode(true);
  });

  afterEach(() => {
    clearCapturedErrors();
    setErrorCaptureDevMode(true);
    setMinLevel(LogLevel.INFO);
    document.querySelector("openp41ge-toast")?.replaceChildren();
    document.getElementById("_openp41ge-error-modal")?.remove();
  });

  function openModalViaToast(message: string): HTMLElement {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.onerror as any)(message, "src.ts", 1, 4, new Error(message));
    (document.querySelector("openp41ge-toast .openp41ge-toast-error") as HTMLElement).click();
    return document.getElementById("_openp41ge-error-modal")!;
  }

  it("closes on Escape", () => {
    const modal = openModalViaToast("esc boom");
    expect(modal.style.display).toBe("flex");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(modal.style.display).toBe("none");
  });

  it("closes on the close button", () => {
    const modal = openModalViaToast("close boom");
    (modal.querySelector(".op-err-close") as HTMLElement).click();
    expect(modal.style.display).toBe("none");
  });

  it("closes when clearCapturedErrors is called", () => {
    const modal = openModalViaToast("clear boom");
    expect(modal.style.display).toBe("flex");
    clearCapturedErrors();
    expect(modal.style.display).toBe("none");
  });
});
