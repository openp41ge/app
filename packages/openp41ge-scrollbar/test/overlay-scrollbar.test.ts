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
  it("creates a decorative pin icon (hoverable for its tooltip) when the `pinned` option is provided", () => {
    const { container, sb } = attach(makeScrollTarget(), { pinned: true });
    const pin = container.querySelector<HTMLElement>(".os-pin");
    expect(pin).not.toBeNull();
    expect(pin!.tagName).toBe("SPAN"); // an icon, never a button
    expect(pin!.getAttribute("aria-hidden")).toBe("true");
    expect(pin!.querySelector("svg path")).not.toBeNull();
    expect(sb.pinElement).toBe(pin);
    // No native title — the host wires the custom uikit tooltip instead.
    expect(pin!.hasAttribute("title")).toBe(false);
    // Hoverable so it can show a tooltip + hover chip, and so hovering it
    // doesn't fall through to the track's own hover-widen.
    expect(getComputedStyle(pin!).pointerEvents).toBe("auto");
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

describe("OverlayScrollbar scroll-to-bottom arrow", () => {
  it("creates the arrow when the `scrollToBottom` option is provided", () => {
    const { container, sb } = attach(makeScrollTarget(), { scrollToBottom: true });
    const arrow = container.querySelector<HTMLElement>(".os-scroll-down");
    expect(arrow).not.toBeNull();
    expect(arrow!.getAttribute("role")).toBe("button");
    expect(arrow!.hasAttribute("title")).toBe(false);
    expect(sb.scrollDownElement).toBe(arrow);
    expect(arrow!.querySelector("svg path")).not.toBeNull();
  });

  it("does not create the arrow without the option", () => {
    const { container } = attach(makeScrollTarget());
    expect(container.querySelector(".os-scroll-down")).toBeNull();
  });

  it("shows the arrow when scrolled up and hides it at the bottom", () => {
    const target = makeScrollTarget();
    const { container, sb } = attach(target, { scrollToBottom: true });
    const arrow = container.querySelector<HTMLElement>(".os-scroll-down")!;

    // Scrolled up away from the bottom → visible.
    target.scrollTop = 500;
    sb.update();
    expect(arrow.classList.contains("os-scroll-down-hidden")).toBe(false);
    // Back at the very bottom → nothing to scroll, arrow hides.
    target.scrollTop = target.scrollHeight;
    sb.update();
    expect(arrow.classList.contains("os-scroll-down-hidden")).toBe(true);
  });

  it("hides the arrow when there is nothing to scroll", () => {
    const target = makeScrollTarget();
    Object.defineProperty(target, "scrollHeight", { value: 400, configurable: true });
    const { container } = attach(target, { scrollToBottom: true });
    const arrow = container.querySelector<HTMLElement>(".os-scroll-down")!;
    expect(arrow.classList.contains("os-scroll-down-hidden")).toBe(true);
  });

  it("scrolls the target to the bottom when clicked", () => {
    const target = makeScrollTarget();
    const { container } = attach(target, { scrollToBottom: true });
    const arrow = container.querySelector<HTMLElement>(".os-scroll-down")!;
    target.scrollTop = 500;
    expect(target.scrollTop).toBe(500);
    arrow.dispatchEvent(new PointerEvent("click", { bubbles: true }));
    expect(target.scrollTop).toBe(target.scrollHeight);
  });
});
