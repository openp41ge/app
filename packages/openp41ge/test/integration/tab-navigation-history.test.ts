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

  it("new activation after going back appends to the log (chronological)", () => {
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

    TabActivationHistory.goBack("w1"); // at t2, t3 ahead in the log

    // New activation via event (append-only — t3 is NOT cleared)
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t4" } }),
    );

    expect(TabActivationHistory.getCurrent("w1")).toBe("t4");
    expect(TabActivationHistory.getHistory("w1")).toEqual(["t1", "t2", "t3", "t4"]);
    // Back goes to the chronological predecessor t3, not t2.
    expect(TabActivationHistory.goBack("w1")).toBe("t3");
    expect(TabActivationHistory.goBack("w1")).toBe("t2");
    expect(TabActivationHistory.goBack("w1")).toBe("t1");
  });

  it("refocusing an earlier tab via event appends a duplicate entry", () => {
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t1" } }),
    );
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t2" } }),
    );
    // Refocus t1 (opened earlier) — appends a NEW entry.
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t1" } }),
    );

    expect(TabActivationHistory.getHistory("w1")).toEqual(["t1", "t2", "t1"]);
    expect(TabActivationHistory.getCurrent("w1")).toBe("t1");
    expect(TabActivationHistory.goBack("w1")).toBe("t2");
    expect(TabActivationHistory.goBack("w1")).toBe("t1");
  });

  it("closed tabs are skipped by back/forward but remain in the log", () => {
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t1" } }),
    );
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t2" } }),
    );
    document.dispatchEvent(
      new CustomEvent("grid-activate", { detail: { winId: "w1", tabId: "t3" } }),
    );

    // t2 is closed — Back from t3 lands on t1, skipping t2.
    const isOpen = (t: string) => t !== "t2";
    expect(TabActivationHistory.goBack("w1", isOpen)).toBe("t1");
    // t2 is still in the immutable log.
    expect(TabActivationHistory.getHistory("w1")).toEqual(["t1", "t2", "t3"]);
  });
});
