/**
 * ErrorCaptureService — captures runtime errors (renderer + main process),
 * logs them to the log bus + on-disk file (and Sentry where available), and
 * surfaces them via a NON-BLOCKING persistent error toast.
 *
 * The old full-screen blocking overlay and the toast-click modal are gone.
 * Instead, captured errors are held in a reactive list that any UI (e.g. the
 * manager window's "Errors" grid tab) can subscribe to. Clicking an error
 * toast opens that grid via the "openp41ge:open-error-grid" document event.
 *
 * Renderer errors: window.onerror, unhandledrejection, console.error
 * Main process errors: forwarded via IPC channel "openp41ge:error"
 *
 * Install at the VERY TOP of bootstrap.start() so startup errors are caught.
 */

const STORAGE_KEY = "openp41ge:captured-errors";
/** Document event dispatched when an error toast is clicked (opens the Errors grid tab). */
export const OPEN_ERROR_GRID_EVENT = "openp41ge:open-error-grid";

import { createLogger } from "openp41ge-logger";
import * as Sentry from "@sentry/electron/renderer";
import { MAX_ERRORS } from "openp41ge-constants";
import { toastService } from "../components/openp41ge-toast";

const log = createLogger("openp41ge", "error-capture");

export interface CapturedError {
  message: string;
  source: string;
  stack: string;
  timestamp: number;
  type: "exception" | "rejection" | "console" | "main-process";
}

let errors: CapturedError[] = [];
let isInstalled = false;

/** Subscribe to the captured-errors list. The listener is called immediately
 *  with the current list, then again on every change. */
type ErrorListener = (errors: CapturedError[]) => void;
const _listeners = new Set<ErrorListener>();

/**
 * True while this service is emitting a `log.error` (which the console
 * transport replays to console.error and would hence re-trigger the console
 * interceptor below). Guards the double-count of an uncaught error — the
 * onerror / rejection handler adds it explicitly once.
 */
let _suppressConsoleCapture = false;

/** Coalesce rapid duplicate error toasts so a burst never floods the screen. */
let _lastToastMessage = "";
let _lastToastAt = 0;

function emitChanges(): void {
  const snapshot = errors;
  for (const cb of _listeners) {
    try {
      cb(snapshot);
    } catch {
      /* a listener must never break error capture */
    }
  }
}

function persist(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(errors.slice(0, 20)));
  } catch {
    /* quota exceeded */
  }
}

function addError(err: CapturedError): void {
  errors = [err, ...errors].slice(0, MAX_ERRORS);
  persist();
  showErrorToast(err);
  emitChanges();
}

function describeError(err: CapturedError): string {
  return `${err.type === "main-process" ? "[MAIN PROCESS] " : ""}${err.message}`;
}

function showErrorToast(err: CapturedError): void {
  const full = describeError(err);
  const now = Date.now();
  if (full === _lastToastMessage && now - _lastToastAt < 2000) {
    // Same error repeated recently — refresh the coalesce window, don't stack.
    _lastToastAt = now;
    return;
  }
  _lastToastMessage = full;
  _lastToastAt = now;

  const preview = full.length > 180 ? `${full.slice(0, 180)}…` : full;
  // Errors never auto-dismiss (duration 0) — the user must dismiss them, or
  // click the toast to open the Errors grid tab (the manager window listens
  // for OPEN_ERROR_GRID_EVENT).
  toastService.show(`Error: ${preview}`, "error", 0, () => {
    document.dispatchEvent(new CustomEvent(OPEN_ERROR_GRID_EVENT));
  });
}

/** Current captured errors (newest first). */
export function getCapturedErrors(): CapturedError[] {
  return errors;
}

/** Subscribe to captured-error changes. Returns a cancel function. */
export function subscribeErrors(listener: ErrorListener): () => void {
  _listeners.add(listener);
  try {
    listener(errors);
  } catch {
    /* ignore */
  }
  return () => {
    _listeners.delete(listener);
  };
}

/** Remove a single error by its index in the captured list. */
export function removeCapturedError(index: number): void {
  if (index < 0 || index >= errors.length) return;
  errors = errors.filter((_, i) => i !== index);
  persist();
  emitChanges();
}

/** Clear all captured errors. */
export function clearCapturedErrors(): void {
  errors = [];
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  emitChanges();
}

/**
 * Install global error handlers for the renderer process.
 * Also sets up an IPC listener for errors forwarded from the main process.
 */
