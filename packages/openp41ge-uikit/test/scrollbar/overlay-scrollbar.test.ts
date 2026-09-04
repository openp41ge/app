import { describe, it, expect } from "vitest";
import {
  computeThumbLength,
  computeThumbPosition,
} from "../../src/components/scrollbar/overlay-scrollbar";

describe("OverlayScrollbar geometry", () => {
  describe("computeThumbLength", () => {
    it("returns the full track when content fits (no scroll)", () => {
      expect(computeThumbLength(100, 100, 50)).toBe(50);
      expect(computeThumbLength(100, 90, 50)).toBe(50);
    });

    it("scales the thumb to the visible fraction", () => {
      // half the content visible → thumb is half the track
      expect(computeThumbLength(100, 200, 100)).toBe(50);
      // quarter visible → quarter of the track
      expect(computeThumbLength(100, 400, 100)).toBe(25);
    });

    it("clamps to the minimum thumb length", () => {
      // only 1% visible → 1px, but min 24 wins
      expect(computeThumbLength(100, 10000, 1000, 24)).toBe(24);
    });

    it("never exceeds the track length", () => {
      expect(computeThumbLength(100, 500, 10)).toBe(10);
    });
  });

  describe("computeThumbPosition", () => {
    it("returns 0 at the scroll origin", () => {
      expect(computeThumbPosition(0, 200, 100, 100, 50)).toBe(0);
    });

    it("maps the scroll range onto the thumb travel", () => {
      // half scrolled → thumb half-way through its travel (100-50=50 → 25)
      expect(computeThumbPosition(50, 200, 100, 100, 50)).toBe(25);
      // fully scrolled → thumb at the end
      expect(computeThumbPosition(100, 200, 100, 100, 50)).toBe(50);
    });

    it("returns 0 when there is no travel", () => {
      expect(computeThumbPosition(0, 100, 100, 100, 100)).toBe(0);
      expect(computeThumbPosition(10, 100, 100, 100, 100)).toBe(0);
    });

    it("clamps negative scroll positions to 0", () => {
      expect(computeThumbPosition(-5, 200, 100, 100, 50)).toBe(0);
    });
  });
});
