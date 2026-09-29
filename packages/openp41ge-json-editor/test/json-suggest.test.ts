/**
 * json-suggest tests — key auto-complete detection and schema suggestion
 * collection (owner-object path resolution, key-position detection, prefix
 * filtering and exclusion of already-present keys).
 */
import { describe, expect, it } from "vitest";
import {
  stringAt,
  ownerPathAt,
  suggestContextAt,
  collectKeySuggestions,
  defaultLiteralForType,
  valueSuggestContextAt,
} from "../src/json-suggest";
import { parseJson } from "../src/json-parse";

const SCHEMA = {
  type: "object",
  properties: {
    providerId: { type: "string", description: "Active provider id." },
    providers: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          baseUrl: { type: "string", description: "The endpoint URL." },
          models: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Model id." },
                input: { type: "array", items: { type: "string" } },
                thinking: { type: "object", additionalProperties: { type: "string" } },
                maxTokens: { type: "number" },
              },
            },
            description: "Available models.",
          },
        },
      },
    },
  },
};

// An object with an empty candidate key line inside `providers.vllm`.
const TEXT = [
  "{",
  '  "providerId": "vllm",',
  '  "providers": {',
  '    "vllm": {',
  '      ""',
  "    }",
  "  }",
  "}",
].join("\n");

describe("stringAt", () => {
  it("finds an empty string when the caret sits between the quotes", () => {
    const open = TEXT.indexOf('""');
    const caret = open + 1; // between the two quotes
    expect(stringAt(TEXT, caret)).toEqual({ open, close: open + 1 });
  });

  it("returns null for a caret outside any string", () => {
    expect(stringAt(TEXT, 0)).toBeNull();
  });

  it("finds a string with typed content (prefix) — caret at the end", () => {
    const line = '  "baseUrl": "ht"';
    const caret = line.length - 1; // just before the closing quote
    const res = stringAt(line, caret);
    expect(res).toEqual({ open: line.indexOf('"ht'), close: line.length - 1 });
    expect(line.slice(res!.open + 1, caret)).toBe("ht");
  });

  it("ignores a quote inside an escaped string", () => {
    const text = '  "k": "a\\"b"';
    // caret inside the value, after the escaped backslash-quote pair.
    const caret = text.indexOf('b"') + 1;
    expect(stringAt(text, caret)).not.toBeNull();
  });
});

describe("ownerPathAt", () => {
  it("resolves the object owning a nested key", () => {
    // Line start of the `""` line (line index 4).
    const lineStart = TEXT.split("\n").slice(0, 4).join("\n").length + 1;
    expect(ownerPathAt(TEXT, lineStart)).toEqual(["providers", "vllm"]);
  });

  it("resolves root for a top-level key", () => {
    // Line start of the `"providerId"` line (line index 1).
    const lineStart = TEXT.split("\n")[0].length + 1;
    expect(ownerPathAt(TEXT, lineStart)).toEqual([]);
  });

  it("returns null for an empty prefix", () => {
    expect(ownerPathAt(TEXT, 0)).toBeNull();
  });

  it("resolves an array-item object to a numeric-index path", () => {
    const text = [
      "{",
      '  "models": [',
      "    {",
      '      "id": "a"',
      "    },",
      "    {",
      '      ""',
      "    }",
      "  ]",
      "}",
    ].join("\n");
    // Line start of the `""` line inside the second model item (index 1).
    const lineStart = text.split("\n").slice(0, 6).join("\n").length + 1;
    expect(ownerPathAt(text, lineStart)).toEqual(["models", 1]);
  });

  it("distinguishes a scalar array element from an object element index", () => {
    const text = [
      "{",
      '  "models": [',
      '    "legacy",',
      "    {",
      '      ""',
      "    }",
      "  ]",
      "}",
    ].join("\n");
    // The string element is index 0, so the object below is index 1.
    const lineStart = text.split("\n").slice(0, 4).join("\n").length + 1;
    expect(ownerPathAt(text, lineStart)).toEqual(["models", 1]);
  });
});

