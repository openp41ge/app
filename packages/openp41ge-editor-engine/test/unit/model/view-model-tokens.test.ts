/**
 * Unit tests for ViewModel's cache-only token access — Phase 3 async tokenization.
 *
 * getLineTokensIfCached exists so the render loop can draw plain text without
 * ever invoking TextMate synchronously, then highlight the visible range
 * afterwards. ViewModel.setTokenizer auto-tokenizes the top of the file, so the
 * meaningful "not yet tokenized" case is a line BEYOND that initial window.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { PieceTreeTextContentModel } from "../../../src/model/piece-tree-text-content-model";
import { ViewModel } from "../../../src/model/view-model";
import type { ITokenizer } from "openp41ge-syntax-highlighting/tokenizer";
import type { ITokenizeLineResult } from "openp41ge-syntax-highlighting/line-tokens";
import type { StateStack } from "openp41ge-syntax-highlighting/tokenizer";

// 150 lines so lines beyond the auto-tokenized top-100 window exist.
const CONTENT = Array.from({ length: 150 }, (_, i) => `const v${i} = ${i};`).join("\n");

class FakeTokenizer implements ITokenizer {
  readonly languageId = "js";
  readonly scopeName = "source.js";
  tokenizeLineCalls = 0;
  tokenizedLineTexts: string[] = [];

  tokenizeLine(lineText: string, _prevState: StateStack | null): ITokenizeLineResult {
    this.tokenizeLineCalls++;
    this.tokenizedLineTexts.push(lineText);
    return {
      tokens: [
        {
          startIndex: 0,
          endIndex: lineText.length,
          tokenType: 0,
          fontStyle: 0,
          foreground: 1,
          background: 0,
          languageId: 0,
          scope: "source.js",
        },
      ],
      ruleStack: null,
    };
  }
}

let vm: ViewModel;
let fake: FakeTokenizer;

beforeEach(() => {
  const model = new PieceTreeTextContentModel("file:///a.js", CONTENT);
  vm = new ViewModel(model);
  fake = new FakeTokenizer();
});

describe("ViewModel.getLineTokensIfCached", () => {
  test("hasTokenizer is false until a grammar is applied", () => {
    expect(vm.hasTokenizer).toBe(false);
    expect(vm.getLineTokensIfCached(1)).toBeNull();
  });

  test("setting a tokenizer flags hasTokenizer and tokenizes the top of the file", () => {
    vm.setTokenizer(fake);
    expect(vm.hasTokenizer).toBe(true);
    expect(fake.tokenizeLineCalls).toBe(100); // min(100, lineCount)
    expect(vm.getLineTokensIfCached(1)).not.toBeNull();
    expect(vm.getLineTokensIfCached(100)).not.toBeNull();
  });

  test("returns null beyond the tokenized window WITHOUT invoking the grammar", () => {
    vm.setTokenizer(fake); // tokenizes lines 1..100
    const calls = fake.tokenizeLineCalls;
    expect(vm.getLineTokensIfCached(150)).toBeNull();
    // Reading is cache-only: the grammar was NOT asked to tokenize line 150.
    expect(fake.tokenizeLineCalls).toBe(calls);
  });

  test("after tokenizeVisibleRange, the cache-only read returns fresh tokens", () => {
    vm.setTokenizer(fake);
    const before = fake.tokenizeLineCalls;
    vm.tokenizeVisibleRange(140, 150);
    expect(vm.getLineTokensIfCached(140)).not.toBeNull();
    expect(vm.getLineTokensIfCached(150)).not.toBeNull();
    // No additional grammar work happens just by reading cached tokens.
    expect(fake.tokenizeLineCalls).toBeGreaterThan(before);
    expect(vm.getLineTokensIfCached(150)).not.toBeNull();
  });
});
