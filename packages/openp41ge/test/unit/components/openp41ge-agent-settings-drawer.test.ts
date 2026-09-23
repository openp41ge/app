/**
 * Tests for <openp41ge-agent-settings-drawer> — the Agent settings surface for
 * the "negative drawer" host.
 *
 * The surface now renders the smart <json-editor> for the whole agent config in
 * the base pane, and pushes JSON-editor sub-layer drawers for providers/models
 * (via the editor's open-in-drawer buttons). Edits stage into a working draft
 * in memory; nothing is persisted until the user clicks Save or Reset.
 */
// @ts-nocheck
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/renderer/components/openp41ge-settings-drawer-host";
import "../../../src/renderer/components/openp41ge-agent-settings-drawer";

/** Minimal ConfigService fake that captures set() and serves get(). */
class FakeConfig {
  constructor(initial) {
    this.vals = { ...initial };
    this.sets = [];
  }
  get(key) {
    return this.vals.agent;
  }
  async set(key, value) {
    this.sets.push({ key, value });
    this.vals.agent = value;
  }
}

const VLLM = {
  baseUrl: "http://localhost:8000/v1",
  model: "Qwen2.5-Coder-7B-Instruct",
  name: "vLLM (local)",
};
const AGENT = { providerId: "vllm", providers: { vllm: VLLM } };

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

async function mountWith(config) {
  const host = document.createElement("openp41ge-settings-drawer-host");
  Object.defineProperty(host, "clientWidth", { configurable: true, value: 900 });
  document.body.appendChild(host);
  await host.updateComplete;
  const surface = document.createElement("openp41ge-agent-settings-drawer");
  surface.configService = new FakeConfig({ agent: config });
  host.openSurface(surface, "right");
  await host.updateComplete;
  await tick();
  return { host, surface };
}

/** The base pane's json-editor. */
const baseEditor = (surface) => surface.shadowRoot.querySelector("json-editor");

/** Fire the editor's change/open events on an element bound to the host. */
function fire(el, name, detail) {
  el.dispatchEvent(
    new CustomEvent(name, { detail, bubbles: true, composed: true }),
  );
}

