/**
 * agent-provider-presets — provider preset definitions and pure helpers for the
 * Agent settings surface.
 *
 * Pure, DOM-free functions so they are trivially unit-testable. The persisted
 * config shape (`agent.providers[].{ baseUrl, model, apiKey?, temperature?,
 * maxTokens?, name? }`) is unchanged by the runtime — `name` is a settings-only
 * display label that the chat runtime ignores.
 */

/** A single provider connection config (settings UI only; runtime ignores `name`). */
export interface ProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  /** Friendly display name; settings-only, ignored by the chat runtime. */
  name?: string;
}

/** The persisted Agent config: the active provider id + the provider table. */
export interface AgentConfig {
  providerId: string;
  providers: Record<string, ProviderConfig>;
}

/** A known provider preset the settings surface can pre-fill. */
export interface ProviderPreset {
  /** Canonical id, used as the default provider-key base (e.g. "openai"). */
  id: string;
  label: string;
  /** Wire protocol family — meaningful once the chat runtime supports more than OpenAI. */
  compatible: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  /** Whether a hosted service needs an API key (local servers usually don't). */
  requiresKey: boolean;
  description?: string;
}

/** The preset id that means "no preset — type everything by hand". */
export const CUSTOM_PRESET_ID = "custom";

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    compatible: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    requiresKey: true,
    description: "GPT-4o family hosted by OpenAI.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    compatible: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-5-sonnet-20241022",
    requiresKey: true,
    description: "Claude models hosted by Anthropic.",
  },
  {
    id: "vllm",
    label: "vLLM (local)",
    compatible: "openai",
    baseUrl: "http://localhost:8000/v1",
    model: "",
    requiresKey: false,
    description: "Self-hosted vLLM server with an OpenAI-compatible API.",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    compatible: "openai",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
    requiresKey: false,
    description: "Local Ollama server exposing an OpenAI-compatible API.",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    compatible: "openai",
    baseUrl: "http://localhost:1234/v1",
    model: "",
    requiresKey: false,
    description: "Local LM Studio server with an OpenAI-compatible API.",
  },
  {
    id: "groq",
    label: "Groq",
    compatible: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.1-70b-versatile",
    requiresKey: true,
    description: "Hosted Groq inference endpoints.",
  },
  {
    id: "mistral",
    label: "Mistral",
    compatible: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    model: "mistral-large-latest",
    requiresKey: true,
    description: "Hosted Mistral endpoints.",
  },
  {
    id: CUSTOM_PRESET_ID,
    label: "Custom",
    compatible: "openai",
    baseUrl: "",
    model: "",
    requiresKey: false,
    description: "Any OpenAI-compatible endpoint you configure by hand.",
  },
];

export function providerPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

export function customPreset(): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === CUSTOM_PRESET_ID)!;
}

/**
 * A unique provider key for `agent.providers`, derived from a base id
 * ("openai", "custom", …). First use keeps the base; collisions get a numeric
 * suffix ("openai", "openai-2", "openai-3").
 */
export function nextProviderId(existingIds: string[], base: string): string {
  const normalized = base.trim().toLowerCase() || CUSTOM_PRESET_ID;
  if (!existingIds.includes(normalized)) return normalized;
  let n = 2;
  while (existingIds.includes(`${normalized}-${n}`)) n++;
  return `${normalized}-${n}`;
}

/** Seed a draft provider config from a preset (baseUrl/model/name). */
export function applyPreset(preset: ProviderPreset): ProviderConfig {
  return {
    baseUrl: preset.baseUrl,
    model: preset.model,
    name: preset.label,
  };
}

/** The preset whose endpoint this config matches, else the Custom preset. */
export function presetFor(config: ProviderConfig): ProviderPreset {
  const base = normalizeUrl(config.baseUrl);
  if (base) {
    const exact = PROVIDER_PRESETS.find(
      (p) => p.id !== CUSTOM_PRESET_ID && normalizeUrl(p.baseUrl) === base,
    );
    if (exact) return exact;
  }
  return customPreset();
}

/** Precedence: explicit name → known preset label → endpoint host → fallback. */
export function providerDisplayName(
  preset: ProviderPreset | undefined,
  config: ProviderConfig,
): string {
  if (config.name?.trim()) return config.name.trim();
  if (preset && preset.id !== CUSTOM_PRESET_ID) return preset.label;
  if (config.baseUrl.trim()) {
    try {
      return new URL(config.baseUrl).hostname || config.baseUrl;
    } catch {
      return config.baseUrl;
    }
  }
  return "Custom provider";
}

/** Shorthand host for a base URL (for row sub-titles). */
export function endpointHost(baseUrl: string): string {
  const url = baseUrl.trim();
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}
