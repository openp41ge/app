// @ts-nocheck
/**
 * Tests for the structure-aware helpers that power the editor: the JSON parser
 * (with source positions), fold-range / entry-lookup analysis, and the
 * offset-tracking tokenizer + click-to-select ranges.
 */
import { describe, test, expect } from "vitest";
import { parseJson } from "../src/json-parse";
import { computeFoldRanges, findEntryAtLine } from "../src/json-analyze";
import { tokenizeJsonFull, selectableRanges } from "../src/json-tokenize";

describe("parseJson", () => {
  test("parses a valid document with positions", () => {
    const text = '{\n  "a": 1,\n  "b": [1,2],\n  "c": {"x":"y"}\n}';
    const r = parseJson(text);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: 1, b: [1, 2], c: { x: "y" } });
    expect(r.root.members[1].key).toBe("b");
    expect(r.root.members[1].value.type).toBe("array");
    expect(r.root.line).toBe(0);
    expect(r.root.endLine).toBe(4);
  });

  test("reports the offending line for a missing comma", () => {
    const r = parseJson('{\n "a": 1\n "b": 2\n}');
    expect(r.ok).toBe(false);
    expect(r.error.line).toBe(2);
  });

  test("reports trailing commas and unterminated structures", () => {
    expect(parseJson('{"a":1,}').ok).toBe(false);
    expect(parseJson('{"a":1').ok).toBe(false);
    expect(parseJson("").ok).toBe(false);
  });

  test("handles numbers, booleans, null and escapes", () => {
    expect(
      parseJson('{"n": -1.5e3, "t": true, "f": false, "z": null, "s": "a\\"b"}').value,
    ).toEqual({
      n: -1500,
      t: true,
      f: false,
      z: null,
      s: 'a"b',
    });
  });
});

describe("computeFoldRanges", () => {
  test("matches braces / brackets and ignores strings", () => {
    const text = '{\n  "a": 1,\n  "b": {\n    "x": 1\n  },\n  "c": [1,2]\n}';
    const folds = computeFoldRanges(text);
    expect(folds).toEqual([
      { openLine: 0, closeLine: 6, kind: "object" },
      { openLine: 2, closeLine: 4, kind: "object" },
    ]);
  });

  test("ignores brackets inside strings", () => {
    const text = '{"s": "{ not a brace }", "a": [1]}';
    const folds = computeFoldRanges(text);
    expect(folds).toEqual(
      [
        { openLine: 0, closeLine: 0, kind: "object" },
        { openLine: 0, closeLine: 0, kind: "array" },
      ].filter((f) => f.closeLine > f.openLine),
    );
    expect(folds.length).toBe(0);
  });
});

describe("findEntryAtLine", () => {
  const text = '{\n  "a": 1,\n  "b": {\n    "x": 1\n  },\n  "c": [1,2]\n}';
  const { root } = parseJson(text);

  test("finds a primitive member by its line", () => {
    const m = findEntryAtLine(root, 1);
    expect(m.member.key).toBe("a");
    expect(m.line).toBe(1);
  });

  test("an object's opening line maps to the whole member (subtree delete)", () => {
    const m = findEntryAtLine(root, 2);
    expect(m.member.key).toBe("b");
    expect(m.node.type).toBe("object");
    expect(m.node.endLine).toBe(4);
  });

  test("finds nested members by line", () => {
    const m = findEntryAtLine(root, 3);
    expect(m.member.key).toBe("x");
  });
});

describe("tokenizeJsonFull", () => {
  test("emits tokens with offsets", () => {
    const tokens = tokenizeJsonFull('{ "a": 1 }');
    expect(tokens.find((t) => t.value === '"a"').start).toBe(2);
    expect(tokens.find((t) => t.value === "1").start).toBe(7);
  });
});

describe("selectableRanges", () => {
  const tokens = tokenizeJsonFull('{\n  "a": 1,\n  "b": "hi"\n}');

  test("keys and string values select their inner text, literals their whole token", () => {
    expect(selectableRanges(tokens)).toEqual([
      { kind: "key", start: 5, end: 6 },
      { kind: "value", start: 9, end: 10 },
      { kind: "key", start: 15, end: 16 },
      { kind: "value", start: 20, end: 22 },
    ]);
  });
});
