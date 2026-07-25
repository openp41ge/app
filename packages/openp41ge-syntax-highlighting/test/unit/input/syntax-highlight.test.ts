/**
 *
 * Tests for syntax-highlight.ts — LanguageHandler registry, JSON and YAML
 * tokenizers and formatters.
 */

import {
  tokenizeJsonLine,
  tokenizeYamlLine,
  tokenizeJsLine,
  tokenizeMarkdownLine,
  tokenizeShellLine,
  tokenizeHtmlLine,
  tokenizeCssLine,
  getHandler,
  registerLanguage,
  ensureHighlightStyles,
  jsonHandler,
  yamlHandler,
  jsHandler,
  mdHandler,
  shHandler,
  htmlHandler,
  cssHandler,
} from "@openp41ge/renderer/controllers/syntax-highlight";
import type { LanguageHandler } from "@openp41ge/renderer/controllers/syntax-highlight";

beforeEach(() => {
  // Remove any injected style so each test starts clean
  const existing = document.getElementById("openp41ge-syntax-highlight-style");
  if (existing) existing.remove();
});

// ──────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────

describe("registerLanguage / getHandler", () => {
  it("returns null for unknown extension", () => {
    expect(getHandler("foo.xyz")).toBeNull();
  });

  it("returns null for path without extension", () => {
    expect(getHandler("Makefile")).toBeNull();
  });

  it("returns formatter for registered .json extension", () => {
    const fn = getHandler("data.json");
    expect(fn).toBeTruthy();
    const html = fn!('[ "hello" ]');
    expect(html).toContain("hl-string");
  });

  it("returns formatter for registered .yaml extension", () => {
    const fn = getHandler("config.yaml");
    expect(fn).toBeTruthy();
    const html = fn!("key: value");
    expect(html).toContain("hl-key");
  });

  it("returns formatter for registered .yml extension", () => {
    const fn = getHandler("config.yml");
    expect(fn).toBeTruthy();
    const html = fn!("key: value");
    expect(html).toContain("hl-key");
  });

  it("is case-insensitive for extension", () => {
    const fn = getHandler("data.JSON");
    expect(fn).toBeTruthy();
  });

  it("supports registering custom language", () => {
    const custom: LanguageHandler = {
      name: "Custom",
      formatLine(line: string) {
        return `<custom>${line}</custom>`;
      },
    };
    registerLanguage([".custom"], custom);
    const fn = getHandler("file.custom");
    expect(fn).toBeTruthy();
    expect(fn!("test")).toBe("<custom>test</custom>");

    // cleanup — not persistent across tests since registry is module-level
    // but that's fine; each test file gets its own module instance
  });

  it("jsonHandler.name is JSON", () => {
    expect(jsonHandler.name).toBe("JSON");
  });

  it("yamlHandler.name is YAML", () => {
    expect(yamlHandler.name).toBe("YAML");
  });
});

// ──────────────────────────────────────────────
// JSON tokenizer
// ──────────────────────────────────────────────

