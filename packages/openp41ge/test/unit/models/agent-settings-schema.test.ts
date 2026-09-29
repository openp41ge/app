/**
 * agent-settings-schema tests — every key the JSON editor can hover must have
 * a tooltip description, so the schema stays in sync with the surface.
 */
import { describe, expect, it } from "vitest";
import { AGENT_SETTINGS_SCHEMA } from "../../../src/renderer/models/agent-settings-schema";
import { GLOBAL_SETTINGS_SCHEMA } from "../../../src/renderer/models/global-settings-schema";
import { schemaAtPath, schemaDescription } from "openp41ge-json-editor";
import type { JsonPath } from "openp41ge-json-editor";

/** Collect every key path `properties.<key>` defines (recursing into nested
 *  properties / items / additionalProperties so dynamic keys are covered). */
function collectKeys(schema: unknown, path: JsonPath = []): JsonPath[] {
  if (!schema || typeof schema !== "object") return [];
  const obj = schema as Record<string, unknown>;
  const out: JsonPath[] = [];
  const props = obj.properties as Record<string, unknown> | undefined;
  if (props) {
    for (const [key, sub] of Object.entries(props)) {
      const p: JsonPath = [...path, key];
      out.push(p);
      out.push(...collectKeys(sub, p));
    }
  }
  const items = obj.items;
  if (items && typeof items === "object") {
    out.push(...collectKeys(items, [...path, 0]));
  }
  const ap = obj.additionalProperties;
  if (ap && typeof ap === "object") {
    out.push(...collectKeys(ap, [...path, "*"]));
  }
  return out;
}

describe("settings schemas", () => {
  it("every agent-settings property has a tooltip description", () => {
    const keys = collectKeys(AGENT_SETTINGS_SCHEMA);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const sub = schemaAtPath(AGENT_SETTINGS_SCHEMA, key);
      expect(schemaDescription(sub), `expected a description for "${key.join(".")}"`).toBeTruthy();
    }
  });

  it("every global-settings property has a tooltip description", () => {
    const keys = collectKeys(GLOBAL_SETTINGS_SCHEMA);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const sub = schemaAtPath(GLOBAL_SETTINGS_SCHEMA, key);
      expect(schemaDescription(sub), `expected a description for "${key.join(".")}"`).toBeTruthy();
    }
  });

  it("describes the provider id mapping and each model field", () => {
    // The key surfaces a user actually hovers.
    expect(schemaDescription(schemaAtPath(AGENT_SETTINGS_SCHEMA, ["providerId"]))).toBeTruthy();
    expect(schemaDescription(schemaAtPath(AGENT_SETTINGS_SCHEMA, ["providers"]))).toBeTruthy();
    expect(
      schemaDescription(
        schemaAtPath(AGENT_SETTINGS_SCHEMA, ["providers", "vllm", "models", 0, "contextWindow"]),
      ),
    ).toBeTruthy();
  });
});
