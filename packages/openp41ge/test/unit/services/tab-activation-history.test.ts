// @vitest-environment node
/**
 * Unit tests for TabActivationHistory — per-window tab navigation history.
 *
 * Pure logic tests, no DOM required.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TabActivationHistory } from "@openp41ge/renderer/services/tab-activation-history";

describe("TabActivationHistory", () => {
  beforeEach(() => {
    TabActivationHistory._reset();
  });

  it("pushActivation records the first tab", () => {
    TabActivationHistory.pushActivation("w1", "t1");

    expect(TabActivationHistory.getCurrent("w1")).toBe("t1");
    expect(TabActivationHistory.canGoBack("w1")).toBe(false);
  });

  it("pushActivation with same tab is a no-op", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    const result = TabActivationHistory.pushActivation("w1", "t1");

    expect(result).toBe(false);
    expect(TabActivationHistory.canGoBack("w1")).toBe(false);
  });

  it("pushActivation with different tab pushes previous to back stack", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");

    expect(TabActivationHistory.getCurrent("w1")).toBe("t2");
    expect(TabActivationHistory.canGoBack("w1")).toBe(true);
  });

  it("goBack returns the previous tab", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");

    const tabId = TabActivationHistory.goBack("w1");

    expect(tabId).toBe("t1");
    expect(TabActivationHistory.getCurrent("w1")).toBe("t1");
    expect(TabActivationHistory.canGoBack("w1")).toBe(false);
    expect(TabActivationHistory.canGoForward("w1")).toBe(true);
  });

  it("goForward returns the next tab after going back", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");
    TabActivationHistory.goBack("w1");

    const tabId = TabActivationHistory.goForward("w1");

    expect(tabId).toBe("t2");
    expect(TabActivationHistory.getCurrent("w1")).toBe("t2");
    expect(TabActivationHistory.canGoBack("w1")).toBe(true);
    expect(TabActivationHistory.canGoForward("w1")).toBe(false);
  });

  it("new activation after going back clears forward stack", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");
    TabActivationHistory.goBack("w1"); // now at t1, t2 in forward

    // New activation from t1
    TabActivationHistory.pushActivation("w1", "t3");

    expect(TabActivationHistory.getCurrent("w1")).toBe("t3");
    expect(TabActivationHistory.canGoForward("w1")).toBe(false);
    expect(TabActivationHistory.canGoBack("w1")).toBe(true); // t1 in back
  });

  it("canGoBack and canGoForward reflect stack state", () => {
    expect(TabActivationHistory.canGoBack("w1")).toBe(false);
    expect(TabActivationHistory.canGoForward("w1")).toBe(false);

    TabActivationHistory.pushActivation("w1", "t1");
    expect(TabActivationHistory.canGoBack("w1")).toBe(false);
    expect(TabActivationHistory.canGoForward("w1")).toBe(false);

    TabActivationHistory.pushActivation("w1", "t2");
    expect(TabActivationHistory.canGoBack("w1")).toBe(true);
    expect(TabActivationHistory.canGoForward("w1")).toBe(false);

    TabActivationHistory.goBack("w1");
    expect(TabActivationHistory.canGoBack("w1")).toBe(false);
    expect(TabActivationHistory.canGoForward("w1")).toBe(true);
  });

  it("per-window isolation — two windows have independent stacks", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w2", "ta");

    expect(TabActivationHistory.getCurrent("w1")).toBe("t1");
    expect(TabActivationHistory.getCurrent("w2")).toBe("ta");

    TabActivationHistory.pushActivation("w1", "t2");
    TabActivationHistory.pushActivation("w2", "tb");

    expect(TabActivationHistory.goBack("w1")).toBe("t1");
    expect(TabActivationHistory.goBack("w2")).toBe("ta");
  });

  it("goBack returns null when back stack is empty", () => {
    TabActivationHistory.pushActivation("w1", "t1");

    expect(TabActivationHistory.goBack("w1")).toBeNull();
  });

  it("goForward returns null when forward stack is empty", () => {
    expect(TabActivationHistory.goForward("w1")).toBeNull();
  });

  it("returns null for unknown window", () => {
    expect(TabActivationHistory.goBack("nonexistent")).toBeNull();
    expect(TabActivationHistory.goForward("nonexistent")).toBeNull();
    expect(TabActivationHistory.canGoBack("nonexistent")).toBe(false);
    expect(TabActivationHistory.canGoForward("nonexistent")).toBe(false);
  });

  it("supports multiple back steps — full history traversal", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");
    TabActivationHistory.pushActivation("w1", "t3");
    TabActivationHistory.pushActivation("w1", "t4");

    expect(TabActivationHistory.goBack("w1")).toBe("t3");
    expect(TabActivationHistory.goBack("w1")).toBe("t2");
    expect(TabActivationHistory.goBack("w1")).toBe("t1");
    expect(TabActivationHistory.goBack("w1")).toBeNull(); // no more

    // Now go forward all the way
    expect(TabActivationHistory.goForward("w1")).toBe("t2");
    expect(TabActivationHistory.goForward("w1")).toBe("t3");
    expect(TabActivationHistory.goForward("w1")).toBe("t4");
    expect(TabActivationHistory.goForward("w1")).toBeNull();
  });

  it("caps at 50 entries to avoid unbounded memory", () => {
    for (let i = 0; i < 60; i++) {
      TabActivationHistory.pushActivation("w1", `t${i}`);
    }

    expect(TabActivationHistory.getCurrent("w1")).toBe("t59");
    expect(TabActivationHistory.canGoBack("w1")).toBe(true);

    // Should be capped at 50
    let count = 0;
    while (TabActivationHistory.goBack("w1") !== null) {
      count++;
    }
    expect(count).toBeLessThanOrEqual(50);
  });

  it("clear removes history for a specific window", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");
    TabActivationHistory.pushActivation("w2", "ta");

    TabActivationHistory.clear("w1");

    expect(TabActivationHistory.getCurrent("w1")).toBeNull();
    expect(TabActivationHistory.canGoBack("w1")).toBe(false);
    expect(TabActivationHistory.getCurrent("w2")).toBe("ta"); // still intact
  });
});