describe("suggestContextAt", () => {
  it("detects an empty key-position string and its owner + prefix", () => {
    const open = TEXT.indexOf('""');
    const context = suggestContextAt(TEXT, open + 1);
    expect(context).toEqual({ ownerPath: ["providers", "vllm"], prefix: "" });
  });

  it("returns null when the caret is inside a value string", () => {
    const text = ["{", '  "providerId": "vllm"', "}"].join("\n");
    // caret inside the value `"vllm"` (a value, not a key position).
    const caret = text.indexOf('"vllm"') + 2;
    expect(suggestContextAt(text, caret)).toBeNull();
  });

  it("returns null when the caret is inside an array (no object keys)", () => {
    const text = ["{", '  "models": [', '    "a"', "  ]", "}"].join("\n");
    const caret = text.indexOf('"a"') + 1;
    expect(suggestContextAt(text, caret)).toBeNull();
  });

  it("detects a key-position string inside an array-item object", () => {
    const text = ["{", '  "models": [', "    {", '      ""', "    }", "  ]", "}"].join("\n");
    const open = text.indexOf('""');
    const context = suggestContextAt(text, open + 1);
    expect(context).toEqual({ ownerPath: ["models", 0], prefix: "" });
  });

  it("captures a typed prefix between the quotes", () => {
    const text = [
      "{",
      '  "providers": {',
      '    "vllm": {',
      '      "mod"',
      "    }",
      "  }",
      "}",
    ].join("\n");
    const caret = text.indexOf('"mod') + 4; // after "mod", before the closing quote
    const context = suggestContextAt(text, caret);
    expect(context?.ownerPath).toEqual(["providers", "vllm"]);
    expect(context?.prefix).toBe("mod");
  });

  it("returns null for a settled member (a key followed by a colon)", () => {
    const text = [
      "{",
      '  "providers": {',
      '    "vllm": {',
      '      "baseUrl": "http://x",',
      '      "models"',
      "    }",
      "  }",
      "}",
    ].join("\n");
    // Caret inside the filled `"baseUrl"` key (both at the start and mid-string)
    // must NOT be treated as a key being typed — it has a `:`+value after it.
    const atStart = text.indexOf('"baseUrl"') + 1;
    expect(suggestContextAt(text, atStart)).toBeNull();
    const atEnd = text.indexOf('"baseUrl"') + '"baseUrl"'.length - 1;
    expect(suggestContextAt(text, atEnd)).toBeNull();
  });
});

describe("collectKeySuggestions", () => {
  const base = { providers: { vllm: { baseUrl: "http://x" } } };

  it("lists schema keys not already present at the object", () => {
    const items = collectKeySuggestions(SCHEMA, ["providers", "vllm"], base, "");
    expect(items.map((i) => i.key)).toEqual(["models"]);
  });

  it("excludes keys already set even when a prefix matches them", () => {
    const items = collectKeySuggestions(SCHEMA, ["providers", "vllm"], base, "base");
    expect(items).toEqual([]);
  });

  it("filters by the typed prefix (case-insensitive)", () => {
    const items = collectKeySuggestions(SCHEMA, ["providers", "vllm"], {}, "MOD");
    expect(items.map((i) => i.key)).toEqual(["models"]);
  });

  it("returns nothing for an array owner path", () => {
    expect(collectKeySuggestions(SCHEMA, ["providers", "vllm", "models"], base, "")).toEqual([]);
  });

  it("lists an array item's schema keys at a numeric element path", () => {
    const parsed = parseJson(
      JSON.stringify({ providers: { vllm: { models: [{ id: "a" }] } } }),
    ).value;
    const items = collectKeySuggestions(SCHEMA, ["providers", "vllm", "models", 0], parsed, "");
    expect(items.map((i) => i.key)).toEqual(["input", "thinking", "maxTokens"]);
    expect(items.find((i) => i.key === "input")?.type).toBe("array");
  });

  it("returns top-level properties for the root path", () => {
    const parsed = parseJson(JSON.stringify({ providerId: "vllm" })).value;
    const items = collectKeySuggestions(SCHEMA, [], parsed, "");
    expect(items.map((i) => i.key)).toEqual(["providers"]);
  });

  it("attaches the property description for the side tooltip", () => {
    const items = collectKeySuggestions(SCHEMA, ["providers", "vllm"], {}, "");
    const models = items.find((i) => i.key === "models");
    expect(models?.description).toBe("Available models.");
  });

  it("attaches the property type (normalized) for pre-population", () => {
    const items = collectKeySuggestions(SCHEMA, ["providers", "vllm"], {}, "");
    const models = items.find((i) => i.key === "models");
    expect(models?.type).toBe("array");
    const multi = collectKeySuggestions(
      { type: "object", properties: { a: { type: ["string", "null"] }, b: { type: "boolean" } } },
      [],
      {},
      "",
    );
    expect(multi.find((i) => i.key === "a")?.type).toBe("string");
    expect(multi.find((i) => i.key === "b")?.type).toBe("boolean");
  });

  it('offers a single "new key" option inside a free-form map on an empty prefix', () => {
    const parsed = parseJson(JSON.stringify({ providers: { vllm: { models: [{}] } } })).value;
    const items = collectKeySuggestions(
      SCHEMA,
      ["providers", "vllm", "models", 0, "thinking"],
      parsed,
      "",
    );
    expect(items).toEqual([
      { key: "", label: "new key", description: "Add a new key (any name).", type: "string" },
    ]);
  });

  it("returns nothing for a free-form map once a prefix has been typed", () => {
    const parsed = parseJson(JSON.stringify({ providers: { vllm: { models: [{}] } } })).value;
    expect(
      collectKeySuggestions(SCHEMA, ["providers", "vllm", "models", 0, "thinking"], parsed, "h"),
    ).toEqual([]);
  });

  it("uses the additionalProperties value type for the new-key default", () => {
    const items = collectKeySuggestions(
      { type: "object", additionalProperties: { type: "number" } },
      [],
      {},
      "",
    );
    expect(items[0]?.type).toBe("number");
  });
});

