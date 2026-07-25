/**
 * Tests for CoordinatesConverter (model↔view with word wrap).
 */
import { describe, it, expect } from "vitest";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";
import { CoordinatesConverter } from "@openp41ge-file-editor/model/coordinates-converter";

function createModel(text: string): PieceTreeTextContentModel {
  return new PieceTreeTextContentModel("test", text);
}

describe("CoordinatesConverter", () => {
  describe("without word wrap (identity)", () => {
    it("identity conversion", () => {
      const m = createModel("hello\nworld");
      const cc = new CoordinatesConverter(m);
      const vp = cc.convertModelToViewPosition(2, 3);
      expect(vp).toEqual({ lineNumber: 2, column: 3 });
      const mp = cc.convertViewToModelPosition(2, 3);
      expect(mp).toEqual({ lineNumber: 2, column: 3 });
    });

    it("total view line count equals model line count", () => {
      const m = createModel("a\nb\nc\nd\ne");
      const cc = new CoordinatesConverter(m);
      expect(cc.getTotalViewLineCount()).toBe(5);
    });

    it("each model line has one view line", () => {
      const m = createModel("a\nb\nc");
      const cc = new CoordinatesConverter(m);
      expect(cc.getViewLineCount(1)).toBe(1);
      expect(cc.getViewLineCount(2)).toBe(1);
      expect(cc.getViewLineCount(3)).toBe(1);
    });
  });

  describe("with word wrap", () => {
    it("splits long lines into multiple view lines", () => {
      const m = createModel("hello world foo bar baz");
      const cc = new CoordinatesConverter(m);
      cc.setWordWrap(true);
      cc.setWrapColumn(10);
      expect(cc.getViewLineCount(1)).toBeGreaterThan(1);
    });

    it("converts model position to correct view line", () => {
      const m = createModel("abcdefghijklmnop");
      const cc = new CoordinatesConverter(m);
      cc.setWordWrap(true);
      cc.setWrapColumn(5);
      // "abcde" → view line 1, "fghij" → view line 2, "klmno" → view line 3, "p" → view line 4
      const vp1 = cc.convertModelToViewPosition(1, 3);
      expect(vp1.lineNumber).toBe(1);
      const vp2 = cc.convertModelToViewPosition(1, 8);
      expect(vp2.lineNumber).toBe(2);
      const vp3 = cc.convertModelToViewPosition(1, 13);
      expect(vp3.lineNumber).toBe(3);
      const vp4 = cc.convertModelToViewPosition(1, 16);
      expect(vp4.lineNumber).toBe(4);
    });

    it("converts view position back to model position", () => {
      const m = createModel("abcdefghijklmnop");
      const cc = new CoordinatesConverter(m);
      cc.setWordWrap(true);
      cc.setWrapColumn(5);
      const mp = cc.convertViewToModelPosition(2, 3);
      // View line 2 = "fghij", column 3 = "h" → model line 1, column 8
      expect(mp.lineNumber).toBe(1);
      expect(mp.column).toBe(8);
    });

    it("getTotalViewLineCount with wrapped lines", () => {
      const m = createModel("abcde\nfghijklmnop\nqrs");
      const cc = new CoordinatesConverter(m);
      cc.setWordWrap(true);
      cc.setWrapColumn(5);
      // Line 1: "abcde" (1 view line)
      // Line 2: "fghij" + "klmno" + "p" (3 view lines)
      // Line 3: "qrs" (1 view line)
      expect(cc.getTotalViewLineCount()).toBe(5);
    });

    it("getModelLineFromViewLine", () => {
      const m = createModel("abcde\nfghijklmnop\nqrs");
      const cc = new CoordinatesConverter(m);
      cc.setWordWrap(true);
      cc.setWrapColumn(5);
      expect(cc.getModelLineFromViewLine(1)).toBe(1);
      expect(cc.getModelLineFromViewLine(2)).toBe(2);
      expect(cc.getModelLineFromViewLine(3)).toBe(2);
      expect(cc.getModelLineFromViewLine(4)).toBe(2);
      expect(cc.getModelLineFromViewLine(5)).toBe(3);
    });

    it("converts model col within wrapped segment", () => {
      const m = createModel("abcdefghijklmnop");
      const cc = new CoordinatesConverter(m);
      cc.setWordWrap(true);
      cc.setWrapColumn(5);
      // Column 3 in model = column 3 in view line 1
      const vp = cc.convertModelToViewPosition(1, 3);
      expect(vp).toEqual({ lineNumber: 1, column: 3 });
    });

    it("returns null for getWrapSegments when word wrap off", () => {
      const m = createModel("hello");
      const cc = new CoordinatesConverter(m);
      expect(cc.getWrapSegments(1)).toBeNull();
    });
  });

  describe("cache invalidation", () => {
    it("clears cache when word wrap is toggled", () => {
      const m = createModel("abcdefghijklmnop");
      const cc = new CoordinatesConverter(m);
      cc.setWordWrap(true);
      cc.setWrapColumn(5);
      expect(cc.getTotalViewLineCount()).toBeGreaterThan(1);
      cc.setWordWrap(false);
      expect(cc.getTotalViewLineCount()).toBe(1);
    });

    it("clears cache when wrap column changes", () => {
      const m = createModel("abcdefghijklmnop");
      const cc = new CoordinatesConverter(m);
      cc.setWordWrap(true);
      cc.setWrapColumn(5);
      const count1 = cc.getTotalViewLineCount();
      cc.setWrapColumn(10);
      const count2 = cc.getTotalViewLineCount();
      expect(count2).toBeLessThan(count1);
    });

    it("markDirty recalculates total view line count", () => {
      const m = createModel("a");
      const cc = new CoordinatesConverter(m);
      cc.setWordWrap(true);
      cc.setWrapColumn(5);
      expect(cc.getTotalViewLineCount()).toBe(1);
      cc.markDirty();
      // Should recalculate (still 1 since no real change)
      expect(cc.getTotalViewLineCount()).toBe(1);
    });
  });

  describe("roundtrip consistency", () => {
    it("view->model->view across multiple wrapped lines", () => {
      const model = new PieceTreeTextContentModel(
        "test",
        [
          "a very long first line that wraps into multiple segments",
          "a second long line that also wraps around for testing",
          "a third long line that wraps for additional verification",
        ].join("\n"),
      );
      const conv = new CoordinatesConverter(model);
      conv.setWordWrap(true);
      conv.setWrapColumn(20);

      for (let ml = 1; ml <= 3; ml++) {
        const segs = conv.getWrapSegments(ml)!;
        const base = conv.getViewLineFromModelLine(ml);
        for (let si = 0; si < segs.length; si++) {
          const vl = base + si;
          const seg = segs[si];
          for (let vc = 1; vc <= Math.min(3, seg.endColumn - seg.startColumn); vc++) {
            const mp = conv.convertViewToModelPosition(vl, vc);
            const vp = conv.convertModelToViewPosition(mp.lineNumber, mp.column);
            expect(vp.lineNumber).toBe(vl);
            expect(vp.column).toBe(vc);
          }
        }
      }
    });

    it("model->view->model for all columns of a wrapped line", () => {
      const model = new PieceTreeTextContentModel(
        "test",
        ["short", "a very long line that wraps to multiple segments here", "also short"].join("\n"),
      );
      const conv = new CoordinatesConverter(model);
      conv.setWordWrap(true);
      conv.setWrapColumn(20);

      for (let col = 1; col <= model.getLineContent(2).length + 1; col++) {
        const vp = conv.convertModelToViewPosition(2, col);
        const mp = conv.convertViewToModelPosition(vp.lineNumber, vp.column);
        expect(mp).toEqual({ lineNumber: 2, column: col });
      }
    });
  });
});
