// @ts-nocheck
/**
 * Unit tests for the lightweight line highlighter used by the Explorer's
 * content-search match rows.
 */

import { describe, test, expect } from "vitest";
import { highlightLine, languageFromPath, cropLine } from "../../src/highlight/highlight-line";

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
    // The matched portion is wrapped in cm-match-term (carrying the token
    // scope class, here s-var for the variable `drawing`).
    expect(html).toContain('class="cm-match-term');
    expect(html).toContain(">draw</span>");
    expect(html).toContain("cm-match-term s-var");
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

  test("highlights the single range when matchStart/matchEnd are given", () => {
    // `a` appears twice; only the second occurrence [8,9) should be wrapped.
    const html = highlightLine("let a = a;", {
      language: "javascript",
      matchStart: 8,
      matchEnd: 9,
    });
    expect(html).toContain("cm-match-term");
    expect((html.match(/class="cm-match-term/g) ?? []).length).toBe(1);
    // The highlighted piece is the second `a`, not the first.
    expect(html).toMatch(/cm-match-term[^>]*>a<\/span>/);
  });

  test("single range works without a query and ignores other occurrences", () => {
    // `foo` appears three times; only the third [8,11) is highlighted.
    const html = highlightLine("foo foo foo", {
      language: "javascript",
      matchStart: 8,
      matchEnd: 11,
    });
    expect((html.match(/class="cm-match-term/g) ?? []).length).toBe(1);
    expect(html).toContain(">foo</span>");
  });

  test("single range clamps out-of-bounds offsets and skips an empty range", () => {
    // Empty/invalid range → no term highlight.
    expect(
      highlightLine("abc", { language: "javascript", matchStart: 5, matchEnd: 5 }),
    ).not.toContain("cm-match-term");
    // Range clamped to text length → still highlights.
    const clamped = highlightLine("abc", { language: "javascript", matchStart: 1, matchEnd: 99 });
    expect(clamped).toContain("cm-match-term");
    expect(clamped).toContain(">bc</span>");
  });

  test("colours a member property access (foo.bar) via s-var", () => {
    const html = highlightLine("const x = user.name;", { language: "javascript" });
    expect(html).toContain('<span class="s-var">name</span>');
  });

  test("colours an object before a member access via s-sup", () => {
    const html = highlightLine("console.log(1);", { language: "javascript" });
    expect(html).toContain('<span class="s-sup">console</span>');
    expect(html).toContain('<span class="s-fun">log</span>');
  });

  test("colours punctuation as s-pun", () => {
    const html = highlightLine("foo(a, b);", { language: "javascript" });
    expect(html).toContain("s-pun");
    expect(html).not.toContain('class="s-pun">;');
    // Consecutive punctuation may group; the semicolon is coloured.
    expect(html).toContain(";</span>");
  });

  test("colours an HTML tag and attribute", () => {
    const html = highlightLine('<div class="box">hi</div>', { language: "html" });
    expect(html).toContain('<span class="s-tag">div</span>');
    expect(html).toContain('<span class="s-atr">class</span>');
  });

  test("does not treat a JS `<` comparison as an HTML tag", () => {
    const html = highlightLine("if (x < y) return;", { language: "javascript" });
    // The `<` stays an operator and `y` is a plain variable — not an s-tag.
    expect(html).not.toContain("s-tag");
    expect(html).toContain("s-op");
  });
});

describe("cropLine", () => {
  test("returns a short line unchanged", () => {
    const r = cropLine("const x = 1;", 3, 4, { maxChars: 80 });
    expect(r.text).toBe("const x = 1;");
    expect(r.matchStart).toBe(3);
    expect(r.matchEnd).toBe(4);
  });

  test("crops a long line around the match and adds ellipses", () => {
    const line = "a".repeat(30) + "MATCH" + "b".repeat(30);
    const r = cropLine(line, 30, 35, { maxChars: 20, before: 4, after: 4 });
    expect(r.text.startsWith("…")).toBe(true);
    expect(r.text.endsWith("…")).toBe(true);
    expect(r.text).toContain("MATCH");
    expect(r.text.length).toBeLessThanOrEqual(20);
  });

  test("keeps the match visible at the crop edges", () => {
    const line = "prefix".repeat(10) + "needle" + "suffix".repeat(10);
    const r = cropLine(line, line.indexOf("needle"), line.indexOf("needle") + 6, {
      maxChars: 12,
      before: 2,
      after: 2,
    });
    expect(r.text).toContain("needle");
    expect(r.matchStart).toBeGreaterThanOrEqual(0);
  });

  test("no ellipsis when the match sits at the line start or end", () => {
    const line = "MATCH" + "x".repeat(100);
    const r = cropLine(line, 0, 5, { maxChars: 20, before: 4, after: 4 });
    expect(r.text.startsWith("…")).toBe(false);
    expect(r.text.endsWith("…")).toBe(true);
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
