/**
 * Unit tests for Openp41geTooltipHost (display surface: variant selection,
 * show/hide delays, fade, positioning, ARIA) and the two tooltip components.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { Openp41geTooltipHost } from "../../src/components/tooltip/tooltip-host";
import { Openp41geTooltip } from "../../src/components/tooltip/openp41ge-tooltip";
import { Openp41geTooltipDetail } from "../../src/components/tooltip/openp41ge-tooltip-detail";

const R = (
  left: number,
  top: number,
  right: number,
  bottom: number,
): DOMRect =>
  ({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

describe("tooltip panel components", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("Openp41geTooltip renders a single line of text", async () => {
    const el = new Openp41geTooltip();
    el.text = "Close left sidebar";
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.textContent).toContain("Close left sidebar");
  });

  test("Openp41geTooltipDetail renders title + wrapping subtitle", async () => {
    const el = new Openp41geTooltipDetail();
    el.title = "Workspaces";
    el.subtitle = "Open the Workspaces overlay.";
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.textContent).toContain("Workspaces");
    expect(el.textContent).toContain("Open the Workspaces overlay.");
  });
});

describe("Openp41geTooltipHost", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Openp41geTooltipHost.instance = null;
    window.innerWidth = 1024;
    window.innerHeight = 768;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    Openp41geTooltipHost.instance = null;
  });

  const makeHost = (): Openp41geTooltipHost => {
    const h = new Openp41geTooltipHost();
    document.body.appendChild(h);
    return h;
  };

  const stubOffset = (el: HTMLElement, w: number, h: number): void => {
    Object.defineProperty(el, "offsetWidth", { value: w, configurable: true });
    Object.defineProperty(el, "offsetHeight", { value: h, configurable: true });
  };

  test("show mounts the matching variant and wires ARIA after the show delay", async () => {
    const host = makeHost();
    const target = document.createElement("button");
    document.body.appendChild(target);
    target.getBoundingClientRect = () => R(100, 100, 160, 130);
    host.show(target, { type: "detail", title: "Workspaces", subtitle: "Switch projects." });

    // Nothing before the show delay.
    expect(host.querySelector("openp41ge-tooltip-detail")).toBeNull();

    await vi.advanceTimersByTimeAsync(220);
    await Promise.resolve();

    const popup = host.querySelector("openp41ge-tooltip-detail");
    expect(popup).not.toBeNull();
    expect(popup!.getAttribute("role")).toBe("tooltip");
    expect(target.getAttribute("aria-describedby")).toBe(popup!.id);
    expect(popup!.style.opacity).toBe("1"); // fade-in settles at 1
    // Fade is driven by deterministic JS steps, not a CSS transition.
    expect(popup!.style.transition).toBe("none");
    // Tail: placement + target-centre offset (target centre 130 - popup left 100).
    expect(popup!.getAttribute("data-placement")).toBe("below");
    expect(popup!.style.getPropertyValue("--tt-tail-left")).toBe("30px");
  });

  test("hide fades out, clears aria-describedby, and hides after the fade", async () => {
    const host = makeHost();
    const target = document.createElement("button");
    document.body.appendChild(target);
    target.getBoundingClientRect = () => R(100, 100, 160, 130);
    host.show(target, { type: "simple", text: "Save" });
    await vi.advanceTimersByTimeAsync(120);
    expect(target.getAttribute("aria-describedby")).not.toBeNull();
    const popup = host.querySelector("openp41ge-tooltip")!;
    expect(popup.style.display).toBe("");

    host.hide();
    await vi.advanceTimersByTimeAsync(61); // hide delay
    expect(target.getAttribute("aria-describedby")).toBeNull();
    await vi.advanceTimersByTimeAsync(91); // fade
    expect(popup.style.display).toBe("none");
  });

  test("_position places below, flips above near the bottom, clamps horizontally", () => {
    const host = makeHost();
    const target = document.createElement("button");
    document.body.appendChild(target);
    const popup = document.createElement("div");
    document.body.appendChild(popup);
    stubOffset(popup, 120, 40);
    const pos = (host as unknown as { _position: (p: HTMLElement, t: HTMLElement) => void })._position;

    // Below, comfortably inside the viewport.
    target.getBoundingClientRect = () => R(200, 100, 260, 130);
    pos(popup, target);
    expect(popup.style.top).toBe("136px"); // 130 + gap 6
    expect(popup.style.left).toBe("200px");

    // Near the bottom edge → flip above (top=730, popup 40 tall → 730 - gap 6 - 40).
    target.getBoundingClientRect = () => R(200, 730, 260, 760);
    pos(popup, target);
    expect(popup.style.top).toBe("684px");

    // Right edge → clamp left so it stays in the viewport.
    target.getBoundingClientRect = () => R(960, 100, 1020, 130);
    pos(popup, target);
    expect(popup.style.left).toBe("896px"); // 1024 - 120 - margin 8
  });

  test("repositions on resize while visible and hides when the target disconnects", async () => {
    const host = makeHost();
    const target = document.createElement("button");
    document.body.appendChild(target);
    let rect = R(100, 100, 160, 130);
    target.getBoundingClientRect = () => rect;

    host.show(target, { type: "simple", text: "Save" });
    await vi.advanceTimersByTimeAsync(120);
    const popup = host.querySelector("openp41ge-tooltip")!;
    stubOffset(popup, 120, 40);
    expect(popup.style.left).toBe("100px");

    rect = R(300, 100, 360, 130);
    window.dispatchEvent(new Event("resize"));
    expect(popup.style.left).toBe("300px");

    // Removing the target while visible dismisses the tooltip.
    target.remove();
    window.dispatchEvent(new Event("scroll", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(95);
    expect(popup.style.display).toBe("none");
  });
});
