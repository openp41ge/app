import { describe, expect, it } from "vitest";
import { tokenizeJsonText, highlightJsonToHtml, JSON_SCOPE_CLASS } from "../src/json-highlight";

describe("json-highlight", () => {
  it("classifies keys vs string values", () => {
    const tokens = tokenizeJsonText('"name": "Alice"');
    expect(tokens.map((t) => t.scope)).toEqual(["key", "punct", "plain", "string"]);
    expect(tokens[0].text).toBe('"name"');
    expect(tokens[3].text).toBe('"Alice"');
  });

  it("classifies numbers, literals and punctuation", () => {
    const tokens = tokenizeJsonText('{ "n": 42, "f": true, "x": null }');
    const scopes = tokens.map((t) => t.scope);
    expect(scopes).toContain("number");
    expect(scopes).toContain("literal");
    expect(scopes).toContain("punct");
  });

  it("maps scopes to editor classes", () => {
    expect(JSON_SCOPE_CLASS.key).toBe("s-var");
    expect(JSON_SCOPE_CLASS.string).toBe("s-str");
    expect(JSON_SCOPE_CLASS.number).toBe("s-num");
    expect(JSON_SCOPE_CLASS.literal).toBe("s-kw");
  });

  it("produces an escaping-safe HTML highlight", () => {
    const html = highlightJsonToHtml('"a<b"');
    expect(html).toContain("&lt;");
    expect(html).toContain('class="s-str"');
  });
});
