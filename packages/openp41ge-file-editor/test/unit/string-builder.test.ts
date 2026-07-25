/**
 * Tests for StringBuilder.
 */
import { describe, it, expect } from "vitest";
import { StringBuilder } from "@openp41ge-file-editor/view/string-builder";

describe("StringBuilder", () => {
  it("starts empty", () => {
    const sb = new StringBuilder(100);
    expect(sb.build()).toBe("");
  });

  it("appends strings", () => {
    const sb = new StringBuilder(100);
    sb.append("hello");
    sb.append(" ");
    sb.append("world");
    expect(sb.build()).toBe("hello world");
  });

  it("resets correctly", () => {
    const sb = new StringBuilder(100);
    sb.append("hello");
    sb.reset();
    expect(sb.build()).toBe("");
  });

  it("builds large strings", () => {
    const sb = new StringBuilder(1000);
    for (let i = 0; i < 100; i++) {
      sb.append("x");
    }
    const result = sb.build();
    expect(result.length).toBe(100);
    expect(result).toBe("x".repeat(100));
  });

  it("handles empty append", () => {
    const sb = new StringBuilder(100);
    sb.append("");
    expect(sb.build()).toBe("");
  });

  it("tracks length", () => {
    const sb = new StringBuilder(100);
    expect(sb.length).toBe(0);
    sb.append("hello");
    expect(sb.length).toBe(5);
  });
});
