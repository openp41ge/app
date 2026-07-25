/**
 * Tests for TokenSegmentAdjuster — token offset adjustment for wrapped segments.
 *
 * Verifies:
 *   - First segment (offset 0) returns original tokens unchanged (reference identity)
 *   - Subsequent segments have correctly shifted token offsets
 *   - Tokens outside the segment are dropped
 *   - Tokens partially overlapping the segment are clipped
 *   - Token spanning across a segment boundary is split on each side
 *   - Token exactly at segment boundary is included correctly
 *   - Null/empty tokens return null
 *   - All IToken fields (scope, colors, etc.) are preserved
 *   - Very short segments (narrow wrap) work correctly
 */

import { describe, it, expect } from "vitest";
import { TokenSegmentAdjuster } from "@openp41ge-file-editor/view/token-segment-adjuster";
import { StandardTokenType, FontStyle } from "openp41ge-syntax-highlighting";
import type { IToken } from "openp41ge-syntax-highlighting";

/**
 * Helper: create a simple token with the given offsets and optional type.
 */
function makeToken(
  startIndex: number,
  endIndex: number,
  tokenType: StandardTokenType = StandardTokenType.Other,
  foreground: number = 1,
  scope: string = "",
): IToken {
  return {
    startIndex,
    endIndex,
    tokenType,
    fontStyle: FontStyle.None,
    foreground,
    background: 0,
    languageId: 0,
    scope,
  };
}

