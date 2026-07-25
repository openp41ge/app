/**
 * Tests for BracketPairService, BracketDepthComputer, DefaultBracketDetector,
 * and StringCommentScopeFilter.
 */
import { describe, it, expect } from "vitest";
import { BracketPairService } from "@openp41ge-file-editor/rendering/bracket-pair-service";
import { DefaultBracketDetector } from "@openp41ge-file-editor/rendering/bracket-detector";
import { StringCommentScopeFilter } from "@openp41ge-file-editor/rendering/scope-filter";
import { BracketDepthComputer } from "@openp41ge-file-editor/rendering/bracket-depth-computer";
import type { BracketLineInput } from "@openp41ge-file-editor/rendering/bracket-depth-computer";
import type { IBracketDetector } from "@openp41ge-file-editor/rendering/bracket-detector";
import type { IScopeFilter } from "@openp41ge-file-editor/rendering/scope-filter";
import { StandardTokenType } from "openp41ge-syntax-highlighting";
import type { IToken } from "openp41ge-syntax-highlighting";
import { renderViewLine } from "@openp41ge-file-editor/rendering/view-line-renderer";

// ── Helper: create a simple token ────────────────────────────────────

function token(
  startIndex: number,
  endIndex: number,
  scope: string = "",
  tokenType: StandardTokenType = StandardTokenType.Other,
): IToken {
  return {
    startIndex,
    endIndex,
    tokenType,
    fontStyle: 0,
    foreground: 0,
    background: 0,
    languageId: 0,
    scope,
  };
}

// ── DefaultBracketDetector tests ─────────────────────────────────────