export function installErrorCapture(): void {
  if (isInstalled) return;
  isInstalled = true;

  // ── Listen for main-process errors forwarded via IPC ────────────────
  try {
    if (window.openp41ge?.lifecycle?.onError) {
      window.openp41ge.lifecycle.onError((data) => {
        addError({
          message: data.message || "(no message)",
          source: data.source || "main-process",
          stack: data.stack || "",
          timestamp: Date.now(),
          type: "main-process",
        });
      });
    }
  } catch {
    /* preload might not be ready */
  }

  // ── window.onerror ──────────────────────────────────────────────────
  const origOnerror = window.onerror;
  window.onerror = ((
    message: string | Event,
    source?: string,
    lineno?: number,
    colno?: number,
    error?: Error,
  ) => {
    const msg = typeof message === "string" ? message : String(message);
    // Benign browser diagnostics (e.g. ResizeObserver loop completion) also
    // arrive through window.onerror as uncaught "exceptions" — skip them so
    // they never surface, matching the console.error filter below.
    if (!isBenignRendererDiagnostic(msg)) {
      // Land the error in the log bus + file. The console transport replays
      // ERROR to console.error, which our own interceptor would otherwise add
      // AGAIN (type "console") — suppress it during the emit so a single
      // uncaught error is only shown once.
      _suppressConsoleCapture = true;
      try {
        log.error("uncaught-error", {
          message: msg,
          source: source || "",
          stack: error?.stack || "",
        });
      } finally {
        _suppressConsoleCapture = false;
      }
      addError({
        message: msg,
        source: source || "",
        stack: error?.stack || "",
        timestamp: Date.now(),
        type: "exception",
      });
    }
    if (typeof origOnerror === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origOnerror as any)(message, source, lineno, colno, error);
    }
    return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  // ── Unhandled rejections ────────────────────────────────────────────
  const origOnrejection = window.onunhandledrejection;
  window.onunhandledrejection = ((event: PromiseRejectionEvent) => {
    const reason = event.reason;
    // Land the rejection in the log bus + file (suppress the replay into the
    // console interceptor so it isn't double-counted as a console error).
    _suppressConsoleCapture = true;
    try {
      log.error("unhandled-rejection", {
        message: reason?.message || String(reason),
        stack: reason?.stack || "",
      });
    } finally {
      _suppressConsoleCapture = false;
    }
    addError({
      message: reason?.message || String(reason),
      source: "",
      stack: reason?.stack || "",
      timestamp: Date.now(),
      type: "rejection",
    });
    if (typeof origOnrejection === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (origOnrejection as any)(event);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  // ── console.error interception ──────────────────────────────────────
  // eslint-disable-next-line no-console
  const origConsoleError = console.error;
  // eslint-disable-next-line no-console
  console.error = (...args: unknown[]) => {
    const msg = args.map((a: unknown) => (typeof a === "object" ? String(a) : String(a))).join(" ");
    // Skip benign browser-internal warnings that are not real app errors
    if (isBenignRendererDiagnostic(msg)) {
      origConsoleError.apply(console, args);
      return;
    }
    // Suppress the re-entry from this service's own log.error emit so a single
    // uncaught error isn't surfaced twice (see _suppressConsoleCapture).
    if (_suppressConsoleCapture) {
      origConsoleError.apply(console, args);
      return;
    }
    // Breadcrumb so a Sentry event (uncaught errors are auto-captured by the
    // browser SDK's global handler) carries the console context that preceded
    // it. Safe no-op when Sentry isn't initialized (e.g. no DSN).
    try {
      Sentry.addBreadcrumb({
        category: "console",
        level: "error",
        message: msg.slice(0, 300),
      });
    } catch {
      // never let telemetry throw
    }
    addError({
      message: msg,
      source: "",
      stack: new Error().stack || "",
      timestamp: Date.now(),
      type: "console",
    });
    origConsoleError.apply(console, args);
  };

  // Restore any errors stored from a previous page load — surface a single
  // summary toast (never a blocking screen). Clicking it opens the grid.
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      errors = JSON.parse(stored);
      if (errors.length > 0) {
        toastService.show(
          `${errors.length} error${errors.length !== 1 ? "s" : ""} detected from a previous session`,
          "error",
          0,
          () => {
            document.dispatchEvent(new CustomEvent(OPEN_ERROR_GRID_EVENT));
          },
        );
        emitChanges();
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * True when a message is a benign browser-internal diagnostic that must NOT
 * surface as an error. The browser reports these itself (e.g. ResizeObserver
 * loop completion) and recovers internally — they are not app errors. Used in
 * BOTH the console.error interceptor and the window.onerror handler, because
 * Chromium can emit the SAME message through either path.
 */
function isBenignRendererDiagnostic(msg: string): boolean {
  return msg.includes("ResizeObserver loop completed with undelivered notifications");
}