describe("tokenizeJsonLine", () => {
  it("tokenizes an empty line", () => {
    const tokens = tokenizeJsonLine("");
    expect(tokens).toEqual([]);
  });

  it("preserves whitespace-only line as text token", () => {
    const tokens = tokenizeJsonLine("   ");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual({ type: "text", value: "   " });
  });

  it("preserves leading whitespace (indentation)", () => {
    const tokens = tokenizeJsonLine('  "name": "Alice"');
    // text("  "), key('"name"'), punct(":"), text(" "), string('"Alice"')
    expect(tokens[0]).toEqual({ type: "text", value: "  " });
    expect(tokens[1]).toEqual({ type: "key", value: '"name"' });
    expect(tokens[2]).toEqual({ type: "punctuation", value: ":" });
    expect(tokens[3]).toEqual({ type: "text", value: " " });
    expect(tokens[4]).toEqual({ type: "string", value: '"Alice"' });
  });

  it("handles whitespace between tokens", () => {
    const tokens = tokenizeJsonLine('{"a": 1}');
    // punct("{"), key('"a"'), punct(":"), text(" "), number("1"), punct("}")
    expect(tokens[0]).toEqual({ type: "punctuation", value: "{" });
    expect(tokens[1]).toEqual({ type: "key", value: '"a"' });
    expect(tokens[2]).toEqual({ type: "punctuation", value: ":" });
    expect(tokens[3]).toEqual({ type: "text", value: " " });
    expect(tokens[4]).toEqual({ type: "number", value: "1" });
    expect(tokens[5]).toEqual({ type: "punctuation", value: "}" });
  });

  it("marks strings before colon as keys (quotes included)", () => {
    const tokens = tokenizeJsonLine('{"key": "val"}');
    // punct("{"), key('"key"'), punct(":"), text(" "), string('"val"'), punct("}")
    expect(tokens[1].type).toBe("key");
    expect(tokens[1].value).toBe('"key"');
    expect(tokens[4].type).toBe("string");
    expect(tokens[4].value).toBe('"val"');
  });

  it("does not mark strings not before colon as keys", () => {
    const tokens = tokenizeJsonLine('"just a string"');
    expect(tokens[0].type).toBe("string");
    expect(tokens[0].value).toBe('"just a string"');
  });

  it("tokenizes string with escaped quotes (quotes included)", () => {
    const tokens = tokenizeJsonLine('"hello \\"world\\""');
    expect(tokens[0].type).toBe("string");
    expect(tokens[0].value).toBe('"hello \\"world\\""');
  });

  it("tokenizes number literals (integer, negative, decimal, scientific)", () => {
    expect(tokenizeJsonLine("42")[0]).toEqual({ type: "number", value: "42" });
    expect(tokenizeJsonLine("-7")[0]).toEqual({ type: "number", value: "-7" });
    expect(tokenizeJsonLine("3.14")[0]).toEqual({ type: "number", value: "3.14" });
    expect(tokenizeJsonLine("1e10")[0]).toEqual({ type: "number", value: "1e10" });
  });

  it("tokenizes boolean literals", () => {
    expect(tokenizeJsonLine("true")[0]).toEqual({ type: "boolean", value: "true" });
    expect(tokenizeJsonLine("false")[0]).toEqual({ type: "boolean", value: "false" });
  });

  it("tokenizes null literal", () => {
    expect(tokenizeJsonLine("null")[0]).toEqual({ type: "null", value: "null" });
  });

  it("includes space tokens in array", () => {
    const tokens = tokenizeJsonLine('[1, "two", true, null]');
    // punct("["), number("1"), punct(","), text(" "), string('"two"'), punct(","),
    // text(" "), boolean("true"), punct(","), text(" "), null("null"), punct("]")
    expect(tokens[0]).toEqual({ type: "punctuation", value: "[" });
    expect(tokens[1]).toEqual({ type: "number", value: "1" });
    expect(tokens[2]).toEqual({ type: "punctuation", value: "," });
    expect(tokens[3]).toEqual({ type: "text", value: " " });
    expect(tokens[4]).toEqual({ type: "string", value: '"two"' });
    expect(tokens[5]).toEqual({ type: "punctuation", value: "," });
    expect(tokens[6]).toEqual({ type: "text", value: " " });
    expect(tokens[7]).toEqual({ type: "boolean", value: "true" });
    expect(tokens[8]).toEqual({ type: "punctuation", value: "," });
    expect(tokens[9]).toEqual({ type: "text", value: " " });
    expect(tokens[10]).toEqual({ type: "null", value: "null" });
    expect(tokens[11]).toEqual({ type: "punctuation", value: "]" });
  });

  it("groups consecutive unknown characters into one text token", () => {
    const tokens = tokenizeJsonLine("some text");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ type: "text", value: "some" });
    expect(tokens[1]).toEqual({ type: "text", value: " " });
    expect(tokens[2]).toEqual({ type: "text", value: "text" });
  });

  it("includes quotes in unterminated string token", () => {
    const tokens = tokenizeJsonLine('"unclosed');
    expect(tokens[0].type).toBe("string");
    expect(tokens[0].value).toBe('"unclosed');
  });

  it("handles backslash at end of string (quotes included)", () => {
    const tokens = tokenizeJsonLine('"trailing\\\\');
    expect(tokens[0].type).toBe("string");
    // Value includes the escape backslash and the escaped backslash
    expect(tokens[0].value).toBe('"trailing\\\\');
  });

  it("handles backslash as last character (line[i+1] undefined)", () => {
    const tokens = tokenizeJsonLine('"stray\\');
    expect(tokens[0].type).toBe("string");
    expect(tokens[0].value).toBe('"stray\\');
  });
});

// ──────────────────────────────────────────────
// JSON formatter
// ──────────────────────────────────────────────

describe("jsonHandler.formatLine", () => {
  it("returns highlighted HTML for a JSON object line", () => {
    const html = jsonHandler.formatLine('{"a": 1}');
    expect(html).toContain('class="hl-punct"');
    expect(html).toContain('class="hl-key"');
    expect(html).toContain('class="hl-number"');
    // Key value includes surrounding quotes (HTML-escaped)
    expect(html).toContain("&quot;a&quot;");
    expect(html).toContain("1");
    expect(html).not.toContain("&amp;"); // no double-escaping
    // Indentation preserved: space between : and value
    expect(html).toContain(
      '&quot;a&quot;</span><span class="hl-punct">:</span><span class="hl-text"> </span><span class="hl-number">1',
    );
  });

  it("escapes special characters in token values", () => {
    const html = jsonHandler.formatLine('"<danger>"');
    // Value includes quotes: "&lt;danger&gt;"
    expect(html).toContain("&quot;&lt;danger&gt;&quot;");
  });

  it("returns empty string for an empty line", () => {
    const html = jsonHandler.formatLine("");
    expect(html).toBe("");
  });

  it("returns escaped text for a non-JSON line", () => {
    const html = jsonHandler.formatLine("plain text");
    // Tokens: text("plain"), text(" "), text("text")
    expect(html).toContain("plain");
    expect(html).toContain("text");
    expect(html).toContain('class="hl-text"');
  });

  it("wraps each token in a span with the correct class", () => {
    const html = jsonHandler.formatLine("true");
    expect(html).toBe('<span class="hl-bool">true</span>');
  });

  it("handles nested structures", () => {
    const html = jsonHandler.formatLine('{"outer": {"inner": 2}}');
    expect(html).toContain('class="hl-key"');
    expect(html).toContain('class="hl-number"');
    expect(html).toContain("&quot;outer&quot;");
    expect(html).toContain("&quot;inner&quot;");
    expect(html).toContain("2");
  });
});

// ──────────────────────────────────────────────
// YAML tokenizer
// ──────────────────────────────────────────────

