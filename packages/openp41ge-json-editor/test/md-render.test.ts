/**
 * md-render tests — Markdown → HTML for the key tooltip, plus file-reference
 * detection and code-block highlighting.
 */
import { describe, it, expect } from "vitest";
import { renderMarkdown, isMarkdownFileRef, highlightCodeBlock } from "../src/md-render";

describe("renderMarkdown", () => {
  it("wraps a plain paragraph", () => {
    expect(renderMarkdown("Just some text.")).toBe("<p>Just some text.</p>");
  });

  it("renders headings at their level", () => {
    expect(renderMarkdown("# Title")).toBe("<h1>Title</h1>");
    expect(renderMarkdown("### Sub")).toBe("<h3>Sub</h3>");
  });

  it("renders bold, italic, inline code and links", () => {
    expect(renderMarkdown("**bold** and *ital* and `code`")).toBe(
      "<p><strong>bold</strong> and <em>ital</em> and <code>code</code></p>",
    );
    expect(renderMarkdown("[docs](https://x.y)")).toBe('<p><a href="https://x.y">docs</a></p>');
  });

  it("escapes HTML in source text", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("renders bullet and numbered lists", () => {
    expect(renderMarkdown("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(renderMarkdown("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("renders a blockquote", () => {
    expect(renderMarkdown("> a note")).toBe("<blockquote>a note</blockquote>");
  });

  it("syntax-highlights a fenced JSON code block", () => {
    const html = renderMarkdown('Example:\n```json\n{ "a": 1 }\n```');
    expect(html).toContain('<pre class="je-md-code" data-lang="json">');
    expect(html).toContain("<code>");
    expect(html).toContain('<span class="s-pun">{</span>');
    expect(html).toContain('<span class="s-var">"a"</span>');
    expect(html).toContain('<span class="s-num">1</span>');
  });

  it("escapes a non-JSON fenced block", () => {
    const html = renderMarkdown("```bash\nrm -rf /\n```");
    expect(html).toContain('<pre class="je-md-code" data-lang="bash">');
    expect(html).toContain("rm -rf /");
    expect(html).not.toContain("<span");
  });

  it("keeps an unclosed fence as a single code block", () => {
    const html = renderMarkdown('```json\n{ "a": 1 }');
    expect(html).toContain('data-lang="json"');
    expect(html).toContain("<code>");
  });
});

describe("highlightCodeBlock", () => {
  it("highlights JSON with scoped spans", () => {
    const html = highlightCodeBlock('{ "k": 2 }', "json");
    expect(html).toContain('<span class="s-var">');
    expect(html).toContain('<span class="s-num">');
  });

  it("escapes other languages without spans", () => {
    const html = highlightCodeBlock("<x>", "text");
    expect(html).toBe("&lt;x&gt;");
  });
});

describe("isMarkdownFileRef", () => {
  it("accepts relative .md paths", () => {
    expect(isMarkdownFileRef("descriptions/thinking.md")).toBe(true);
    expect(isMarkdownFileRef("./thinking.md")).toBe(true);
    expect(isMarkdownFileRef("../shared/x.md")).toBe(true);
    expect(isMarkdownFileRef("a.md")).toBe(true);
  });

  it("rejects prose, absolute paths and non-.md extensions", () => {
    expect(isMarkdownFileRef("A description to show.")).toBe(false);
    expect(isMarkdownFileRef("has a space/thinking.md")).toBe(false);
    expect(isMarkdownFileRef("/abs/path/thinking.md")).toBe(false);
    expect(isMarkdownFileRef("descriptions/thinking.txt")).toBe(false);
    expect(isMarkdownFileRef("")).toBe(false);
  });
});