describe("DefaultBracketDetector", () => {
  const detector = new DefaultBracketDetector();

  it("detects round brackets", () => {
    expect(detector.getBracketPair("(")).toEqual({ open: "(", close: ")" });
    expect(detector.getBracketPair(")")).toEqual({ open: "(", close: ")" });
  });

  it("detects square brackets", () => {
    expect(detector.getBracketPair("[")).toEqual({ open: "[", close: "]" });
    expect(detector.getBracketPair("]")).toEqual({ open: "[", close: "]" });
  });

  it("detects curly brackets", () => {
    expect(detector.getBracketPair("{")).toEqual({ open: "{", close: "}" });
    expect(detector.getBracketPair("}")).toEqual({ open: "{", close: "}" });
  });

  it("returns null for non-bracket characters", () => {
    expect(detector.getBracketPair("a")).toBeNull();
    expect(detector.getBracketPair("1")).toBeNull();
    expect(detector.getBracketPair(".")).toBeNull();
    expect(detector.getBracketPair('"')).toBeNull();
    expect(detector.getBracketPair(" ")).toBeNull();
    expect(detector.getBracketPair("<")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(detector.getBracketPair("")).toBeNull();
  });
});

// ── StringCommentScopeFilter tests ───────────────────────────────────

describe("StringCommentScopeFilter", () => {
  const filter = new StringCommentScopeFilter();

  it("skips positions inside strings", () => {
    const tokens = [token(0, 5, "string.quoted.double")];
    expect(filter.shouldSkip(tokens, 1)).toBe(true);
    expect(filter.shouldSkip(tokens, 3)).toBe(true);
  });

  it("skips positions inside comments", () => {
    const tokens = [token(0, 20, "comment.line.double-slash")];
    expect(filter.shouldSkip(tokens, 5)).toBe(true);
    expect(filter.shouldSkip(tokens, 15)).toBe(true);
  });

  it("does not skip positions outside strings/comments", () => {
    const tokens = [token(0, 5, "keyword")];
    expect(filter.shouldSkip(tokens, 1)).toBe(false);
  });

  it("does not skip positions with empty scope", () => {
    const tokens = [token(0, 5, "")];
    expect(filter.shouldSkip(tokens, 1)).toBe(false);
  });

  it("does not skip punctuation brackets", () => {
    const tokens = [token(0, 1, "punctuation.definition.block")];
    expect(filter.shouldSkip(tokens, 0)).toBe(false);
  });

  it("handles mixed tokens correctly", () => {
    const tokens = [token(0, 3, "keyword"), token(3, 4, ""), token(4, 10, "string.quoted.double")];
    expect(filter.shouldSkip(tokens, 1)).toBe(false); // keyword
    expect(filter.shouldSkip(tokens, 5)).toBe(true); // string
  });

  it("string.quoted.template is skipped", () => {
    const tokens = [token(0, 10, "string.quoted.template")];
    expect(filter.shouldSkip(tokens, 3)).toBe(true);
  });

  it("comment.block is skipped", () => {
    const tokens = [token(0, 14, "comment.block")];
    expect(filter.shouldSkip(tokens, 7)).toBe(true);
  });
});

// ── BracketDepthComputer tests ────────────────────────────────────────

describe("BracketDepthComputer", () => {
  const detector = new DefaultBracketDetector();
  const filter = new StringCommentScopeFilter();

  function makeLines(
    inputs: Array<{ text: string; tokens?: IToken[] | null }>,
  ): BracketLineInput[] {
    return inputs.map((inp, i) => ({
      lineNumber: i + 1,
      text: inp.text,
      tokens: inp.tokens ?? null,
    }));
  }

  it("assigns depth 0 to a single pair", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([{ text: "()" }]);
    const depths = computer.compute(lines);
    expect(depths.get("1:0")).toBe(0); // opening paren
    expect(depths.get("1:1")).toBe(0); // closing paren
  });

  it("assigns increasing depths for nesting", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([{ text: "({})" }]);
    const depths = computer.compute(lines);
    expect(depths.get("1:0")).toBe(0); // outer (
    expect(depths.get("1:1")).toBe(1); // inner {
    expect(depths.get("1:2")).toBe(1); // inner }
    expect(depths.get("1:3")).toBe(0); // outer )
  });

  it("assigns same depth to matching brackets", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([{ text: "[()]" }]);
    const depths = computer.compute(lines);
    expect(depths.get("1:0")).toBe(0); // [
    expect(depths.get("1:1")).toBe(1); // (
    expect(depths.get("1:2")).toBe(1); // )
    expect(depths.get("1:3")).toBe(0); // ]
  });

  it("handles multiple bracket types on same depth", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([{ text: "{[()]}" }]);
    const depths = computer.compute(lines);
    // { depth 0, [ depth 1, ( depth 2, ) depth 2, ] depth 1, } depth 0
    expect(depths.get("1:0")).toBe(0); // {
    expect(depths.get("1:1")).toBe(1); // [
    expect(depths.get("1:2")).toBe(2); // (
    expect(depths.get("1:3")).toBe(2); // )
    expect(depths.get("1:4")).toBe(1); // ]
    expect(depths.get("1:5")).toBe(0); // }
  });

  it("handles multiline bracket pairs", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([{ text: "function() {" }, { text: "  return 1;" }, { text: "}" }]);
    const depths = computer.compute(lines);
    expect(depths.get("1:8")).toBe(0); // (
    expect(depths.get("1:9")).toBe(0); // )
    expect(depths.get("1:11")).toBe(0); // {
    expect(depths.get("3:0")).toBe(0); // matching }
  });

  it("skips brackets inside string tokens", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([
      {
        text: '"{()}"',
        tokens: [token(0, 6, "string.quoted.double")],
      },
    ]);
    const depths = computer.compute(lines);
    // No bracket outside a string, so no depths assigned
    expect(depths.size).toBe(0);
  });

  it("skips brackets inside comment tokens", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([
      {
        text: "// {()}",
        tokens: [token(0, 7, "comment.line.double-slash")],
      },
    ]);
    const depths = computer.compute(lines);
    expect(depths.size).toBe(0);
  });

  it("does not assign depth to unmatched brackets", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([{ text: "(()" }]);
    const depths = computer.compute(lines);
    // First ( gets depth 0, second ( gets depth 1, ) matches second ( at depth 1
    // The first ( is unmatched, but it was already assigned depth 0
    expect(depths.get("1:0")).toBe(0); // first (
    expect(depths.get("1:1")).toBe(1); // second (
    expect(depths.get("1:2")).toBe(1); // ) matches second (
  });

  it("handles empty line", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([{ text: "" }]);
    const depths = computer.compute(lines);
    expect(depths.size).toBe(0);
  });

  it("handles no input lines", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const depths = computer.compute([]);
    expect(depths.size).toBe(0);
  });

  it("correctly matches same bracket type at same depth", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([{ text: "(()())" }]);
    const depths = computer.compute(lines);
    // ( depth 0, ( depth 1, ) depth 1, ( depth 1, ) depth 1, ) depth 0
    expect(depths.get("1:0")).toBe(0);
    expect(depths.get("1:1")).toBe(1);
    expect(depths.get("1:2")).toBe(1);
    expect(depths.get("1:3")).toBe(1);
    expect(depths.get("1:4")).toBe(1);
    expect(depths.get("1:5")).toBe(0);
  });

  it("deeply nested brackets cycle through depths", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([{ text: "((((((()))))))" }]);
    const depths = computer.compute(lines);
    // 7 opening parens, 7 closing parens
    expect(depths.get("1:0")).toBe(0);
    expect(depths.get("1:1")).toBe(1);
    expect(depths.get("1:2")).toBe(2);
    expect(depths.get("1:3")).toBe(3);
    expect(depths.get("1:4")).toBe(4);
    expect(depths.get("1:5")).toBe(5);
    expect(depths.get("1:6")).toBe(6);
    expect(depths.get("1:7")).toBe(6);
    expect(depths.get("1:8")).toBe(5);
    expect(depths.get("1:9")).toBe(4);
    expect(depths.get("1:10")).toBe(3);
    expect(depths.get("1:11")).toBe(2);
    expect(depths.get("1:12")).toBe(1);
    expect(depths.get("1:13")).toBe(0);
  });

  it("handles mixed bracket types inside strings/comments", () => {
    const computer = new BracketDepthComputer(detector, filter);
    const lines = makeLines([
      {
        text: 'func("arg")',
        tokens: [
          token(0, 4, "entity.name.function"),
          token(4, 5, "punctuation.definition.parameters"),
          token(5, 10, "string.quoted.double"),
          token(10, 11, "punctuation.definition.parameters"),
        ],
      },
    ]);
    const depths = computer.compute(lines);
    // ( at 4 should be depth 0, " at 5 is string skipped, ) at 10 should be depth 0
    expect(depths.get("1:4")).toBe(0); // (
    expect(depths.get("1:5")).toBe(undefined); // " inside string
    expect(depths.get("1:9")).toBe(undefined); // " inside string
    expect(depths.get("1:10")).toBe(0); // )
  });
});