describe("openp41ge-agent-settings-drawer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("the base pane renders a json-editor bound to the whole agent config", async () => {
    const { surface } = await mountWith(AGENT);
    const je = baseEditor(surface);
    expect(je).toBeTruthy();
    expect(je.editedValue).toEqual(AGENT);
  });

  test("edits in the base editor stage the config but do not auto-save", async () => {
    const { host, surface } = await mountWith(AGENT);
    const next = {
      ...AGENT,
      providers: { vllm: { ...VLLM, baseUrl: "http://x/v1" } },
    };
    fire(baseEditor(surface), "json-editor-change", { value: next });
    await tick();
    // Staged into the in-memory draft — nothing persisted until Save.
    expect(surface.configService.sets.length).toBe(0);
    // Save is now enabled and persists the whole draft.
    const save = surface.shadowRoot.querySelector(".agds-footer-btn--primary");
    expect(save).toBeTruthy();
    save.click();
    await tick();
    expect(surface.configService.sets.length).toBe(1);
    expect(surface.configService.sets[0].value.providers.vllm.baseUrl).toBe("http://x/v1");
    // The host was refreshed with the new config.
    expect(host).toBeTruthy();
  });

  test("opening a provider sub-object pushes a Provider JSON drawer", async () => {
    const { host, surface } = await mountWith(AGENT);
    fire(baseEditor(surface), "json-editor-open", { path: ["providers", "vllm"] });
    await host.updateComplete;
    await tick();
    const layerEditors = host.querySelectorAll("json-editor");
    expect(layerEditors.length).toBe(1);
    expect(layerEditors[0].editedValue).toEqual(VLLM);
  });

  test("edits within the provider drawer stage the config but do not auto-save", async () => {
    const { host, surface } = await mountWith(AGENT);
    fire(baseEditor(surface), "json-editor-open", { path: ["providers", "vllm"] });
    await host.updateComplete;
    await tick();
    const layerJe = host.querySelector("json-editor");
    fire(layerJe, "json-editor-change", { value: { ...VLLM, model: "new-model" } });
    await tick();
    // Staged into the draft only.
    expect(surface.configService.vals.agent.providers.vllm.model).toBe("Qwen2.5-Coder-7B-Instruct");
    expect(surface.configService.sets.length).toBe(0);
    // Save persists the staged drafts.
    const save = surface.shadowRoot.querySelector(".agds-footer-btn--primary");
    save.click();
    await tick();
    expect(surface.configService.vals.agent.providers.vllm.model).toBe("new-model");
  });

  test("opening a model inside a provider stacks a second Model drawer", async () => {
    const agent = {
      providerId: "vllm",
      providers: {
        vllm: { ...VLLM, models: [{ id: "Qwen2.5-Coder", maxTokens: 2048 }] },
      },
    };
    const { host, surface } = await mountWith(agent);
    fire(baseEditor(surface), "json-editor-open", { path: ["providers", "vllm"] });
    await host.updateComplete;
    await tick();
    const providerJe = host.querySelector("json-editor");
    fire(providerJe, "json-editor-open", { path: ["models", 0] });
    await host.updateComplete;
    await tick();
    expect(host.querySelectorAll("json-editor").length).toBe(2);
    const modelJe = host.querySelectorAll("json-editor")[1];
    expect(modelJe.editedValue).toEqual({ id: "Qwen2.5-Coder", maxTokens: 2048 });
  });

  test("edits within a model drawer stage but do not auto-save", async () => {
    const agent = {
      providerId: "vllm",
      providers: {
        vllm: { ...VLLM, models: [{ id: "Qwen2.5-Coder", maxTokens: 2048 }] },
      },
    };
    const { host, surface } = await mountWith(agent);
    fire(baseEditor(surface), "json-editor-open", { path: ["providers", "vllm"] });
    await host.updateComplete;
    await tick();
    fire(host.querySelector("json-editor"), "json-editor-open", { path: ["models", 0] });
    await host.updateComplete;
    await tick();
    const modelJe = host.querySelectorAll("json-editor")[1];
    fire(modelJe, "json-editor-change", { value: { id: "Qwen2.5-Coder", maxTokens: 4096 } });
    await tick();
    // Staged in the draft only — persisted value unchanged.
    expect(surface.configService.vals.agent.providers.vllm.models[0].maxTokens).toBe(2048);
    expect(surface.configService.sets.length).toBe(0);
    // Save persists the staged drafts.
    surface.shadowRoot.querySelector(".agds-footer-btn--primary").click();
    await tick();
    expect(surface.configService.vals.agent.providers.vllm.models[0].maxTokens).toBe(4096);
  });

  test("the entire base pane is the json-editor (no card chrome)", async () => {
    const { surface } = await mountWith(AGENT);
    const je = surface.shadowRoot.querySelector(".agds-json-pane > json-editor");
    expect(je).toBeTruthy();
    // No leftover settings cards in the base pane.
    expect(surface.shadowRoot.querySelector(".agds-card .agds-card-question")).toBeNull();
    expect(surface.shadowRoot.textContent).not.toContain("Tools");
  });

  test("the base surface has a pinned bottom bar with a Close button", async () => {
    const { surface } = await mountWith(AGENT);
    const footer = surface.shadowRoot.querySelector(".agds-footer");
    expect(footer).toBeTruthy();
    expect(footer.textContent).toContain("Close");
  });

  test("the provider json layer has a bottom bar with a Back button", async () => {
    const { surface, host } = await mountWith(AGENT);
    const baseJe = surface.shadowRoot.querySelector(".agds-json-pane > json-editor");
    expect(baseJe).toBeTruthy();
    baseJe.dispatchEvent(
      new CustomEvent("json-editor-open", {
        detail: { path: ["providers", "vllm"] },
        bubbles: true,
        composed: true,
      }),
    );
    await tick();
    const layerFooter = host.querySelector(".agds-model .agds-footer");
    expect(layerFooter).toBeTruthy();
    expect(layerFooter.textContent).toContain("Back");
  });
});
