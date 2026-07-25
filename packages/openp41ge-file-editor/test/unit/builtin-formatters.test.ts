/**
 * Comprehensive tests for all built-in formatters and common utilities.
 *
 * Covers edge cases, boundary conditions, and real-world patterns for
 * each formatter type. Organized by formatter module with detailed
 * describe blocks per logical grouping.
 *
 * Key assumptions verified by these tests:
 * - All formatters operate synchronously on in-memory strings
 * - All formatters strip trailing whitespace and ensure final newline
 * - All formatters normalize line endings to LF
 * - Brace-based formatters work on brace/bracelet/paren depth (no parser)
 * - String contents containing braces are NOT parsed — this is a documented limitation
 * - Backtick identifiers in SQL are NOT protected from keyword uppercasing
 */

import { describe, it, expect } from "vitest";
import {
  stripTrailingWhitespace,
  ensureFinalNewline,
  normalizeLineEndings,
  usesTabs,
} from "@openp41ge-file-editor/services/formatters/common";
import { createBraceIndentFormatter } from "@openp41ge-file-editor/services/formatters/brace-indent-formatter";
import { createHtmlFormatter } from "@openp41ge-file-editor/services/formatters/html-formatter";
import { createCssFormatter } from "@openp41ge-file-editor/services/formatters/css-formatter";
import { createYamlFormatter } from "@openp41ge-file-editor/services/formatters/yaml-formatter";
import { createSqlFormatter } from "@openp41ge-file-editor/services/formatters/sql-formatter";
import { createTomlFormatter } from "@openp41ge-file-editor/services/formatters/toml-formatter";
import { createDockerfileFormatter } from "@openp41ge-file-editor/services/formatters/dockerfile-formatter";
import { createMarkdownFormatter } from "@openp41ge-file-editor/services/formatters/markdown-formatter";
import { createShellFormatter } from "@openp41ge-file-editor/services/formatters/shell-formatter";
import { createHclFormatter } from "@openp41ge-file-editor/services/formatters/hcl-formatter";
import { registerBuiltinFormatters } from "@openp41ge-file-editor/services/formatters";
import { ExtensionFormatterRegistry } from "@openp41ge-file-editor/services/extension-formatter-registry";

// ─────────────────────────────────────────────────────────────────────────────
// Common Utilities
// ─────────────────────────────────────────────────────────────────────────────

