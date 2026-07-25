/**
 * Tests for format-save.ts — per-extension formatters run on save.
 */

import { getFormatterForPath } from "@openp41ge/renderer/controllers/format-save";

describe("getFormatterForPath", () => {
  it("returns null for unknown extensions", () => {
    expect(getFormatterForPath("foo.xyz")).toBeNull();
    expect(getFormatterForPath("Makefile")).toBeNull();
  });

  it("returns a formatter for .html", () => {
    const fmt = getFormatterForPath("index.html");
    expect(fmt).toBeInstanceOf(Function);
  });

  it("returns a formatter for .htm", () => {
    const fmt = getFormatterForPath("page.htm");
    expect(fmt).toBeInstanceOf(Function);
  });
});

describe("HTML formatter", () => {
  const fmt = getFormatterForPath("test.html")!;

  it("converts single-quote attrs to double-quote", () => {
    const input = `<div class='foo' id='bar'>text</div>`;
    expect(fmt(input)).toBe(`<div class="foo" id="bar">text</div>`);
  });

  it("converts single-quote attrs with spacing", () => {
    const input = `<div class = 'foo'>text</div>`;
    expect(fmt(input)).toBe(`<div class="foo">text</div>`);
  });

  it("leaves double-quote attrs unchanged", () => {
    const input = `<div class="foo" id="bar">text</div>`;
    expect(fmt(input)).toBe(input);
  });

  it("escapes double quotes inside single-quoted values", () => {
    const input = `<div title='say "hello"'>text</div>`;
    expect(fmt(input)).toBe(`<div title="say \\"hello\\"">text</div>`);
  });

  it("does not modify content inside <script> tags", () => {
    const input = `<html><body><script>var x = 'hello';</script></body></html>`;
    const result = fmt(input);
    // Script content should be unchanged (single quotes preserved)
    expect(result).toContain(`var x = 'hello'`);
    // Tags around the script should be normalised (re-indented)
    expect(result).toContain(`<script>var x = 'hello';</script>`);
  });

  it("does not modify content inside <style> tags", () => {
    const input = `<html><head><style>div:before { content: '>' }</style></head></html>`;
    const result = fmt(input);
    // Style content should be unchanged (single quotes preserved)
    expect(result).toContain(`content: '>'`);
    // Tags around the style should be normalised
    expect(result).toContain(`<style>div:before { content: '>' }</style>`);
  });

  it("handles mixed single/double quotes in a tag", () => {
    const input = `<a href='link.html' title="hello">text</a>`;
    expect(fmt(input)).toBe(`<a href="link.html" title="hello">text</a>`);
  });

  it("removes trailing whitespace from lines", () => {
    const input = `<div>  \n  <span>  </span>  \n</div>  `;
    const result = fmt(input);
    // Each line should have no trailing spaces
    const lines = result.split("\n");
    for (const line of lines) {
      expect(line).not.toMatch(/[ \t]+$/);
    }
  });

  it("handles self-closing tags", () => {
    const input = `<br class='clear'/>`;
    expect(fmt(input)).toBe(`<br class="clear"/>`);
  });

  it("handles attributes with hyphens", () => {
    const input = `<div data-foo='bar' ng-model='baz'>text</div>`;
    expect(fmt(input)).toBe(`<div data-foo="bar" ng-model="baz">text</div>`);
  });

  // ── Indentation tests ──

  it("indents nested elements on separate lines", () => {
    const input = `<div>\n<p>text</p>\n</div>`;
    expect(fmt(input)).toBe(`<div>\n  <p>text</p>\n</div>`);
  });

  it("aligns closing tags with their opening tags", () => {
    const input = `<ul>\n<li>a</li>\n<li>b</li>\n</ul>`;
    expect(fmt(input)).toBe(`<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>`);
  });

  it("handles deeply nested structure on separate lines", () => {
    const input = `<div>\n<div>\n<span>deep</span>\n</div>\n</div>`;
    expect(fmt(input)).toBe(`<div>\n  <div>\n    <span>deep</span>\n  </div>\n</div>`);
  });

  it("preserves single-line tags as-is (no line-break insertion)", () => {
    const input = `<div><p>text</p></div>`;
    expect(fmt(input)).toBe(input);
  });

  it("preserves self-closing and void elements at correct depth", () => {
    const input = `<div>\n<br/>\n<hr/>\n</div>`;
    expect(fmt(input)).toBe(`<div>\n  <br/>\n  <hr/>\n</div>`);
  });

  it("does not re-indent content inside <style> blocks", () => {
    const input = `<html>\n<style>\n  .foo { color: red; }\n</style>\n</html>`;
    const result = fmt(input);
    // <style> content should keep its original indentation
    expect(result).toContain("  .foo { color: red; }");
    // But tags around it should be re-indented
    expect(result).toMatch(/^<html>\n  <style>/m);
  });

  it("formats JavaScript inside <script> blocks", () => {
    const input = `<html>\n<script>\n  var x = 1;\n</script>\n</html>`;
    const result = fmt(input);
    // JS content should be re-indented inside the script tag
    expect(result).toMatch(/<html>\n  <script>\n    var x = 1;\n  <\/script>\n<\/html>/);
  });

  it("trims whitespace inside single-line script blocks", () => {
    const input = `<script>   var x = 1;   </script>`;
    expect(fmt(input)).toContain(`<script>var x = 1;</script>`);
  });

  it("leaves external scripts (src=) untouched", () => {
    const input = `<html><script src="lib.js"></script></html>`;
    const result = fmt(input);
    expect(result).toContain(`<script src="lib.js"></script>`);
  });

  it("indents JavaScript based on brace depth", () => {
    const input = `<script>\nfunction foo() {\nreturn 1;\n}\n</script>`;
    const result = fmt(input);
    expect(result).toContain("  function foo() {");
    expect(result).toContain("    return 1;");
  });

  it("handles tags with attributes split across lines", () => {
    const input = `<span\n  class="foo">text</span>`;
    const result = fmt(input);
    // The tag should be folded onto one line
    expect(result).toContain(`<span class="foo">`);
  });
});
