import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@openp41ge-agents/ui/markdown";

describe("renderMarkdown", () => {
  it("renders paragraphs", () => {
    expect(renderMarkdown("hello world")).toBe("<p>hello world</p>");
  });

  it("renders headings", () => {
    expect(renderMarkdown("# Title")).toBe("<h1>Title</h1>");
    expect(renderMarkdown("### Sub")).toBe("<h3>Sub</h3>");
  });

  it("renders bold, italic, and strikethrough", () => {
    expect(renderMarkdown("**bold** and *italic* and ~~strike~~")).toBe(
      "<p><strong>bold</strong> and <em>italic</em> and <del>strike</del></p>",
    );
  });

  it("renders inline code without mangling emphasis inside it", () => {
    expect(renderMarkdown("use `a * b` here")).toBe("<p>use <code>a * b</code> here</p>");
  });

  it("renders fenced code blocks", () => {
    expect(renderMarkdown("```js\nconst x = 1;\n```")).toBe("<pre><code>const x = 1;</code></pre>");
  });

  it("renders unordered and ordered lists", () => {
    expect(renderMarkdown("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(renderMarkdown("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("renders blockquotes and horizontal rules", () => {
    expect(renderMarkdown("> quote")).toBe("<blockquote>quote</blockquote>");
    expect(renderMarkdown("---")).toBe("<hr />");
  });

  it("renders links and images", () => {
    expect(renderMarkdown("[label](https://example.com)")).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">label</a></p>',
    );
    expect(renderMarkdown("![alt](https://example.com/a.png)")).toBe(
      '<p><img src="https://example.com/a.png" alt="alt" /></p>',
    );
  });

  it("escapes raw HTML so the LLM cannot inject it", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("returns an empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });
});
