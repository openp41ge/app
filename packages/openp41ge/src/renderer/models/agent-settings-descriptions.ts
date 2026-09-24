/**
 * agent-settings-descriptions — Marks the agent-settings schema's description
 * "file references" to their bundled Markdown content.
 *
 * Schema `description` values may be a local Markdown file reference (a
 * relative `*.md` path). The JSON editor detects those and resolves them
 * through its `resolveResource` hook; this module supplies that hook for the
 * agent settings surface. The files live next to the schema and are inlined at
 * build time via Vite `?raw` imports, so no runtime filesystem access is
 * needed.
 */

import providersMd from "./descriptions/providers.md?raw";
import providerMd from "./descriptions/provider.md?raw";
import modelsMd from "./descriptions/models.md?raw";
import thinkingMd from "./descriptions/thinking.md?raw";

/** Map of relative description-file path → bundled Markdown content. */
export const AGENT_DESCRIPTION_FILES: Record<string, string> = {
  "descriptions/providers.md": providersMd,
  "descriptions/provider.md": providerMd,
  "descriptions/models.md": modelsMd,
  "descriptions/thinking.md": thinkingMd,
};

/** Resolve a description file reference to its bundled Markdown, or null. */
export function resolveAgentDescription(ref: string): string | null {
  return AGENT_DESCRIPTION_FILES[ref] ?? null;
}
