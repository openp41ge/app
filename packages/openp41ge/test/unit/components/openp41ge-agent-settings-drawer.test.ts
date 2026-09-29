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
import { __resetAgentSettingsDraft } from "../../../src/renderer/components/openp41ge-agent-settings-drawer";

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
  defaultModel: "Qwen2.5-Coder-7B-Instruct",
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
  el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
}

describe("openp41ge-agent-settings-drawer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    __resetAgentSettingsDraft();
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
    // Save lives in the drawer head now (next to ✕), and is enabled.
    const save = host.querySelector(".sdw-save");
    expect(save).toBeTruthy();
    save.click();
    await tick();
    expect(surface.configService.sets.length).toBe(1);
    expect(surface.configService.sets[0].value.providers.vllm.baseUrl).toBe("http://x/v1");
    // The host was refreshed with the new config.
    expect(host).toBeTruthy();
  });

  test("the footer sort button reorders keys recursively without saving", async () => {
    const messy = {
      providers: {
        vllm: {
          name: "vLLM",
          baseUrl: "http://x",
          defaultModel: "m",
          models: [{ id: "m", contextWindow: 128000 }],
        },
      },
      providerId: "vllm",
    };
    const { surface } = await mountWith(messy);
    const btn = surface.shadowRoot.querySelector(".agds-footer-btn--icon");
    expect(btn).toBeTruthy();
    btn.click();
    await tick();
    expect(Object.keys(surface._config)).toEqual(["providerId", "providers"]);
    expect(Object.keys(surface._config.providers.vllm)).toEqual([
      "baseUrl",
      "defaultModel",
      "models",
      "name",
    ]);
    expect(Object.keys(surface._config.providers.vllm.models[0])).toEqual(["contextWindow", "id"]);
    // Sort is staging-only — nothing persisted.
    expect(surface.configService.sets.length).toBe(0);
  });

  test("Cmd/Ctrl+S while the JSON editor is focused saves the staged config", async () => {
    const { surface } = await mountWith(AGENT);
    // Stage an unsaved edit.
    fire(baseEditor(surface), "json-editor-change", {
      value: { ...AGENT, providerId: "oai" },
    });
    await tick();
    expect(surface.configService.sets.length).toBe(0);

    // Cmd+S on the json-editor saves it (and suppresses the browser default).
    const ev = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    baseEditor(surface).dispatchEvent(ev);
    await tick();
    expect(ev.defaultPrevented).toBe(true);
    expect(surface.configService.sets.length).toBe(1);
    expect(surface.configService.vals.agent.providerId).toBe("oai");

    // Ctrl+S behaves the same.
    surface.configService.vals.agent.providerId = "vllm";
    fire(baseEditor(surface), "json-editor-change", {
      value: { ...AGENT, providerId: "oai" },
    });
    await tick();
    baseEditor(surface).dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await tick();
    expect(surface.configService.sets.length).toBe(2);
    expect(surface.configService.vals.agent.providerId).toBe("oai");
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
    fire(layerJe, "json-editor-change", { value: { ...VLLM, defaultModel: "new-model" } });
    await tick();
    // Staged into the draft only.
    expect(surface.configService.vals.agent.providers.vllm.defaultModel).toBe(
      "Qwen2.5-Coder-7B-Instruct",
    );
    expect(surface.configService.sets.length).toBe(0);
    // Save persists the staged drafts.
    host.querySelector(".sdw-save").click();
    await tick();
    expect(surface.configService.vals.agent.providers.vllm.defaultModel).toBe("new-model");
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
    host.querySelector(".sdw-save").click();
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

  test("the base footer is a right-aligned full-height Sort button (no text), with Reset+Save in the head by ✕", async () => {
    const { host, surface } = await mountWith(AGENT);
    const footer = surface.shadowRoot.querySelector(".agds-footer");
    expect(footer).toBeTruthy();
    // No left-aligned status text in the bar — only the right-aligned Sort
    // button (full-height square with a left separator, defined in CSS).
    expect(footer.textContent.trim()).toBe("");
    const footerButtons = footer.querySelectorAll("button");
    expect(footerButtons.length).toBe(1);
    const sortBtn = footer.querySelector(".agds-footer-btn--icon");
    expect(sortBtn).toBeTruthy();
    expect(sortBtn?.getAttribute("aria-label")).toBe("Sort keys");
    expect(sortBtn).toBe(footerButtons[0]);
    const sheet = surface.shadowRoot.querySelector("style")?.textContent ?? "";
    expect(sheet).toContain("aspect-ratio: 1 / 1");
    expect(sheet).toContain("border-left: 1px solid var(--border-divider");

    // Head: Reset right-aligned before Save, both next to the ✕ close button.
    const head = host.querySelector(".sdw-head");
    expect(head).toBeTruthy();
    const reset = head?.querySelector(".sdw-reset");
    const save = head?.querySelector(".sdw-save");
    const close = head?.querySelector(".sdw-close");
    expect(reset).toBeTruthy();
    expect(save).toBeTruthy();
    expect(close).toBeTruthy();
    // Reset sits immediately before Save; Save immediately before ✕.
    expect(reset?.compareDocumentPosition(save!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(save?.compareDocumentPosition(close!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No unsaved changes: save not dirty-highlighted, reset disabled.
    expect(save?.classList.contains("sdw-save--dirty")).toBe(false);
    expect((reset as HTMLButtonElement).disabled).toBe(true);
  });

  test("the head Reset discards unsaved edits and restores the saved config", async () => {
    const { host, surface } = await mountWith(AGENT);
    fire(baseEditor(surface), "json-editor-change", {
      value: { ...AGENT, providerId: "oai" },
    });
    await tick();
    const reset = host.querySelector(".sdw-reset");
    expect((reset as HTMLButtonElement).disabled).toBe(false);
    reset.click();
    await tick();
    expect(baseEditor(surface).editedValue).toEqual(AGENT);
    expect(host.querySelector(".sdw-save").classList.contains("sdw-save--dirty")).toBe(false);
  });

  test("the head save button highlights blue when there are unsaved changes", async () => {
    const { host, surface } = await mountWith(AGENT);
    expect(host.querySelector(".sdw-save").classList.contains("sdw-save--dirty")).toBe(false);
    fire(baseEditor(surface), "json-editor-change", {
      value: { ...AGENT, providerId: "oai" },
    });
    await tick();
    expect(host.querySelector(".sdw-save").classList.contains("sdw-save--dirty")).toBe(true);
    // Saving confirms and clears the highlight.
    host.querySelector(".sdw-save").click();
    await tick();
    expect(host.querySelector(".sdw-save").classList.contains("sdw-save--dirty")).toBe(false);
  });

  test("closing the drawer keeps unsaved edits as a draft for the next open", async () => {
    const { host, surface } = await mountWith(AGENT);
    const next = { ...AGENT, providers: { vllm: { ...VLLM, baseUrl: "http://draft/v1" } } };
    fire(baseEditor(surface), "json-editor-change", { value: next });
    await tick();
    expect(surface.configService.sets.length).toBe(0); // staged only, not persisted

    // Close the drawer.
    host.closeAll();
    await host.updateComplete;
    await tick();

    // Re-open a brand-new surface — the draft comes back, still unsaved.
    const surface2 = document.createElement("openp41ge-agent-settings-drawer");
    surface2.configService = new FakeConfig({ agent: AGENT });
    host.openSurface(surface2, "right");
    await host.updateComplete;
    await tick();
    expect(surface2.configService.sets.length).toBe(0);
    expect(baseEditor(surface2).editedValue.providers.vllm.baseUrl).toBe("http://draft/v1");
    expect(host.querySelector(".sdw-save").classList.contains("sdw-save--dirty")).toBe(true);
  });

  test("saving clears the draft so a later open shows the saved state", async () => {
    const { host, surface } = await mountWith(AGENT);
    fire(baseEditor(surface), "json-editor-change", {
      value: { ...AGENT, providerId: "oai" },
    });
    await tick();
    host.querySelector(".sdw-save").click();
    await tick();
    expect(surface.configService.sets.length).toBe(1);

    host.closeAll();
    await host.updateComplete;
    await tick();

    const surface2 = document.createElement("openp41ge-agent-settings-drawer");
    surface2.configService = new FakeConfig({ agent: AGENT });
    host.openSurface(surface2, "right");
    await host.updateComplete;
    await tick();
    // No draft left — the reopened surface loads the saved config clean.
    expect(baseEditor(surface2).editedValue.providerId).toBe(AGENT.providerId);
    expect(host.querySelector(".sdw-save").classList.contains("sdw-save--dirty")).toBe(false);
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
