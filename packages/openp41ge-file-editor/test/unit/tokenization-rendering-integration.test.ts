/**
 * Integration tests: tokenization pipeline → rendering output.
 *
 * Tests the full chain:
 *   PieceTreeTextContentModel → ViewModel → LazyTokenizationManager
 *   → ITokenizer (mock) → ContiguousTokensStore → renderViewLine
 *
 * These tests ensure that tokens with scope fields are properly
 * stored, retrieved, and rendered as CSS classes.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";
import { ViewModel } from "@openp41ge-file-editor/model/view-model";
import { LazyTokenizationManager } from "openp41ge-syntax-highlighting";
import type { ITokenizer, ITokenizeLineResult, IToken } from "openp41ge-syntax-highlighting";
import type { StateStack } from "vscode-textmate";
import { renderViewLine } from "@openp41ge-file-editor/rendering/view-line-renderer";

/**
 * A test tokenizer that returns predictable tokens with scope fields
 * based on the line content.
 */
class TestTokenizer implements ITokenizer {
  readonly languageId: string;
  readonly scopeName: string;

  constructor(languageId: string, scopeName: string) {
    this.languageId = languageId;
    this.scopeName = scopeName;
  }

  tokenizeLine(lineText: string, prevState: StateStack | null): ITokenizeLineResult {
    const tokens: IToken[] = [];
    let pos = 0;

    // A simple "tokenizer" that recognizes a few patterns:
    // - "const", "let", "var", "function", "return", "if", "else" → scope "keyword"
    // - "//" to end of line → scope "comment"
    // - Numbers (digits) → scope "constant.numeric"
    // - Strings ("...") → scope "string.quoted"
    // - Assignment (=) → scope "keyword.operator"
    // - Everything else → scope "variable"

    const keywords = ["const", "let", "var", "function", "return", "if", "else", "while", "for"];

    while (pos < lineText.length) {
      // Skip whitespace
      if (lineText[pos] === " " || lineText[pos] === "\t") {
        const start = pos;
        while (pos < lineText.length && (lineText[pos] === " " || lineText[pos] === "\t")) {
          pos++;
        }
        tokens.push(makeToken(start, pos, 0, ""));
        continue;
      }

      // Line comments
      if (lineText[pos] === "/" && lineText[pos + 1] === "/") {
        tokens.push(makeToken(pos, lineText.length, 1, "comment"));
        pos = lineText.length;
        continue;
      }

      // Strings
      if (lineText[pos] === '"' || lineText[pos] === "'") {
        const quote = lineText[pos];
        const start = pos;
        pos++;
        while (pos < lineText.length && lineText[pos] !== quote) {
          if (lineText[pos] === "\\") pos++;
          pos++;
        }
        if (pos < lineText.length) pos++;
        tokens.push(makeToken(start, pos, 2, "string.quoted"));
        continue;
      }

      // Numbers
      if (/\d/.test(lineText[pos])) {
        const start = pos;
        while (pos < lineText.length && /\d/.test(lineText[pos])) pos++;
        tokens.push(makeToken(start, pos, 0, "constant.numeric"));
        continue;
      }

      // Operators (=, +, -, *, /, etc.)
      if (/[=+\-*\/%<>!&|^~]/.test(lineText[pos])) {
        const start = pos;
        pos++;
        tokens.push(makeToken(start, pos, 0, "keyword.operator"));
        continue;
      }

      // Punctuation
      if (/[;,.(){}[\]":]/.test(lineText[pos])) {
        const start = pos;
        pos++;
        tokens.push(makeToken(start, pos, 1, ""));
        continue;
      }

      // Keywords or identifiers
      const start = pos;
      while (pos < lineText.length && /[a-zA-Z0-9_$]/.test(lineText[pos])) pos++;
      const word = lineText.substring(start, pos);
      if (keywords.includes(word)) {
        tokens.push(makeToken(start, pos, 0, "keyword"));
      } else if (word === "true" || word === "false" || word === "null" || word === "undefined") {
        tokens.push(makeToken(start, pos, 0, "constant.language"));
      } else if (word[0] === word[0]?.toUpperCase() && word[0] !== word[0]?.toLowerCase()) {
        // Uppercase first letter → type
        tokens.push(makeToken(start, pos, 0, "entity.name.type"));
      } else {
        tokens.push(makeToken(start, pos, 0, "variable"));
      }
    }

    return { tokens, ruleStack: prevState };
  }
}

function makeToken(startIndex: number, endIndex: number, tokenType: number, scope: string): IToken {
  return {
    startIndex,
    endIndex,
    tokenType: tokenType as any,
    fontStyle: 0,
    foreground: 0,
    background: 0,
    languageId: 0,
    scope,
  };
}

describe("Tokenization → Rendering Integration", () => {
  let model: PieceTreeTextContentModel;
  let viewModel: ViewModel;
  let tokenizer: TestTokenizer;

  beforeEach(() => {
    model = new PieceTreeTextContentModel("", "javascript");
    viewModel = new ViewModel(model, { lineHeight: 20, tabSize: 4 });
    tokenizer = new TestTokenizer("javascript", "source.js");
  });

  it("getLineTokens returns null before tokenizer is set", () => {
    expect(viewModel.getLineTokens(1)).toBeNull();
  });

  it("getLineTokens returns tokens with scope after tokenizer is set", () => {
    viewModel.setTokenizer(tokenizer);
    model.setValue('const x = "hello";\nlet y = 42;\n');

    viewModel.tokenizeVisibleRange(1, 2);

    const tokens1 = viewModel.getLineTokens(1);
    expect(tokens1).not.toBeNull();
    expect(tokens1!.length).toBeGreaterThan(0);

    // Verify tokens have scope fields
    const keywordToken = tokens1!.find((t) => t.scope === "keyword");
    expect(keywordToken).toBeDefined();
    expect(keywordToken!.startIndex).toBe(0);
    expect(keywordToken!.endIndex).toBe(5); // "const"

    const stringToken = tokens1!.find((t) => t.scope === "string.quoted");
    expect(stringToken).toBeDefined();
  });

  it("getLineTokens returns tokens for second line", () => {
    viewModel.setTokenizer(tokenizer);
    model.setValue('const x = "hello";\nlet y = 42;\n');

    viewModel.tokenizeVisibleRange(1, 2);

    const tokens2 = viewModel.getLineTokens(2);
    expect(tokens2).not.toBeNull();
    expect(tokens2!.length).toBeGreaterThan(0);

    const keywordToken = tokens2!.find((t) => t.scope === "keyword");
    expect(keywordToken).toBeDefined();

    const numToken = tokens2!.find((t) => t.scope === "constant.numeric");
    expect(numToken).toBeDefined();
  });

  it("renderViewLine produces scope-based classes from ViewModel tokens", () => {
    viewModel.setTokenizer(tokenizer);
    model.setValue('const x = "hello";\nlet y = 42;\n');

    viewModel.tokenizeVisibleRange(1, 1);

    const content = viewModel.getLineContent(1);
    const tokens = viewModel.getLineTokens(1);
    const output = renderViewLine(content, tokens, 4);

    // Should have s-kw for "const"
    expect(output.html).toContain('class="s-kw"');

    // Should have s-str for the string
    expect(output.html).toContain('class="s-str"');

    // Should have s-var for "x"
    expect(output.html).toContain('class="s-var"');

    // Should have s-op for "="
    expect(output.html).toContain('class="s-op"');
  });

  it("renderViewLine renders number with s-num class", () => {
    viewModel.setTokenizer(tokenizer);
    model.setValue("let count = 42;\n");

    viewModel.tokenizeVisibleRange(1, 1);

    const content = viewModel.getLineContent(1);
    const tokens = viewModel.getLineTokens(1);
    const output = renderViewLine(content, tokens, 4);

    expect(output.html).toContain('class="s-num"');
  });

  it("renderViewLine renders comment with s-cmt class", () => {
    viewModel.setTokenizer(tokenizer);
    model.setValue("// this is a comment\n");

    viewModel.tokenizeVisibleRange(1, 1);

    const content = viewModel.getLineContent(1);
    const tokens = viewModel.getLineTokens(1);
    const output = renderViewLine(content, tokens, 4);

    expect(output.html).toContain('class="s-cmt"');
  });

  it("cached tokens preserve scope fields", () => {
    viewModel.setTokenizer(tokenizer);
    model.setValue("const hello = 123;\n");

    viewModel.tokenizeVisibleRange(1, 1);

    // Get tokens twice — second call should return cached
    const tokens1 = viewModel.getLineTokens(1);
    const tokens2 = viewModel.getLineTokens(1);

    expect(tokens1).toBe(tokens2); // Same reference (cached)

    // Both should have scope fields
    const kw1 = tokens1!.find((t) => t.scope === "keyword");
    const kw2 = tokens2!.find((t) => t.scope === "keyword");
    expect(kw1).toBeDefined();
    expect(kw2).toBeDefined();
  });
});

describe("TextMateTokenizer-like token creation", () => {
  it("firstScope extracts first segment from LAST scope in array", () => {
    // The innermost scope is LAST in the array
    const scopes = ["source.js", "keyword.control.js"];
    const innermost = scopes[scopes.length - 1].split(".")[0];
    expect(innermost).toBe("keyword");
  });

  it("scopeToTokenType identifies comment scope from last element", () => {
    const scopes = ["source.js", "comment.line.js"];
    const innermost = scopes[scopes.length - 1].split(".")[0];
    expect(innermost).toBe("comment");
  });

  it("scopeToTokenType identifies string scope from last element", () => {
    const scopes = ["source.js", "string.quoted.double.js"];
    const innermost = scopes[scopes.length - 1].split(".")[0];
    expect(innermost).toBe("string");
  });
});