describe("tokenizeYamlLine", () => {
  it("returns empty tokens for empty line", () => {
    expect(tokenizeYamlLine("")).toEqual([]);
  });

  it("preserves whitespace-only line", () => {
    const t = tokenizeYamlLine("  ");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("text");
  });

  it("tokenizes a comment", () => {
    const t = tokenizeYamlLine("# This is a comment");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("comment");
    expect(t[0].value).toBe("# This is a comment");
  });

  it("tokenizes indented comment", () => {
    const t = tokenizeYamlLine("  # indented comment");
    expect(t[0]).toEqual({ type: "text", value: "  " });
    expect(t[1]).toEqual({ type: "comment", value: "# indented comment" });
  });

  it("tokenizes document separator", () => {
    const t = tokenizeYamlLine("---");
    expect(t).toHaveLength(1);
    expect(t[0]).toEqual({ type: "punctuation", value: "---" });
  });

  it("tokenizes document separator with trailing comment", () => {
    const t = tokenizeYamlLine("--- # start");
    expect(t[0]).toEqual({ type: "punctuation", value: "---" });
    expect(t[1]).toEqual({ type: "text", value: " " });
    expect(t[2]).toEqual({ type: "comment", value: "# start" });
  });

  it("tokenizes simple key: value", () => {
    const t = tokenizeYamlLine("name: Alice");
    // key("name"), punct(":"), text(" "), text("Alice")
    expect(t[0]).toEqual({ type: "key", value: "name" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "text", value: "Alice" });
  });

  it("tokenizes key with colon at end only", () => {
    const t = tokenizeYamlLine("key:");
    expect(t[0]).toEqual({ type: "key", value: "key" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
  });

  it("tokenizes indented key: value", () => {
    const t = tokenizeYamlLine("  port: 8080");
    expect(t[0]).toEqual({ type: "text", value: "  " });
    expect(t[1]).toEqual({ type: "key", value: "port" });
    expect(t[2]).toEqual({ type: "punctuation", value: ":" });
    expect(t[3]).toEqual({ type: "text", value: " " });
    expect(t[4]).toEqual({ type: "number", value: "8080" });
  });

  it("tokenizes quoted string value (double)", () => {
    const t = tokenizeYamlLine('title: "Hello World"');
    expect(t[0]).toEqual({ type: "key", value: "title" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "string", value: '"Hello World"' });
  });

  it("tokenizes quoted string value (single)", () => {
    const t = tokenizeYamlLine("title: 'Hello World'");
    expect(t[0]).toEqual({ type: "key", value: "title" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "string", value: "'Hello World'" });
  });

  it("tokenizes boolean values", () => {
    const check = (val: string) => {
      const t = tokenizeYamlLine(`enabled: ${val}`);
      expect(t[2]).toEqual({ type: "text", value: " " });
      expect(t[3]).toEqual({ type: "boolean", value: val });
    };
    check("true");
    check("false");
    check("yes");
    check("no");
    check("on");
    check("off");
  });

  it("tokenizes null value", () => {
    const t = tokenizeYamlLine("value: null");
    expect(t[3]).toEqual({ type: "null", value: "null" });
  });

  it("tokenizes null tilde (~)", () => {
    const t = tokenizeYamlLine("value: ~");
    expect(t[3]).toEqual({ type: "null", value: "~" });
  });

  it("tokenizes number value", () => {
    const t = tokenizeYamlLine("count: 42");
    expect(t[3]).toEqual({ type: "number", value: "42" });
  });

  it("tokenizes negative number", () => {
    const t = tokenizeYamlLine("temp: -5");
    expect(t[3]).toEqual({ type: "number", value: "-5" });
  });

  it("tokenizes list marker with value", () => {
    const t = tokenizeYamlLine("- item");
    expect(t[0]).toEqual({ type: "punctuation", value: "-" });
    expect(t[1]).toEqual({ type: "text", value: " " });
    expect(t[2]).toEqual({ type: "text", value: "item" });
  });

  it("tokenizes list of mappings", () => {
    const t = tokenizeYamlLine("- name: Alice");
    expect(t[0]).toEqual({ type: "punctuation", value: "-" });
    expect(t[1]).toEqual({ type: "text", value: " " });
    expect(t[2]).toEqual({ type: "key", value: "name" });
    expect(t[3]).toEqual({ type: "punctuation", value: ":" });
    expect(t[4]).toEqual({ type: "text", value: " " });
    expect(t[5]).toEqual({ type: "text", value: "Alice" });
  });

  it("tokenizes block scalar indicator (|)", () => {
    const t = tokenizeYamlLine("  script: |");
    expect(t[0]).toEqual({ type: "text", value: "  " });
    expect(t[1]).toEqual({ type: "key", value: "script" });
    expect(t[2]).toEqual({ type: "punctuation", value: ":" });
    expect(t[3]).toEqual({ type: "text", value: " " });
    expect(t[4]).toEqual({ type: "punctuation", value: "|" });
  });

  it("tokenizes block scalar indicator (>)", () => {
    const t = tokenizeYamlLine("desc: >");
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "punctuation", value: ">" });
  });

  it("tokenizes inline JSON-like containers", () => {
    const t = tokenizeYamlLine("data: { key: val }");
    expect(t[0]).toEqual({ type: "key", value: "data" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "punctuation", value: "{" });
  });

  it("tokenizes inline array", () => {
    const t = tokenizeYamlLine("tags: [a, b]");
    expect(t[0]).toEqual({ type: "key", value: "tags" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "punctuation", value: "[" });
  });

  it("handles colon in value context (standalone colon)", () => {
    // A colon that appears after a digit (not a key separator)
    // Colons inside values are part of the string, not punctuation
    const t = tokenizeYamlLine("value: 3:00");
    expect(t[0]).toEqual({ type: "key", value: "value" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "number", value: "3" });
    // The `:00` after `3` is part of the unquoted string value
    expect(t[4]).toEqual({ type: "text", value: ":00" });
  });

  it("handles hyphens inside unquoted value (value-with-hyphens)", () => {
    // Hyphens inside an unquoted string value are part of the string
    const t = tokenizeYamlLine("value: value-with-hyphens");
    expect(t[0]).toEqual({ type: "key", value: "value" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "text", value: "value-with-hyphens" });
  });

  it("handles colon preceded by digit inside value (3:00)", () => {
    // A colon after a digit (like "3:00") is now part of the text token
    // rather than breaking into punct(":") + number("00").
    // Note: colons after word chars (like "http:") still match as key
    // due to pre-existing context limitation in the simple tokenizer.
    const t = tokenizeYamlLine("value: 3:00");
    expect(t[0]).toEqual({ type: "key", value: "value" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "number", value: "3" });
    expect(t[4]).toEqual({ type: "text", value: ":00" });
  });

  it("handles whitespace before colon in key", () => {
    const t = tokenizeYamlLine("key : value");
    expect(t[0]).toEqual({ type: "key", value: "key" });
    // text(" ") is the space before colon
    expect(t[1]).toEqual({ type: "text", value: " " });
    // then colon, space, value
    expect(t[2]).toEqual({ type: "punctuation", value: ":" });
    expect(t[3]).toEqual({ type: "text", value: " " });
    expect(t[4]).toEqual({ type: "text", value: "value" });
  });

  it("handles dash not followed by digit inside value", () => {
    // `-` here appears in a value context, not as a list marker
    // With a space after it, the while loop body is not entered
    const t = tokenizeYamlLine("value: - something");
    expect(t[0]).toEqual({ type: "key", value: "value" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "text", value: "-" });
    expect(t[4]).toEqual({ type: "text", value: " " });
    expect(t[5]).toEqual({ type: "text", value: "something" });
  });

  it("handles dash directly adjacent to text (no space)", () => {
    // `-` followed directly by non-digit, non-delimiter chars
    const t = tokenizeYamlLine("value: -text");
    expect(t[0]).toEqual({ type: "key", value: "value" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
    expect(t[2]).toEqual({ type: "text", value: " " });
    // `-text` is consumed as one text token
    expect(t[3]).toEqual({ type: "text", value: "-text" });
  });

  it("tokenizes text after document separator", () => {
    const t = tokenizeYamlLine("---something");
    expect(t[0]).toEqual({ type: "punctuation", value: "---" });
    expect(t[1]).toEqual({ type: "text", value: "something" });
  });

  it("handles unterminated double-quoted string with trailing backslash", () => {
    const t = tokenizeYamlLine('key: "stray\\');
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "string", value: '"stray\\' });
  });

  it("handles inline comment after value", () => {
    // Comment `#` inside content (not at start of line)
    const t = tokenizeYamlLine("key: value # explanation");
    expect(t[0]).toEqual({ type: "key", value: "key" });
    expect(t[1]).toEqual({ type: "punctuation", value: ":" });
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "text", value: "value" });
    expect(t[4]).toEqual({ type: "text", value: " " });
    expect(t[5]).toEqual({ type: "comment", value: "# explanation" });
  });

  // ── List marker edge cases ──

  it("handles list marker at end of line", () => {
    // `-` with no value on the same line
    const t = tokenizeYamlLine("-");
    expect(t).toHaveLength(1);
    expect(t[0]).toEqual({ type: "punctuation", value: "-" });
  });

  it("handles list marker with tab separator", () => {
    const t = tokenizeYamlLine("-\titem");
    expect(t[0]).toEqual({ type: "punctuation", value: "-" });
    expect(t[1]).toEqual({ type: "text", value: "\t" });
    expect(t[2]).toEqual({ type: "text", value: "item" });
  });

  // ── Block scalar edges ──

  it("handles block scalar | with trailing space", () => {
    // `| ` followed by content
    const t = tokenizeYamlLine("  script: | text");
    expect(t[4]).toEqual({ type: "punctuation", value: "|" });
  });

  it("handles block scalar | with tab separator", () => {
    const t = tokenizeYamlLine("script: |\ttext");
    expect(t[2]).toEqual({ type: "text", value: " " });
    expect(t[3]).toEqual({ type: "punctuation", value: "|" });
  });
});

