/**
 * Unit tests for CoordinatesConverter wrap-cache invalidation on content change
 * (Phase 2 of the large-file-performance plan).
 *
 * Regression: after a wrapped document is REPLACED with different content, the
 * converter kept stale per-line wrap-segment counts from the old document, so:
 *   - getTotalViewLineCount() came out short (7787 instead of 8000 in the live
 *     repro where 71 short lines were replaced by 2000 wrapped lines), and
 *   - convertViewToModelPosition() mapped to the wrong model line, breaking
 *     click-to-caret (view line 9 -> model line 9 instead of model line 3).
 */
import { describe, test, expect } from "vitest";
import { PieceTreeTextContentModel } from "../../../src/model/piece-tree-text-content-model";
import { CoordinatesConverter } from "../../../src/model/coordinates-converter";
import { ViewModel } from "../../../src/model/view-model";

function makeModel(contents: string[]): PieceTreeTextContentModel {
  return new PieceTreeTextContentModel("file:///conv.ts", contents.join("\n"));
}

describe("CoordinatesConverter cache invalidation on content change", () => {
  test("total view line count reflects the NEW content immediately after setValue", () => {
    const model = makeModel(["a", "b"]); // short, 1 segment each
    const conv = new CoordinatesConverter(model);
    conv.setWordWrap(true);
    conv.setWrapColumn(10);
    expect(conv.getTotalViewLineCount()).toBe(2); // cached for the old content

    // Replace with 20 lines that wrap into 6 segments each at column 10.
    model.setValue(Array.from({ length: 20 }, () => "x".repeat(60)).join("\n"));
    conv.markDirty(); // what ViewModel._handleModelChange now does on any change
    expect(conv.getTotalViewLineCount()).toBe(120); // 20 x 6, NOT stale 2 + 18*6
  });

  test("convertViewToModelPosition resolves through the NEW wrap layout (click-to-caret)", () => {
    const model = makeModel(["a", "b", "c", "this is a much longer fourth line"]);
    const conv = new CoordinatesConverter(model);
    conv.setWordWrap(true);
    conv.setWrapColumn(10);

    const before = conv.convertModelToViewPosition(4, 1);
    expect(conv.convertViewToModelPosition(before.lineNumber, 1).lineNumber).toBe(4);

    // Replace the whole document with 4 identical long lines; line 4 now also
    // wraps, and view line 9 should be part of model line 3 (1*? + ...) per
    // the new layout, not a leftover coordinate from the old one.
    model.setValue(["x".repeat(40), "x".repeat(40), "x".repeat(40), "x".repeat(40)].join("\n"));
    conv.markDirty();

    // 40-char lines at column 10 -> 4 segments each; model line 3 spans view
    // lines 9..12, so view line 9 belongs to model line 3.
    const pos = conv.convertViewToModelPosition(9, 1);
    expect(pos.lineNumber).toBe(3);
  });

  test("ViewModel invalidates the converter wrap cache on content change (regression wiring test)", () => {
    // Pin the actual wiring: ViewModel._handleModelChange MUST call
    // coordinatesConverter.markDirty() on every content change. Without it the
    // converter keeps the old document's per-line wrap counts. No manual
    // markDirty here — the ViewModel must do it.
    const model = makeModel(["a", "b"]);
    const vm = new ViewModel(model);
    vm.coordinatesConverter.setWordWrap(true);
    vm.coordinatesConverter.setWrapColumn(10);
    expect(vm.coordinatesConverter.getTotalViewLineCount()).toBe(2);

    model.setValue(Array.from({ length: 20 }, () => "x".repeat(60)).join("\n"));
    expect(vm.coordinatesConverter.getTotalViewLineCount()).toBe(120); // not stale 110
  });
});