// ── BracketPairService (thin facade) tests ────────────────────────────

describe("BracketPairService", () => {
  it("returns empty map for no lines", () => {
    const service = new BracketPairService();
    const depths = service.compute([]);
    expect(depths.size).toBe(0);
  });

  it("returns empty map for plain text without brackets", () => {
    const service = new BracketPairService();
    const lines: BracketLineInput[] = [{ lineNumber: 1, text: "hello world", tokens: null }];
    const depths = service.compute(lines);
    expect(depths.size).toBe(0);
  });

  it("uses custom detector and filter", () => {
    const customDetector: IBracketDetector = {
      getBracketPair(ch: string) {
        if (ch === "<" || ch === ">") {
          return { open: "<", close: ">" };
        }
        return null;
      },
    };
    const customFilter: IScopeFilter = {
      shouldSkip() {
        return false;
      },
    };
    const service = new BracketPairService(customDetector, customFilter);
    const lines: BracketLineInput[] = [{ lineNumber: 1, text: "<div></div>", tokens: null }];
    const depths = service.compute(lines);
    expect(depths.get("1:0")).toBe(0); // first <
    expect(depths.get("1:4")).toBe(0); // first >
    expect(depths.get("1:5")).toBe(0); // second <
    expect(depths.get("1:10")).toBe(0); // second >
  });
});

// ── Integration with renderViewLine ──────────────────────────────────

describe("renderViewLine with bracket depths", () => {
  it("adds bracket depth class to matching brackets", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 1,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "punctuation.definition.bracket",
    };
    const depths = new Map<string, number>([["1:0", 0]]);
    const output = renderViewLine("(", [token], 4, depths, 1);
    expect(output.html).toContain("s-bracket-d0");
    expect(output.html).toContain("s-pun");
  });

  it("adds different depth class for nested brackets", () => {
    // Two separate tokens: ( at 0, [ at 1
    const tokens: IToken[] = [
      {
        startIndex: 0,
        endIndex: 1,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "punctuation.definition.bracket",
      },
      {
        startIndex: 1,
        endIndex: 2,
        tokenType: StandardTokenType.Other,
        fontStyle: 0,
        foreground: 0,
        background: 0,
        languageId: 0,
        scope: "punctuation.definition.bracket",
      },
    ];
    const depths = new Map<string, number>([
      ["1:0", 0],
      ["1:1", 1],
    ]);
    const output = renderViewLine("([", tokens, 4, depths, 1);
    // First char should have s-bracket-d0, second should have s-bracket-d1
    // They're separate tokens, so they should be in separate spans
    expect(output.html).toContain("s-bracket-d0");
    expect(output.html).toContain("s-bracket-d1");
  });

  it("does not add bracket class for characters without depth entry", () => {
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
    const depths = new Map<string, number>(); // empty
    const output = renderViewLine("const", [token], 4, depths, 1);
    expect(output.html).not.toContain("s-bracket");
  });

  it("falls back to scope class when no bracket depth (unmatched bracket)", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 1,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "punctuation.definition.bracket",
    };
    const depths = new Map<string, number>(); // bracket is unmatched — no depth
    const output = renderViewLine("(", [token], 4, depths, 1);
    expect(output.html).toContain("s-pun");
    expect(output.html).not.toContain("s-bracket");
  });

  it("renders bracket depth class on plain lines (no tokens)", () => {
    const depths = new Map<string, number>([
      ["1:0", 0],
      ["1:1", 0],
    ]);
    const output = renderViewLine("()", null, 4, depths, 1);
    expect(output.html).toContain("s-bracket-d0");
  });

  it("combines scope class and bracket class on single character token", () => {
    const token: IToken = {
      startIndex: 0,
      endIndex: 1,
      tokenType: StandardTokenType.Other,
      fontStyle: 0,
      foreground: 0,
      background: 0,
      languageId: 0,
      scope: "punctuation.definition.bracket",
    };
    const depths = new Map<string, number>([["1:0", 0]]);
    const output = renderViewLine("{", [token], 4, depths, 1);
    expect(output.html).toContain("s-pun");
    expect(output.html).toContain("s-bracket-d0");
  });
});