// ──────────────────────────────────────────────
// YAML formatter (via yamlHandler)
// ──────────────────────────────────────────────

describe("yamlHandler", () => {
  it("returns highlighted HTML for simple key-value", () => {
    const html = yamlHandler.formatLine("name: Alice");
    expect(html).toContain('class="hl-key"');
    expect(html).toContain('class="hl-punct"');
    expect(html).toContain("name");
    expect(html).toContain("Alice");
  });

  it("returns highlighted HTML for comment", () => {
    const html = yamlHandler.formatLine("# A comment");
    expect(html).toContain('class="hl-comment"');
    expect(html).toContain("# A comment");
  });

  it("returns highlighted HTML for list item", () => {
    const html = yamlHandler.formatLine("- item");
    expect(html).toContain('class="hl-punct"');
    expect(html).toContain("-");
    expect(html).toContain("item");
  });

  it("handles empty line", () => {
    expect(yamlHandler.formatLine("")).toBe("");
  });

  it("handles whitespace-only line", () => {
    const html = yamlHandler.formatLine("   ");
    expect(html).toContain('class="hl-text"');
  });

  it("handles indented key-value with number", () => {
    const html = yamlHandler.formatLine("  port: 8080");
    expect(html).toContain('class="hl-key"');
    expect(html).toContain('class="hl-number"');
    expect(html).toContain("port");
    expect(html).toContain("8080");
  });
});

// ──────────────────────────────────────────────
// ensureHighlightStyles
// ──────────────────────────────────────────────

describe("ensureHighlightStyles", () => {
  it("injects style element into document head", () => {
    ensureHighlightStyles();
    const style = document.getElementById("openp41ge-syntax-highlight-style");
    expect(style).toBeTruthy();
    expect(style!.textContent).toContain(".hl-key");
    expect(style!.textContent).toContain(".hl-string");
    expect(style!.textContent).toContain(".hl-comment");
  });

  it("does not duplicate style element on second call", () => {
    ensureHighlightStyles();
    ensureHighlightStyles();
    const styles = document.querySelectorAll("#openp41ge-syntax-highlight-style");
    expect(styles.length).toBe(1);
  });
});

