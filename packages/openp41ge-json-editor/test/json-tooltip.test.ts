/**
 * json-tooltip tests — path resolution and schema lookup for key tooltips.
 */
import { describe, expect, it } from "vitest";
import {
  pathForLine,
  schemaAtPath,
  schemaDescription,
  schemaDescriptionForPath,
  schemaItemHint,
  schemaTypeLabel,
} from "../src/json-tooltip";
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
                id: { type: "string", description: "Exact model id." },
                thinking: {
                  type: "object",
                  description: "Thinking config.",
                },
              },
            },
          },
        },
      },
    },
  },
};

const TEXT = [
  "{",
  '  "providerId": "vllm",',
  '  "providers": {',
  '    "vllm": {',
  '      "baseUrl": "http://localhost:8000/v1",',
  '      "models": [',
  "        {",
  '          "id": "qwen",',
  '          "thinking": { "high": "1" }',
  "        }",
  "      ]",
  "    }",
  "  }",
  "}",
].join("\n");

describe("pathForLine", () => {
  it("resolves a top-level key to its path", () => {
    const root = parseJson(TEXT).root;
    expect(pathForLine(root, 1)).toEqual(["providerId"]);
  });

  it("resolves a dynamic provider key through the object path", () => {
    const root = parseJson(TEXT).root;
    // line 3 is the 'vllm' member key
    expect(pathForLine(root, 3)).toEqual(["providers", "vllm"]);
  });

  it("resolves nested keys and array indexes", () => {
    const root = parseJson(TEXT).root;
    // line 6 is the array element's own object line; line 7 is its id key
    expect(pathForLine(root, 6)).toEqual(["providers", "vllm", "models", 0]);
    expect(pathForLine(root, 7)).toEqual(["providers", "vllm", "models", 0, "id"]);
    expect(pathForLine(root, 8)).toEqual(["providers", "vllm", "models", 0, "thinking"]);
  });

  it("returns the path when key and value share a line", () => {
    const root = parseJson(TEXT).root;
    // line 4 is the baseUrl key line (key and value on the same line)
    expect(pathForLine(root, 4)).toEqual(["providers", "vllm", "baseUrl"]);
  });

  it("returns null for bare value lines", () => {
    const root = parseJson('{\n  "temperature":\n    0.7\n}\n').root;
    expect(pathForLine(root, 1)).toEqual(["temperature"]);
    expect(pathForLine(root, 2)).toBeNull();
  });
});

describe("schemaAtPath", () => {
  it("resolves a top-level property", () => {
    const s = schemaAtPath(SCHEMA, ["providerId"]);
    expect(schemaDescription(s)).toBe("Active provider id.");
  });

  it("falls back to additionalProperties for dynamic keys", () => {
    const s = schemaAtPath(SCHEMA, ["providers", "vllm", "baseUrl"]);
    expect(schemaDescription(s)).toBe("The endpoint URL.");
  });

  it("resolves array items", () => {
    const s = schemaAtPath(SCHEMA, ["providers", "vllm", "models", 0, "id"]);
    expect(schemaDescription(s)).toBe("Exact model id.");
  });

  it("returns null when the path does not exist", () => {
    expect(schemaAtPath(SCHEMA, ["nope", "x"])).toBeNull();
    expect(schemaAtPath(SCHEMA, ["providers", "vllm", "nope"])).toBeNull();
  });

  it("returns null for a missing description", () => {
    expect(schemaDescription(schemaAtPath(SCHEMA, ["providers"]))).toBeNull();
  });
});

describe("schemaDescriptionForPath", () => {
  it("returns the key's own description when present", () => {
    expect(schemaDescriptionForPath(SCHEMA, ["providerId"])).toBe("Active provider id.");
    expect(schemaDescriptionForPath(SCHEMA, ["providers", "vllm", "baseUrl"])).toBe(
      "The endpoint URL.",
    );
  });

  it("falls back to the nearest ancestor description for a dynamic key", () => {
    // "high" inside `thinking` has no own schema entry → inherits `thinking`.
    expect(
      schemaDescriptionForPath(SCHEMA, ["providers", "vllm", "models", 0, "thinking", "high"]),
    ).toBe("Thinking config.");
  });

  it("returns null when no ancestor has a description", () => {
    expect(
      schemaDescriptionForPath({ type: "object", properties: { nope: { type: "string" } } }, [
        "nope",
      ]),
    ).toBeNull();
  });
});

describe("schemaItemHint / schemaTypeLabel", () => {
  it("describes an array item's keys and types", () => {
    const s = schemaAtPath(SCHEMA, ["providers", "vllm", "models"]);
    expect(schemaItemHint(s)).toBe("Each item: { id: string, thinking: object }");
  });

  it("collapses a string-array item to string[]", () => {
    expect(schemaTypeLabel({ type: "array", items: { type: "string" } })).toBe("string[]");
    expect(schemaTypeLabel({ type: "number" })).toBe("number");
  });

  it("returns null for a non-object item or an array without properties", () => {
    expect(schemaItemHint({ type: "array", items: { type: "string" } })).toBeNull();
    expect(schemaItemHint({ type: "object" })).toBeNull();
    expect(schemaItemHint(null)).toBeNull();
  });
});
