/**
 * Tests for <openp41ge-agent-settings>.
 *
 * The surface renders the smart <json-editor> for the whole agent config (base
 * card), which drives the provider/model JSON sub-drawers, plus the default
 * provider selector.
 */
// @ts-nocheck
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/renderer/components/openp41ge-agent-settings";

/** Minimal ConfigService fake that captures set() and serves get(). */
class FakeConfig {
  constructor(initial) {
    this.vals = { ...initial };
    this.sets = [];
  }
  get(key) {
    const keys = key.split(".");
    let obj = this.vals;
    for (const k of keys) {
      if (obj === null || obj === undefined) return undefined;
      if (typeof obj === "object" && k in obj) obj = obj[k];
      else return undefined;
    }
    return obj;
  }
  async set(key, value) {
    this.sets.push({ key, value });
    const keys = key.split(".");
    let obj = this.vals;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
  }
}

const VLLM = {
  baseUrl: "http://localhost:8000/v1",
  defaultModel: "Qwen2.5-Coder-7B-Instruct",
  name: "vLLM (local)",
};
const AGENT = (providers = { vllm: VLLM }, providerId = "vllm") => ({ providerId, providers });

async function mount(agent) {
  const el = document.createElement("openp41ge-agent-settings");
  el.configService = new FakeConfig(agent === undefined ? {} : { agent });
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 10));
  return el;
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe("openp41ge-agent-settings — smart JSON view", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("the whole pane is the json-editor, with no card chrome", async () => {
    const el = await mount(AGENT());
    expect(el.shadowRoot.querySelector(".ags-json-pane > json-editor")).toBeTruthy();
    expect(el.shadowRoot.querySelector(".ags-default-card")).toBeNull();
    expect(el.shadowRoot.textContent).not.toContain("Tools");
  });

  test("a pinned bottom bar sits under the json editor", async () => {
    const el = await mount(AGENT());
    expect(el.shadowRoot.querySelector(".ags-bottombar")).toBeTruthy();
    expect(el.shadowRoot.querySelector(".ags-bottombar").textContent).toContain("saved");
  });

  test("the sort button reorders object keys recursively without breaking JSON", async () => {
    const el = await mount({
      providers: {
        vllm: {
          name: "vLLM",
          baseUrl: "http://localhost:8000/v1",
          defaultModel: "Qwen",
          models: [{ id: "Qwen", contextWindow: 128000 }],
        },
      },
      providerId: "vllm",
    });
    const btn = el.shadowRoot.querySelector(".ags-footer-btn--icon");
    expect(btn).toBeTruthy();
    btn.click();
    await tick();
    expect(Object.keys(el._config)).toEqual(["providerId", "providers"]);
    expect(Object.keys(el._config.providers.vllm)).toEqual([
      "baseUrl",
      "defaultModel",
      "models",
      "name",
    ]);
    expect(Object.keys(el._config.providers.vllm.models[0])).toEqual(["contextWindow", "id"]);
    // Staged in-memory only — sorting is not a save.
    expect(el.configService.sets.length).toBe(0);
  });

  test("Cmd/Ctrl+S while the JSON editor is focused saves the staged config", async () => {
    const el = await mount(AGENT());
    const je = el.shadowRoot.querySelector(".ags-json-pane > json-editor");
    expect(je).toBeTruthy();
    // Stage an unsaved edit.
    je.dispatchEvent(
      new CustomEvent("json-editor-change", {
        detail: { value: { ...AGENT(), providerId: "oai" } },
        bubbles: true,
      }),
    );
    await tick();
    expect(el.configService.sets.length).toBe(0);

    // Cmd+S on the json-editor saves it (and suppresses the browser default).
    const ev = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    je.dispatchEvent(ev);
    await tick();
    expect(ev.defaultPrevented).toBe(true);
    expect(el.configService.sets.length).toBe(1);
    expect(el.configService.vals.agent.providerId).toBe("oai");
  });

  test("renders a <json-editor> bound to the whole config", async () => {
    const el = await mount(AGENT());
    const je = el.shadowRoot.querySelector("json-editor");
    expect(je).toBeTruthy();
    expect(je.editedValue).toEqual(AGENT());
  });

  test("editing the base json-editor stages but does not auto-save", async () => {
    const el = await mount(AGENT());
    const je = el.shadowRoot.querySelector("json-editor");
    const next = { ...AGENT(), providers: { vllm: { ...VLLM, baseUrl: "http://x/v1" } } };
    je.dispatchEvent(
      new CustomEvent("json-editor-change", {
        detail: { value: next },
        bubbles: true,
        composed: true,
      }),
    );
    await tick();
    // Staged in the in-memory draft only.
    expect(el.configService.sets.length).toBe(0);
    // Save persists the drafted config.
    const save = el.shadowRoot.querySelector(".ags-footer-btn--primary");
    expect(save).toBeTruthy();
    save.click();
    await tick();
    expect(el.configService.sets.length).toBe(1);
    expect(el.configService.sets[0].value.providers.vllm.baseUrl).toBe("http://x/v1");
  });

  test("opening a provider sub-object stacks a json drawer locked to it", async () => {
    const el = await mount(AGENT());
    const je = el.shadowRoot.querySelector("json-editor");
    je.dispatchEvent(
      new CustomEvent("json-editor-open", {
        detail: { path: ["providers", "vllm"] },
        bubbles: true,
        composed: true,
      }),
    );
    await tick();
    const drawerJe = el.shadowRoot.querySelector(".drawer json-editor");
    expect(drawerJe).toBeTruthy();
    expect(drawerJe.editedValue).toEqual(VLLM);
  });

  test("editing within a json drawer stages but does not auto-save", async () => {
    const el = await mount(AGENT());
    el.shadowRoot.querySelector("json-editor").dispatchEvent(
      new CustomEvent("json-editor-open", {
        detail: { path: ["providers", "vllm"] },
        bubbles: true,
        composed: true,
      }),
    );
    await tick();
    const drawerJe = el.shadowRoot.querySelector(".drawer json-editor");
    drawerJe.dispatchEvent(
      new CustomEvent("json-editor-change", {
        detail: { value: { ...VLLM, defaultModel: "new-model" } },
        bubbles: true,
        composed: true,
      }),
    );
    await tick();
    // Staged in memory only — the persisted value is unchanged.
    expect(el.configService.vals.agent.providers.vllm.defaultModel).toBe(
      "Qwen2.5-Coder-7B-Instruct",
    );
    expect(el.configService.sets.length).toBe(0);
    // Save persists the drafted config.
    el.shadowRoot.querySelector(".ags-footer-btn--primary").click();
    await tick();
    expect(el.configService.vals.agent.providers.vllm.defaultModel).toBe("new-model");
  });

  test("opening a nested sub-object stacks a second json drawer", async () => {
    const agent = {
      providerId: "vllm",
      providers: {
        vllm: {
          ...VLLM,
          models: [{ id: "Qwen2.5-Coder", maxTokens: 2048 }],
        },
      },
    };
    const el = await mount(agent);
    el.shadowRoot.querySelector("json-editor").dispatchEvent(
      new CustomEvent("json-editor-open", {
        detail: { path: ["providers", "vllm"] },
        bubbles: true,
        composed: true,
      }),
    );
    await tick();
    const drawerJe = el.shadowRoot.querySelector(".drawer json-editor");
    expect(drawerJe).toBeTruthy();
    drawerJe.dispatchEvent(
      new CustomEvent("json-editor-open", {
        detail: { path: ["models", 0] },
        bubbles: true,
        composed: true,
      }),
    );
    await tick();
    const drawers = el.shadowRoot.querySelectorAll(".drawer");
    expect(drawers.length).toBe(2);
    const nestedJe = el.shadowRoot.querySelectorAll(".drawer json-editor")[1];
    expect(nestedJe.editedValue).toEqual({ id: "Qwen2.5-Coder", maxTokens: 2048 });
  });
});
