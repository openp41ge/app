/**
 * Tests for renderViewLine and CharacterMapping.
 */
import { describe, it, expect } from "vitest";
import { renderViewLine } from "@openp41ge-file-editor/rendering/view-line-renderer";
import { StandardTokenType } from "openp41ge-syntax-highlighting";
import type { IToken } from "openp41ge-syntax-highlighting";

describe("renderViewLine", () => {
  it("renders plain text without tokens", () => {
    const output = renderViewLine("hello", null, 4);
    expect(output.html).toContain("hello");
  });

  it("renders plain text without span when no tokens", () => {
    // Without tokens, renderViewLine outputs bare text (no span wrapper)
    const output = renderViewLine("hello", null, 4);
    expect(output.html).toContain("hello");
    expect(output.html).not.toContain("<span");
  });

  it("renders empty line", () => {
    const output = renderViewLine("", null, 4);
    expect(output.html).toBeDefined();
  });

  it("escapes HTML in text content", () => {
    const output = renderViewLine("<script>alert('x')</script>", null, 4);
    expect(output.html).not.toContain("<script>");
    expect(output.html).toContain("&lt;script&gt;");
  });

  // ── Scope-based syntax highlighting tests ──

  it("renders keyword with s-kw class", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 5,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "keyword",
    };
    const output = renderViewLine("const", [token], 4);
    expect(output.html).toBe('<span class="s-kw">const</span>');
  });

  it("renders string with s-str class", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 7,
      tokenType: StandardTokenType.String,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "string",
    };
    const output = renderViewLine('"hello"', [token], 4);
    expect(output.html).toBe('<span class="s-str">"hello"</span>');
  });

  it("renders comment with s-cmt class", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 20,
      tokenType: StandardTokenType.Comment,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "comment",
    };
    const output = renderViewLine("// this is a comment", [token], 4);
    expect(output.html).toBe('<span class="s-cmt">// this is a comment</span>');
  });

  it("renders number with s-num class", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 2,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "constant.numeric",
    };
    const output = renderViewLine("42", [token], 4);
    expect(output.html).toBe('<span class="s-num">42</span>');
  });

  it("renders function with s-fun class", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 6,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "entity.name.function",
    };
    const output = renderViewLine("myFunc", [token], 4);
    expect(output.html).toBe('<span class="s-fun">myFunc</span>');
  });

  it("renders variable with s-var class", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 5,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "variable",
    };
    const output = renderViewLine("count", [token], 4);
    expect(output.html).toBe('<span class="s-var">count</span>');
  });

  it("renders keyword.operator with s-op class", () => {
    const tokens: IToken[] = [
      {
        startIndex: 0,
        endIndex: 1,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "variable",
      },
      {
        startIndex: 1,
        endIndex: 2,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "",
      },
      {
        startIndex: 2,
        endIndex: 3,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "keyword.operator",
      },
      {
        startIndex: 3,
        endIndex: 4,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "",
      },
      {
        startIndex: 4,
        endIndex: 5,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "variable",
      },
    ];
    const output = renderViewLine("x + y", tokens, 4);
    expect(output.html).toContain('class="s-op"');
    expect(output.html).toContain('class="s-var"');
  });

  it("renders multiple tokens with correct classes", () => {
    const tokens: IToken[] = [
      {
        startIndex: 0,
        endIndex: 5,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "keyword",
      },
      {
        startIndex: 5,
        endIndex: 6,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "",
      },
      {
        startIndex: 6,
        endIndex: 7,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "variable",
      },
    ];
    const output = renderViewLine("const x", tokens, 4);
    expect(output.html).toContain('class="s-kw"');
    expect(output.html).toContain('class="s-var"');
  });

  it("falls back to token-type class when scope is empty", () => {
    const tokens: IToken[] = [
      {
        startIndex: 0,
        endIndex: 4,
        tokenType: StandardTokenType.String,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "",
      },
    ];
    const output = renderViewLine("test", tokens, 4);
    expect(output.html).toContain('class="token-string"');
  });

  it("renders each character in the token range", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 13,
      tokenType: StandardTokenType.String,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "string",
    };
    const output = renderViewLine('"hello world"', [token], 4);
    expect(output.html).toBe('<span class="s-str">"hello world"</span>');
  });

  it("renders trailing characters after last token", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 7,
      tokenType: StandardTokenType.String,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "string",
    };
    const output = renderViewLine('"hello";', [token], 4);
    expect(output.html).toBe('<span class="s-str">"hello"</span>;');
  });

  it("renders a multi-token line with correct classes", () => {
    const line = 'const x = "hi";';
    const tokens: IToken[] = [
      {
        startIndex: 0,
        endIndex: 5,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "keyword",
      },
      {
        startIndex: 5,
        endIndex: 6,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "",
      },
      {
        startIndex: 6,
        endIndex: 7,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "variable",
      },
      {
        startIndex: 7,
        endIndex: 8,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "",
      },
      {
        startIndex: 8,
        endIndex: 9,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "keyword.operator",
      },
      {
        startIndex: 9,
        endIndex: 10,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "",
      },
      {
        startIndex: 10,
        endIndex: 14,
        tokenType: StandardTokenType.String,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "string",
      },
      {
        startIndex: 14,
        endIndex: 15,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "",
      },
    ];
    const output = renderViewLine(line, tokens, 4);
    expect(output.html).toContain('class="s-kw"');
    expect(output.html).toContain('class="s-var"');
    expect(output.html).toContain('class="s-op"');
    expect(output.html).toContain('class="s-str"');
    expect(output.html).toContain("const");
    expect(output.html).toContain("x");
    expect(output.html).toContain("hi");
  });

  // ── Scope class mapping for JSON grammar scopes ──

  it("maps meta.structure.dictionary.key.json to s-atr (JSON key)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 6,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "meta.structure.dictionary.key.json",
    };
    const output = renderViewLine('"name"', [token], 4);
    expect(output.html).toBe('<span class="s-atr">"name"</span>');
  });

  it("maps string.quoted.double.json to s-str (JSON string value)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 7,
      tokenType: StandardTokenType.String,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "string.quoted.double.json",
    };
    const output = renderViewLine('"hello"', [token], 4);
    expect(output.html).toBe('<span class="s-str">"hello"</span>');
  });

  it("maps constant.language.json to s-kw (JSON boolean/null)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 4,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "constant.language.json",
    };
    const output = renderViewLine("true", [token], 4);
    expect(output.html).toBe('<span class="s-kw">true</span>');
  });

  it("maps constant.numeric.json to s-num (JSON number)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 2,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "constant.numeric.json",
    };
    const output = renderViewLine("42", [token], 4);
    expect(output.html).toBe('<span class="s-num">42</span>');
  });

  it("maps comment.block.json to s-cmt (JSONC block comment)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 14,
      tokenType: StandardTokenType.Comment,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "comment.block.json",
    };
    const output = renderViewLine("/* comment */", [token], 4);
    expect(output.html).toBe('<span class="s-cmt">/* comment */</span>');
  });

  it("maps comment.line.double-slash.json to s-cmt (JSONC line comment)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 17,
      tokenType: StandardTokenType.Comment,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "comment.line.double-slash.json",
    };
    const output = renderViewLine("// line comment", [token], 4);
    expect(output.html).toBe('<span class="s-cmt">// line comment</span>');
  });

  it("maps punctuation.separator.dictionary.key-value.json to s-pun", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 1,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "punctuation.separator.dictionary.key-value.json",
    };
    const output = renderViewLine(":", [token], 4);
    expect(output.html).toBe('<span class="s-pun">:</span>');
  });

  it("maps meta.structure.dictionary.json to token-other (structural fallback)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 1,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "meta.structure.dictionary.json",
    };
    const output = renderViewLine("{", [token], 4);
    expect(output.html).toBe('<span class="token-other">{</span>');
  });

  it("maps punctuation.definition.dictionary.begin.json to s-pun", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 1,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "punctuation.definition.dictionary.begin.json",
    };
    const output = renderViewLine("{", [token], 4);
    expect(output.html).toBe('<span class="s-pun">{</span>');
  });

  it("maps invalid.illegal.expected-dictionary-close.json to s-inv", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 1,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "invalid.illegal.expected-dictionary-close.json",
    };
    const output = renderViewLine("x", [token], 4);
    expect(output.html).toBe('<span class="s-inv">x</span>');
  });

  // ── Key vs value produce different CSS classes ──

  it("produces different classes for JSON key scope vs value scope", () => {
    const keyToken: IToken = {
      startIndex: 0,
      endIndex: 6,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "meta.structure.dictionary.key.json",
    };
    const valueToken: IToken = {
      startIndex: 0,
      endIndex: 7,
      tokenType: StandardTokenType.String,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "string.quoted.double.json",
    };
    const keyOutput = renderViewLine('"name"', [keyToken], 4);
    const valueOutput = renderViewLine('"hello"', [valueToken], 4);
    expect(keyOutput.html).toContain("s-atr");
    expect(valueOutput.html).toContain("s-str");
    expect(keyOutput.html).not.toContain("s-str");
    expect(valueOutput.html).not.toContain("s-atr");
  });

  // ── HCL / Terraform grammar scope mappings ──

  it("maps entity.name.type.hcl to s-type (HCL block type)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 8,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "entity.name.type.hcl",
    };
    const output = renderViewLine("resource", [token], 4);
    expect(output.html).toBe('<span class="s-type">resource</span>');
  });

  it("maps variable.other.enummember.hcl to s-lbl (HCL block label)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 14,
      tokenType: StandardTokenType.String,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "variable.other.enummember.hcl",
    };
    const output = renderViewLine('"aws_instance"', [token], 4);
    expect(output.html).toBe('<span class="s-lbl">"aws_instance"</span>');
  });

  it("maps variable.other.readwrite.hcl to s-var (HCL attribute key)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 3,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "variable.other.readwrite.hcl",
    };
    const output = renderViewLine("ami", [token], 4);
    expect(output.html).toBe('<span class="s-var">ami</span>');
  });

  it("maps variable.other.enummember (no suffix) to s-lbl", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 14,
      tokenType: StandardTokenType.String,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "variable.other.enummember",
    };
    const output = renderViewLine('"aws_instance"', [token], 4);
    expect(output.html).toBe('<span class="s-lbl">"aws_instance"</span>');
  });

  it("produces different classes for HCL block label vs attribute key", () => {
    const labelToken: IToken = {
      startIndex: 0,
      endIndex: 13,
      tokenType: StandardTokenType.String,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "variable.other.enummember.hcl",
    };
    const attrToken: IToken = {
      startIndex: 0,
      endIndex: 3,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "variable.other.readwrite.hcl",
    };
    const labelOutput = renderViewLine('"aws_instance"', [labelToken], 4);
    const attrOutput = renderViewLine("ami", [attrToken], 4);
    expect(labelOutput.html).toContain("s-lbl");
    expect(attrOutput.html).toContain("s-var");
    expect(labelOutput.html).not.toContain("s-var");
    expect(attrOutput.html).not.toContain("s-lbl");
  });

  it("maps support.function.builtin.hcl to s-fun (HCL built-in function)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 6,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "support.function.builtin.hcl",
    };
    const output = renderViewLine("length", [token], 4);
    expect(output.html).toBe('<span class="s-fun">length</span>');
  });

  it("maps comment.line.number-sign.hcl to s-cmt (HCL # comment)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 19,
      tokenType: StandardTokenType.Comment,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "comment.line.number-sign.hcl",
    };
    const output = renderViewLine("# This is a comment", [token], 4);
    expect(output.html).toBe('<span class="s-cmt"># This is a comment</span>');
  });

  it("maps storage.type.hcl to s-type (HCL type keyword)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 6,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "storage.type.hcl",
    };
    const output = renderViewLine("string", [token], 4);
    expect(output.html).toBe('<span class="s-type">string</span>');
  });

  // ── JSDoc @-symbol highlighting ──

  it("maps punctuation.definition.block.tag to s-type for JSDoc @-symbol", () => {
    // The @ in @param gets scope punctuation.definition.block.tag.jsdoc
    // which falls back to punctuation.definition.block.tag
    const token: IToken = {
      startIndex: 0,
      endIndex: 1,
      tokenType: StandardTokenType.Comment,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "punctuation.definition.block.tag.jsdoc",
    };
    const output = renderViewLine("@", [token], 4);
    expect(output.html).toBe('<span class="s-type">@</span>');
  });

  it("maps punctuation.definition.inline.tag to s-type for JSDoc inline @-symbol", () => {
    // The @ in {@link ...} gets scope punctuation.definition.inline.tag.jsdoc
    // which falls back to punctuation.definition.inline.tag
    const token: IToken = {
      startIndex: 0,
      endIndex: 1,
      tokenType: StandardTokenType.Comment,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "punctuation.definition.inline.tag.jsdoc",
    };
    const output = renderViewLine("@", [token], 4);
    expect(output.html).toBe('<span class="s-type">@</span>');
  });

  it("produces same CSS class for JSDoc @ and tag name", () => {
    // Simulate two tokens on one line: @param
    const atToken: IToken = {
      startIndex: 0,
      endIndex: 1,
      tokenType: StandardTokenType.Comment,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "punctuation.definition.block.tag.jsdoc",
    };
    const paramToken: IToken = {
      startIndex: 1,
      endIndex: 6,
      tokenType: StandardTokenType.Comment,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "storage.type.class.jsdoc",
    };
    const output = renderViewLine("@param", [atToken, paramToken], 4);
    // Both should have s-type class — find all class="s-type" occurrences
    const typeMatch = output.html.match(/class="s-type"/g);
    expect(typeMatch).not.toBeNull();
    expect(typeMatch!.length).toBe(2);
  });
});
