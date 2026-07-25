/**
 * Tests for ViewModel.
 */
import { describe, it, expect } from "vitest";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";
import { ViewModel } from "@openp41ge-file-editor/model/view-model";

function createModel(text: string): PieceTreeTextContentModel {
  return new PieceTreeTextContentModel("test", text);
}

describe("ViewModel", () => {
  it("exposes the underlying model", () => {
    const m = createModel("hello");
    const vm = new ViewModel(m);
    expect(vm.model).toBe(m);
  });

  it("getLineContent delegates to model", () => {
    const m = createModel("hello\nworld");
    const vm = new ViewModel(m);
    expect(vm.getLineContent(1)).toBe("hello");
    expect(vm.getLineContent(2)).toBe("world");
  });

  it("lineCount matches model", () => {
    const m = createModel("a\nb\nc");
    const vm = new ViewModel(m);
    expect(vm.lineCount).toBe(3);
  });

  it("coordinatesConverter is accessible", () => {
    const m = createModel("hello");
    const vm = new ViewModel(m);
    expect(vm.coordinatesConverter).toBeDefined();
    expect(vm.coordinatesConverter.isWordWrap).toBe(false);
  });

  it("tokenizer is initialized", () => {
    const m = createModel("hello");
    const vm = new ViewModel(m);
    expect(vm.tokenizer).toBeDefined();
  });

  it("getLineTokens returns tokens for a line", () => {
    const m = createModel("hello world");
    const vm = new ViewModel(m);
    const tokens = vm.getLineTokens(1);
    expect(tokens).toBeDefined();
  });

  it("dispose cleans up", () => {
    const m = createModel("hello");
    const vm = new ViewModel(m);
    vm.dispose();
    expect(vm.model).toBe(m); // model still exists, view model is gone
  });
});
