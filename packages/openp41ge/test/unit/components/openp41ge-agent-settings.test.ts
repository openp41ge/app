/**
 * Tests for <openp41ge-agent-settings>.
 *
 * Verifies the Providers card, the slide-in provider drawer, preset pickers,
 * add/edit/delete flows, and the default-provider select.
 */
// @ts-nocheck
import { describe, test, expect, beforeEach, vi } from "vitest";
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

const VLLM = { baseUrl: "http://localhost:8000/v1", model: "Qwen2.5-Coder-7B-Instruct" };
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

  test("renders the Providers card and lists the default vLLM provider", async () => {
    const el = await mount(AGENT());
    expect(q(el, ".ags-card")).not.toBeNull();
    expect(q(el, ".ags-card-question").textContent).toContain(
      "Which providers should be available for chats?",
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

  test("clicking Add another provider opens a drawer with preset radios", async () => {
    const el = await mount(AGENT({}, ""));
    q(el, ".ags-add-row").click();
    await tick();
    expect(qa(el, ".drawer:not(.drawer--closing)")).toHaveLength(1);
    expect(q(el, ".drawer-title").textContent).toBe("New provider");
    expect(qa(el, ".ags-preset-option")).toHaveLength(PROVIDER_PRESETS.length);
  });

  test("selecting a preset pre-fills baseUrl and model", async () => {
    const el = await mount(AGENT({}, ""));
    q(el, ".ags-add-row").click();
    await tick();
    const openai = qa(el, ".ags-preset-option").find((o) =>
      o.querySelector(".ags-preset-label").textContent.includes("OpenAI"),
    );
    const radio = openai.querySelector(".ags-preset-radio");
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(q(el, ".ags-baseurl-input").value).toBe("https://api.openai.com/v1");
    // The model card's input follows the display-name + base-url cards.
    const modelInputs = qa(el, ".ags-card").map((c) => c.querySelector(".ags-input"));
    expect(modelInputs.some((i) => i && i.value === "gpt-4o")).toBe(true);
  });

  test("Save adds a new provider, persists agent, and returns to the list", async () => {
    const el = await mount(AGENT({}, ""));
    q(el, ".ags-add-row").click();
    await tick();
    const openai = qa(el, ".ags-preset-option").find((o) =>
      o.querySelector(".ags-preset-label").textContent.includes("OpenAI"),
    );
    openai.querySelector(".ags-preset-radio").dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    qa(el, ".dw-save")[0].click();
    await tick();
    await settleClose();

    const lastSet = el.configService.sets[el.configService.sets.length - 1];
    expect(lastSet.key).toBe("agent");
    expect(lastSet.value.providers.openai).toBeDefined();
    expect(lastSet.value.providerId).toBe("openai");
    // Drawer closed, list now shows the new provider.
    expect(qa(el, ".drawer:not(.drawer--closing)")).toHaveLength(0);
    const names = qa(el, ".ags-provider-name").map((n) => n.textContent);
    expect(names).toContain("OpenAI");
  });

  test("editing an existing provider updates it and persists", async () => {
    const el = await mount(AGENT({ vllm: VLLM, openai: OPENAI }));
    // Open the OpenAI row (the second provider row, index 1).
    const row = qa(el, ".ags-provider-row")[1];
    row.click();
    await tick();
    // Change the model field.
    const modelInput = qa(el, ".ags-card")
      .map((c) => c.querySelector(".ags-input"))
      .find((i) => i && i.classList.contains("ags-input--mono") && i.value === "gpt-4o");
    modelInput.value = "gpt-4o-mini";
    modelInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    qa(el, ".dw-save")[0].click();
    await tick();
    await settleClose();

    const lastSet = el.configService.sets[el.configService.sets.length - 1];
    expect(lastSet.value.providers.openai.model).toBe("gpt-4o-mini");
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
    // The whole card is just the selection — no intro question or footer blurb.
    expect(q(el, ".ags-card-question")?.textContent ?? "").not.toContain(
      "Which provider is the default",
    );

    // Open the list; the card becomes an in-place list of providers.
    trigger.click();
    await tick();
    const rows = qa(el, ".ags-default-row");
    expect(rows.map((o) => o.querySelector(".ags-default-row-name").textContent.trim())).toEqual([
      "vLLM (local)",
      "OpenAI",
    ]);
    expect(rows[0].classList.contains("is-active")).toBe(true);

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
