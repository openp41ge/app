/**
 * Consolidated test setup for all openp41ge packages.
 *
 * Merges setup logic from:
 * - packages/openp41ge-file-editor/test/unit/setup.ts
 * - packages/openp41ge-agent-chat/test/unit/setup.ts
 * - packages/openp41ge-logger/test/unit/setup.ts
 * - packages/openp41ge-terminal/test/unit/setup.ts
 */

import { vi } from "vitest";

// ── Stub Electron preload API ─────────────────────────────────────────

if (typeof window !== "undefined" && !window.openp41ge) {
  (window as unknown as { openp41ge: Record<string, unknown> }).openp41ge = {
    file: {
      readRange: vi.fn(),
      writeFile: vi.fn(),
    },
  };
}

// ── Ensure customElements exists ──────────────────────────────────────

// jsdom doesn't support customElements registration by default.
// We define NO-OP stubs so imports that call defineElement don't throw.
if (typeof customElements === "undefined") {
  (globalThis as unknown as { customElements: Record<string, unknown> }).customElements = {
    _registry: new Map<string, any>(),
    define(name: string, ctor: any) {
      this._registry.set(name, ctor);
    },
    get(name: string) {
      return this._registry.get(name);
    },
    whenDefined(name: string): Promise<void> {
      if (this._registry.has(name)) return Promise.resolve();
      return Promise.reject(new Error(`Element ${name} not defined`));
    },
    upgrade(_root: Node): void {
      // noop
    },
  };
}

// ── Stub ShadowRoot if not available ──────────────────────────────────

if (typeof ShadowRoot === "undefined") {
  (globalThis as unknown as { ShadowRoot: typeof ShadowRoot }).ShadowRoot =
    class ShadowRoot {} as unknown as typeof ShadowRoot;
}

// ── Stub attachShadow if not supported ─────────────────────────────────

if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.attachShadow) {
  HTMLElement.prototype.attachShadow = function (
    this: HTMLElement,
    _init: ShadowRootInit,
  ): ShadowRoot {
    // Provide a basic shadow root stub that supports innerHTML assignment
    const stub = Object.assign(document.createElement("div"), {
      mode: _init.mode,
      adoptedStyleSheets: [],
    }) as unknown as ShadowRoot;
    (this as unknown as { shadowRoot: ShadowRoot }).shadowRoot = stub;
    return stub;
  };
}

// ── Stub requestAnimationFrame ────────────────────────────────────────

if (typeof requestAnimationFrame === "undefined") {
  (
    globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }
  ).requestAnimationFrame = (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(0), 0) as unknown as number;
  };
}

// ── Suppress Lit ChildPart errors from innerHTML cleanup ──────────────

// When tests clear document.body.innerHTML = "", Lit's internal marker
// comment nodes are ejected, causing harmless ChildPart errors.
// We suppress these to keep test output clean.
process.on("unhandledRejection", (err) => {
  if (err instanceof Error && err.message?.includes("ChildPart has no parentNode")) {
    // Suppress Lit's internal DOM marker ejection errors
    return;
  }
  // Re-throw all other unhandled rejections
  console.error("Unhandled Rejection:", err);
});

// ── Suppress known console noise ──────────────────────────────────────────
//
// Intercept console.warn/error to suppress patterns that are expected in tests
// (Lit dev-mode message, jsdom limitations, intentional test errors).

const _origConsoleInfo = console.info.bind(console);
const _origConsoleWarn = console.warn.bind(console);
const _origConsoleError = console.error.bind(console);
const _noisePatterns = [
  "Lit is in dev mode",
  "HTMLCanvasElement",
  "ChildPart has no parentNode",
  "Error unmounting controller",
  "ConfigService.*init error",
  "[config-service]",
];

console.info = (...args: any[]) => {
  const msg = args.join(" ");
  if (_noisePatterns.some((p) => msg.includes(p) || new RegExp(p).test(msg))) return;
  _origConsoleInfo(...args);
};

console.warn = (...args: any[]) => {
  const msg = args.join(" ");
  if (_noisePatterns.some((p) => msg.includes(p) || new RegExp(p).test(msg))) return;
  _origConsoleWarn(...args);
};

console.error = (...args: any[]) => {
  const msg = args.join(" ");
  if (_noisePatterns.some((p) => msg.includes(p) || new RegExp(p).test(msg))) return;
  _origConsoleError(...args);
};
