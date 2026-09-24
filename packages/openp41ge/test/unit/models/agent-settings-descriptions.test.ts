/**
 * agent-settings-descriptions — the schema's description strings resolve: every
 * property still carries a description (markdown or a file reference), and any
 * file reference maps to bundled content. Keeps the schema and the resolver in
 * sync so no key's tooltip comes up empty.
 */
import { describe, it, expect } from "vitest";
import { AGENT_SETTINGS_SCHEMA } from "../../../src/renderer/models/agent-settings-schema";
import { resolveAgentDescription } from "../../../src/renderer/models/agent-settings-descriptions";
import { isMarkdownFileRef, renderMarkdown } from "openp41ge-json-editor";

/** Recursively collect every `description` string in a schema object. */
function collectDescriptions(schema: unknown, out: string[] = []): string[] {
  if (schema === null || typeof schema !== "object") return out;
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === "description" && typeof v === "string") out.push(v);
    else if (v && typeof v === "object") collectDescriptions(v, out);
  }
  return out;
}

describe("agent settings descriptions", () => {
  const descriptions = collectDescriptions(AGENT_SETTINGS_SCHEMA);

  it("every property carries a non-empty description", () => {
    expect(descriptions.length).toBeGreaterThan(0);
    for (const d of descriptions) expect(d.trim()).toBeTruthy();
  });

  it("every file reference resolves to bundled markdown", () => {
    const refs = descriptions.filter(isMarkdownFileRef);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const content = resolveAgentDescription(ref);
      expect(content, `expected "${ref}" to resolve`).toBeTruthy();
      expect(content!.trim()).toBeTruthy();
      // Resolved content renders as markdown without throwing.
      expect(() => renderMarkdown(content!)).not.toThrow();
    }
  });

  it("inline descriptions render as markdown without throwing", () => {
    for (const d of descriptions.filter((x) => !isMarkdownFileRef(x))) {
      expect(() => renderMarkdown(d)).not.toThrow();
    }
  });

  it("resolves each bundled file to a code block for at least the thinking doc", () => {
    const thinking = resolveAgentDescription("descriptions/thinking.md");
    expect(thinking).toBeTruthy();
    expect(renderMarkdown(thinking!)).toContain("je-md-code");
  });
});