// ──────────────────────────────────────────────
// JavaScript / TypeScript tokenizer
// ──────────────────────────────────────────────

describe("tokenizeJsLine", () => {
  it("returns empty tokens for empty line", () => {
    expect(tokenizeJsLine("")).toEqual([]);
  });

  it("preserves whitespace-only line", () => {
    const t = tokenizeJsLine("   ");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("text");
  });

  it("tokenizes a line comment", () => {
    const t = tokenizeJsLine("// this is a comment");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("comment");
    expect(t[0].value).toBe("// this is a comment");
  });

  it("tokenizes a block comment on one line", () => {
    const t = tokenizeJsLine("/* block */");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("comment");
    expect(t[0].value).toBe("/* block */");
  });

  it("tokenizes const declaration", () => {
    const t = tokenizeJsLine("const x = 42;");
    expect(t[0]).toEqual({ type: "key", value: "const" });
    expect(t[1]).toEqual({ type: "text", value: " " });
    expect(t[2]).toEqual({ type: "text", value: "x" });
    expect(t[3]).toEqual({ type: "text", value: " " });
    expect(t[4]).toEqual({ type: "punctuation", value: "=" });
    expect(t[5]).toEqual({ type: "text", value: " " });
    expect(t[6]).toEqual({ type: "number", value: "42" });
    expect(t[7]).toEqual({ type: "punctuation", value: ";" });
  });

  it("tokenizes function keyword", () => {
    const t = tokenizeJsLine("function hello() {");
    expect(t[0]).toEqual({ type: "key", value: "function" });
    expect(t[1]).toEqual({ type: "text", value: " " });
    expect(t[2]).toEqual({ type: "method", value: "hello" });
    expect(t[3]).toEqual({ type: "bracket", value: "(" });
    expect(t[4]).toEqual({ type: "bracket", value: ")" });
    expect(t[5]).toEqual({ type: "text", value: " " });
    expect(t[6]).toEqual({ type: "bracket", value: "{" });
  });

  it("tokenizes double-quoted strings", () => {
    const t = tokenizeJsLine('const s = "hello world";');
    expect(t[0]).toEqual({ type: "key", value: "const" });
    // String is split: opening quote, content, closing quote
    expect(t[6]).toEqual({ type: "string", value: '"' });
    expect(t[7]).toEqual({ type: "text", value: "hello world" });
    expect(t[8]).toEqual({ type: "string", value: '"' });
  });

  it("tokenizes single-quoted strings", () => {
    const t = tokenizeJsLine("const s = 'hello';");
    expect(t[6]).toEqual({ type: "string", value: "'" });
    expect(t[7]).toEqual({ type: "text", value: "hello" });
    expect(t[8]).toEqual({ type: "string", value: "'" });
  });

  it("tokenizes template literals", () => {
    const t = tokenizeJsLine("const s = `hello`;");
    expect(t[6]).toEqual({ type: "string", value: "`" });
    expect(t[7]).toEqual({ type: "text", value: "hello" });
    expect(t[8]).toEqual({ type: "string", value: "`" });
  });

  it("tokenizes booleans", () => {
    const t = tokenizeJsLine("const a = true;");
    expect(t[6]).toEqual({ type: "boolean", value: "true" });
  });

  it("tokenizes null and undefined", () => {
    const t = tokenizeJsLine("const a = null;");
    expect(t[6]).toEqual({ type: "null", value: "null" });
    const t2 = tokenizeJsLine("const b = undefined;");
    expect(t2[6]).toEqual({ type: "null", value: "undefined" });
  });

  it("tokenizes hex numbers", () => {
    const t = tokenizeJsLine("const a = 0xff;");
    expect(t[6]).toEqual({ type: "number", value: "0xff" });
  });

  it("tokenizes TypeScript keywords", () => {
    const t = tokenizeJsLine("interface Foo {");
    expect(t[0]).toEqual({ type: "key", value: "interface" });
  });

  it("tokenizes TypeScript type annotations", () => {
    const t = tokenizeJsLine('const a: string = "hello";');
    expect(t).toContainEqual({ type: "type", value: "string" });
  });

  it("tokenizes arrow function", () => {
    const t = tokenizeJsLine("const fn = () => {");
    expect(t).toContainEqual({ type: "punctuation", value: "=>" });
  });

  it("tokenizes import statement", () => {
    const t = tokenizeJsLine('import { foo } from "./bar";');
    expect(t[0]).toEqual({ type: "key", value: "import" });
    expect(t).toContainEqual({ type: "key", value: "from" });
    // String is now split into quote + content + quote
    expect(t).toContainEqual({ type: "string", value: '"' });
    expect(t).toContainEqual({ type: "text", value: "./bar" });
  });

  it("handles equals operators", () => {
    const t = tokenizeJsLine("if (a === b) {");
    expect(t).toContainEqual({ type: "punctuation", value: "===" });
  });

  it("handles not-equals operator", () => {
    const t = tokenizeJsLine("if (a !== b) {");
    expect(t).toContainEqual({ type: "punctuation", value: "!==" });
  });

  it("handles nullish coalescing", () => {
    const t = tokenizeJsLine("const x = a ?? b;");
    expect(t).toContainEqual({ type: "punctuation", value: "??" });
  });

  it("handles optional chaining", () => {
    const t = tokenizeJsLine("a?.b?.c;");
    expect(t).toContainEqual({ type: "punctuation", value: "?." });
  });
});

