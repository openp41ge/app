// @vitest-environment node
/**
 * Unit tests for TabActivationHistory — per-window tab activation log.
 *
 * The log is append-only and may contain duplicate entries: every activation
 * (open / refocus / navigate) appends, even if that tab appeared earlier.
 * Closing a tab does NOT remove its entries — Back/Forward skip closed tabs.
 *
 * Pure logic tests, no DOM required.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TabActivationHistory } from "@openp41ge/renderer/services/tab-activation-history";

const open = (t: string) => (id: string) => id !== t;

describe("TabActivationHistory", () => {
  beforeEach(() => {
    TabActivationHistory._reset();
  });

  it("pushActivation records the first tab", () => {
    TabActivationHistory.pushActivation("w1", "t1");

    expect(TabActivationHistory.getCurrent("w1")).toBe("t1");
    expect(TabActivationHistory.canGoBack("w1")).toBe(false);
    expect(TabActivationHistory.getHistory("w1")).toEqual(["t1"]);
  });

  it("pushActivation with the same tab is a no-op (no duplicate)", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    const result = TabActivationHistory.pushActivation("w1", "t1");

    expect(result).toBe(false);
    expect(TabActivationHistory.getHistory("w1")).toEqual(["t1"]);
    expect(TabActivationHistory.canGoBack("w1")).toBe(false);
  });

  it("pushActivation with a different tab appends", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");

    expect(TabActivationHistory.getCurrent("w1")).toBe("t2");
    expect(TabActivationHistory.canGoBack("w1")).toBe(true);
    expect(TabActivationHistory.getHistory("w1")).toEqual(["t1", "t2"]);
  });

  it("refocusing an earlier tab appends a NEW entry (duplicate in the log)", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");
    TabActivationHistory.pushActivation("w1", "t3");
    // User clicks t2 again (it was opened earlier) — refocus.
    TabActivationHistory.pushActivation("w1", "t2");

    // Log now has t2 twice, at the exact order of activation.
    expect(TabActivationHistory.getHistory("w1")).toEqual(["t1", "t2", "t3", "t2"]);
    expect(TabActivationHistory.getCurrent("w1")).toBe("t2");

    // Back visits t3 first, then t2 again (before its earlier entry), then t1.
    expect(TabActivationHistory.goBack("w1")).toBe("t3");
    expect(TabActivationHistory.goBack("w1")).toBe("t2");
    expect(TabActivationHistory.goBack("w1")).toBe("t1");
    expect(TabActivationHistory.goBack("w1")).toBeNull();

    // Forward traverses back through the same entries, in order.
    expect(TabActivationHistory.goForward("w1")).toBe("t2");
    expect(TabActivationHistory.goForward("w1")).toBe("t3");
    expect(TabActivationHistory.goForward("w1")).toBe("t2");
    expect(TabActivationHistory.goForward("w1")).toBeNull();
  });

  it("goBack returns the previous entry", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");

    const tabId = TabActivationHistory.goBack("w1");

    expect(tabId).toBe("t1");
    expect(TabActivationHistory.getCurrent("w1")).toBe("t1");
    expect(TabActivationHistory.canGoBack("w1")).toBe(false);
    expect(TabActivationHistory.canGoForward("w1")).toBe(true);
  });

  it("goForward returns the next entry after going back", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");
    TabActivationHistory.goBack("w1");

    const tabId = TabActivationHistory.goForward("w1");

    expect(tabId).toBe("t2");
    expect(TabActivationHistory.getCurrent("w1")).toBe("t2");
    expect(TabActivationHistory.canGoBack("w1")).toBe(true);
    expect(TabActivationHistory.canGoForward("w1")).toBe(false);
  });

  it("canGoBack and canGoForward reflect the log position", () => {
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

  it("per-window isolation — two windows have independent logs", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w2", "ta");

    expect(TabActivationHistory.getCurrent("w1")).toBe("t1");
    expect(TabActivationHistory.getCurrent("w2")).toBe("ta");

    TabActivationHistory.pushActivation("w1", "t2");
    TabActivationHistory.pushActivation("w2", "tb");

    expect(TabActivationHistory.goBack("w1")).toBe("t1");
    expect(TabActivationHistory.goBack("w2")).toBe("ta");
  });

  it("goBack returns null when there is no earlier entry", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    expect(TabActivationHistory.goBack("w1")).toBeNull();
  });

  it("goForward returns null when there is no later entry", () => {
    expect(TabActivationHistory.goForward("w1")).toBeNull();
  });

  it("returns null / false for an unknown window", () => {
    expect(TabActivationHistory.goBack("nonexistent")).toBeNull();
    expect(TabActivationHistory.goForward("nonexistent")).toBeNull();
    expect(TabActivationHistory.canGoBack("nonexistent")).toBe(false);
    expect(TabActivationHistory.canGoForward("nonexistent")).toBe(false);
    expect(TabActivationHistory.getCurrent("nonexistent")).toBeNull();
    expect(TabActivationHistory.getHistory("nonexistent")).toEqual([]);
  });

  it("supports a full back/forward traversal", () => {
    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");
    TabActivationHistory.pushActivation("w1", "t3");
    TabActivationHistory.pushActivation("w1", "t4");

    expect(TabActivationHistory.goBack("w1")).toBe("t3");
    expect(TabActivationHistory.goBack("w1")).toBe("t2");
    expect(TabActivationHistory.goBack("w1")).toBe("t1");
    expect(TabActivationHistory.goBack("w1")).toBeNull();

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
    expect(TabActivationHistory.getHistory("w1").length).toBeLessThanOrEqual(50);

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
    expect(TabActivationHistory.getCurrent("w2")).toBe("ta");
  });

  describe("closed-tab handling (isOpen)", () => {
    it("goBack skips a closed tab but keeps it in the log (history immutable)", () => {
      TabActivationHistory.pushActivation("w1", "t1");
      TabActivationHistory.pushActivation("w1", "t2");
      TabActivationHistory.pushActivation("w1", "t3");

      // t3 is closed — goBack should land on t2, skipping the closed t3.
      const isOpen = open("t3");
      expect(TabActivationHistory.goBack("w1", isOpen)).toBe("t2");
      expect(TabActivationHistory.getCurrent("w1")).toBe("t2");
      // t3 is NOT discarded from the log.
      expect(TabActivationHistory.getHistory("w1")).toEqual(["t1", "t2", "t3"]);
      // The closed t3 is not an open back-candidate.
      expect(TabActivationHistory.canGoBack("w1", isOpen)).toBe(true);
    });

    it("goForward skips a closed tab", () => {
      TabActivationHistory.pushActivation("w1", "t1");
      TabActivationHistory.pushActivation("w1", "t2");
      TabActivationHistory.pushActivation("w1", "t3");

      // Navigate to t1 so t2 and t3 are ahead.
      TabActivationHistory.goBack("w1"); // at t2
      TabActivationHistory.goBack("w1"); // at t1

      // t2 is closed — goForward should land on t3, skipping t2.
      const isOpen = open("t2");
      expect(TabActivationHistory.goForward("w1", isOpen)).toBe("t3");
    });

    it("canGoBack/canGoForward respect isOpen", () => {
      TabActivationHistory.pushActivation("w1", "t1");
      TabActivationHistory.pushActivation("w1", "t2");

      const allClosed = () => false;
      expect(TabActivationHistory.canGoBack("w1", allClosed)).toBe(false);
      expect(TabActivationHistory.canGoBack("w1")).toBe(true);
      expect(TabActivationHistory.canGoForward("w1", allClosed)).toBe(false);
    });

    it("getCurrent may point at a closed tab; navigation skips it", () => {
      TabActivationHistory.pushActivation("w1", "t1");
      TabActivationHistory.pushActivation("w1", "t2");
      TabActivationHistory.pushActivation("w1", "t3");
      // t2 is closed. Current is t3 (open).
      expect(TabActivationHistory.getCurrent("w1")).toBe("t3");

      // Navigate back: skip nothing (t2 is before t3)... goBack lands on t1,
      // skipping the closed t2.
      const isOpen = open("t2");
      expect(TabActivationHistory.goBack("w1", isOpen)).toBe("t1");
      // Position now points at t1, an open tab.
      expect(TabActivationHistory.getCurrent("w1")).toBe("t1");
    });
  });

  describe("append-only log", () => {
    it("closed tabs are never removed from the log", () => {
      TabActivationHistory.pushActivation("w1", "t1");
      TabActivationHistory.pushActivation("w1", "t2");

      // The history has no remove API — closing is an external concern.
      expect(TabActivationHistory.getHistory("w1")).toEqual(["t1", "t2"]);
    });
  });

  describe("focusPreviousOpen", () => {
    it("moves focus to the previous open entry and returns it", () => {
      TabActivationHistory.pushActivation("w1", "t1");
      TabActivationHistory.pushActivation("w1", "t2");
      TabActivationHistory.pushActivation("w1", "t3");

      // Close the focused t3 → focus t2 (the previous activation).
      expect(TabActivationHistory.focusPreviousOpen("w1", "t3")).toBe("t2");
      expect(TabActivationHistory.getCurrent("w1")).toBe("t2");
      // The closed t3 remains in the log.
      expect(TabActivationHistory.getHistory("w1")).toEqual(["t1", "t2", "t3"]);
    });

    it("skips earlier duplicates of the closed tab", () => {
      TabActivationHistory.pushActivation("w1", "t1");
      TabActivationHistory.pushActivation("w1", "t2");
      TabActivationHistory.pushActivation("w1", "t3");
      TabActivationHistory.pushActivation("w1", "t2");

      // Close the focused t2 (last entry) → focus t3, not the earlier t2.
      expect(TabActivationHistory.focusPreviousOpen("w1", "t2")).toBe("t3");
    });

    it("skips closed entries via isOpen", () => {
      TabActivationHistory.pushActivation("w1", "t1");
      TabActivationHistory.pushActivation("w1", "t2");
      TabActivationHistory.pushActivation("w1", "t3");

      // Close t3; t2 is closed → focus t1.
      const isOpen = open("t2");
      expect(TabActivationHistory.focusPreviousOpen("w1", "t3", isOpen)).toBe("t1");
    });

    it("returns null when the closed tab is not in the log", () => {
      TabActivationHistory.pushActivation("w1", "t1");
      expect(TabActivationHistory.focusPreviousOpen("w1", "nope")).toBeNull();
    });

    it("returns null when there is no earlier open entry", () => {
      TabActivationHistory.pushActivation("w1", "t1");
      expect(TabActivationHistory.focusPreviousOpen("w1", "t1")).toBeNull();
    });
  });
});
