// @vitest-environment jsdom
/**
 * Integration tests for tab navigation history — verifies that
 * grid-activate events and tab activations flow through TabActivationHistory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TabActivationHistory } from "@openp41ge/renderer/services/tab-activation-history";
import { Openp41geTabsEventHandler } from "@openp41ge/renderer/services/openp41ge-tabs-event-handler";

describe("Tab navigation history — integration", () => {
  let eventHandler: Openp41geTabsEventHandler;
  let commandBusMock: { dispatch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    TabActivationHistory._reset();
    commandBusMock = { dispatch: vi.fn() };
    eventHandler = new Openp41geTabsEventHandler();
    eventHandler.init(commandBusMock as any);
  });

  afterEach(() => {
    eventHandler.destroy();
  });

  it("grid-activate event pushes to history", () => {
    document.dispatchEvent(
      new CustomEvent("grid-activate", {
        detail: { winId: "w1", tabId: "t1" },
      }),
    );

    expect(TabActivationHistory.getCurrent("w1")).toBe("t1");
  });

  it("multiple grid-activate events build history", () => {
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t1" } }),
    );
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t2" } }),
    );
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t3" } }),
    );

    expect(TabActivationHistory.getCurrent("w1")).toBe("t3");
    expect(TabActivationHistory.canGoBack("w1")).toBe(true);

    expect(TabActivationHistory.goBack("w1")).toBe("t2");
    expect(TabActivationHistory.goBack("w1")).toBe("t1");
  });

  it("goBack returns the previous tab after event-driven activations", () => {
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t1" } }),
    );
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t2" } }),
    );

    const tabId = TabActivationHistory.goBack("w1");
    expect(tabId).toBe("t1");
    expect(TabActivationHistory.getCurrent("w1")).toBe("t1");

    // Go forward again
    expect(TabActivationHistory.goForward("w1")).toBe("t2");
    expect(TabActivationHistory.getCurrent("w1")).toBe("t2");
  });

  it("same tab activation is a no-op", () => {
    // First activation
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t1" } }),
    );

    // Fire grid-activate with same tab again
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t1" } }),
    );

    expect(TabActivationHistory.getCurrent("w1")).toBe("t1");
    expect(TabActivationHistory.canGoBack("w1")).toBe(false);
  });

  it("per-window isolation via events", () => {
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t1" } }),
    );
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w2", tabId: "ta" } }),
    );

    expect(TabActivationHistory.getCurrent("w1")).toBe("t1");
    expect(TabActivationHistory.getCurrent("w2")).toBe("ta");
  });

  it("forward stack cleared on new activation after going back", () => {
    // Build history via events
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t1" } }),
    );
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t2" } }),
    );
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t3" } }),
    );

    TabActivationHistory.goBack("w1"); // now at t2, t3 in forward

    // New activation via event
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t4" } }),
    );

    expect(TabActivationHistory.canGoForward("w1")).toBe(false);
    expect(TabActivationHistory.goBack("w1")).toBe("t2"); // not t3
  });
});
