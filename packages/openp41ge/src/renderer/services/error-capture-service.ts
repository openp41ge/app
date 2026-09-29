/**
 * ErrorCaptureService — captures runtime errors (renderer + main process),
 * logs them to the log bus + on-disk file (and Sentry where available), and
 * surfaces them via a NON-BLOCKING error toast.
 *
 * The old full-screen blocking red overlay is gone. Instead:
 *   - Every captured error logs + shows an error toast (dev and production).
 *   - In development, clicking the toast opens a dismissible detail modal
 *     listing all captured errors + stack traces.
 *   - In production the modal is disabled — the app never pauses for an
 *     error, only a toast is shown.
 *
 * Renderer errors: window.onerror, unhandledrejection, console.error
 * Main process errors: forwarded via IPC channel "openp41ge:error"
 *
 * Install at the VERY TOP of bootstrap.start() so startup errors are caught.
 */

const STORAGE_KEY = "openp41ge:captured-errors";

import { createLogger } from "openp41ge-logger";
import * as Sentry from "@sentry/electron/renderer";
import { MAX_ERRORS } from "openp41ge-constants";
import { toastService } from "../components/openp41ge-toast";

const log = createLogger("openp41ge", "error-capture");

interface CapturedError {
  message: string;
  source: string;
  stack: string;
  timestamp: number;
  type: "exception" | "rejection" | "console" | "main-process";
}

let errors: CapturedError[] = [];
let modalEl: HTMLElement | null = null;
let modalStylesInjected = false;
let isInstalled = false;

/**
 * True while this service is emitting a `log.error` (which the console
 * transport replays to console.error and would hence re-trigger the console
 * interceptor below). Guards the double-count of an uncaught error — the
 * onerror / rejection handler adds it explicitly once.
 */
let _suppressConsoleCapture = false;

/**
 * Whether the detail modal is enabled. Defaults to the real dev flag
 * (`window.openp41ge.isDev()`). Disabled in packaged production builds.
 * Tests can override via setErrorCaptureDevMode().
 */
let _isDev = detectIsDev();

/** Coalesce rapid duplicate error toasts so a burst never floods the screen. */
let _lastToastMessage = "";
let _lastToastAt = 0;

function detectIsDev(): boolean {
  try {
    if (window.openp41ge && typeof window.openp41ge.isDev === "function") {
      return !!window.openp41ge.isDev();
    }
  } catch {
    /* preload may not be ready */
  }
  // Browser / test context behaves like dev so the modal stays available.
  return true;
}

/** Override dev/production detection (used by tests). */
export function setErrorCaptureDevMode(value: boolean): void {
  _isDev = value;
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
  // If the detail modal is open, keep it in sync with the latest errors.
  if (modalEl && modalEl.style.display === "flex") {
    renderModal();
  }
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
  // Only in development does clicking the toast open the detail modal.
  const onClick = _isDev ? openErrorModal : undefined;
  toastService.show(`Error: ${preview}`, "error", 6000, onClick);
}

// ── Detail modal (development only) ─────────────────────────────────────

