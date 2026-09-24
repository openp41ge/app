/**
 * agent-settings-schema — JSON Schema describing the Agent settings config
 * (the `UserConfig.agent` object the Agent settings drawer edits).
 *
 * The JSON editor consumes this to show a tooltip on each key on hover. The
 * tooltip text is the schema property's `description`, rendered as **Markdown**
 * (headings, lists, inline code, and fenced code blocks with syntax
 * highlighting). A description that is a local Markdown file reference (a
 * relative `*.md` path, e.g. `descriptions/thinking.md`) is resolved through
 * the editor's `resolveResource` hook to the bundled file content — see
 * `agent-settings-descriptions.ts`. Keeping the schema next to the config
 * types means the surface and the documentation stay in sync.
 *
 * NOTE: this is the *real* persisted shape — including the per-model fields
 * (`input`, `thinking`, `maxTokens`, `contextWindow`) that the settings editor
 * persists and the chat composer reads, even though the main process's
 * `ChatProviderConfig` only models a subset (`baseUrl`, `defaultModel`,
 * `apiKey`, `temperature`, `maxTokens`). `additionalProperties` is left open
 * for all levels so hand-added keys are never flagged.
 */

/** JSON Schema for `UserConfig.agent`. */
export const AGENT_SETTINGS_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "openp41ge://schema/agent-settings",
  title: "Agent settings",
  type: "object",
  additionalProperties: true,
  description:
    "Agent connection settings: which chat provider is active and the table of providers (endpoints, models, generation options).",
  properties: {
    providerId: {
      type: "string",
      description:
        "The **active** provider id. Must match a key in `providers`. Chat requests that don't pin a provider use this one.",
    },
    providers: {
      type: "object",
      description: "descriptions/providers.md",
      additionalProperties: {
        type: "object",
        description: "descriptions/provider.md",
        additionalProperties: true,
        properties: {
          baseUrl: {
            type: "string",
            description:
              "The OpenAI-compatible endpoint URL, e.g. `https://api.example.com/v1`. The runtime appends `/chat/completions` and `/models`.",
          },
          defaultModel: {
            type: "string",
            description:
              "The **default** model id used when a chat doesn't pick one explicitly. Distinct from `models`, the list of available models.",
          },
          apiKey: {
            type: "string",
            description:
              "Bearer **API key** for hosted services. Local servers usually don't need one.",
          },
          temperature: {
            type: "number",
            description:
              "Sampling randomness (0–2). Optional; the server default is used when unset.",
          },
          maxTokens: {
            type: "number",
            description:
              "Max output tokens per completion. Optional; the server default is used when unset.",
          },
          name: {
            type: "string",
            description:
              "Friendly **display name** for the settings UI only. The chat runtime ignores it.",
          },
          models: {
            type: "array",
            description: "descriptions/models.md",
            items: {
              type: "object",
              additionalProperties: true,
              properties: {
                id: {
                  type: "string",
                  description: "The **exact model id** used when requesting chat completions.",
                },
                input: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "A list of strings describing the model's accepted input (e.g. modalities). Settings-only for now.",
                },
                thinking: {
                  type: "object",
                  // Values are sent verbatim as the provider's reasoning_effort;
                  // `null` means off (field omitted).
                  additionalProperties: { type: ["string", "null"] },
                  description: "descriptions/thinking.md",
                },
                maxTokens: {
                  type: "number",
                  description: "Max output tokens for this model. Optional.",
                },
                contextWindow: {
                  type: "number",
                  description: "Context window size in tokens. Shown in the composer; optional.",
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export type AgentSettingsSchema = typeof AGENT_SETTINGS_SCHEMA;