describe("jsHandler", () => {
  it("returns highlighted HTML for a simple declaration", () => {
    const html = jsHandler.formatLine("const x = 42;");
    expect(html).toContain('<span class="hl-key">const</span>');
    expect(html).toContain('<span class="hl-number">42</span>');
  });

  it("returns highlighted HTML for a string", () => {
    const html = jsHandler.formatLine('const s = "hi";');
    expect(html).toContain('<span class="hl-string">');
  });

  it("returns highlighted HTML for a comment", () => {
    const html = jsHandler.formatLine("// comment");
    expect(html).toContain('<span class="hl-comment">');
  });

  it("handles empty line", () => {
    expect(jsHandler.formatLine("")).toBe("");
  });

  it("handles whitespace-only line", () => {
    expect(jsHandler.formatLine("  ")).toBe('<span class="hl-text">  </span>');
  });

  it("name is JavaScript/TypeScript", () => {
    expect(jsHandler.name).toBe("JavaScript/TypeScript");
  });
});

// ──────────────────────────────────────────────
// Markdown tokenizer
// ──────────────────────────────────────────────

describe("tokenizeMarkdownLine", () => {
  it("returns empty tokens for empty line", () => {
    expect(tokenizeMarkdownLine("")).toEqual([]);
  });

  it("preserves whitespace-only line", () => {
    const t = tokenizeMarkdownLine("  ");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("text");
  });

  it("tokenizes a heading", () => {
    const t = tokenizeMarkdownLine("# Title");
    expect(t[0].type).toBe("comment"); // the #
    expect(t[1].type).toBe("key"); // the heading text
  });

  it("tokenizes a level-2 heading", () => {
    const t = tokenizeMarkdownLine("## Subtitle");
    expect(t[0].value).toBe("## ");
  });

  it("tokenizes a blockquote", () => {
    const t = tokenizeMarkdownLine("> quoted text");
    expect(t[0].type).toBe("comment");
  });

  it("tokenizes a list item", () => {
    const t = tokenizeMarkdownLine("- item");
    expect(t[0].type).toBe("punctuation");
    expect(t[0].value).toBe("- ");
  });

  it("tokenizes numbered list item", () => {
    const t = tokenizeMarkdownLine("1. item");
    expect(t[0].value).toBe("1. ");
  });

  it("tokenizes inline code", () => {
    const t = tokenizeMarkdownLine("use `code` here");
    const codeToken = t.find((token) => token.type === "string");
    expect(codeToken).toBeTruthy();
  });

  it("tokenizes bold text", () => {
    const t = tokenizeMarkdownLine("**bold**");
    expect(t[0].type).toBe("punctuation");
    expect(t[1].type).toBe("key");
    expect(t[1].value).toBe("bold");
    expect(t[2].type).toBe("punctuation");
  });

  it("tokenizes a link", () => {
    const t = tokenizeMarkdownLine("[text](url)");
    expect(t[0].value).toBe("[");
    expect(t[1].type).toBe("key");
    expect(t[1].value).toBe("text");
  });

  it("tokenizes horizontal rule", () => {
    const t = tokenizeMarkdownLine("---");
    expect(t[0].type).toBe("comment");
  });

  it("handles lone asterisk followed by space (no infinite loop)", () => {
    // * followed by space is neither bold nor italic — was an infinite loop
    const t = tokenizeMarkdownLine("foo * bar");
    expect(t.length).toBeGreaterThan(0);
    expect(t.some((tk) => tk.value === "*")).toBe(true);
  });
});

describe("mdHandler", () => {
  it("returns highlighted HTML for a heading", () => {
    const html = mdHandler.formatLine("# Title");
    expect(html).toContain('<span class="hl-comment">');
    expect(html).toContain('<span class="hl-key">');
  });

  it("returns highlighted HTML for inline code", () => {
    const html = mdHandler.formatLine("use `code` here");
    expect(html).toContain('<span class="hl-string">');
  });

  it("handles empty line", () => {
    expect(mdHandler.formatLine("")).toBe("");
  });

  it("name is Markdown", () => {
    expect(mdHandler.name).toBe("Markdown");
  });
});

// ── Extension registration ────────────────────────────────────────────

describe("extension registration for new languages", () => {
  it("registers .js extension", () => {
    const f = getHandler("/test/file.js");
    expect(f).toBeTruthy();
    expect(f!("const x = 1;")).toContain('class="hl-key"');
  });

  it("registers .mjs extension", () => {
    const f = getHandler("/test/file.mjs");
    expect(f).toBeTruthy();
    expect(f!("const x = 1;")).toContain('class="hl-key"');
  });

  it("registers .cjs extension", () => {
    const f = getHandler("/test/file.cjs");
    expect(f).toBeTruthy();
    expect(f!("const x = 1;")).toContain('class="hl-key"');
  });

  it("registers .jsx extension", () => {
    const f = getHandler("/test/file.jsx");
    expect(f).toBeTruthy();
    expect(f!("const x = 1;")).toContain('class="hl-key"');
  });

  it("registers .ts extension", () => {
    const f = getHandler("/test/file.ts");
    expect(f).toBeTruthy();
    expect(f!("const x: number = 1;")).toContain('class="hl-key"');
  });

  it("registers .tsx extension", () => {
    const f = getHandler("/test/file.tsx");
    expect(f).toBeTruthy();
    expect(f!('const x: string = "a";')).toContain('class="hl-key"');
  });

  it("registers .mts extension", () => {
    const f = getHandler("/test/file.mts");
    expect(f).toBeTruthy();
  });

  it("registers .cts extension", () => {
    const f = getHandler("/test/file.cts");
    expect(f).toBeTruthy();
  });

  it("registers .md extension", () => {
    const f = getHandler("/test/file.md");
    expect(f).toBeTruthy();
    expect(f!("# Title")).toContain('class="hl-key"');
  });

  it("registers .markdown extension", () => {
    const f = getHandler("/test/file.markdown");
    expect(f).toBeTruthy();
    expect(f!("# Title")).toContain('class="hl-key"');
  });
});

