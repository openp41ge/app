/**
 * Tests for <openp41ge-agent-settings>.
 *
 * Verifies the Providers card, the slide-in provider drawer, preset pickers,
 * add/edit/delete flows, and the default-provider select.
 */
// @ts-nocheck
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import "../../../src/renderer/components/openp41ge-agent-settings";
import { PROVIDER_PRESETS } from "../../../src/renderer/models/agent-provider-presets";

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
  model: "Qwen2.5-Coder-7B-Instruct",
  name: "vLLM (local)",
};
const OPENAI = { baseUrl: "https://api.openai.com/v1", model: "gpt-4o", name: "OpenAI" };
const AGENT = (providers = { vllm: VLLM }, providerId = "vllm") => ({ providerId, providers });

async function mount(agent) {
  const el = document.createElement("openp41ge-agent-settings");
  el.configService = new FakeConfig(agent === undefined ? {} : { agent });
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 10));
  return el;
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/** Wait for a closing drawer to be removed from the DOM. */
const settleClose = () => tick(300);

function q(el, sel) {
  return el.shadowRoot.querySelector(sel);
}
function qa(el, sel) {
  return [...el.shadowRoot.querySelectorAll(sel)];
}

describe("openp41ge-agent-settings", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    delete (window as any).openp41ge;
  });

  test("renders the Providers card and lists the default vLLM provider", async () => {
    const el = await mount(AGENT());
    expect(q(el, ".ags-card")).not.toBeNull();
    expect(q(el, ".ags-card-question").textContent).toContain(
      "Which providers should be available for agents?",
    );
    const row = qa(el, ".ags-provider-row")[0];
    expect(row.querySelector(".ags-provider-name").textContent).toBe("vLLM (local)");
    expect(row.querySelector(".ags-provider-meta").textContent).toContain(
      "Qwen2.5-Coder-7B-Instruct",
    );
    // No per-row selection control; the default is chosen with the second card.
    expect(row.querySelector(".ags-provider-radio")).toBeNull();
    expect(q(el, ".ags-default-trigger .ags-default-row-name").textContent.trim()).toBe(
      "vLLM (local)",
    );
  });

  test("empty provider list shows no rows and a prominent add row", async () => {
    const el = await mount(AGENT({}, ""));
    expect(q(el, ".ags-empty")).not.toBeNull();
    expect(qa(el, ".ags-provider-info")).toHaveLength(0);
    expect(q(el, ".ags-add-row").textContent).toContain("Add another provider");
  });

  test("clicking Add another provider opens a drawer with a preset selection card", async () => {
    const el = await mount(AGENT({}, ""));
    q(el, ".ags-add-row").click();
    await tick();
    expect(qa(el, ".drawer:not(.drawer--closing)")).toHaveLength(1);
    expect(q(el, ".drawer-title").textContent).toBe("New provider");
    // The preset card is a closed selection trigger, not a radio grid.
    expect(q(el, ".drawer .ags-default-trigger .ags-default-row-name").textContent.trim()).toBe(
      "Custom",
    );
    // Opening it lists every preset as a selectable row.
    q(el, ".drawer .ags-default-trigger").click();
    await tick();
    expect(qa(el, ".drawer .ags-default-row")).toHaveLength(PROVIDER_PRESETS.length);
  });

  test("selecting a preset pre-fills baseUrl and model", async () => {
    const el = await mount(AGENT({}, ""));
    q(el, ".ags-add-row").click();
    await tick();
    q(el, ".drawer .ags-default-trigger").click();
    await tick();
    const openaiRow = qa(el, ".drawer .ags-default-row").find((o) =>
      o.querySelector(".ags-default-row-name").textContent.includes("OpenAI"),
    );
    openaiRow.click();
    await tick();
    expect(q(el, ".drawer .ags-baseurl-input").value).toBe("https://api.openai.com/v1");
    // The default-model card shows the preset's default model.
    expect(
      q(
        el,
        ".drawer .ags-default-model-card .ags-default-trigger .ags-default-row-name",
      ).textContent.trim(),
    ).toBe("gpt-4o");
  });

  test("Save adds a new provider, persists agent, and keeps the drawer open", async () => {
    const el = await mount(AGENT({}, ""));
    q(el, ".ags-add-row").click();
    await tick();
    q(el, ".drawer .ags-default-trigger").click();
    await tick();
    const openaiRow = qa(el, ".drawer .ags-default-row").find((o) =>
      o.querySelector(".ags-default-row-name").textContent.includes("OpenAI"),
    );
    openaiRow.click();
    await tick();
    qa(el, ".drawer .dw-save").pop().click();
    await tick();

    const lastSet = el.configService.sets[el.configService.sets.length - 1];
    expect(lastSet.key).toBe("agent");
    expect(lastSet.value.providers.openai).toBeDefined();
    expect(lastSet.value.providerId).toBe("openai");
    // The drawer stays open after saving.
    expect(qa(el, ".drawer:not(.drawer--closing)")).toHaveLength(1);
    // The provider list behind it shows the new provider.
    const names = qa(el, ".ags-provider-name").map((n) => n.textContent);
    expect(names).toContain("OpenAI");
    // Saving again rebinds to the same provider id rather than re-creating it.
    qa(el, ".drawer .dw-save").pop().click();
    await tick();
    const secondSet = el.configService.sets[el.configService.sets.length - 1];
    expect(Object.keys(secondSet.value.providers)).toEqual(["openai"]);
  });

  test("editing a provider's models persists the added/detected models", async () => {
    const el = await mount(AGENT({ vllm: VLLM, openai: OPENAI }));
    // Open the OpenAI row.
    const row = qa(el, ".ags-provider-row")[1];
    row.click();
    await tick();
    // Add a model via the model drawer.
    q(el, ".drawer .ags-add-row").click();
    await tick();
    const idInput = q(el, ".drawer .ags-model-id-input");
    idInput.value = "gpt-4o-mini";
    idInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    qa(el, ".drawer .dw-save").pop().click();
    await tick();
    await settleClose();
    // Adding a model does NOT change the default — the preset default stays.
    expect(
      q(
        el,
        ".drawer .ags-default-model-card .ags-default-trigger .ags-default-row-name",
      ).textContent.trim(),
    ).toBe("gpt-4o");
    // Save the provider.
    qa(el, ".drawer .dw-save").pop().click();
    await tick();
    await settleClose();
    const lastSet = el.configService.sets[el.configService.sets.length - 1];
    expect(lastSet.value.providers.openai.model).toBe("gpt-4o");
    expect(lastSet.value.providers.openai.models).toEqual([{ id: "gpt-4o-mini" }]);
  });

  test("Delete removes the provider and re-points the active id", async () => {
    const el = await mount(AGENT({ vllm: VLLM, openai: OPENAI }, "openai"));
    // Open the OpenAI default provider and delete it.
    const row = qa(el, ".ags-provider-row").find((r) =>
      r.querySelector(".ags-provider-name").textContent.includes("OpenAI"),
    );
    row.click();
    await tick();
    // Stub the confirm modal (production shows a real confirmation).
    el._confirm = async () => true;
    q(el, ".dw-delete-label").click();
    await tick();
    await settleClose();

    const lastSet = el.configService.sets[el.configService.sets.length - 1];
    expect(lastSet.value.providers.openai).toBeUndefined();
    expect(lastSet.value.providerId).toBe("vllm");
  });

  test("the default-provider list lists providers and persists providerId", async () => {
    const el = await mount(AGENT({ vllm: VLLM, openai: OPENAI }, "vllm"));
    const trigger = q(el, ".ags-default-trigger");
    expect(trigger).not.toBeNull();
    expect(q(el, ".ags-default-row-name").textContent.trim()).toBe("vLLM (local)");
    // The closed state shows the intro question and the footer blurb again.
    expect(q(el, ".ags-default-card .ags-card-question").textContent).toContain(
      "Which provider is the default",
    );
    expect(q(el, ".ags-default-card .ags-card-help").textContent).toContain(
      "Agents use the default provider",
    );

    // Open the list; the card is replaced by the list (no question or blurb).
    trigger.click();
    await tick();
    const rows = qa(el, ".ags-default-row");
    expect(rows.map((o) => o.querySelector(".ags-default-row-name").textContent.trim())).toEqual([
      "vLLM (local)",
      "OpenAI",
    ]);
    expect(rows[0].classList.contains("is-active")).toBe(true);
    // The question stays in place over the list; only the blurb is dropped.
    expect(q(el, ".ags-default-card .ags-card-question").textContent).toContain(
      "Which provider is the default",
    );
    expect(q(el, ".ags-default-card .ags-card-help")).toBeNull();
    // The last row drops its separator line.
    expect(rows[rows.length - 1].classList.contains("is-last")).toBe(true);

    // Select OpenAI -> closes the list and persists the default.
    rows[1].click();
    await tick();
    const lastSet = el.configService.sets[el.configService.sets.length - 1];
    expect(lastSet.key).toBe("agent");
    expect(lastSet.value.providerId).toBe("openai");
    expect(qa(el, ".ags-default-list")).toHaveLength(0);
    expect(q(el, ".ags-default-row-name").textContent.trim()).toBe("OpenAI");
  });

  test("closing the default list via the close button keeps the current default", async () => {
    const el = await mount(AGENT({ vllm: VLLM, openai: OPENAI }, "vllm"));
    q(el, ".ags-default-trigger").click();
    await tick();
    expect(qa(el, ".ags-default-list")).toHaveLength(1);
    q(el, ".ags-default-close").click();
    await tick();
    expect(qa(el, ".ags-default-list")).toHaveLength(0);
    expect(q(el, ".ags-default-row-name").textContent.trim()).toBe("vLLM (local)");
  });

  test("the default list is virtualized — it only renders a bounded window of rows", async () => {
    const many = {};
    for (let i = 0; i < 50; i++) {
      many[`p${i}`] = { baseUrl: `http://localhost:${i + 8000}/v1`, model: `m${i}` };
    }
    const el = await mount(AGENT(many, "p0"));
    q(el, ".ags-default-trigger").click();
    await tick();
    const rows = qa(el, ".ags-default-row");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(50);
    // The currently-selected provider sits at the top of the rendered window.
    expect(rows[0].textContent).toContain("m0");
    // Clicking a row selects it and closes the list.
    rows[rows.length - 1].click();
    await tick();
    expect(qa(el, ".ags-default-list")).toHaveLength(0);
  });

  test("detect models populates the models list and sets the default", async () => {
    const el = await mount(AGENT({}, ""));
    q(el, ".ags-add-row").click();
    await tick();
    // Set a base URL so detection has an endpoint.
    const baseInput = q(el, ".drawer .ags-baseurl-input");
    baseInput.value = "https://api.openai.com/v1";
    baseInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    (window as any).openp41ge = {
      chat: {
        listModels: vi.fn(async () => ({ ok: true, models: ["gpt-4o", "gpt-4o-mini"] })),
      },
    };
    await el._detectModels(el._drawers[0]);
    await tick();
    const names = qa(el, ".drawer .ags-provider-row").map(
      (r) => r.querySelector(".ags-provider-name")?.textContent,
    );
    expect(names).toEqual(["gpt-4o", "gpt-4o-mini", undefined]);
    expect(q(el, ".drawer .ags-detect-note").textContent).toContain("Detected 2 models");
    // The default model card shows the first detected model.
    expect(
      q(
        el,
        ".drawer .ags-default-model-card .ags-default-trigger .ags-default-row-name",
      ).textContent.trim(),
    ).toBe("gpt-4o");
  });

  test("choosing a model from the default list sets it as the default", async () => {
    const providers = {
      vllm: {
        baseUrl: "http://localhost:8000/v1",
        model: "m1",
        models: [{ id: "m1" }, { id: "m2" }],
      },
    };
    const el = await mount(AGENT(providers, "vllm"));
    qa(el, ".ags-provider-row")[0].click();
    await tick();
    q(el, ".drawer .ags-default-model-card .ags-default-trigger").click();
    await tick();
    const rows = qa(el, ".drawer .ags-default-model-card .ags-default-row");
    expect(rows.map((r) => r.querySelector(".ags-default-row-name").textContent.trim())).toEqual([
      "m1",
      "m2",
    ]);
    rows[1].click();
    await tick();
    expect(
      q(
        el,
        ".drawer .ags-default-model-card .ags-default-trigger .ags-default-row-name",
      ).textContent.trim(),
    ).toBe("m2");
    qa(el, ".drawer .dw-save").pop().click();
    await tick();
    await settleClose();
    const lastSet = el.configService.sets[el.configService.sets.length - 1];
    expect(lastSet.value.providers.vllm.model).toBe("m2");
    expect(lastSet.value.providers.vllm.models).toEqual([{ id: "m1" }, { id: "m2" }]);
  });

  test("deleting a model removes it and falls back the default", async () => {
    const providers = {
      vllm: {
        baseUrl: "http://localhost:8000/v1",
        model: "m1",
        models: [{ id: "m1" }, { id: "m2" }],
      },
    };
    const el = await mount(AGENT(providers, "vllm"));
    qa(el, ".ags-provider-row")[0].click();
    await tick();
    // Open the second model's drawer (m2).
    qa(el, ".drawer .ags-provider-row")[1].click();
    await tick();
    el._confirm = async () => true;
    qa(el, ".drawer .dw-delete-label").pop().click();
    await tick();
    await settleClose();
    const names = qa(el, ".drawer .ags-provider-row").map(
      (r) => r.querySelector(".ags-provider-name")?.textContent,
    );
    expect(names).toEqual(["m1", undefined]);
    expect(
      q(
        el,
        ".drawer .ags-default-model-card .ags-default-trigger .ags-default-row-name",
      ).textContent.trim(),
    ).toBe("m1");
  });

  test("detect models shows an inline error on a failed request", async () => {
    const el = await mount(AGENT({}, ""));
    q(el, ".ags-add-row").click();
    await tick();
    const baseInput = q(el, ".drawer .ags-baseurl-input");
    baseInput.value = "https://api.openai.com/v1";
    baseInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    (window as any).openp41ge = {
      chat: {
        listModels: vi.fn(async () => ({ ok: false, error: "Model list request failed (401)" })),
      },
    };
    await el._detectModels(el._drawers[0]);
    await tick();
    expect(q(el, ".drawer .ags-detect-note--err").textContent).toContain(
      "Model list request failed (401)",
    );
    expect(qa(el, ".drawer .ags-provider-row").length).toBe(1); // only the add row
  });

  test("Detect models is presented as an action row under the explanation", async () => {
    const el = await mount(AGENT());
    qa(el, ".ags-provider-row")[0].click();
    await tick();
    const row = qa(el, ".drawer .ags-action-row").find((r) =>
      r.querySelector(".ags-action-label")?.textContent.includes("Detect the models"),
    );
    expect(row).toBeDefined();
    expect(row.querySelector(".ags-action-control button").textContent).toContain("Detect models");
    // The add-model data row is exempt from the action-row treatment.
    expect(q(el, ".drawer .ags-add-row").classList.contains("ags-action-row")).toBe(false);
  });

  test("Test Connection lives in an Actions card and exposes View response", async () => {
    const el = await mount(AGENT({ openai: OPENAI }, "openai"));
    const row = qa(el, ".ags-provider-row").find((r) =>
      r.querySelector(".ags-provider-name")?.textContent.includes("OpenAI"),
    );
    row.click();
    await tick();
    // The drawer has an Actions section.
    const titles = qa(el, ".drawer .ags-section-title").map((t) => t.textContent.trim());
    expect(titles).toContain("Actions");
    // Test Connection is an action row.
    const testRow = qa(el, ".drawer .ags-action-row").find((r) =>
      r.querySelector(".ags-action-control button")?.textContent.includes("Test Connection"),
    );
    expect(testRow).toBeDefined();
    // Stub a failing ping.
    (window as any).openp41ge = {
      chat: {
        pingProvider: vi.fn(async () => ({ ok: false, error: "HTTP 400 Bad Request" })),
      },
    };
    await el._testConnection(el._drawers[0]);
    await tick();
    expect(q(el, ".drawer .test-err").textContent).toContain("HTTP 400 Bad Request");
    // View response appears and toggles the raw JSON, regardless of success.
    const viewBtn = qa(el, ".drawer .ags-action-row")
      .map((r) => r.querySelector(".ags-action-control button"))
      .find((b) => b?.textContent.includes("View response"));
    expect(viewBtn).toBeDefined();
    viewBtn.click();
    await tick();
    expect(q(el, ".drawer .ags-response").textContent).toContain("HTTP 400 Bad Request");
    viewBtn.click();
    await tick();
    expect(q(el, ".drawer .ags-response")).toBeNull();
  });

  test("numeric fields are text inputs that strip non-numeric characters", async () => {
    const el = await mount(AGENT({}, ""));
    q(el, ".ags-add-row").click();
    await tick();

    const temp = qa(el, ".ags-card .ags-input").find((i) => i.placeholder === "0.7");
    expect(temp.type).toBe("text");
    temp.value = "12.3x.4";
    temp.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(temp.value).toBe("12.34");

    const max = qa(el, ".ags-card .ags-input").find((i) => i.placeholder === "e.g. 2048");
    expect(max.type).toBe("text");
    max.value = "20ab48";
    max.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(max.value).toBe("2048");
  });

  test("clicking anywhere on a field card focuses its input", async () => {
    const el = await mount(AGENT({}, ""));
    q(el, ".ags-add-row").click();
    await tick();
    const card = qa(el, ".ags-input-card").find((c) => c.querySelector(".ags-input"));
    const input = card.querySelector(".ags-input");
    const focus = vi.spyOn(input, "focus");
    card.click();
    await tick();
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
