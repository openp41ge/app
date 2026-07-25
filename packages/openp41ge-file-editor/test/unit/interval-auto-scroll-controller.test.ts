/**
 * Tests for IntervalAutoScrollController — click-and-hold auto-scroll behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IntervalAutoScrollController } from "@openp41ge-file-editor/controllers/interval-auto-scroll-controller";

describe("IntervalAutoScrollController", () => {
  let controller: IntervalAutoScrollController;
  let target: HTMLElement;

  beforeEach(() => {
    controller = new IntervalAutoScrollController();
    target = document.createElement("div");
    // Simulate a scrollable container
    Object.defineProperty(target, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(target, "clientHeight", { value: 100, configurable: true });
    target.scrollTop = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is not scrolling initially", () => {
    expect(controller.isScrolling).toBe(false);
  });

  it("starts scrolling on start()", () => {
    vi.useFakeTimers();
    controller.start({ target, speed: 20, interval: 30 });
    expect(controller.isScrolling).toBe(true);
    vi.useRealTimers();
  });

  it("stops scrolling on stop()", () => {
    vi.useFakeTimers();
    controller.start({ target, speed: 20, interval: 30 });
    controller.stop();
    expect(controller.isScrolling).toBe(false);
    vi.useRealTimers();
  });

  it("scrolls the target downward every interval", () => {
    vi.useFakeTimers();
    const initialScrollTop = target.scrollTop;
    controller.start({ target, speed: 20, interval: 30 });

    vi.advanceTimersByTime(30);
    expect(target.scrollTop).toBe(initialScrollTop + 20);

    vi.advanceTimersByTime(30);
    expect(target.scrollTop).toBe(initialScrollTop + 40);

    controller.stop();
    vi.useRealTimers();
  });

  it("stops auto-scroll when target reaches the bottom", () => {
    vi.useFakeTimers();
    // In real browsers, scrollTop is clamped to scrollHeight - clientHeight.
    // Simulate that here by intercepting the scrollTop setter.
    let _scrollTop = 0;
    Object.defineProperty(target, "scrollTop", {
      get: () => _scrollTop,
      set: (val: number) => {
        const maxScroll = target.scrollHeight - target.clientHeight;
        _scrollTop = Math.max(0, Math.min(val, maxScroll));
      },
      configurable: true,
    });
    Object.defineProperty(target, "scrollHeight", { value: 500, configurable: true });
    Object.defineProperty(target, "clientHeight", { value: 100, configurable: true });
    target.scrollTop = 480; // 20px from bottom (max = 400)

    controller.start({ target, speed: 20, interval: 30 });

    // First tick scrolls by 20, reaching max scrollTop = 400
    vi.advanceTimersByTime(30);
    expect(target.scrollTop).toBe(400);

    // Second tick should not increase since autoscroll should have stopped
    const scrollTopAfter = target.scrollTop;
    vi.advanceTimersByTime(30);
    expect(target.scrollTop).toBe(scrollTopAfter);

    expect(controller.isScrolling).toBe(false);
    vi.useRealTimers();
  });

  it("stop() clears the interval so no further scrolling occurs", () => {
    vi.useFakeTimers();
    controller.start({ target, speed: 20, interval: 30 });

    vi.advanceTimersByTime(30);
    expect(target.scrollTop).toBe(20);

    controller.stop();
    // Advance time more; scrollTop should not change
    vi.advanceTimersByTime(120);
    expect(target.scrollTop).toBe(20);
    vi.useRealTimers();
  });

  it("start() called twice restarts without race condition", () => {
    vi.useFakeTimers();
    controller.start({ target, speed: 20, interval: 30 });
    controller.start({ target, speed: 10, interval: 50 });

    vi.advanceTimersByTime(50);
    expect(target.scrollTop).toBe(10);
    vi.useRealTimers();
  });
});
