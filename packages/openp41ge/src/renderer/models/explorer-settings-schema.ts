/**
 * explorer-settings-schema — JSON Schema describing the Explorer settings the
 * Explorer settings drawer's JSON editor edits
 * (`{ indentSize, prefetchDepth }`, a subset of `UserConfig`).
 *
 * Consumed by the JSON editor for key-hover tooltips and key suggestions.
 */

/** JSON Schema for the Explorer settings object. */
export const EXPLORER_SETTINGS_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "openp41ge://schema/explorer-settings",
  title: "Explorer settings",
  type: "object",
  additionalProperties: false,
  description:
    "Explorer preferences: the indentation unit and how many levels of directory contents the Explorer prefetches per expand.",
  properties: {
    indentSize: {
      type: "number",
      minimum: 4,
      maximum: 48,
      default: 16,
      description:
        "The indentation unit in pixels, used as the base multiple for every Explorer row. Every row is indented by a multiple of this fixed value, so the repo, worktree, and file rows all stay aligned. The whole sidebar re-flows when it changes.",
    },
    prefetchDepth: {
      type: "number",
      minimum: 0,
      maximum: 4,
      default: 2,
      description:
        "How many levels of subfolder contents the Explorer fetches in advance when you expand a folder, so opening the next level is instant instead of another round trip. Higher values use more memory and I/O for large repositories; 0 loads each level only when you open it.",
    },
  },
} as const;

export type ExplorerSettingsSchema = typeof EXPLORER_SETTINGS_SCHEMA;