describe("TokenSegmentAdjuster", () => {
  const adjuster = new TokenSegmentAdjuster();

  describe("first segment (offset === 0)", () => {
    it("returns original tokens reference unchanged", () => {
      const tokens: IToken[] = [makeToken(0, 5), makeToken(5, 10)];
      const result = adjuster.adjust(tokens, 0, 10);
      // Should return the same array reference (identity preserved)
      expect(result).toBe(tokens);
    });

    it("returns null for null input", () => {
      expect(adjuster.adjust(null, 0, 10)).toBeNull();
    });

    it("returns null for empty array", () => {
      expect(adjuster.adjust([], 0, 10)).toBeNull();
    });
  });

  describe("subsequent segments (offset > 0)", () => {
    it("shifts token offsets down by the segment offset", () => {
      // Line: "const x = \"a long string that wraps\""
      // Token at offset 12..32 (the string)
      const tokens: IToken[] = [
        makeToken(0, 5, StandardTokenType.Other, 1, "keyword"), // "const"
        makeToken(6, 9, StandardTokenType.Other, 2, "variable"), // "x ="
        makeToken(12, 32, StandardTokenType.String, 3, "string"), // the string literal
      ];

      // Segment 1 starts at offset 20, length 12
      // Original text of segment 1: "string that " (cols 21..32)
      const result = adjuster.adjust(tokens, 20, 12);

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].startIndex).toBe(0); // was 12 relative to line, now 0 relative to segment
      expect(result![0].endIndex).toBe(12); // was 32 relative to line, segment is only 12 chars
      expect(result![0].scope).toBe("string");
    });

    it("drops tokens entirely before the segment", () => {
      const tokens: IToken[] = [
        makeToken(0, 5, StandardTokenType.Other, 1, "keyword"), // "const"
        makeToken(6, 9, StandardTokenType.Other, 2, "variable"), // "x ="
      ];

      // Segment starts at offset 20, so these tokens should be dropped
      const result = adjuster.adjust(tokens, 20, 10);
      expect(result).toBeNull();
    });

    it("drops tokens entirely after the segment", () => {
      const tokens: IToken[] = [
        makeToken(0, 5, StandardTokenType.Other, 1, "keyword"),
        makeToken(30, 40, StandardTokenType.String, 3, "string"),
      ];

      // Segment covers offsets 10..20
      // First token ends at 5 (before segment), second starts at 30 (after segment)
      const result = adjuster.adjust(tokens, 10, 10);
      expect(result).toBeNull();
    });

    it("clips a token that starts before the segment", () => {
      const tokens: IToken[] = [makeToken(5, 25, StandardTokenType.String, 3, "string")];

      // Segment covers offsets 10..20
      // Token starts at 5 (before segment), ends at 25 (after segment)
      const result = adjuster.adjust(tokens, 10, 10);

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].startIndex).toBe(0); // clipped to segment start (10 - 10 = 0)
      expect(result![0].endIndex).toBe(10); // clipped to segment end (20 - 10 = 10)
    });

    it("clips a token that ends after the segment", () => {
      const tokens: IToken[] = [makeToken(15, 40, StandardTokenType.String, 3, "string")];

      // Segment covers offsets 10..20
      // Token starts at 15 (within segment), ends at 40 (after segment)
      const result = adjuster.adjust(tokens, 10, 10);

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].startIndex).toBe(5); // 15 - 10 = 5
      expect(result![0].endIndex).toBe(10); // 20 - 10 = 10
    });

    it("preserves a token exactly at segment boundaries", () => {
      const tokens: IToken[] = [makeToken(10, 20, StandardTokenType.String, 3, "string")];

      // Segment exactly matches the token range
      const result = adjuster.adjust(tokens, 10, 10);

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].startIndex).toBe(0); // 10 - 10 = 0
      expect(result![0].endIndex).toBe(10); // 20 - 10 = 10
    });

    it("handles multiple tokens in one segment", () => {
      const tokens: IToken[] = [
        makeToken(0, 5, StandardTokenType.Other, 1, "keyword"),
        makeToken(6, 9, StandardTokenType.Other, 2, "variable"),
        makeToken(10, 11, StandardTokenType.Other, 4, "operator"),
        makeToken(12, 30, StandardTokenType.String, 3, "string"),
        makeToken(31, 35, StandardTokenType.Other, 1, "other"),
      ];

      // Segment covers offsets 10..25 (starting in the operator, through the string)
      const result = adjuster.adjust(tokens, 10, 15);

      expect(result).not.toBeNull();
      expect(result!.length).toBe(2);

      // Token at 10..11 → adjusted to 0..1 (operator)
      expect(result![0].startIndex).toBe(0);
      expect(result![0].endIndex).toBe(1);
      expect(result![0].scope).toBe("operator");

      // Token at 12..30 → clipped to adjusted range 2..15 (string)
      expect(result![1].startIndex).toBe(2);
      expect(result![1].endIndex).toBe(15);
      expect(result![1].scope).toBe("string");

      // Token at 31..35 → clipped to adjusted range 15..15 → dropped (empty)
    });

    it("preserves all IToken fields through adjustment", () => {
      const tokens: IToken[] = [
        {
          startIndex: 10,
          endIndex: 25,
          tokenType: StandardTokenType.Comment,
          fontStyle: FontStyle.Italic,
          foreground: 7,
          background: 0,
          languageId: 1,
          scope: "comment.line.number-sign",
        },
      ];

      const result = adjuster.adjust(tokens, 10, 15);

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      const adjusted = result![0];
      expect(adjusted.startIndex).toBe(0);
      expect(adjusted.endIndex).toBe(15);
      expect(adjusted.tokenType).toBe(StandardTokenType.Comment);
      expect(adjusted.fontStyle).toBe(FontStyle.Italic);
      expect(adjusted.foreground).toBe(7);
      expect(adjusted.background).toBe(0);
      expect(adjusted.languageId).toBe(1);
      expect(adjusted.scope).toBe("comment.line.number-sign");
    });
  });

  describe("edge cases", () => {
    it("handles a very narrow wrap column (1 char per segment)", () => {
      const tokens: IToken[] = [
        makeToken(0, 1, StandardTokenType.Other, 1, "keyword"),
        makeToken(1, 2, StandardTokenType.Other, 2, "variable"),
        makeToken(2, 3, StandardTokenType.Other, 4, "operator"),
      ];

      // Segment at offset 1, length 1 (second character)
      const result = adjuster.adjust(tokens, 1, 1);

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].startIndex).toBe(0);
      expect(result![0].endIndex).toBe(1);
      expect(result![0].scope).toBe("variable");
    });

    it("returns null when all tokens are before the segment", () => {
      const tokens: IToken[] = [makeToken(0, 5), makeToken(5, 10)];
      expect(adjuster.adjust(tokens, 20, 10)).toBeNull();
    });

    it("returns null when all tokens are after the segment", () => {
      const tokens: IToken[] = [makeToken(30, 40), makeToken(40, 50)];
      expect(adjuster.adjust(tokens, 10, 10)).toBeNull();
    });

    it("handles single-token line fully within segment", () => {
      const tokens: IToken[] = [makeToken(5, 15, StandardTokenType.String, 3, "string")];
      const result = adjuster.adjust(tokens, 5, 10);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].startIndex).toBe(0);
      expect(result![0].endIndex).toBe(10);
    });
  });
});
