import { describe, it, expect, vi, afterEach } from "vitest";
import { OverlayScrollbar } from "../src/overlay-scrollbar.js";

// jsdom (and the package-local vitest run) provides no ResizeObserver; stub it
// so the component can mount. (The root vitest setup already stubs it too.)
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

/**
 * jsdom has no layout, so elements report zero sizes. Define the scroll
 * geometry on the target so the component sees a scrollable region: a 2000px
 * tall document in a 400px viewport, with a mutable scrollTop.
 */
function makeScrollTarget(): HTMLElement {
  const div = document.createElement("div");
  Object.defineProperty(div, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(div, "scrollHeight", { value: 2000, configurable: true });
  let top = 0;
  Object.defineProperty(div, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = v;
    },
  });
  return div;
}

const instances: OverlayScrollbar[] = [];
function attach(target: HTMLElement, options: Parameters<typeof OverlayScrollbar.attach>[1] = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const sb = OverlayScrollbar.attach(target, { container, ...options });
  instances.push(sb);
  return { container, sb };
}

afterEach(() => {
  for (const sb of instances.splice(0)) sb.destroy();
  document.body.innerHTML = "";
});

describe("OverlayScrollbar pinned icon", () => {
  it("creates a non-interactive pin icon when the `pinned` option is provided", () => {
    const { container } = attach(makeScrollTarget(), { pinned: true });
    const pin = container.querySelector<HTMLElement>(".os-pin");
    expect(pin).not.toBeNull();
    expect(pin!.tagName).toBe("SPAN"); // an icon, never a button
    expect(pin!.getAttribute("aria-hidden")).toBe("true");
    expect(pin!.querySelector("svg path")).not.toBeNull();
  });

  it("does not create the pin icon without the option", () => {
    const { container } = attach(makeScrollTarget());
    expect(container.querySelector(".os-pin")).toBeNull();
  });

  it("shows the icon while pinned and hides it once unpinned", () => {
    const target = makeScrollTarget();
    const { container, sb } = attach(target, { pinned: true });
    const pin = container.querySelector<HTMLElement>(".os-pin")!;

    // Pinned (auto-following) at attach → visible.
    expect(pin.classList.contains("os-pin-hidden")).toBe(false);
    // The host stops following (user scrolled up) → icon disappears.
    sb.setPinned(false);
    expect(pin.classList.contains("os-pin-hidden")).toBe(true);
    // Back at the bottom / re-pinned → icon reappears.
    sb.setPinned(true);
    expect(pin.classList.contains("os-pin-hidden")).toBe(false);
  });

  it("hides the pin icon when the scrollbar auto-hides", () => {
    vi.useFakeTimers();
    const target = makeScrollTarget();
    const { container } = attach(target, { pinned: true, autoHide: true });
    const pin = container.querySelector<HTMLElement>(".os-pin")!;
    // Bar visible and pinned → icon shown.
    expect(pin.classList.contains("os-pin-hidden")).toBe(false);
    // Let the auto-hide delay elapse (cursor never entered) → bar fades and
    // the icon disappears with it.
    vi.advanceTimersByTime(3000);
    expect(pin.classList.contains("os-pin-hidden")).toBe(true);
    vi.useRealTimers();
  });
});
