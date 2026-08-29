/**
 * Unit tests for LazyTokenizationManager.tokenizeLineIfCached — the render-path-
 * safe accessor added in Phase 3 (async tokenization).
 *
 * Contract: the render loop may never block on TextMate. `tokenizeLineIfCached`
 * must return cached tokens or null WITHOUT invoking the underlying tokenizer,
 * so uncached lines render as plain text and the async catch-up pass highlights
 * them later.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { LazyTokenizationManager } from "../src/lazy-tokenization-manager";
import type { ITokenizer } from "../src/tokenizer";
import type { ITokenizeLineResult, StateStack } from "../src/tokenizer";

class FakeTokenizer implements ITokenizer {
  readonly languageId = "fake";
  readonly scopeName = "source.fake";
  tokenizeLineCalls = 0;

  tokenizeLine(lineText: string, _prevState: StateStack | null): ITokenizeLineResult {
    this.tokenizeLineCalls++;
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
          scope: "source.fake",
        },
      ],
      ruleStack: null,
    };
  }
}

let manager: LazyTokenizationManager;
let fake: FakeTokenizer;

beforeEach(() => {
  manager = new LazyTokenizationManager(); // default: background batches, NOT immediate
  manager.setLineContentProvider((lineNumber: number) => `line ${lineNumber}`);
  manager.setLineCount(3);
  fake = new FakeTokenizer();
  manager.setTokenizer(fake); // (manager.setTokenizer does NOT auto-tokenize)
});

afterEach(() => {
  manager.dispose();
});

describe("LazyTokenizationManager.tokenizeLineIfCached", () => {
  test("returns null for a line that has never been tokenized, WITHOUT tokenizing", () => {
    const tokens = manager.tokenizeLineIfCached(1);
    expect(tokens).toBeNull();
    // The underlying grammar was never invoked — proving no sync tokenize.
    expect(fake.tokenizeLineCalls).toBe(0);
  });

  test("returns cached tokens after tokenizeLine, without re-tokenizing", () => {
    const first = manager.tokenizeLine(1);
    expect(fake.tokenizeLineCalls).toBe(1);

    const cached = manager.tokenizeLineIfCached(1);
    expect(cached).toEqual(first);
    expect(fake.tokenizeLineCalls).toBe(1); // no second grammar call
  });

  test("returns null for a different un-tokenized line and does not call the grammar", () => {
    manager.tokenizeLine(1);
    expect(manager.tokenizeLineIfCached(2)).toBeNull();
    expect(fake.tokenizeLineCalls).toBe(1);
  });

  test("returns null for out-of-range lines", () => {
    expect(manager.tokenizeLineIfCached(0)).toBeNull();
    expect(manager.tokenizeLineIfCached(999)).toBeNull();
    expect(fake.tokenizeLineCalls).toBe(0);
  });

  test("reflects only the lines produced by tokenizeVisibleRange (sync pass)", () => {
    manager.tokenizeVisibleRange(1, 2);
    expect(manager.tokenizeLineIfCached(1)).not.toBeNull();
    expect(manager.tokenizeLineIfCached(2)).not.toBeNull();
    // Line 3 is outside the synchronous pass; the async catch-up tokenizes it
    // separately, so a cache-only read must still return null here.
    expect(manager.tokenizeLineIfCached(3)).toBeNull();
    expect(fake.tokenizeLineCalls).toBe(2);
  });
});