// ──────────────────────────────────────────────
// Shell tokenizer
// ──────────────────────────────────────────────

describe("tokenizeShellLine", () => {
  it("returns empty tokens for empty line", () => {
    expect(tokenizeShellLine("")).toEqual([]);
  });

  it("tokenizes a comment", () => {
    const t = tokenizeShellLine("# this is a comment");
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe("comment");
    expect(t[0].value).toBe("# this is a comment");
  });

  it("tokenizes a keyword", () => {
    const t = tokenizeShellLine("if true; then");
    expect(t[0]).toEqual({ type: "key", value: "if" });
    expect(t[5]).toEqual({ type: "key", value: "then" });
  });

  it("tokenizes a double-quoted string with variable", () => {
    const t = tokenizeShellLine('echo "hello $name"');
    // echo → key, " → string, hello  → text, $ → punct, name → type, " → string
    expect(t[0]).toEqual({ type: "key", value: "echo" });
    expect(t[2]).toEqual({ type: "string", value: '"' });
    expect(t[3]).toEqual({ type: "text", value: "hello " });
    expect(t[4]).toEqual({ type: "punctuation", value: "$" });
    expect(t[5]).toEqual({ type: "type", value: "name" });
    expect(t[6]).toEqual({ type: "string", value: '"' });
  });

  it("tokenizes a single-quoted string", () => {
    const t = tokenizeShellLine("echo 'hello $name'");
    expect(t[0]).toEqual({ type: "key", value: "echo" });
    expect(t[2]).toEqual({ type: "string", value: "'hello $name'" });
  });

  it("tokenizes $VAR", () => {
    const t = tokenizeShellLine("echo $HOME");
    expect(t[0]).toEqual({ type: "key", value: "echo" });
    expect(t[2]).toEqual({ type: "punctuation", value: "$" });
    expect(t[3]).toEqual({ type: "type", value: "HOME" });
  });

  it("tokenizes ${VAR}", () => {
    const t = tokenizeShellLine("echo ${PATH}");
    expect(t[2]).toEqual({ type: "punctuation", value: "${" });
    expect(t[3]).toEqual({ type: "type", value: "PATH" });
    expect(t[4]).toEqual({ type: "punctuation", value: "}" });
  });

  it("tokenizes a number", () => {
    const t = tokenizeShellLine("x=42");
    expect(t[2]).toEqual({ type: "number", value: "42" });
  });

  it("tokenizes pipe operator", () => {
    const t = tokenizeShellLine("echo foo | grep bar");
    expect(t).toContainEqual({ type: "punctuation", value: "|" });
  });

  it("tokenizes redirect operators", () => {
    const t = tokenizeShellLine("echo foo > file.txt");
    expect(t).toContainEqual({ type: "punctuation", value: ">" });
  });

  it("tokenizes && and ||", () => {
    const t1 = tokenizeShellLine("make && make install");
    expect(t1).toContainEqual({ type: "punctuation", value: "&&" });
    const t2 = tokenizeShellLine("false || true");
    expect(t2).toContainEqual({ type: "punctuation", value: "||" });
  });
});

describe("shHandler", () => {
  it("returns highlighted HTML for a comment", () => {
    const html = shHandler.formatLine("# comment");
    expect(html).toContain('class="hl-comment"');
  });

  it("returns highlighted HTML for a keyword", () => {
    const html = shHandler.formatLine("if true; then");
    expect(html).toContain('class="hl-key"');
  });

  it("handles empty line", () => {
    expect(shHandler.formatLine("")).toBe("");
  });

  it("name is Shell", () => {
    expect(shHandler.name).toBe("Shell");
  });
});

// ──────────────────────────────────────────────
// HTML tokenizer
// ──────────────────────────────────────────────

describe("tokenizeHtmlLine", () => {
  it("returns empty tokens for empty line", () => {
    expect(tokenizeHtmlLine("")).toEqual([]);
  });

  it("tokenizes an opening tag", () => {
    const t = tokenizeHtmlLine('<div class="foo">');
    expect(t[0]).toEqual({ type: "punctuation", value: "<" });
    expect(t[1]).toEqual({ type: "key", value: "div" });
    expect(t[3]).toEqual({ type: "key", value: "class" });
    expect(t[4]).toEqual({ type: "punctuation", value: "=" });
    expect(t[5]).toEqual({ type: "string", value: '"' });
    expect(t[6]).toEqual({ type: "text", value: "foo" });
    expect(t[7]).toEqual({ type: "string", value: '"' });
    expect(t[8]).toEqual({ type: "bracket", value: ">" });
  });

  it("tokenizes a closing tag", () => {
    const t = tokenizeHtmlLine("</div>");
    expect(t[0]).toEqual({ type: "punctuation", value: "</" });
    expect(t[1]).toEqual({ type: "key", value: "div" });
    expect(t[2]).toEqual({ type: "bracket", value: ">" });
  });

  it("tokenizes a self-closing tag", () => {
    const t = tokenizeHtmlLine("<br/>");
    expect(t[0]).toEqual({ type: "punctuation", value: "<" });
    expect(t[1]).toEqual({ type: "key", value: "br" });
    expect(t[2]).toEqual({ type: "punctuation", value: "/>" });
  });

  it("tokenizes an HTML comment", () => {
    const t = tokenizeHtmlLine("<!-- comment -->");
    expect(t[0].type).toBe("comment");
    expect(t[0].value).toBe("<!-- comment -->");
  });

  it("tokenizes an HTML entity", () => {
    const t = tokenizeHtmlLine("&amp;");
    expect(t[0].type).toBe("escape");
    expect(t[0].value).toBe("&amp;");
  });

  it("tokenizes a tag with multiple attributes", () => {
    const t = tokenizeHtmlLine('<a href="url" class="link">');
    expect(t[1]).toEqual({ type: "key", value: "a" });
    expect(t[3]).toEqual({ type: "key", value: "href" });
    expect(t[5]).toEqual({ type: "string", value: '"' });
    expect(t[6]).toEqual({ type: "text", value: "url" });
    expect(t[9]).toEqual({ type: "key", value: "class" });
  });
});

