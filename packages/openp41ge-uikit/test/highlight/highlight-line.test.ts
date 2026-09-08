// @ts-nocheck
/**
 * Unit tests for the lightweight line highlighter used by the Explorer's
 * content-search match rows.
 */

import { describe, test, expect } from "vitest";
import { highlightLine, languageFromPath } from "../../src/highlight/highlight-line";

describe("highlightLine", () => {
  test("wraps a keyword in .s-kw", () => {
    const html = highlightLine("const x = 1;", { language: "javascript" });
    expect(html).toContain('<span class="s-kw">const</span>');
  });

  test("wraps a string in .s-str", () => {
    const html = highlightLine('const s = "hi";', { language: "javascript" });
    expect(html).toContain("s-str");
    expect(html).toContain("&quot;hi&quot;");
  });

  test("wraps a line comment from // to end of line in .s-cmt", () => {
    const html = highlightLine("let x = 1; // note", { language: "javascript" });
    expect(html).toContain('<span class="s-cmt">// note</span>');
  });

  test("wraps a number in .s-num", () => {
    const html = highlightLine("return 42;", { language: "javascript" });
    expect(html).toContain('<span class="s-num">42</span>');
  });

  test("wraps a function call in .s-fun", () => {
    const html = highlightLine("drawRect()", { language: "javascript" });
    expect(html).toContain('<span class="s-fun">drawRect</span>');
  });

  test("escapes HTML in source text", () => {
    const html = highlightLine("a < b && c > d", { language: "javascript" });
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
    expect(html).not.toContain("< b");
  });

  test("wraps the matched search term in .cm-match-term", () => {
    const html = highlightLine("let drawing = false;", {
      language: "javascript",
      query: "draw",
    });
    expect(html).toContain('<span class="cm-match-term">draw</span>');
  });

  test("term highlight respects case-insensitive search", () => {
    const html = highlightLine("let Drawing = false;", {
      language: "javascript",
      query: "draw",
      caseSensitive: false,
    });
    expect(html).toContain("cm-match-term");
    expect(html).toContain(">Draw</span>");
  });

  test("term highlight respects case-sensitive search", () => {
    const html = highlightLine("let drawing = false;", {
      language: "javascript",
      query: "DRAW",
      caseSensitive: true,
    });
    expect(html).not.toContain("cm-match-term");
  });

  test("term highlight supports regex queries", () => {
    const html = highlightLine("let ab = 1; let abb = 2;", {
      language: "javascript",
      query: "ab+",
      regex: true,
    });
    expect(html).toContain("cm-match-term");
  });

  test("combines token scope with term highlight", () => {
    const html = highlightLine("const drawing = false;", {
      language: "javascript",
      query: "draw",
    });
    // The matched portion inside a token span carries both classes.
    expect(html).toContain("cm-match-term");
    // And it's still inside the keyword span for the matched keyword part.
    expect(html).toContain("s-kw");
  });

  test("no term highlight when query is empty", () => {
    const html = highlightLine("const x = 1;", { language: "javascript", query: "" });
    expect(html).not.toContain("cm-match-term");
  });

  test("invalid regex does not throw", () => {
    const html = highlightLine("const x = 1;", {
      language: "javascript",
      query: "(",
      regex: true,
    });
    expect(html).toBeTruthy();
    expect(html).not.toContain("cm-match-term");
  });
});

describe("languageFromPath", () => {
  test("returns the language id from the file extension", () => {
    expect(languageFromPath("src/app.js")).toBe("javascript");
    expect(languageFromPath("src/app.ts")).toBe("typescript");
    expect(languageFromPath("style.css")).toBe("css");
  });

  test("handles a Dockerfile with no extension", () => {
    expect(languageFromPath("Dockerfile")).toBe("dockerfile");
  });

  test("returns undefined for a path with no extension", () => {
    expect(languageFromPath("README")).toBeUndefined();
  });
});