describe("defaultLiteralForType", () => {
  it("pre-populates an empty string for string/unknown types", () => {
    expect(defaultLiteralForType("string")).toEqual({ value: '""', inside: true });
    expect(defaultLiteralForType(undefined)).toEqual({ value: '""', inside: true });
  });

  it("uses a zero for numbers and false for booleans (caret after)", () => {
    expect(defaultLiteralForType("number")).toEqual({ value: "0", inside: false });
    expect(defaultLiteralForType("integer")).toEqual({ value: "0", inside: false });
    expect(defaultLiteralForType("boolean")).toEqual({ value: "false", inside: false });
    expect(defaultLiteralForType("null")).toEqual({ value: "null", inside: false });
  });

  it("pre-populates braces/brackets and parks the caret inside", () => {
    expect(defaultLiteralForType("object")).toEqual({ value: "{}", inside: true });
    expect(defaultLiteralForType("array")).toEqual({ value: "[]", inside: true });
  });
});

describe("valueSuggestContextAt", () => {
  const SCHEMA = {
    type: "object",
    properties: {
      updateChannel: {
        type: "string",
        enum: ["latest", "alpha", "beta", "rc"],
        description: "The update channel.",
      },
      appTheme: { type: "string", enum: ["dark", "light"] },
      name: { type: "string" },
      nested: {
        type: "object",
        properties: { channel: { type: "string", enum: ["a", "b"] } },
      },
    },
  };

  const TEXT = [
    "{",
    '  "updateChannel": "latest",',
    '  "appTheme": "dark",',
    '  "name": "abc",',
    '  "nested": {',
    '    "channel": "a"',
    "  }",
    "}",
  ].join("\n");

  it("returns null for the caret in a non-enum string value", () => {
    const open = TEXT.indexOf('"abc"');
    expect(valueSuggestContextAt(SCHEMA, TEXT, open + 1, false)).toBeNull();
  });

  it("returns the enum values for a caret inside an enum value string", () => {
    const open = TEXT.indexOf('"latest"');
    const ctx = valueSuggestContextAt(SCHEMA, TEXT, open + 1, false);
    expect(ctx).not.toBeNull();
    expect(ctx!.path).toEqual(["updateChannel"]);
    expect(ctx!.values).toEqual(["latest", "alpha", "beta", "rc"]);
    expect(ctx!.content).toBe("latest");
  });

  it("filters the offered values by the typed prefix", () => {
    const open = TEXT.indexOf('"latest"');
    // Caret inside the value after typing "la".
    const ctx = valueSuggestContextAt(SCHEMA, TEXT, open + 3, false);
    expect(ctx!.values).toEqual(["latest"]);
  });

  it("offers every value when the whole token is selected (click-to-select)", () => {
    const open = TEXT.indexOf('"latest"');
    const ctx = valueSuggestContextAt(SCHEMA, TEXT, open + 1, true);
    expect(ctx!.values).toEqual(["latest", "alpha", "beta", "rc"]);
  });

  it("resolves a nested enum value path", () => {
    const open = TEXT.indexOf('"a"');
    const ctx = valueSuggestContextAt(SCHEMA, TEXT, open + 1, false);
    expect(ctx!.path).toEqual(["nested", "channel"]);
    expect(ctx!.values).toEqual(["a", "b"]);
  });

  it("returns null when the caret is in a key string", () => {
    const open = TEXT.indexOf('"updateChannel"');
    expect(valueSuggestContextAt(SCHEMA, TEXT, open + 1, false)).toBeNull();
  });

  it("returns null for an array element value (no key)", () => {
    const text = '{ "items": ["x", "y"] }';
    const schema = { type: "object", properties: { items: { type: "array", items: { type: "string", enum: ["x", "y"] } } } };
    const open = text.indexOf('"x"');
    expect(valueSuggestContextAt(schema, text, open + 1, false)).toBeNull();
  });
});