function injectModalStyles(): void {
  if (modalStylesInjected) return;
  modalStylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    #_openp41ge-error-modal {
      position: fixed; inset: 0; z-index: 2147483647; display: none;
      align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.55); font-family: var(--font-ui);
    }
    #_openp41ge-error-modal .op-err-card {
      width: min(90vw, 800px); max-height: 85vh; display: flex; flex-direction: column;
      background: #1e1e2e; color: #fff; border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
      overflow: hidden;
    }
    #_openp41ge-error-modal .op-err-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }
    #_openp41ge-error-modal .op-err-title {
      font-size: 15px; font-weight: 600;
    }
    #_openp41ge-error-modal .op-err-close {
      background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2);
      color: rgba(255, 255, 255, 0.8); width: 28px; height: 28px; border-radius: 6px;
      cursor: pointer; font-size: 14px; line-height: 1;
    }
    #_openp41ge-error-modal .op-err-close:hover { background: rgba(255, 255, 255, 0.2); }
    #_openp41ge-error-modal .op-err-body {
      flex: 1; overflow-y: auto; padding: 12px 18px 18px;
    }
    #_openp41ge-error-modal .op-err-empty {
      color: rgba(255, 255, 255, 0.6); padding: 12px 0; text-align: center;
    }
    #_openp41ge-error-modal .op-err-item {
      background: rgba(0, 0, 0, 0.3); border-radius: 8px;
      padding: 10px 12px; margin-bottom: 10px; position: relative;
      font-size: 13px; line-height: 1.5;
    }
    #_openp41ge-error-modal .op-err-copy {
      position: absolute; top: 8px; right: 8px;
      background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px; color: rgba(255, 255, 255, 0.7); font-size: 12px;
      padding: 2px 8px; cursor: pointer;
    }
    #_openp41ge-error-modal .op-err-msg {
      color: #ffcdd2; font-weight: 600; margin-bottom: 4px; word-break: break-word;
      padding-right: 60px;
    }
    #_openp41ge-error-modal .op-err-meta {
      color: rgba(255, 255, 255, 0.5); font-size: 12px; margin-bottom: 6px;
    }
    #_openp41ge-error-modal .op-err-stack {
      margin: 0; white-space: pre-wrap; color: rgba(255, 255, 255, 0.45);
      font-size: 12px; overflow-wrap: anywhere;
    }
  `;
  document.head.appendChild(style);
}

function ensureModal(): HTMLElement {
  if (modalEl) {
    // Re-attach if it was detached (e.g. tests tore it down between cases).
    if (document.body && !document.body.contains(modalEl)) {
      document.body.appendChild(modalEl);
    }
    return modalEl;
  }
  injectModalStyles();
  modalEl = document.createElement("div");
  modalEl.id = "_openp41ge-error-modal";
  // Click on the backdrop (not the card) dismisses.
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeErrorModal();
  });
  const append = () => {
    if (document.body && !document.body.contains(modalEl)) {
      document.body.appendChild(modalEl!);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", append);
  } else {
    append();
  }
  return modalEl;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderModal(): void {
  if (!modalEl) return;
  const list =
    errors.length === 0
      ? `<div class="op-err-empty">No errors captured.</div>`
      : errors
          .map(
            (e) => `
          <div class="op-err-item">
            <button class="op-err-copy"
              onclick="(function(btn){var t=btn.parentElement.querySelector('.op-err-msg')?.textContent||'';navigator.clipboard.writeText(t).then(function(){var o=btn.textContent;btn.textContent='Copied!';setTimeout(function(){btn.textContent=o},1500)}).catch(function(){})})(this)"
            >Copy</button>
            <div class="op-err-msg">${escHtml(describeError(e))}</div>
            <div class="op-err-meta">${escHtml(e.source)}${e.stack ? " — stack available" : ""}</div>
            ${e.stack ? `<pre class="op-err-stack">${escHtml(e.stack.slice(0, 1000))}</pre>` : ""}
          </div>
        `,
          )
          .join("");

  modalEl.innerHTML = `
    <div class="op-err-card">
      <div class="op-err-head">
        <div class="op-err-title">⚠ ${errors.length} Error${errors.length !== 1 ? "s" : ""} Detected</div>
        <button class="op-err-close" title="Close">✕</button>
      </div>
      <div class="op-err-body">${list}</div>
    </div>
  `;
  modalEl.querySelector(".op-err-close")?.addEventListener("click", () => closeErrorModal());
}

function openErrorModal(): void {
  if (!_isDev) return; // modal disabled in production
  const el = ensureModal();
  renderModal();
  el.style.display = "flex";
}

function closeErrorModal(): void {
  if (modalEl) modalEl.style.display = "none";
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && modalEl && modalEl.style.display === "flex") {
    closeErrorModal();
  }
}

/** Clear all captured errors and close the detail modal. */
export function clearCapturedErrors(): void {
  errors = [];
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (modalEl && modalEl.style.display === "flex") {
    closeErrorModal();
  }
}

/**
 * Install global error handlers for the renderer process.
 * Also sets up an IPC listener for errors forwarded from the main process.
 */
export function installErrorCapture(): void {
  if (isInstalled) return;
  isInstalled = true;

  document.addEventListener("keydown", onKeydown);

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
  // summary toast (never a blocking screen). In dev it opens the modal.
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      errors = JSON.parse(stored);
      if (errors.length > 0) {
        const onClick = _isDev ? openErrorModal : undefined;
        toastService.show(
          `${errors.length} error${errors.length !== 1 ? "s" : ""} detected from a previous session`,
          "error",
          7000,
          onClick,
        );
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
