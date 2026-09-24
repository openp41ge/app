/**
 * global-settings-schema — JSON Schema describing the global editor settings
 * the Manager window's Settings JSON editor edits
 * (`{ appTheme, lineHeight, fontSize }`, a subset of `UserConfig`).
 *
 * Consumed by the JSON editor for key-hover tooltips.
 */

/** JSON Schema for the global editor settings object. */
export const GLOBAL_SETTINGS_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "openp41ge://schema/global-settings",
  title: "Global editor settings",
  type: "object",
  additionalProperties: true,
  description:
    "Global editor appearance preferences: the active theme and the base line height / font size used across every source and settings editor.",
  properties: {
    appTheme: {
      type: "string",
      enum: ["dark", "light"],
      description:
        'The active editor theme: "dark" or "light". Changes are picked up by every editor the next time it renders.',
    },
    lineHeight: {
      type: "number",
      minimum: 14,
      maximum: 100,
      description:
        "Base line height in pixels for every editor. Both source and settings editors read this globally; no per-editor offsets.",
    },
    fontSize: {
      type: "number",
      description:
        "Base editor font size in pixels. Raised/lowered uniformly across editors.",
    },
  },
} as const;

export type GlobalSettingsSchema = typeof GLOBAL_SETTINGS_SCHEMA;
