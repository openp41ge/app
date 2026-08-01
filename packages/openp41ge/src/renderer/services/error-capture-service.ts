/**
 * ErrorCaptureService — captures runtime errors (renderer + main process)
 * and displays a full-screen blocking overlay.
 *
 * The overlay is:
 *   - Full-screen, covering everything
 *   - Blocking — all pointer events pass through to nothing underneath
 *   - Non-dismissible — no close button, must be resolved by fixing errors
 *   - Visually prominent with a red background
 *
 * Renderer errors: window.onerror, unhandledrejection, console.error
 * Main process errors: forwarded via IPC channel "openp41ge:error"
 *
 * Install at the VERY TOP of bootstrap.start() so startup errors are caught.
 */

const STORAGE_KEY = "openp41ge:captured-errors";


import { MAX_ERRORS } from "openp41ge-constants";

interface CapturedError {
  message: string;
  source: string;
  stack: string;
  timestamp: number;
  type: "exception" | "rejection" | "console" | "main-process";
}

let errors: CapturedError[] = [];
let overlayEl: HTMLElement | null = null;
let isInstalled = false;

function addError(err: CapturedError): void {
  errors = [err, ...errors].slice(0, MAX_ERRORS);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(errors.slice(0, 20)));
  } catch {
    /* quota exceeded */
  }
  renderOverlay();
}

function renderOverlay(): void {
  if (!overlayEl) return;
  if (errors.length === 0) {
    overlayEl.style.display = "none";
    return;
  }
  overlayEl.style.display = "flex";

  overlayEl.innerHTML = `
    <div class="w-[90%] max-w-[800px] max-h-[85vh] flex flex-col">
      <div class="text-center py-4 pb-3 border-b border-[rgba(255,255,255,.15)] mb-2">
        <div class="text-5xl font-bold text-white leading-none">⚠</div>
        <div class="text-lg font-semibold text-white mt-1">
          ${errors.length} Error${errors.length !== 1 ? "s" : ""} Detected
        </div>
        <div class="text-sm text-[rgba(255,255,255,.6)] mt-0.5">
          The application is paused until all errors are resolved.
        </div>
      </div>
      <div class="flex-1 overflow-y-auto py-1">
        ${errors
          .map(
            (e, _idx) => `
          <div class="bg-[rgba(0,0,0,.3)] rounded p-2.5 mb-1.5 text-13 leading-[1.5] relative">
            <button
              onclick="(function(btn){var t=btn.parentElement.querySelector('.err-msg')?.textContent||'';navigator.clipboard.writeText(t).then(function(){var o=btn.textContent;btn.textContent='Copied!';setTimeout(function(){btn.textContent=o},1500)}).catch(function(){})})(this)"
              class="absolute top-1.5 right-1.5 bg-[rgba(255,255,255,.1)] border border-[rgba(255,255,255,.2)] rounded text-[rgba(255,255,255,.7)] text-xs px-2 py-0.5 cursor-pointer leading-[1.4] select-none"
            >Copy</button>
            <div class="err-msg text-[#ffcdd2] font-semibold mb-0.5 select-text">
              ${escHtml(e.type === "main-process" ? "[MAIN PROCESS] " : "")}${escHtml(e.message)}
            </div>
            <div class="text-[rgba(255,255,255,.5)] text-xs mb-0.5 select-text">
              ${escHtml(e.source)}${e.stack ? " — stack available" : ""}
            </div>
            ${e.stack ? `<pre class="mt-1 mb-0 whitespace-pre-wrap text-[rgba(255,255,255,.4)] text-xs select-text">${escHtml(e.stack.slice(0, 1000))}</pre>` : ""}
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Clear all captured errors and hide the overlay.
 * Called after a successful project selection to dismiss stale errors
 * from a previous session or hot reload.
 */
export function clearCapturedErrors(): void {
  errors = [];
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  renderOverlay();
}

/**
 * Install global error handlers for the renderer process.
 * Also sets up an IPC listener for errors forwarded from the main process.
 */
export function installErrorCapture(): void {
  if (isInstalled) return;
  isInstalled = true;

  // ── Create full-screen blocking overlay ────────────────────────────
  overlayEl = document.createElement("div");
  overlayEl.id = "_openp41ge-error-overlay";
  overlayEl.style.cssText = `
    position:fixed;
    inset:0;
    z-index:2147483647;
    display:none;
    align-items:center;
    justify-content:center;
    background:rgba(120,20,20,.96);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    color:#fff;
  `;

  const appendOverlay = () => {
    if (document.body && !document.body.contains(overlayEl)) {
      document.body.appendChild(overlayEl!);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", appendOverlay);
  } else {
    appendOverlay();
  }

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
    addError({
      message: msg,
      source: source || "",
      stack: error?.stack || "",
      timestamp: Date.now(),
      type: "exception",
    });
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
    const msg = args.map((a) => (typeof a === "object" ? String(a) : String(a))).join(" ");
    // Skip benign browser-internal warnings that are not real app errors
    if (msg.includes("ResizeObserver loop completed with undelivered notifications")) {
      origConsoleError.apply(console, args);
      return;
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

  // Restore any errors stored from a previous page load
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      errors = JSON.parse(stored);
      renderOverlay();
    }
  } catch {
    /* ignore */
  }
}
