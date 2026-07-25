/**
 * Tests for WordWrapHelper.
 */
import { describe, it, expect } from "vitest";
import { computeWrapSegments, getIndentLevel } from "@openp41ge-file-editor/view/word-wrap-helper";

describe("WordWrapHelper", () => {
  describe("computeWrapSegments", () => {
    it("returns single segment for short line", () => {
      const segments = computeWrapSegments("hello", 80);
      expect(segments.length).toBe(1);
      expect(segments[0].text).toBe("hello");
      expect(segments[0].startColumn).toBe(1);
      expect(segments[0].endColumn).toBe(6);
    });

    it("splits line at word boundary", () => {
      const segments = computeWrapSegments("hello world foo bar", 10);
      // First segment should break after "hello " (6 chars) or at word boundary
      expect(segments.length).toBeGreaterThan(1);
      expect(segments[0].text).toBe("hello "); // breaks at space
    });

    it("hard breaks when no space found", () => {
      const segments = computeWrapSegments("abcdefghijklmnopqrstuvwxyz", 10);
      expect(segments.length).toBe(3);
      expect(segments[0].text).toBe("abcdefghij");
      expect(segments[1].text).toBe("klmnopqrst");
      expect(segments[2].text).toBe("uvwxyz");
    });

    it("preserves start/end columns", () => {
      const segments = computeWrapSegments("hello world", 5);
      expect(segments[0].startColumn).toBe(1);
      expect(segments[1].startColumn).toBe(segments[0].endColumn);
    });

    it("handles empty string", () => {
      const segments = computeWrapSegments("", 80);
      expect(segments.length).toBe(1);
      expect(segments[0].text).toBe("");
    });

    it("handles exact fit", () => {
      const segments = computeWrapSegments("hello", 5);
      expect(segments.length).toBe(1);
      expect(segments[0].text).toBe("hello");
    });
  });

  describe("getIndentLevel", () => {
    it("counts spaces", () => {
      expect(getIndentLevel("    hello")).toBe(4);
    });

    it("counts tabs", () => {
      expect(getIndentLevel("\t\thello")).toBe(8);
    });

    it("returns 0 for no indent", () => {
      expect(getIndentLevel("hello")).toBe(0);
    });

    it("handles empty line", () => {
      expect(getIndentLevel("")).toBe(0);
    });
  });
});
