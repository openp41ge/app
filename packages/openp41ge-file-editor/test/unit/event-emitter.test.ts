/**
 * Tests for EventEmitter.
 */
import { describe, it, expect, vi } from "vitest";
import { Emitter } from "@openp41ge-file-editor/model/event-emitter";

describe("Emitter", () => {
  it("emits to subscribed listeners", () => {
    const emitter = new Emitter<number>();
    const fn = vi.fn();
    const sub = emitter.event(fn);
    emitter.fire(42);
    expect(fn).toHaveBeenCalledWith(42);
    sub.dispose();
  });

  it("unsubscribes via disposer", () => {
    const emitter = new Emitter<string>();
    const fn = vi.fn();
    const sub = emitter.event(fn);
    sub.dispose();
    emitter.fire("test");
    expect(fn).not.toHaveBeenCalled();
  });

  it("supports multiple listeners", () => {
    const emitter = new Emitter<number>();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const sub1 = emitter.event(fn1);
    const sub2 = emitter.event(fn2);
    emitter.fire(1);
    expect(fn1).toHaveBeenCalledWith(1);
    expect(fn2).toHaveBeenCalledWith(1);
    sub1.dispose();
    sub2.dispose();
  });

  it("handles fire during dispose gracefully", () => {
    const emitter = new Emitter<number>();
    const fn = vi.fn();
    emitter.event(fn);
    emitter.dispose();
    // Fire after dispose should not throw
    emitter.fire(42);
    expect(fn).not.toHaveBeenCalled();
  });
});
