import { describe, it, expect } from "vitest";
import { renderMarkdown, renderMarkdownSegments } from "@openp41ge-agents/ui/markdown";

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

  it("renders fenced code blocks as highlighted static pre in renderMarkdown", () => {
    const html = renderMarkdown("```js\nconst x = 1;\n```");
    expect(html).toContain("<pre><code>");
    expect(html).toContain('<span class="hl-key">const</span>');
    expect(html).toContain('<span class="hl-number">1</span>');
  });

  it("returns code blocks as structured segments with language + inferred flags", () => {
    const segments = renderMarkdownSegments("```js\nconst x = 1;\n```");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      type: "code",
      code: "const x = 1;",
      language: "javascript",
      inferred: false,
      index: 0,
      msgId: undefined,
    });
  });

  it("marks a code block as inferred when no language is written", () => {
    const segments = renderMarkdownSegments("```\nconst x = 1;\n```");
    expect(segments[0]).toMatchObject({ language: "javascript", inferred: true });
  });

  it("does not mark an explicitly-tagged code block as inferred", () => {
    const segments = renderMarkdownSegments("```py\nprint(1)\n```");
    expect(segments[0]).toMatchObject({ language: "python", inferred: false });
  });

  it("applies a language override from the codeLanguages option", () => {
    const segments = renderMarkdownSegments("```\nprint(1)\n```", {
      codeLanguages: { 0: "python" },
    });
    expect(segments[0]).toMatchObject({ language: "python", inferred: false });
  });

  it("stamps msgId onto code block segments when provided", () => {
    const segments = renderMarkdownSegments("```\ncode\n```", { msgId: "m1" });
    expect(segments[0]).toMatchObject({ msgId: "m1" });
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

  it("renders a GFM pipe table", () => {
    const md = "| Name | Value |\n| --- | --- |\n| a | 1 |\n| b | 2 |";
    expect(renderMarkdown(md)).toBe(
      "<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody>" +
        "<tr><td>a</td><td>1</td></tr><tr><td>b</td><td>2</td></tr></tbody></table>",
    );
  });

  it("handles tables without leading/trailing pipes", () => {
    const md = "Name | Value\n--- | ---\na | 1";
    expect(renderMarkdown(md)).toBe(
      "<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody>" +
        "<tr><td>a</td><td>1</td></tr></tbody></table>",
    );
  });

  it("applies column alignment from the delimiter row", () => {
    const md = "| a | b | c |\n| :--- | ---: | :---: |\n| 1 | 2 | 3 |";
    expect(renderMarkdown(md)).toBe(
      "<table><thead><tr>" +
        '<th>a</th><th style="text-align:right">b</th><th style="text-align:center">c</th>' +
        "</tr></thead><tbody><tr>" +
        '<td>1</td><td style="text-align:right">2</td><td style="text-align:center">3</td>' +
        "</tr></tbody></table>",
    );
  });

  it("renders inline markdown inside table cells", () => {
    const md = "| Cmd | Status |\n| --- | --- |\n| `npm test` | **ok** |";
    expect(renderMarkdown(md)).toBe(
      "<table><thead><tr><th>Cmd</th><th>Status</th></tr></thead><tbody>" +
        "<tr><td><code>npm test</code></td><td><strong>ok</strong></td></tr></tbody></table>",
    );
  });

  it("fills missing trailing cells with empty content", () => {
    const md = "| a | b |\n| --- | --- |\n| 1 |";
    expect(renderMarkdown(md)).toBe(
      "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody>" +
        "<tr><td>1</td><td></td></tr></tbody></table>",
    );
  });
});