describe("htmlHandler", () => {
  it("returns highlighted HTML for a tag", () => {
    const html = htmlHandler.formatLine('<div class="foo">');
    expect(html).toContain('class="hl-key"');
    expect(html).toContain('class="hl-string"');
  });

  it("handles empty line", () => {
    expect(htmlHandler.formatLine("")).toBe("");
  });

  it("name is HTML", () => {
    expect(htmlHandler.name).toBe("HTML");
  });
});

// ──────────────────────────────────────────────
// CSS tokenizer
// ──────────────────────────────────────────────

describe("tokenizeCssLine", () => {
  it("returns empty tokens for empty line", () => {
    expect(tokenizeCssLine("")).toEqual([]);
  });

  it("tokenizes a comment", () => {
    const t = tokenizeCssLine("/* comment */");
    expect(t[0].type).toBe("comment");
    expect(t[0].value).toBe("/* comment */");
  });

  it("tokenizes a selector", () => {
    const t = tokenizeCssLine(".class {");
    expect(t[0]).toEqual({ type: "punctuation", value: "." });
    expect(t[1]).toEqual({ type: "key", value: "class" });
    expect(t[3]).toEqual({ type: "bracket", value: "{" });
  });

  it("tokenizes a property: value declaration", () => {
    const t = tokenizeCssLine("  color: red;");
    expect(t[0]).toEqual({ type: "text", value: "  " });
    expect(t[1]).toEqual({ type: "text", value: "color" });
    expect(t[2]).toEqual({ type: "punctuation", value: ":" });
    expect(t[3]).toEqual({ type: "text", value: " " });
    expect(t[4]).toEqual({ type: "text", value: "red" });
    expect(t[5]).toEqual({ type: "punctuation", value: ";" });
  });

  it("tokenizes universal selector *", () => {
    const t = tokenizeCssLine("*, *:after, *:before {");
    expect(t[0]).toEqual({ type: "punctuation", value: "*" });
    expect(t[3]).toEqual({ type: "punctuation", value: "*" });
    expect(t[8]).toEqual({ type: "punctuation", value: "*" });
    expect(t).toContainEqual({ type: "key", value: "after" });
    expect(t).toContainEqual({ type: "key", value: "before" });
  });

  it("tokenizes a number with unit", () => {
    const t = tokenizeCssLine("  font-size: 16px;");
    expect(t).toContainEqual({ type: "number", value: "16px" });
  });

  it("tokenizes a hex color", () => {
    const t = tokenizeCssLine("  color: #ff6600;");
    expect(t).toContainEqual({ type: "number", value: "#ff6600" });
  });

  it("tokenizes an id selector", () => {
    const t = tokenizeCssLine("#main {");
    expect(t[0]).toEqual({ type: "punctuation", value: "#" });
    expect(t[1]).toEqual({ type: "key", value: "main" });
  });

  it("tokenizes a pseudo-class", () => {
    const t = tokenizeCssLine("a:hover {");
    expect(t).toContainEqual({ type: "punctuation", value: ":" });
    expect(t).toContainEqual({ type: "key", value: "hover" });
  });

  it("tokenizes a pseudo-element", () => {
    const t = tokenizeCssLine("a::before {");
    expect(t).toContainEqual({ type: "punctuation", value: "::" });
    expect(t).toContainEqual({ type: "key", value: "before" });
  });

  it("tokenizes an at-rule", () => {
    const t = tokenizeCssLine("@media screen {");
    expect(t[0]).toEqual({ type: "key", value: "@media" });
  });

  it("tokenizes a function call like rgb()", () => {
    const t = tokenizeCssLine("  color: rgb(255, 0, 0);");
    // rgb should be a method token since followed by (
    expect(t).toContainEqual({ type: "method", value: "rgb" });
  });
});

describe("cssHandler", () => {
  it("returns highlighted HTML for a declaration", () => {
    const html = cssHandler.formatLine("  color: red;");
    expect(html).toContain('class="hl-punct"');
    expect(html).toContain('class="hl-text"');
  });

  it("handles empty line", () => {
    expect(cssHandler.formatLine("")).toBe("");
  });

  it("name is CSS", () => {
    expect(cssHandler.name).toBe("CSS");
  });
});

// ── Extension registration ────────────────────────────────────────────

describe("extension registration for new languages", () => {
  it("registers .sh extension", () => {
    const f = getHandler("/test/file.sh");
    expect(f).toBeTruthy();
    expect(f!("# comment")).toContain('class="hl-comment"');
  });

  it("registers .bash extension", () => {
    const f = getHandler("/test/file.bash");
    expect(f).toBeTruthy();
  });

  it("registers .zsh extension", () => {
    const f = getHandler("/test/file.zsh");
    expect(f).toBeTruthy();
  });

  it("registers .html extension", () => {
    const f = getHandler("/test/file.html");
    expect(f).toBeTruthy();
    expect(f!("<div></div>")).toContain('class="hl-key"');
  });

  it("registers .htm extension", () => {
    const f = getHandler("/test/file.htm");
    expect(f).toBeTruthy();
  });

  it("registers .css extension", () => {
    const f = getHandler("/test/file.css");
    expect(f).toBeTruthy();
    expect(f!(".class { }")).toContain('class="hl-key"');
  });
});
