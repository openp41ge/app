/**
 * Unit tests for TooltipController (target registration + listener forwarding).
 *
 * Uses a fake `TooltipHostLike` injected via the settable `_host` default (DI),
 * so no host / DOM / timers are involved.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { TooltipController, type TooltipHostLike } from "../../src/components/tooltip/tooltip-controller";
import type { TooltipContent } from "../../src/components/tooltip/content";

function fakeHost(): { host: TooltipHostLike; show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> } {
  const show = vi.fn();
  const hide = vi.fn();
  return { show, hide, host: { show, hide } };
}

describe("TooltipController", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("attach registers content; mouseenter/focusin show, mouseleave/focusout hide", () => {
    const { host, show, hide } = fakeHost();
    const c = new TooltipController(host);
    const el = document.createElement("button");
    document.body.appendChild(el);
    const content: TooltipContent = { type: "simple", text: "Save" };
    c.attach(el, content);

    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(show).toHaveBeenCalledWith(el, content);
    el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(hide).toHaveBeenCalled();
    expect(show).toHaveBeenCalledTimes(1);

    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(show).toHaveBeenCalledTimes(2);
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(hide).toHaveBeenCalledTimes(2);
  });

  test("re-attach with changed content while shown refreshes the visible popup (dynamic label)", () => {
    const { host, show, hide } = fakeHost();
    const c = new TooltipController(host);
    const el = document.createElement("button");
    document.body.appendChild(el);
    const first: TooltipContent = { type: "simple", text: "Close left sidebar" };
    c.attach(el, first);
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(show).toHaveBeenLastCalledWith(el, first);

    // A re-render flips the toggle label while the pointer is still over it.
    const second: TooltipContent = { type: "simple", text: "Open left sidebar" };
    c.attach(el, second);
    expect(show).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenLastCalledWith(el, second);
    // Re-attach must not add duplicate listeners — a single leave hides once.
    el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(hide).toHaveBeenCalledTimes(1);
  });

  test("detach removes listeners and hides if it was shown", () => {
    const { host, show, hide } = fakeHost();
    const c = new TooltipController(host);
    const el = document.createElement("button");
    document.body.appendChild(el);
    c.attach(el, { type: "simple", text: "X" });
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(show).toHaveBeenCalledTimes(1);

    c.detach(el);
    expect(hide).toHaveBeenCalled();
    // Listeners are gone — dispatching again does nothing.
    el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(show).toHaveBeenCalledTimes(1);
  });

  test("the singleton host is resolved lazily and settable _host wins", () => {
    const c = new TooltipController();
    expect(c._host).toBeNull(); // not resolved until first use
    const { host } = fakeHost();
    c._host = host;
    expect(c._host).toBe(host);
  });
});
