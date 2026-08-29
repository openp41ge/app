/**
 * Unit tests for LazyTokenizationManager.tokenizeLineIfCached — the render-path-
 * safe accessor added in Phase 3 (async tokenization).
 *
 * Contract: the render loop may never block on TextMate. `tokenizeLineIfCached`
 * must return cached tokens or null WITHOUT invoking the underlying tokenizer,
 * so uncached lines render as plain text and the async catch-up pass highlights
 * them later.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
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

describe("bounded background tokenization window", () => {
  test("background stops at visibleEnd + window and never reaches EOF", () => {
    vi.useFakeTimers();
    try {
      const m = new LazyTokenizationManager({
        batchSize: 50,
        backgroundDelay: 50,
        backgroundWindow: 100,
      });
      m.setLineCount(10000);
      m.setLineContentProvider((l) => `line ${l}`);
      const f = new FakeTokenizer();
      m.setTokenizer(f);
      m.tokenizeVisibleRange(1, 10); // visible 1..10

      // Advance far past what a bounded sweep needs (200 batches = 10k lines).
      for (let i = 0; i < 200; i++) vi.advanceTimersByTime(50);

      expect(m.tokenizeLineIfCached(10)).not.toBeNull(); // visible itself
      expect(m.tokenizeLineIfCached(110)).not.toBeNull(); // 10 + window(100)
      expect(m.tokenizeLineIfCached(111)).toBeNull(); // window satisfied — idle
      expect(f.tokenizeLineCalls).toBeLessThanOrEqual(111); // never crawled the file
    } finally {
      vi.useRealTimers();
    }
  });

  test("fast-forward: a deep scroll resumes background just behind the visible range, not from line 1", () => {
    vi.useFakeTimers();
    try {
      const m = new LazyTokenizationManager({
        batchSize: 50,
        backgroundDelay: 50,
        backgroundWindow: 500,
      });
      m.setLineCount(100000);
      m.setLineContentProvider((l) => `line ${l}`);
      const f = new FakeTokenizer();
      m.setTokenizer(f);
      m.tokenizeVisibleRange(90000, 90050); // deep jump to line 90k

      // The sync pass tokenized only the 51 visible lines.
      expect(f.tokenizeLineCalls).toBe(51);
      // The sweep resumes no earlier than 90000 - window(500) = 89500.
      expect(m["_nextBgLine"]).toBeGreaterThanOrEqual(89500);

      // Drain the sweep: it fills up to visibleEnd + window (90550) and stops.
      for (let i = 0; i < 60; i++) vi.advanceTimersByTime(50);
      expect(m.tokenizeLineIfCached(90550)).not.toBeNull(); // just within window
      expect(m.tokenizeLineIfCached(90551)).toBeNull(); // ceiling reached — idle
      expect(m.tokenizeLineIfCached(100000)).toBeNull(); // far beyond — never walked
      // 51 (visible) + ~1050 (window) — never the ~90k crawl from line 1.
      expect(f.tokenizeLineCalls).toBeLessThan(2000);
    } finally {
      vi.useRealTimers();
    }
  });

  test("backgroundWindow: 0 disables background tokenization", () => {
    vi.useFakeTimers();
    try {
      const m = new LazyTokenizationManager({ backgroundDelay: 50, backgroundWindow: 0 });
      m.setLineCount(10000);
      m.setLineContentProvider((l) => `line ${l}`);
      const f = new FakeTokenizer();
      m.setTokenizer(f);
      m.tokenizeVisibleRange(1, 10);
      for (let i = 0; i < 50; i++) vi.advanceTimersByTime(50);

      expect(f.tokenizeLineCalls).toBe(10); // only the visible range
      expect(m.tokenizeLineIfCached(20)).toBeNull(); // nothing beyond was tokenized
    } finally {
      vi.useRealTimers();
    }
  });
});
