/**
 * Unit tests for agent provider presets + pure helpers.
 */

import { describe, expect, it } from "vitest";
import {
  PROVIDER_PRESETS,
  CUSTOM_PRESET_ID,
  customPreset,
  providerPreset,
  nextProviderId,
  applyPreset,
  presetFor,
  providerDisplayName,
  endpointHost,
} from "../../../src/renderer/models/agent-provider-presets";

describe("agent-provider-presets", () => {
  it("exposes a preset list with a Custom option", () => {
    const ids = PROVIDER_PRESETS.map((p) => p.id);
    expect(ids).toContain("openai");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("vllm");
    expect(ids).toContain("ollama");
    expect(ids).toContain("lmstudio");
    expect(ids).toContain("groq");
    expect(ids).toContain("mistral");
    expect(ids).toContain(CUSTOM_PRESET_ID);
  });

  it("looks up a preset by id and falls back to Custom", () => {
    expect(providerPreset("openai")?.baseUrl).toBe("https://api.openai.com/v1");
    expect(providerPreset("nope")).toBeUndefined();
    expect(customPreset().id).toBe(CUSTOM_PRESET_ID);
  });

  it("applyPreset seeds baseUrl, model, and a display name", () => {
    const draft = applyPreset(providerPreset("openai")!);
    expect(draft).toEqual({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      name: "OpenAI",
    });
    // A custom preset yields blank fields.
    const custom = applyPreset(customPreset());
    expect(custom.baseUrl).toBe("");
    expect(custom.model).toBe("");
  });

  it("nextProviderId de-dupes against existing ids", () => {
    expect(nextProviderId([], "openai")).toBe("openai");
    expect(nextProviderId(["openai"], "openai")).toBe("openai-2");
    expect(nextProviderId(["openai", "openai-2"], "openai")).toBe("openai-3");
    // Ensures the base is lowercased and defaults to custom.
    expect(nextProviderId([], "OpenAI")).toBe("openai");
    expect(nextProviderId([], "")).toBe(CUSTOM_PRESET_ID);
  });

  it("presetFor matches a config to its preset by endpoint, else Custom", () => {
    expect(presetFor({ baseUrl: "https://api.openai.com/v1", model: "" }).id).toBe("openai");
    // Trailing slash / case are normalised.
    expect(presetFor({ baseUrl: "HTTPS://API.OPENAI.COM/V1/", model: "" }).id).toBe("openai");
    expect(presetFor({ baseUrl: "http://localhost:8000/v1", model: "" }).id).toBe("vllm");
    // Unrecognised endpoint → Custom.
    expect(presetFor({ baseUrl: "https://example.com/x/v1", model: "" }).id).toBe(CUSTOM_PRESET_ID);
    // Blank endpoint → Custom.
    expect(presetFor({ baseUrl: "", model: "" }).id).toBe(CUSTOM_PRESET_ID);
  });

  it("providerDisplayName prefers an explicit name", () => {
    const config = { baseUrl: "https://api.openai.com/v1", model: "", name: "My Rig" };
    expect(providerDisplayName(providerPreset("openai"), config)).toBe("My Rig");
  });

  it("providerDisplayName falls back to the preset label, then to the host, then a default", () => {
    expect(
      providerDisplayName(providerPreset("openai"), {
        baseUrl: "https://api.openai.com/v1",
        model: "",
      }),
    ).toBe("OpenAI");
    // Custom preset with a host → hostname.
    expect(
      providerDisplayName(customPreset(), { baseUrl: "https://my.example.com/v1", model: "" }),
    ).toBe("my.example.com");
    // Custom preset with no endpoint → generic label.
    expect(providerDisplayName(customPreset(), { baseUrl: "", model: "" })).toBe("Custom provider");
  });

  it("endpointHost returns the host without the scheme/path", () => {
    expect(endpointHost("https://api.openai.com/v1")).toBe("api.openai.com");
    expect(endpointHost("http://localhost:8000/v1")).toBe("localhost:8000");
    expect(endpointHost("")).toBe("");
  });
});
