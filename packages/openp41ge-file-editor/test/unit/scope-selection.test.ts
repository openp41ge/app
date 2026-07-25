/**
 * Unit tests for pickBestScope — the tokenizer's scope selection algorithm.
 *
 * Verifies that the correct scope is chosen from a vscode-textmate scope
 * stack array by skipping structural scopes (source, text, meta.embedded,
 * punctuation.definition.string) while keeping semantic scopes like
 * meta.structure.dictionary.key.json for key vs value distinction.
 */

import { describe, it, expect } from "vitest";
import { pickBestScope } from "openp41ge-syntax-highlighting";

describe("pickBestScope", () => {
  // ── Basic skips ──────────────────────────────────────────────

  it("skips source.* scopes", () => {
    const scopes = ["source.json", "string.quoted.double.json"];
    expect(pickBestScope(scopes)).toBe("string.quoted.double.json");
  });

  it("skips text.* scopes", () => {
    const scopes = ["text.html", "string.quoted.double.html"];
    expect(pickBestScope(scopes)).toBe("string.quoted.double.html");
  });

  it("skips meta.embedded scopes", () => {
    const scopes = [
      "source.json",
      "meta.structure.dictionary.json",
      "string.quoted.double.json",
      "meta.embedded.json",
    ];
    // Should skip meta.embedded.json and return string.quoted.double.json
    expect(pickBestScope(scopes)).toBe("string.quoted.double.json");
  });

  it("skips punctuation.definition.string scopes", () => {
    const scopes = [
      "source.json",
      "meta.structure.dictionary.json",
      "string.quoted.double.json",
      "punctuation.definition.string.begin.json",
    ];
    // Should skip the punctuation scope and return string.quoted.double.json
    expect(pickBestScope(scopes)).toBe("string.quoted.double.json");
  });

  it("skips punctuation.definition.string.end scopes", () => {
    const scopes = [
      "source.json",
      "meta.structure.dictionary.json",
      "string.quoted.double.json",
      "punctuation.definition.string.end.json",
    ];
    expect(pickBestScope(scopes)).toBe("string.quoted.double.json");
  });

  it("skips both meta.embedded and punctuation.definition.string together", () => {
    // Simulates a JSON key: ["source.json", …, "string.quoted.double.json",
    // "meta.structure.dictionary.key.json", "meta.embedded.json"]
    const scopes = [
      "source.json",
      "meta.structure.dictionary.json",
      "string.quoted.double.json",
      "meta.structure.dictionary.key.json",
      "meta.embedded.json",
    ];
    // Should skip meta.embedded, then find meta.structure.dictionary.key.json
    expect(pickBestScope(scopes)).toBe("meta.structure.dictionary.key.json");
  });

  // ── JSON key vs value distinction ────────────────────────────

  it("returns meta.structure.dictionary.key.json for JSON keys", () => {
    // Simulates the scope stack for a JSON key's text content
    const scopes = [
      "source.json",
      "meta.structure.dictionary.json",
      "string.quoted.double.json",
      "meta.structure.dictionary.key.json",
    ];
    expect(pickBestScope(scopes)).toBe("meta.structure.dictionary.key.json");
  });

  it("returns string.quoted.double.json for JSON string values", () => {
    // Simulates the scope stack for a JSON string value (no key scope)
    const scopes = ["source.json", "meta.structure.dictionary.json", "string.quoted.double.json"];
    expect(pickBestScope(scopes)).toBe("string.quoted.double.json");
  });

  it("returns string.quoted.double.json for JSON array items", () => {
    // Array items don't have meta.structure.dictionary.key.json
    const scopes = ["source.json", "meta.structure.array.json", "string.quoted.double.json"];
    expect(pickBestScope(scopes)).toBe("string.quoted.double.json");
  });

  it("differentiates JSON keys from values by scope", () => {
    const keyScopes = [
      "source.json",
      "meta.structure.dictionary.json",
      "string.quoted.double.json",
      "meta.structure.dictionary.key.json",
    ];
    const valueScopes = [
      "source.json",
      "meta.structure.dictionary.json",
      "string.quoted.double.json",
    ];
    const key = pickBestScope(keyScopes);
    const value = pickBestScope(valueScopes);
    expect(key).toBe("meta.structure.dictionary.key.json");
    expect(value).toBe("string.quoted.double.json");
    expect(key).not.toBe(value);
  });

  // ── JSON punctuation scopes ──────────────────────────────────

  it("returns punctuation.separator.dictionary.key-value for JSON colon", () => {
    const scopes = [
      "source.json",
      "meta.structure.dictionary.json",
      "punctuation.separator.dictionary.key-value.json",
    ];
    expect(pickBestScope(scopes)).toBe("punctuation.separator.dictionary.key-value.json");
  });

  it("returns punctuation.definition.dictionary.begin for JSON opening brace", () => {
    const scopes = [
      "source.json",
      "meta.structure.dictionary.json",
      "punctuation.definition.dictionary.begin.json",
    ];
    expect(pickBestScope(scopes)).toBe("punctuation.definition.dictionary.begin.json");
  });

  it("returns punctuation.separator.comma for JSON comma", () => {
    const scopes = [
      "source.json",
      "meta.structure.dictionary.json",
      "punctuation.separator.comma.json",
    ];
    expect(pickBestScope(scopes)).toBe("punctuation.separator.comma.json");
  });

  // ── JSON literal scopes ──────────────────────────────────────

  it("returns constant.language for JSON booleans", () => {
    const scopes = ["source.json", "meta.structure.dictionary.json", "constant.language.json"];
    expect(pickBestScope(scopes)).toBe("constant.language.json");
  });

  it("returns constant.numeric for JSON numbers", () => {
    const scopes = ["source.json", "meta.structure.dictionary.json", "constant.numeric.json"];
    expect(pickBestScope(scopes)).toBe("constant.numeric.json");
  });

  // ── JSON comments ────────────────────────────────────────────

  it("returns comment.line.double-slash.json for JSONC comments", () => {
    const scopes = ["source.json", "comment.line.double-slash.json"];
    expect(pickBestScope(scopes)).toBe("comment.line.double-slash.json");
  });

  it("returns comment.block.json for JSONC block comments", () => {
    const scopes = ["source.json", "comment.block.json"];
    expect(pickBestScope(scopes)).toBe("comment.block.json");
  });

  // ── Fallback behavior ────────────────────────────────────────

  it("falls back to last scope when all are structural", () => {
    // If ALL scopes are structural (source + meta.definition),
    // the last one is returned as fallback
    const scopes = ["source.json"];
    // source.json is skipped, fallback returns last element
    const result = pickBestScope(scopes);
    expect(result).toBe("source.json");
  });

  it("falls back when all scopes are meta.embedded", () => {
    const scopes = ["source.json", "meta.embedded.json"];
    // Both skipped, falls back to last scope
    expect(pickBestScope(scopes)).toBe("meta.embedded.json");
  });

  it("handles empty scope array gracefully", () => {
    // This shouldn't happen in practice, but be defensive
    expect(pickBestScope([])).toBe("");
  });

  // ── Other language scopes ────────────────────────────────────

  it("returns keyword for JS keywords", () => {
    const scopes = ["source.js", "keyword.control.js"];
    expect(pickBestScope(scopes)).toBe("keyword.control.js");
  });

  it("returns entity.name.function for JS function names", () => {
    const scopes = ["source.js", "meta.function.js", "entity.name.function.js"];
    expect(pickBestScope(scopes)).toBe("entity.name.function.js");
  });

  it("skips meta.function for JS function blocks (structural)", () => {
    // meta.function.js is NOT meta.embedded and NOT punctuation.definition.string
    // so it should NOT be skipped. This test verifies that meta.* (non-embedded)
    // scopes like meta.function.js are kept when they're the best available.
    const scopes = ["source.js", "meta.function.js"];
    expect(pickBestScope(scopes)).toBe("meta.function.js");
  });

  it("does NOT skip meta.structure.dictionary.key.json (it's semantic, not structural)", () => {
    // This scope is critical for JSON key vs value distinction
    const scopes = [
      "source.json",
      "meta.structure.dictionary.json",
      "meta.structure.dictionary.key.json",
    ];
    expect(pickBestScope(scopes)).toBe("meta.structure.dictionary.key.json");
  });

  it("handles template expression delimiters (not string delimiters)", () => {
    // punctuation.definition.template-expression should NOT be skipped
    // because it starts with "punctuation.definition.template" not
    // "punctuation.definition.string"
    const scopes = [
      "source.js",
      "string.quoted.template.js",
      "punctuation.definition.template-expression.js",
    ];
    // The scope is NOT punctuation.definition.string.*, so it should be kept
    expect(pickBestScope(scopes)).toBe("punctuation.definition.template-expression.js");
  });

  // ── Inner-to-outer ordering ──────────────────────────────────

  it("picks the innermost non-structural scope", () => {
    // The innermost scopes are at the END of the array
    // Verify that we iterate from the end
    const scopes = [
      "source.json",
      "string.quoted.double.json",
      "meta.structure.dictionary.key.json",
    ];
    // The innermost is meta.structure.dictionary.key.json
    expect(pickBestScope(scopes)).toBe("meta.structure.dictionary.key.json");
  });

  it("walks inward until finding a non-structural scope", () => {
    // If the innermost is structural, skip it and try the next one inward
    const scopes = [
      "source.json",
      "string.quoted.double.json",
      "meta.structure.dictionary.key.json",
      "meta.embedded.json",
    ];
    // meta.embedded.json is skipped, next is meta.structure.dictionary.key.json
    expect(pickBestScope(scopes)).toBe("meta.structure.dictionary.key.json");
  });

  // ── JSDoc @-symbol scopes (must NOT be skipped) ──────────────

  it("keeps punctuation.definition.block.tag (JSDoc block @)", () => {
    // The @ in @param gets this scope; it is NOT punctuation.definition.string.*
    // so pickBestScope should keep it
    const scopes = [
      "source.js",
      "comment.block.documentation.js",
      "punctuation.definition.block.tag.jsdoc",
    ];
    expect(pickBestScope(scopes)).toBe("punctuation.definition.block.tag.jsdoc");
  });

  it("keeps punctuation.definition.inline.tag (JSDoc inline @)", () => {
    // The @ in {@link ...} gets this scope; should NOT be skipped
    const scopes = [
      "source.js",
      "comment.block.documentation.js",
      "punctuation.definition.inline.tag.jsdoc",
    ];
    expect(pickBestScope(scopes)).toBe("punctuation.definition.inline.tag.jsdoc");
  });
});
