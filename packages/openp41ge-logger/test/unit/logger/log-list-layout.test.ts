/**
 * Unit tests for log-list-layout.ts — the pure windowing math behind the
 * log viewer's virtual list. No DOM, no framework.
 */
import { describe, it, expect } from "vitest";
import { LogListLayout } from "@openp41ge-logger/log-list-layout";

describe("LogListLayout", () => {
  it("starts empty with zero total height", () => {
    const l = new LogListLayout();
    expect(l.count).toBe(0);
    expect(l.totalHeight).toBe(0);
  });

  it("setCount sizes the layout using the estimate", () => {
    const l = new LogListLayout(20);
    l.setCount(5);
    expect(l.count).toBe(5);
    expect(l.totalHeight).toBe(100);
  });

  it("setCount(0) empties the layout", () => {
    const l = new LogListLayout(20);
    l.setCount(5);
    l.setCount(0);
    expect(l.count).toBe(0);
    expect(l.totalHeight).toBe(0);
  });

  it("append grows the total height incrementally", () => {
    const l = new LogListLayout(20);
    l.setCount(3);
    expect(l.totalHeight).toBe(60);
    l.append(2);
    expect(l.count).toBe(5);
    expect(l.totalHeight).toBe(100);
  });

  it("prepend shifts existing items and grows total height", () => {
    const l = new LogListLayout(20);
    l.setCount(3);
    // Give the last two items a measured height of 10.
    l.updateHeights([
      [1, 10],
      [2, 10],
    ]);
    expect(l.totalHeight).toBe(20 + 10 + 10);
    l.prepend(2);
    expect(l.count).toBe(5);
    // Prepend 2 * estimate (20) on top of the existing total.
    expect(l.totalHeight).toBe(40 + 20 + 10 + 10);
  });

  it("updateHeights applies measured heights and rebuilds offsets once", () => {
    const l = new LogListLayout(20);
    l.setCount(4);
    const changed = l.updateHeights([
      [1, 10],
      [2, 30],
    ]);
    expect(changed).toBe(true);
    expect(l.totalHeight).toBe(20 + 10 + 30 + 20);
    // No change → returns false.
    expect(l.updateHeights([[1, 10]])).toBe(false);
  });

  it("ignores out-of-range index updates", () => {
    const l = new LogListLayout(20);
    l.setCount(2);
    expect(
      l.updateHeights([
        [-1, 5],
        [5, 5],
      ]),
    ).toBe(false);
    expect(l.totalHeight).toBe(40);
  });

  describe("indexAt", () => {
    it("returns the item that owns the pixel offset", () => {
      const l = new LogListLayout(10);
      l.setCount(4); // offsets: 0,10,20,30,40
      expect(l.indexAt(0)).toBe(0);
      expect(l.indexAt(9)).toBe(0);
      expect(l.indexAt(10)).toBe(1);
      expect(l.indexAt(39)).toBe(3);
      expect(l.indexAt(100)).toBe(3);
    });
  });

  describe("offsetAt", () => {
    it("returns 0 for the first item", () => {
      const l = new LogListLayout(10);
      l.setCount(4);
      expect(l.offsetAt(0)).toBe(0);
    });

    it("returns the cumulative height before the item", () => {
      const l = new LogListLayout(20);
      l.setCount(4); // heights 20,20,20,20 → offsets 0,20,40,60,80
      expect(l.offsetAt(1)).toBe(20);
      expect(l.offsetAt(2)).toBe(40);
      expect(l.offsetAt(3)).toBe(60);
      expect(l.offsetAt(4)).toBe(80); // one past the end = totalHeight
    });

    it("tracks measured heights", () => {
      const l = new LogListLayout(20);
      l.setCount(3);
      l.updateHeights([
        [1, 10],
        [2, 30],
      ]);
      // offsets: 0, 20, 30, 60
      expect(l.offsetAt(0)).toBe(0);
      expect(l.offsetAt(1)).toBe(20);
      expect(l.offsetAt(2)).toBe(30);
      expect(l.offsetAt(3)).toBe(60);
    });

    it("clamps out-of-range indices", () => {
      const l = new LogListLayout(10);
      expect(l.offsetAt(-1)).toBe(0);
      expect(l.offsetAt(10)).toBe(0);
      l.setCount(3);
      expect(l.offsetAt(100)).toBe(30); // = totalHeight
    });

    it("returns 0 when empty", () => {
      const l = new LogListLayout(10);
      expect(l.offsetAt(0)).toBe(0);
    });
  });

  describe("setDefaultHeight", () => {
    it("re-seeds every unmeasured item to the new estimate", () => {
      const l = new LogListLayout(18);
      l.setCount(4);
      expect(l.estimate).toBe(18);
      expect(l.setDefaultHeight(20)).toBe(true);
      expect(l.estimate).toBe(20);
      expect(l.totalHeight).toBe(80);
      // Idempotent once already at the default.
      expect(l.setDefaultHeight(20)).toBe(false);
    });

    it("preserves measured item heights", () => {
      const l = new LogListLayout(18);
      l.setCount(3);
      l.updateHeights([[1, 30]]);
      // Items 0 and 2 are still the old estimate (18); item 1 is measured (30).
      expect(l.setDefaultHeight(25)).toBe(true);
      expect(l.totalHeight).toBe(25 + 30 + 25);
    });

    it("returns false when the estimate is unchanged", () => {
      const l = new LogListLayout(20);
      l.setCount(2);
      expect(l.setDefaultHeight(20)).toBe(false);
      expect(l.totalHeight).toBe(40);
    });
  });

  describe("window", () => {
    it("returns an empty slice when there are no items", () => {
      const l = new LogListLayout(10);
      const w = l.window(0, 100);
      expect(w).toEqual({ start: 0, end: 0, offsetTop: 0, offsetBottom: 0 });
    });

    it("returns the full window when the viewport is not laid out", () => {
      const l = new LogListLayout(10);
      l.setCount(4);
      const w = l.window(0, 0);
      expect(w.start).toBe(0);
      expect(w.end).toBe(4);
    });

    it("slices a sub-window with overscan around the viewport", () => {
      const l = new LogListLayout(10);
      l.setCount(100); // offsets 0..1000
      const w = l.window(400, 100, 2);
      // item 40 = offset 400 (viewport top), item 50 = offset 500 (bottom).
      // Overscan pulls in 2 items on each side; end is exclusive (+1).
      expect(w.start).toBe(38);
      expect(w.end).toBe(53);
      expect(w.offsetTop).toBe(10 * w.start);
      expect(w.offsetBottom).toBe(l.totalHeight - 10 * w.end);
    });

    it("clamps the window to the list bounds", () => {
      const l = new LogListLayout(10);
      l.setCount(10);
      const w = l.window(0, 100, 20);
      expect(w.start).toBe(0);
      expect(w.end).toBe(10);
    });

    it("ensures at least one item is rendered", () => {
      const l = new LogListLayout(10);
      l.setCount(1);
      const w = l.window(0, 100);
      expect(w.start).toBe(0);
      expect(w.end).toBe(1);
    });

    it("offsetTop + rendered span + offsetBottom equals totalHeight", () => {
      const l = new LogListLayout(12);
      l.setCount(200);
      const w = l.window(700, 240, 4);
      const span = (w.end - w.start) * 12;
      expect(w.offsetTop + span + w.offsetBottom).toBe(l.totalHeight);
    });
  });
});