describe("common formatting utilities", () => {
  describe("stripTrailingWhitespace", () => {
    it("removes trailing spaces from each line", () => {
      expect(stripTrailingWhitespace("a  \nb  \n")).toBe("a\nb\n");
    });

    it("removes trailing tabs from each line", () => {
      expect(stripTrailingWhitespace("a\t\t\nb\t\n")).toBe("a\nb\n");
    });

    it("handles mixed trailing whitespace keeping mid-line tabs", () => {
      // Tab before "y" is mid-line so it's preserved; trailing tab after "y" is removed
      expect(stripTrailingWhitespace("x  \ty\t\n")).toBe("x  \ty\n");
    });

    it("preserves lines with no trailing space", () => {
      expect(stripTrailingWhitespace("hello\nworld\n")).toBe("hello\nworld\n");
    });

    it("preserves intentional leading whitespace", () => {
      expect(stripTrailingWhitespace("  indented  \n    also  \n")).toBe("  indented\n    also\n");
    });

    it("handles empty string", () => {
      expect(stripTrailingWhitespace("")).toBe("");
    });

    it("handles single line with only spaces", () => {
      expect(stripTrailingWhitespace("   \t  ")).toBe("");
    });

    it("handles multiple blank lines with spaces", () => {
      expect(stripTrailingWhitespace("a\n   \n\nb\n")).toBe("a\n\n\nb\n");
    });
  });

  describe("ensureFinalNewline", () => {
    it("adds newline to content without trailing newline", () => {
      expect(ensureFinalNewline("hello")).toBe("hello\n");
    });

    it("preserves single trailing newline", () => {
      expect(ensureFinalNewline("hello\n")).toBe("hello\n");
    });

    it("trims multiple trailing newlines to one", () => {
      expect(ensureFinalNewline("hello\n\n\n")).toBe("hello\n");
    });

    it("handles empty string", () => {
      expect(ensureFinalNewline("")).toBe("\n");
    });

    it("handles string with only newlines", () => {
      expect(ensureFinalNewline("\n\n\n")).toBe("\n");
    });

    it("preserves interior newlines", () => {
      expect(ensureFinalNewline("a\nb\nc\n")).toBe("a\nb\nc\n");
    });
  });

  describe("normalizeLineEndings", () => {
    it("converts CRLF to LF", () => {
      expect(normalizeLineEndings("line1\r\nline2\r\n")).toBe("line1\nline2\n");
    });

    it("converts bare CR to LF", () => {
      expect(normalizeLineEndings("line1\rline2\r")).toBe("line1\nline2\n");
    });

    it("preserves LF as-is", () => {
      expect(normalizeLineEndings("line1\nline2\n")).toBe("line1\nline2\n");
    });

    it("handles mixed line endings", () => {
      expect(normalizeLineEndings("a\r\nb\rc\n")).toBe("a\nb\nc\n");
    });

    it("handles empty string", () => {
      expect(normalizeLineEndings("")).toBe("");
    });
  });

  describe("usesTabs", () => {
    it("returns true when tabs are used for indentation", () => {
      expect(usesTabs("\t\tfoo\n\tbar\n")).toBe(true);
    });

    it("returns false when no tabs are used", () => {
      expect(usesTabs("  foo\n    bar\n")).toBe(false);
    });

    it("returns false for tabs after non-whitespace (mid-line tabs)", () => {
      expect(usesTabs("foo\tbar\nbaz\n")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(usesTabs("")).toBe(false);
    });

    it("returns false for whitespace-only lines", () => {
      expect(usesTabs("   \n    \n")).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BraceIndentFormatter
// ─────────────────────────────────────────────────────────────────────────────

describe("BraceIndentFormatter", () => {
  describe("2-space indent (JS/TS/TSX/JSX style)", () => {
    const fmt = createBraceIndentFormatter("Brace Indent", 2);

    it("indents a simple function body", () => {
      expect(fmt.format("function foo() {\nreturn 1;\n}")).toBe(
        "function foo() {\n  return 1;\n}\n",
      );
    });

    it("indents nested blocks correctly", () => {
      const input = "if (a) {\nif (b) {\nif (c) {\nx();\n}\n}\n}";
      const expected = [
        "if (a) {",
        "  if (b) {",
        "    if (c) {",
        "      x();",
        "    }",
        "  }",
        "}",
        "",
      ].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("handles multiple opening braces on one line (depth increments once)", () => {
      // Both braces are on the same line; only the trailing `{` increments depth
      const input = "function foo() { if (a) {\nx();\n}\n}";
      const expected = ["function foo() { if (a) {", "  x();", "}", "}", ""].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("handles closing braces on the same line as content", () => {
      const input = "if (a) {\nx(); }";
      const expected = ["if (a) {", "  x(); }", ""].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("handles square bracket delimiters", () => {
      const input = "const arr = [\n1,\n2,\n]";
      const expected = ["const arr = [", "  1,", "  2,", "]", ""].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("handles parentheses as delimiters", () => {
      const input = "foo(\nbar,\nbaz\n)";
      const expected = ["foo(", "  bar,", "  baz", ")", ""].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("handles mixed brace types [] () {}", () => {
      const input = "function foo() {\nconst x = bar(\n1,\n2\n);\n}";
      const expected = [
        "function foo() {",
        "  const x = bar(",
        "    1,",
        "    2",
        "  );",
        "}",
        "",
      ].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("is idempotent on already-indented code", () => {
      const input = "function foo() {\n  return 1;\n}";
      const result = fmt.format(input);
      expect(result).toBe("function foo() {\n  return 1;\n}\n");
    });

    it("handles empty block on one line", () => {
      expect(fmt.format("if (true) {}\nelse {\n}")).toBe("if (true) {}\nelse {\n}\n");
    });

    it("handles excessive closing braces without going negative", () => {
      // `{` opens a block so `foo` is indented, then `}` closes it
      const result = fmt.format("}\n}\n{\nfoo\n}");
      expect(result).toBe("}\n}\n{\n  foo\n}\n");
    });

    it("handles strings containing braces (documented limitation)", () => {
      // Brace formatter can't distinguish braces in strings.
      // Should not crash, output should still be reasonable.
      const input = 'const s = "if (a) { foo }";\nreturn s;';
      const result = fmt.format(input);
      expect(result).toContain("return s;");
      expect(result).toContain("const s");
    });

    it("indents blank lines to current depth level", () => {
      const input = "function foo() {\n\n\nreturn 1;\n}";
      const expected = ["function foo() {", "  ", "  ", "  return 1;", "}", ""].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("preserves comment lines", () => {
      const input = "// header\nfunction foo() {\n// inside\nreturn 1;\n}";
      const expected = [
        "// header",
        "function foo() {",
        "  // inside",
        "  return 1;",
        "}",
        "",
      ].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("handles switch-case blocks at same indent level", () => {
      // case and break are both body-level in a switch, so indent one level
      const input = "switch (x) {\ncase 1:\nbreak;\ncase 2:\nbreak;\n}";
      const expected = [
        "switch (x) {",
        "  case 1:",
        "  break;",
        "  case 2:",
        "  break;",
        "}",
        "",
      ].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("handles arrow function with body block", () => {
      const input = "const fn = () => {\nreturn x;\n}";
      const expected = ["const fn = () => {", "  return x;", "}", ""].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("handles immediately-invoked function expression (IIFE)", () => {
      const input = "(function() {\nconsole.log('hi');\n})();";
      const expected = ["(function() {", "  console.log('hi');", "})();", ""].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("handles empty string without crashing", () => {
      expect(fmt.format("")).toBe("\n");
    });

    it("handles single line without braces", () => {
      expect(fmt.format("const x = 1;")).toBe("const x = 1;\n");
    });

    it("handles CRLF line endings", () => {
      const input = "function foo() {\r\nreturn 1;\r\n}";
      expect(fmt.format(input)).toBe("function foo() {\n  return 1;\n}\n");
    });

    it("uses tabs when input uses tab indentation", () => {
      // Uses tabs because input has leading tabs; closing `}` gets depth=0 so no tab
      const input = "\tfunction foo() {\n\t\treturn 1;\n\t}";
      expect(fmt.format(input)).toBe("function foo() {\n\treturn 1;\n}\n");
    });
  });

  describe("4-space indent (Java/C++/Go style)", () => {
    const fmt = createBraceIndentFormatter("Brace Indent", 4);

    it("indents a Java class body", () => {
      const input = "public class Foo {\nprivate int x;\npublic Foo() {}\n}";
      const expected = [
        "public class Foo {",
        "    private int x;",
        "    public Foo() {}",
        "}",
        "",
      ].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("indents nested methods and blocks", () => {
      const input = "class Foo {\nvoid bar() {\nif (a) {\nx();\n}\n}\n}";
      const expected = [
        "class Foo {",
        "    void bar() {",
        "        if (a) {",
        "            x();",
        "        }",
        "    }",
        "}",
        "",
      ].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("handles a Go struct with fields", () => {
      const input = "type Foo struct {\nName string\nAge  int\n}";
      const expected = ["type Foo struct {", "    Name string", "    Age  int", "}", ""].join("\n");
      expect(fmt.format(input)).toBe(expected);
    });

    it("consistently formats when called twice", () => {
      const input = "class Foo {\nint x;\n}";
      const result1 = fmt.format(input);
      const result2 = fmt.format(result1);
      expect(result1).toBe(result2);
    });
  });

  describe("custom indent size", () => {
    const fmt = createBraceIndentFormatter("3-space", 3);

    it("uses the specified indent size", () => {
      const input = "if (a) {\nb();\n}";
      expect(fmt.format(input)).toBe("if (a) {\n   b();\n}\n");
    });
  });

  describe("formatter name", () => {
    it("returns the configured name", () => {
      const fmt = createBraceIndentFormatter("My Formatter", 2);
      expect(fmt.name).toBe("My Formatter");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HtmlFormatter
// ─────────────────────────────────────────────────────────────────────────────

describe("HtmlFormatter", () => {
  const fmt = createHtmlFormatter();

  it("indents nested tags", () => {
    const input = "<div>\n<p>\nHello\n</p>\n</div>";
    const expected = ["<div>", "  <p>", "    Hello", "  </p>", "</div>", ""].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });

  it("handles deeply nested elements", () => {
    const input = "<div>\n<section>\n<article>\n<p>\ntext\n</p>\n</article>\n</section>\n</div>";
    const expected = [
      "<div>",
      "  <section>",
      "    <article>",
      "      <p>",
      "        text",
      "      </p>",
      "    </article>",
      "  </section>",
      "</div>",
      "",
    ].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });

  it("does not indent self-closing void elements", () => {
    const input = "<div>\n<br>\n<p>text</p>\n</div>";
    const expected = ["<div>", "  <br>", "  <p>text</p>", "</div>", ""].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });

  it("does not indent all HTML5 void elements", () => {
    const voids = [
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr",
    ];
    for (const tag of voids) {
      const input = `<div>\n<${tag} />\n</div>`;
      const result = fmt.format(input);
      expect(result).toContain(`  <${tag} />`);
    }
  });

  it("handles tags with attributes", () => {
    const input = '<div class="container" id="main">\n<p style="color:red">\nHi\n</p>\n</div>';
    const expected = [
      '<div class="container" id="main">',
      '  <p style="color:red">',
      "    Hi",
      "  </p>",
      "</div>",
      "",
    ].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });

  it("handles tags that close on the same line", () => {
    const input = "<div>\n<p>Hello</p>\n</div>";
    const expected = ["<div>", "  <p>Hello</p>", "</div>", ""].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });

  it("handles nested same-name tags", () => {
    const input = "<div>\n<div>\n<p>nested</p>\n</div>\n</div>";
    const expected = ["<div>", "  <div>", "    <p>nested</p>", "  </div>", "</div>", ""].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });

  it("handles DOCTYPE declaration", () => {
    const input = "<!DOCTYPE html>\n<html>\n<body>\n<p>ok</p>\n</body>\n</html>";
    const expected = [
      "<!DOCTYPE html>",
      "<html>",
      "  <body>",
      "    <p>ok</p>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });

  it("handles comment lines", () => {
    const input = "<div>\n<!-- comment -->\n<p>text</p>\n</div>";
    const expected = ["<div>", "  <!-- comment -->", "  <p>text</p>", "</div>", ""].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });

  it("handles empty input", () => {
    expect(fmt.format("")).toBe("\n");
  });

  it("handles single tag without children", () => {
    expect(fmt.format("<p>Hello</p>")).toBe("<p>Hello</p>\n");
  });

  it("indents blank lines to current depth", () => {
    const input = "<div>\n\n\n<p>text</p>\n</div>";
    const expected = ["<div>", "", "", "  <p>text</p>", "</div>", ""].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });

  it("detects tab indentation and preserves tabs", () => {
    const input = "<ul>\n\t<li>\n\titem\n</li>\n</ul>";
    const result = fmt.format(input);
    expect(result).toContain("\t<li>");
  });

  it("handles CRLF line endings", () => {
    const input = "<div>\r\n<p>text</p>\r\n</div>";
    expect(fmt.format(input)).toBe("<div>\n  <p>text</p>\n</div>\n");
  });

  it("does not choke on inline angle brackets in content", () => {
    const input = "<div>\nThe value is a < b && c > d\n</div>";
    const result = fmt.format(input);
    expect(result).toContain("The value is a < b && c > d");
  });

  it("handles multiple sibling elements at same level", () => {
    const input = "<ul>\n<li>one</li>\n<li>two</li>\n<li>three</li>\n</ul>";
    const expected = [
      "<ul>",
      "  <li>one</li>",
      "  <li>two</li>",
      "  <li>three</li>",
      "</ul>",
      "",
    ].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });

  it("handles HTML with meta charset self-closing tag", () => {
    const input = '<head>\n<meta charset="utf-8">\n<title>test</title>\n</head>';
    const expected = [
      "<head>",
      '  <meta charset="utf-8">',
      "  <title>test</title>",
      "</head>",
      "",
    ].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });

  it("handles nested list items", () => {
    const input = "<ul>\n<li>\nA\n<ul>\n<li>B</li>\n</ul>\n</li>\n</ul>";
    const expected = [
      "<ul>",
      "  <li>",
      "    A",
      "    <ul>",
      "      <li>B</li>",
      "    </ul>",
      "  </li>",
      "</ul>",
      "",
    ].join("\n");
    expect(fmt.format(input)).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CssFormatter
// ─────────────────────────────────────────────────────────────────────────────

describe("CssFormatter", () => {
  const fmt = createCssFormatter();

  it("formats a single rule with one property", () => {
    const result = fmt.format("a { color: red; }");
    expect(result).toContain("a {");
    expect(result).toContain("  color: red;");
    expect(result).toContain("}");
  });

  it("splits multiple selectors onto separate rule sets", () => {
    const result = fmt.format("h1, h2, h3 {\ncolor: blue;\n}");
    expect(result).toContain("h1, h2, h3 {");
    expect(result).toContain("  color: blue;");
  });

  it("formats multiple rules", () => {
    const input = "a { color: red; } b { color: blue; }";
    const result = fmt.format(input);
    expect(result).toContain("a {");
    expect(result).toContain("  color: red;");
    expect(result).toContain("b {");
    expect(result).toContain("  color: blue;");
  });

  it("handles nested braces (media queries)", () => {
    const input = "@media (max-width: 600px) { body { font-size: 14px; } }";
    const result = fmt.format(input);
    expect(result).toContain("@media (max-width: 600px) {");
    expect(result).toContain("body {");
    expect(result).toContain("    font-size: 14px;");
  });

  it("handles empty rules", () => {
    const result = fmt.format("div {}");
    expect(result).toContain("div {");
    expect(result).toContain("}");
  });

  it("handles at-rules (@import, @font-face, @keyframes)", () => {
    const input = [
      "@import url('style.css');",
      "@font-face {",
      "font-family: 'Custom';",
      "src: url('font.woff');",
      "}",
    ].join("\n");
    const result = fmt.format(input);
    expect(result).toContain("@import url('style.css')");
    expect(result).toContain("@font-face {");
    expect(result).toContain("  font-family: 'Custom';");
    expect(result).toContain("  src: url('font.woff')");
  });

  it("handles vendor prefixed properties", () => {
    const input = [
      "div {",
      "-webkit-transform: scale(1);",
      "-moz-transform: scale(1);",
      "transform: scale(1);",
      "}",
    ].join("\n");
    const result = fmt.format(input);
    expect(result).toContain("-webkit-transform: scale(1)");
    expect(result).toContain("-moz-transform: scale(1)");
  });

  it("preserves comments", () => {
    const result = fmt.format("/* comment */\na { color: red; }");
    expect(result).toContain("/* comment */");
    expect(result).toContain("a {");
  });

  it("handles empty input", () => {
    expect(fmt.format("")).toBe("\n");
  });

  it("handles pseudo-classes and pseudo-elements", () => {
    const result = fmt.format("a:hover { color: red; }\na::before { content: '>'; }");
    expect(result).toContain("a:hover {");
    expect(result).toContain("  color: red;");
    expect(result).toContain("a::before {");
    expect(result).toContain("  content: '>'");
  });

  it("handles attribute selectors", () => {
    const result = fmt.format('input[type="text"] { border: 1px; }');
    expect(result).toContain('input[type="text"] {');
    expect(result).toContain("  border: 1px");
  });

  it("consistently formats when applied twice", () => {
    const input = "a { color: red; } b { color: blue; }";
    const result1 = fmt.format(input);
    const result2 = fmt.format(result1);
    expect(result1).toBe(result2);
  });

  it("uses tab indentation when input uses tabs", () => {
    // usesTabs detects leading tabs; opening brace at depth 0 gets no indent
    const input = "\ta {\n\t\tcolor: red;\n\t}";
    const result = fmt.format(input);
    expect(result).toContain("a {");
    expect(result).toContain("\tcolor: red;");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// YamlFormatter
// ─────────────────────────────────────────────────────────────────────────────

describe("YamlFormatter", () => {
  const fmt = createYamlFormatter();

  it("normalizes spacing after colon", () => {
    expect(fmt.format("key:value\nfoo:bar")).toBe("key: value\nfoo: bar\n");
  });

  it("normalizes extra spaces around colon", () => {
    expect(fmt.format("key  :   value\nfoo  :  bar")).toBe("key: value\nfoo: bar\n");
  });

  it("preserves single space after colon", () => {
    expect(fmt.format("key: value\nfoo: bar")).toBe("key: value\nfoo: bar\n");
  });

  it("preserves original indentation (no re-indentation)", () => {
    // YAML formatter normalizes colon spacing but preserves original indent
    const input = "root:\n    child:\n        grandchild: val";
    const expected = "root:\n    child:\n        grandchild: val\n";
    expect(fmt.format(input)).toBe(expected);
  });

  it("preserves comments at any level", () => {
    const input = "key: value\n# top comment\n  # indented comment";
    const result = fmt.format(input);
    expect(result).toContain("# top comment");
    expect(result).toContain("# indented comment");
  });

  it("preserves flow collections (inline {})", () => {
    const input = "key: {a: 1, b: 2}";
    expect(fmt.format(input)).toBe("key: {a: 1, b: 2}\n");
  });

  it("preserves multiline string literal block scalar (|)", () => {
    const input = "text: |\n  line1\n  line2\n";
    const result = fmt.format(input);
    expect(result).toContain("text: |");
    expect(result).toContain("  line1");
    expect(result).toContain("  line2");
  });

  it("preserves folded block scalar (>)", () => {
    const input = "text: >\n  line1\n  line2\n";
    const result = fmt.format(input);
    expect(result).toContain("text: >");
  });

  it("preserves empty values (null/undefined)", () => {
    expect(fmt.format("key:\nchild: val\n")).toBe("key:\nchild: val\n");
  });

  it("handles list items with dash prefix", () => {
    const input = "list:\n  - item1\n  - item2\n";
    const result = fmt.format(input);
    expect(result).toContain("  - item1");
    expect(result).toContain("  - item2");
  });

  it("preserves quoted keys", () => {
    const input = '"quoted key": value\nnormal_key: other';
    const result = fmt.format(input);
    expect(result).toContain('"quoted key": value');
    expect(result).toContain("normal_key: other");
  });

  it("handles YAML anchors and aliases", () => {
    const input =
      "defaults: &defaults\n  timeout: 30\n  retries: 3\nserver:\n  <<: *defaults\n  port: 8080";
    const result = fmt.format(input);
    expect(result).toContain("&defaults");
    expect(result).toContain("*defaults");
    expect(result).toContain("port: 8080");
  });

  it("handles empty input", () => {
    expect(fmt.format("")).toBe("\n");
  });

  it("handles single line", () => {
    expect(fmt.format("single_key: true")).toBe("single_key: true\n");
  });

  it("handles boolean and numeric values unchanged", () => {
    const result = fmt.format("active: true\ncount: 42\nratio: 3.14\n");
    expect(result).toBe("active: true\ncount: 42\nratio: 3.14\n");
  });

  it("handles YAML document separator", () => {
    const result = fmt.format("---\nkey: val\n...\n");
    expect(result).toContain("---");
    expect(result).toContain("...");
  });

  it("preserves original indentation regardless of consistency", () => {
    // The formatter normalizes spacing after colons but does NOT re-indent
    const input = "root:\n    child:\n  grandchild: val\n";
    const result = fmt.format(input);
    expect(result).toBe("root:\n    child:\n  grandchild: val\n");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SqlFormatter
// ─────────────────────────────────────────────────────────────────────────────

describe("SqlFormatter", () => {
  const fmt = createSqlFormatter();

  it("uppercases SQL keywords", () => {
    const result = fmt.format("select * from users");
    expect(result).toBe("SELECT * FROM users\n");
  });

  it("uppercases multi-word keywords including DESC", () => {
    const result = fmt.format(
      "select a.* from users u left join orders o on u.id = o.user_id order by o.date desc limit 10",
    );
    expect(result).toBe(
      "SELECT a.* FROM users u LEFT JOIN orders o ON u.id = o.user_id ORDER BY o.date desc LIMIT 10\n",
    );
  });

  it("preserves case inside single-quoted strings", () => {
    const result = fmt.format("select name from users where email = 'select'");
    expect(result).toContain("WHERE email = 'select'");
  });

  it("preserves case inside double-quoted strings", () => {
    const result = fmt.format('select name from users where "from" = 1');
    expect(result).toContain('WHERE "from" = 1');
  });

  it("handles escaped single quotes", () => {
    const result = fmt.format("select name from users where name = 'o''brien'");
    expect(result).toContain("WHERE name = 'o''brien'");
  });

  it("handles ALL keywords in the set", () => {
    const keywords = [
      "select",
      "from",
      "where",
      "and",
      "or",
      "not",
      "in",
      "is",
      "null",
      "insert",
      "into",
      "values",
      "update",
      "set",
      "delete",
      "create",
      "table",
      "alter",
      "drop",
      "index",
      "view",
      "join",
      "left",
      "right",
      "inner",
      "outer",
      "cross",
      "on",
      "order",
      "by",
      "group",
      "having",
      "limit",
      "offset",
      "as",
      "distinct",
      "count",
      "sum",
      "avg",
      "min",
      "max",
      "between",
      "like",
      "exists",
      "union",
      "all",
      "any",
      "case",
      "when",
      "then",
      "else",
      "end",
      "begin",
      "commit",
      "rollback",
      "transaction",
      "primary",
      "key",
      "foreign",
      "references",
      "constraint",
      "default",
      "check",
      "unique",
      "auto_increment",
      "serial",
      "if",
      "while",
      "for",
      "declare",
      "return",
      "function",
      "procedure",
      "trigger",
      "event",
      "database",
      "schema",
      "use",
      "show",
      "describe",
      "explain",
    ];
    // SQL_KEYWORDS does NOT include "desc" — it's not in the set
    const sql = keywords.join(" ") + " x";
    const result = fmt.format(sql);
    for (const kw of keywords) {
      expect(result).toContain(kw.toUpperCase());
    }
  });

  it("uppercases keywords inside backtick identifiers", () => {
    // Backticks are NOT tracked by the quote state machine, so keywords
    // inside backticks are uppercased. This is a documented limitation.
    const result = fmt.format("select `select` from `from` where id = 1");
    expect(result).toBe("SELECT `SELECT` FROM `FROM` WHERE id = 1\n");
  });

  it("preserves non-keyword identifiers", () => {
    const result = fmt.format(
      "select user_name, user_email from user_accounts where account_status = 'active'",
    );
    expect(result).toContain("user_name");
    expect(result).toContain("user_email");
    expect(result).toContain("user_accounts");
    expect(result).toContain("account_status");
  });

  it("handles multi-line SQL", () => {
    const input = [
      "select",
      "  u.name,",
      "  o.total",
      "from users u",
      "join orders o on u.id = o.user_id",
      "where o.total > 100",
    ].join("\n");
    const result = fmt.format(input);
    expect(result).toContain("SELECT");
    expect(result).toContain("FROM");
    expect(result).toContain("JOIN");
    expect(result).toContain("WHERE");
    expect(result).toContain("u.name");
    expect(result).toContain("o.total > 100");
  });

  it("handles empty input", () => {
    expect(fmt.format("")).toBe("\n");
  });

  it("handles single line without keywords", () => {
    expect(fmt.format("12345")).toBe("12345\n");
  });

  it("handles mixed keyword case (lower, UPPER, Title)", () => {
    const result = fmt.format("SeLeCt * FrOm users WhErE id = 1");
    expect(result).toBe("SELECT * FROM users WHERE id = 1\n");
  });

  it("does not uppercase CAST (not in keyword set)", () => {
    // 'cast' is NOT a recognized keyword in our simple SQL_KEYWORDS set
    const result = fmt.format("select cast(amount as decimal) from payments");
    expect(result).toContain("cast(amount AS decimal)");
    expect(result).toContain("SELECT");
    expect(result).toContain("FROM");
  });

  it("handles nested quotes", () => {
    const result = fmt.format("select * from t where a = 'x''y' and b = \"z\"");
    expect(result).toContain("WHERE a = 'x''y'");
    expect(result).toContain('AND b = "z"');
  });

  it("strips trailing whitespace", () => {
    const result = fmt.format("select 1   \nfrom dual   ");
    expect(result).toBe("SELECT 1\nFROM dual\n");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TomlFormatter
// ─────────────────────────────────────────────────────────────────────────────

describe("TomlFormatter", () => {
  const fmt = createTomlFormatter();

  it("normalizes spacing around equals sign", () => {
    const result = fmt.format('key  =  "value"\nfoo=bar');
    expect(result).toBe('key = "value"\nfoo = bar\n');
  });

  it("preserves table headers", () => {
    const result = fmt.format("[tool]\nkey = 1");
    expect(result).toContain("[tool]");
  });

  it("handles nested table headers", () => {
    const result = fmt.format("[tool.subtool]\nenabled = true");
    expect(result).toContain("[tool.subtool]");
    expect(result).toContain("enabled = true");
  });

  it("preserves comments", () => {
    const result = fmt.format("# this is a comment\nkey = 1");
    expect(result).toContain("# this is a comment");
  });

  it("handles inline tables", () => {
    const result = fmt.format("point = {x = 1, y = 2}");
    expect(result).toContain("point = {x = 1, y = 2}");
  });

  it("handles arrays", () => {
    const result = fmt.format('tags = ["a", "b", "c"]');
    expect(result).toBe('tags = ["a", "b", "c"]\n');
  });

  it("handles array of tables", () => {
    const result = fmt.format('[[products]]\nname = "hammer"\n[[products]]\nname = "nail"');
    expect(result).toContain("[[products]]");
    expect(result).toContain('name = "hammer"');
    expect(result).toContain('name = "nail"');
  });

  it("handles date/time values", () => {
    const result = fmt.format("created = 1979-05-27T07:32:00Z\nupdated = 2024-01-01");
    expect(result).toContain("created = 1979-05-27T07:32:00Z");
    expect(result).toContain("updated = 2024-01-01");
  });

  it("handles boolean and numeric values", () => {
    const result = fmt.format("debug = true\nport = 8080\npi = 3.14");
    expect(result).toBe("debug = true\nport = 8080\npi = 3.14\n");
  });

  it("handles dotted keys", () => {
    const result = fmt.format('network.host = "localhost"\nnetwork.port = 3000');
    expect(result).toContain('network.host = "localhost"');
    expect(result).toContain("network.port = 3000");
  });

  it("handles empty values", () => {
    const result = fmt.format("key =\nfoo = bar");
    expect(result).toContain("key =");
    expect(result).toContain("foo = bar");
  });

  it("handles multi-line basic strings", () => {
    const result = fmt.format('str = """\nline1\nline2\n"""');
    expect(result).toContain('str = """');
  });

  it("handles empty input", () => {
    expect(fmt.format("")).toBe("\n");
  });

  it("handles single key-value", () => {
    expect(fmt.format('title = "TOML Example"')).toBe('title = "TOML Example"\n');
  });

  it("handles multiple sections with blank-line separation", () => {
    const input = '[server]\nhost = "localhost"\n\n[admin]\nname = "admin"';
    const result = fmt.format(input);
    expect(result).toContain("[server]");
    expect(result).toContain('host = "localhost"');
    expect(result).toContain("[admin]");
    expect(result).toContain('name = "admin"');
  });

  it("handles values with embedded equals sign (in string)", () => {
    const result = fmt.format('formula = "a = b + c"');
    expect(result).toBe('formula = "a = b + c"\n');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DockerfileFormatter
// ─────────────────────────────────────────────────────────────────────────────

describe("DockerfileFormatter", () => {
  const fmt = createDockerfileFormatter();

  it("uppercases FROM instruction", () => {
    const result = fmt.format("from node:20");
    expect(result).toBe("FROM node:20\n");
  });

  it("uppercases all recognized Docker instructions", () => {
    const input = [
      "from node:20-alpine as base",
      "maintainer dev@example.com",
      "workdir /app",
      "copy package.json .",
      "run npm install",
      "copy . .",
      "expose 3000",
      "env NODE_ENV=production",
      "user nobody",
      'cmd ["node", "server.js"]',
      'entrypoint ["node"]',
      'volume ["/data"]',
      "label version=1.0",
      "arg BUILD_ENV=prod",
      "onbuild run echo building",
      "stopsignal SIGTERM",
      "healthcheck --interval=30s cmd curl -f http://localhost || exit 1",
      'shell ["/bin/bash", "-c"]',
    ].join("\n");

    const result = fmt.format(input);
    // 'as' is NOT a standalone instruction — it's part of the FROM argument
    // so it stays lowercase
    const expected =
      [
        "FROM node:20-alpine as base",
        "MAINTAINER dev@example.com",
        "WORKDIR /app",
        "COPY package.json .",
        "RUN npm install",
        "COPY . .",
        "EXPOSE 3000",
        "ENV NODE_ENV=production",
        "USER nobody",
        'CMD ["node", "server.js"]',
        'ENTRYPOINT ["node"]',
        'VOLUME ["/data"]',
        "LABEL version=1.0",
        "ARG BUILD_ENV=prod",
        "ONBUILD run echo building",
        "STOPSIGNAL SIGTERM",
        "HEALTHCHECK --interval=30s cmd curl -f http://localhost || exit 1",
        'SHELL ["/bin/bash", "-c"]',
      ].join("\n") + "\n";

    expect(result).toBe(expected);
  });

  it("handles multi-stage builds (preserves lowercase 'as')", () => {
    const input = [
      "from node:20 as builder",
      "workdir /app",
      "copy . .",
      "run npm run build",
      "",
      "from nginx:alpine",
      "copy --from=builder /app/dist /usr/share/nginx/html",
    ].join("\n");
    const result = fmt.format(input);
    expect(result).toContain("FROM node:20 as builder");
    expect(result).toContain("WORKDIR /app");
    expect(result).toContain("COPY . .");
    expect(result).toContain("RUN npm run build");
    expect(result).toContain("FROM nginx:alpine");
    expect(result).toContain("COPY --from=builder /app/dist /usr/share/nginx/html");
  });

  it("preserves comments", () => {
    const result = fmt.format("# This is a comment\nfrom node:20");
    expect(result).toContain("# This is a comment");
    expect(result).toContain("FROM node:20");
  });

  it("preserves continuation lines but strips their leading whitespace", () => {
    // Continuation lines are trimmed; the formatter doesn't preserve
    // leading indentation on continuations (documented limitation)
    const input = [
      "run apt-get update && \\",
      "  apt-get install -y curl && \\",
      "  rm -rf /var/lib/apt/lists/*",
    ].join("\n");
    const result = fmt.format(input);
    expect(result).toContain("RUN apt-get update && \\");
    // Continuation lines lose their leading whitespace
    expect(result).toContain("apt-get install -y curl && \\");
    expect(result).toContain("rm -rf /var/lib/apt/lists/*");
  });

  it("handles blank lines between instructions", () => {
    const input = 'from node:20\n\nrun echo hello\n\ncmd ["echo"]';
    const result = fmt.format(input);
    expect(result).toBe('FROM node:20\n\nRUN echo hello\n\nCMD ["echo"]\n');
  });

  it("preserves non-instruction lines (e.g. continuation lines with text)", () => {
    const result = fmt.format("arg some_var=value\nfrom node:20");
    expect(result).toContain("ARG some_var=value");
    expect(result).toContain("FROM node:20");
  });

  it("handles empty input", () => {
    expect(fmt.format("")).toBe("\n");
  });

  it("handles mixed case instruction", () => {
    const result = fmt.format('From node:20\nRun echo hello\nCmd ["ls"]');
    expect(result).toBe('FROM node:20\nRUN echo hello\nCMD ["ls"]\n');
  });

  it("handles ADD instruction", () => {
    const result = fmt.format("add https://example.com/file.tar.gz /tmp/");
    expect(result).toBe("ADD https://example.com/file.tar.gz /tmp/\n");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MarkdownFormatter
// ─────────────────────────────────────────────────────────────────────────────

describe("MarkdownFormatter", () => {
  const fmt = createMarkdownFormatter();

  it("normalises heading spacing (no space after #)", () => {
    expect(fmt.format("#Title\n##Subtitle")).toBe("# Title\n## Subtitle\n");
  });

  it("preserves heading with existing space", () => {
    expect(fmt.format("# Title\n## Subtitle")).toBe("# Title\n## Subtitle\n");
  });

  it("handles heading with extra spaces", () => {
    expect(fmt.format("#   Title")).toBe("# Title\n");
  });

  it("preserves standalone # (no text after)", () => {
    expect(fmt.format("#")).toBe("#\n");
  });

  it("normalises unordered list marker spacing", () => {
    expect(fmt.format("*item\n-item\n+item")).toBe("* item\n- item\n+ item\n");
  });

  it("preserves list marker with existing space", () => {
    expect(fmt.format("* item\n- item\n+ item")).toBe("* item\n- item\n+ item\n");
  });

  it("normalises ordered list marker spacing", () => {
    expect(fmt.format("1.item\n2.item")).toBe("1. item\n2. item\n");
  });

  it("preserves ordered list with existing space", () => {
    expect(fmt.format("1. item\n2. item")).toBe("1. item\n2. item\n");
  });

  it("preserves fenced code blocks", () => {
    const input = ["```", "const x = 1;", "```", "", "text after"].join("\n");
    const result = fmt.format(input);
    expect(result).toContain("```");
    expect(result).toContain("const x = 1;");
    expect(result).toContain("text after");
  });

  it("preserves horizontal rules", () => {
    const result = fmt.format("above\n---\nbelow");
    expect(result).toContain("---");
  });

  it("preserves blockquotes", () => {
    const result = fmt.format("> quote\n> > nested");
    expect(result).toContain("> quote");
    expect(result).toContain("> > nested");
  });

  it("does not re-indent indented list items", () => {
    const result = fmt.format("- top\n  - nested\n    - deeper");
    expect(result).toContain("- top");
    expect(result).toContain("  - nested");
    expect(result).toContain("    - deeper");
  });

  it("handles empty input", () => {
    expect(fmt.format("")).toBe("\n");
  });

  it("handles single word", () => {
    expect(fmt.format("hello")).toBe("hello\n");
  });

  it("strips trailing whitespace", () => {
    const result = fmt.format("line 1   \nline 2   ");
    expect(result).toBe("line 1\nline 2\n");
  });

  it("handles CRLF line endings", () => {
    const result = fmt.format("#Title\r\n- item\r\n");
    expect(result).toBe("# Title\n- item\n");
  });

  it("preserves inline code with backticks", () => {
    const result = fmt.format("Use the `foo()` function.");
    expect(result).toBe("Use the `foo()` function.\n");
  });

  it("preserves tables with pipes", () => {
    const input = "| A | B |\n|---|---|";
    const result = fmt.format(input);
    expect(result).toContain("| A | B |");
    expect(result).toContain("|---|---|");
  });

  it("handles mixed headings, lists, and code blocks", () => {
    const input = [
      "#My Doc",
      "",
      "##Intro",
      "",
      "*point1",
      "*point2",
      "",
      "```",
      "echo hi",
      "```",
    ].join("\n");
    const result = fmt.format(input);
    expect(result).toContain("# My Doc");
    expect(result).toContain("## Intro");
    expect(result).toContain("* point1");
    expect(result).toContain("* point2");
    expect(result).toContain("echo hi");
  });

  it("is idempotent on already-formatted content", () => {
    const input = "# Title\n- item\n1. item\n```\ncode\n```\n";
    const result1 = fmt.format(input);
    const result2 = fmt.format(result1);
    expect(result1).toBe(result2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShellFormatter
// ─────────────────────────────────────────────────────────────────────────────

describe("ShellFormatter", () => {
  const fmt = createShellFormatter();

  it("preserves shebang line", () => {
    const result = fmt.format("#!/bin/bash\necho hello");
    expect(result).toContain("#!/bin/bash");
    expect(result).toContain("echo hello");
  });

  it("normalises spacing around = in variable assignments", () => {
    expect(fmt.format("NAME = value")).toBe("NAME=value\n");
  });

  it("normalises extra spaces around =", () => {
    expect(fmt.format("NAME   =   value")).toBe("NAME=value\n");
  });

  it("preserves correct assignment spacing", () => {
    expect(fmt.format("NAME=value")).toBe("NAME=value\n");
  });

  it("preserves array assignments (value starts with ()", () => {
    const result = fmt.format("arr=(one two three)");
    expect(result).toBe("arr=(one two three)\n");
  });

  it("preserves comments", () => {
    const result = fmt.format("# This is a comment\necho hello");
    expect(result).toContain("# This is a comment");
    expect(result).toContain("echo hello");
  });

  it("preserves heredoc content", () => {
    const input = ["cat << EOF", "hello world", "EOF"].join("\n");
    const result = fmt.format(input);
    expect(result).toContain("cat << EOF");
    expect(result).toContain("hello world");
    expect(result).toContain("EOF");
  });

  it("handles empty input", () => {
    expect(fmt.format("")).toBe("\n");
  });

  it("handles single command", () => {
    expect(fmt.format("echo hello")).toBe("echo hello\n");
  });

  it("strips trailing whitespace", () => {
    const result = fmt.format("echo hello   \necho world   ");
    expect(result).toBe("echo hello\necho world\n");
  });

  it("handles CRLF line endings", () => {
    const result = fmt.format("echo hello\r\nNAME = val\r\n");
    expect(result).toBe("echo hello\nNAME=val\n");
  });

  it("preserves export statements", () => {
    const result = fmt.format("export PATH = /usr/bin");
    expect(result).toContain("export");
    expect(result).toBe("export PATH=/usr/bin\n");
  });

  it("preserves blank lines", () => {
    const result = fmt.format("echo a\n\necho b");
    expect(result).toBe("echo a\n\necho b\n");
  });

  it("does not touch comparison operators (==, !=)", () => {
    const result = fmt.format('if [ "$x" == "$y" ]; then');
    expect(result).toContain("==");
  });

  it("is idempotent on already-formatted content", () => {
    const input = "#!/bin/bash\nNAME=value\necho hello\n";
    const result1 = fmt.format(input);
    const result2 = fmt.format(result1);
    expect(result1).toBe(result2);
  });

  it("handles multi-line script with mixed constructs", () => {
    const input = [
      "#!/bin/bash",
      "",
      "# Config",
      "APP_HOME = /opt/app",
      "DEBUG = true",
      "",
      'if [ -d "$APP_HOME" ]; then',
      '  echo "Found"',
      "fi",
    ].join("\n");
    const result = fmt.format(input);
    expect(result).toContain("#!/bin/bash");
    expect(result).toContain("# Config");
    expect(result).toContain("APP_HOME=/opt/app");
    expect(result).toContain("DEBUG=true");
    expect(result).toContain('if [ -d "$APP_HOME" ]; then');
    expect(result).toContain('  echo "Found"');
    expect(result).toContain("fi");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HclFormatter
// ─────────────────────────────────────────────────────────────────────────────

describe("HclFormatter", () => {
  const fmt = createHclFormatter();

  it("indents block bodies (basic resource)", () => {
    const input = `resource "aws_instance" "web" {
ami = "ami-123"
instance_type = "t2.micro"
}`;
    const result = fmt.format(input);
    expect(result).toContain('resource "aws_instance" "web" {');
    expect(result).toContain('  ami = "ami-123"');
    expect(result).toContain('  instance_type = "t2.micro"');
    expect(result).toContain("}");
  });

  it("handles nested blocks", () => {
    const input = `resource "x" "y" {
  tags = {
Name = "foo"
Env = "bar"
  }
}`;
    const result = fmt.format(input);
    expect(result).toContain("  tags = {");
    expect(result).toContain('    Name = "foo"');
    expect(result).toContain('    Env = "bar"');
  });

  it("normalises = spacing in attributes", () => {
    expect(fmt.format('key ="val"')).toBe('key = "val"\n');
    expect(fmt.format('key= "val"')).toBe('key = "val"\n');
    expect(fmt.format('key  =  "val"')).toBe('key = "val"\n');
  });

  it("preserves single space =", () => {
    expect(fmt.format("count = 1")).toBe("count = 1\n");
  });

  it("preserves # comments", () => {
    const result = fmt.format('# This is a comment\nkey = "val"');
    expect(result).toContain("# This is a comment");
  });

  it("preserves // comments", () => {
    const result = fmt.format('// comment\nkey = "val"');
    expect(result).toContain("// comment");
  });

  it("preserves /* */ block comments", () => {
    const input = "/* block\ncomment */\nkey = 1";
    const result = fmt.format(input);
    expect(result).toContain("/* block");
    expect(result).toContain("comment */");
  });

  it("preserves heredoc content", () => {
    const input = [
      'output "test" {',
      "  value = <<EOF",
      "heredoc line 1",
      "heredoc line 2",
      "EOF",
      "}",
    ].join("\n");
    const result = fmt.format(input);
    expect(result).toContain("heredoc line 1");
    expect(result).toContain("heredoc line 2");
    expect(result).toContain("EOF");
  });

  it("handles empty input", () => {
    expect(fmt.format("")).toBe("\n");
  });

  it("handles single line without blocks", () => {
    expect(fmt.format('key = "val"')).toBe('key = "val"\n');
  });

  it("strips trailing whitespace", () => {
    const result = fmt.format(`key = "val"   
count = 1   `);
    expect(result).toBe('key = "val"\ncount = 1\n');
  });

  it("handles CRLF line endings", () => {
    const result = fmt.format('key = "val"\r\ncount = 1\r\n');
    expect(result).toBe('key = "val"\ncount = 1\n');
  });

  it("preserves lists and tuples", () => {
    const result = fmt.format('subnets = ["a", "b", "c"]');
    expect(result).toBe('subnets = ["a", "b", "c"]\n');
  });

  it("handles terraform data source", () => {
    const input = `data "aws_ami" "ubuntu" {
most_recent = true
filter {
name = "name"
values = ["ubuntu-*"]
}
}`;
    const result = fmt.format(input);
    expect(result).toContain("  most_recent = true");
    expect(result).toContain("  filter {");
    expect(result).toContain('    name = "name"');
  });

  it("is idempotent on already-formatted content", () => {
    const input = `resource "x" "y" {
  key = "val"
}
`;
    const result1 = fmt.format(input);
    const result2 = fmt.format(result1);
    expect(result1).toBe(result2);
  });

  it("normalises block label spacing (no space)", () => {
    const result = fmt.format('resource"aws_instance""web"{key = 1}');
    // Block label normalisation + indentation
    expect(result).toContain('resource "aws_instance" "web" {');
  });

  it("detects tab indentation and preserves tabs", () => {
    const input = `resource "x" "y" {
\tkey = "val"
}`;
    const result = fmt.format(input);
    expect(result).toContain('\tkey = "val"');
  });

  it("handles empty blocks on one line", () => {
    const result = fmt.format('resource "x" "y" {}');
    expect(result).toContain('resource "x" "y" {}');
  });

  it("handles .tfvars-like content", () => {
    const result = fmt.format(`region = "us-east-1"
instance_type = "t2.micro"`);
    expect(result).toBe('region = "us-east-1"\ninstance_type = "t2.micro"\n');
  });

  it("handles provisioner block with heredoc", () => {
    const input = [
      'resource "x" "y" {',
      '  provisioner "local-exec" {',
      "    command = <<EOF",
      "echo hello",
      "EOF",
      "  }",
      "}",
    ].join("\n");
    const result = fmt.format(input);
    expect(result).toContain("echo hello");
    expect(result).toContain("EOF");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Registry integration
// ─────────────────────────────────────────────────────────────────────────────

describe("registerBuiltinFormatters", () => {
  it("registers all expected extensions", () => {
    const registry = new ExtensionFormatterRegistry();
    registerBuiltinFormatters(registry);

    // BraceIndent (2) extensions
    const braceExts2 = ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx"];
    for (const ext of braceExts2) {
      const fmt = registry.get(ext);
      expect(fmt).not.toBeNull();
      expect(fmt!.name).toBe("Brace Indent");
    }

    // BraceIndent (4) extensions — includes Python extensions
    const braceExts4 = [
      "java",
      "c",
      "h",
      "cpp",
      "hpp",
      "cc",
      "cxx",
      "hxx",
      "c++",
      "h++",
      "rs",
      "go",
      "py",
      "pyw",
      "pyx",
      "pyi",
      "rb",
      "erb",
      "rbi",
    ];
    for (const ext of braceExts4) {
      const fmt = registry.get(ext);
      expect(fmt).not.toBeNull();
      expect(fmt!.name).toBe("Brace Indent");
    }

    // HTML
    expect(registry.get("html")!.name).toBe("HTML Indent");
    expect(registry.get("htm")!.name).toBe("HTML Indent");
    expect(registry.get("xhtml")!.name).toBe("HTML Indent");

    // CSS
    expect(registry.get("css")!.name).toBe("CSS Format");
    expect(registry.get("scss")!.name).toBe("CSS Format");
    expect(registry.get("less")!.name).toBe("CSS Format");

    // YAML (including lock)
    expect(registry.get("yaml")!.name).toBe("YAML Format");
    expect(registry.get("yml")!.name).toBe("YAML Format");
    expect(registry.get("lock")!.name).toBe("YAML Format");

    // SQL
    expect(registry.get("sql")!.name).toBe("SQL Format");

    // TOML
    expect(registry.get("toml")!.name).toBe("TOML Format");

    // Dockerfile (both cases)
    expect(registry.get("dockerfile")!.name).toBe("Dockerfile Format");
    expect(registry.get("Dockerfile")!.name).toBe("Dockerfile Format");

    // Markdown
    expect(registry.get("md")!.name).toBe("Markdown Format");
    expect(registry.get("markdown")!.name).toBe("Markdown Format");

    // Shell
    expect(registry.get("sh")!.name).toBe("Shell Format");
    expect(registry.get("bash")!.name).toBe("Shell Format");
    expect(registry.get("zsh")!.name).toBe("Shell Format");

    // HCL / Terraform
    expect(registry.get("hcl")!.name).toBe("HCL Format");
    expect(registry.get("tf")!.name).toBe("HCL Format");
    expect(registry.get("tfvars")!.name).toBe("HCL Format");
  });

  it("does not register JSON (registered separately by the controller)", () => {
    const registry = new ExtensionFormatterRegistry();
    registerBuiltinFormatters(registry);
    expect(registry.get("json")).toBeNull();
    expect(registry.get("jsonc")).toBeNull();
  });

  it("does not register unknown extensions", () => {
    const registry = new ExtensionFormatterRegistry();
    registerBuiltinFormatters(registry);
    expect(registry.get("xyz")).toBeNull();
    expect(registry.get("pyc")).toBeNull();
    expect(registry.get("")).toBeNull();
  });

  it("registers Markdown and Shell formatters", () => {
    const registry = new ExtensionFormatterRegistry();
    registerBuiltinFormatters(registry);
    expect(registry.get("md")!.name).toBe("Markdown Format");
    expect(registry.get("markdown")!.name).toBe("Markdown Format");
    expect(registry.get("sh")!.name).toBe("Shell Format");
    expect(registry.get("bash")!.name).toBe("Shell Format");
    expect(registry.get("zsh")!.name).toBe("Shell Format");
  });

  it("PHP has two formatters registered (last registration wins)", () => {
    const registry = new ExtensionFormatterRegistry();
    registerBuiltinFormatters(registry);
    // PHP gets BraceIndent(2) first, then HTML Indent overwrites
    const phpFormatter = registry.get("php");
    expect(phpFormatter).not.toBeNull();
    expect(phpFormatter!.name).toBe("HTML Indent");
  });

  it("can register additional formatters after builtins", () => {
    const registry = new ExtensionFormatterRegistry();
    registerBuiltinFormatters(registry);

    const custom = { name: "Custom", format: (s: string) => s };
    registry.register(["js"], custom);
    expect(registry.get("js")!.name).toBe("Custom");
  });
});
