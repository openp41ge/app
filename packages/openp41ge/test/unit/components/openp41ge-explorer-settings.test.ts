/**
 * Tests for <openp41ge-explorer-settings> — the Explorer settings surface in
 * the settings drawer, which edits `explorer.indentSize` and
 * `explorer.prefetchDepth`.
 *
 * Verifies the no-auto-save contract: edits stage in the JSON editor, and
 * only an explicit Save writes the Explorer keys. Reset discards staged
 * edits.
 */
// @ts-nocheck
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/renderer/components/openp41ge-explorer-settings";

/** Minimal ConfigService fake that captures set() and notifies key listeners. */
class FakeConfig {
  constructor(initial) {
    this.vals = { ...initial };
    this.keyListeners = new Map();
    this.sets = [];
  }
  get(key) {
    return this.vals[key];
  }
  async set(key, value) {
    this.sets.push({ key, value: JSON.parse(JSON.stringify(value)) });
    this.vals[key] = value;
    const lis = this.keyListeners.get(key);
    if (lis) for (const fn of lis) fn(value);
  }
  onKeyChange(key, fn) {
    if (!this.keyListeners.has(key)) this.keyListeners.set(key, new Set());
    this.keyListeners.get(key).add(fn);
    return () => this.keyListeners.get(key)?.delete(fn);
  }
  onChange() {
    return () => {};
  }
}

const CONFIG = {
  "explorer.indentSize": 16,
  "explorer.prefetchDepth": 2,
  lineHeight: 20,
};

const DIRTY = { indentSize: 24, prefetchDepth: 3 };

async function mount(fake) {
  const el = document.createElement("openp41ge-explorer-settings");
  el.configService = fake;
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 20));
  return el;
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/** Dispatch a change event as the <json-editor> would after an edit. */
function commit(el, value) {
  const je = el.querySelector(".exs-editor > json-editor");
  je.dispatchEvent(new CustomEvent("json-editor-change", { detail: { value } }));
}

describe("openp41ge-explorer-settings — Explorer settings JSON editor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("renders a <json-editor> bound to the Explorer settings", async () => {
    const el = await mount(new FakeConfig(CONFIG));
    const je = el.querySelector(".exs-editor > json-editor");
    expect(je).toBeTruthy();
    expect(je.editedValue).toEqual({ indentSize: 16, prefetchDepth: 2 });
    expect(el.querySelector(".exs-footer")).toBeTruthy();
  });

  test("defaults to the sensible defaults when the keys are absent", async () => {
    const el = await mount(new FakeConfig({ lineHeight: 20 }));
    const je = el.querySelector(".exs-editor > json-editor");
    expect(je.editedValue).toEqual({ indentSize: 16, prefetchDepth: 2 });
  });

  test("shows 'All changes saved.' when clean", async () => {
    const el = await mount(new FakeConfig(CONFIG));
    expect(el.querySelector(".exs-status").textContent).toContain("All changes saved");
  });

  test("stages edits but does NOT persist until Save (no auto-save)", async () => {
    const fake = new FakeConfig(CONFIG);
    const el = await mount(fake);
    commit(el, DIRTY);
    await tick();
    expect(el.querySelector(".exs-status").textContent).toContain("Unsaved changes");
    // Nothing written to the config service just from staging.
    expect(fake.sets.length).toBe(0);
  });

  test("Save writes BOTH Explorer keys and marks clean", async () => {
    const fake = new FakeConfig(CONFIG);
    const el = await mount(fake);
    commit(el, DIRTY);
    await tick();
    el.querySelector(".exs-btn--primary").click();
    await tick();
    expect(fake.sets.length).toBe(2);
    const keys = fake.sets.map((s) => s.key).sort();
    expect(keys).toEqual(["explorer.indentSize", "explorer.prefetchDepth"]);
    const indent = fake.sets.find((s) => s.key === "explorer.indentSize");
    expect(indent.value).toBe(24);
    const prefetch = fake.sets.find((s) => s.key === "explorer.prefetchDepth");
    expect(prefetch.value).toBe(3);
    expect(el.querySelector(".exs-status").textContent).toContain("All changes saved");
  });

  test("Reset discards the staged edits", async () => {
    const fake = new FakeConfig(CONFIG);
    const el = await mount(fake);
    commit(el, { indentSize: 48, prefetchDepth: 0 });
    await tick();
    el.querySelectorAll(".exs-btn")[0].click();
    await tick();
    const je = el.querySelector(".exs-editor > json-editor");
    expect(je.editedValue).toEqual({ indentSize: 16, prefetchDepth: 2 });
    expect(fake.sets.length).toBe(0);
  });

  test("row height follows the global line-height", async () => {
    const el = await mount(new FakeConfig({ ...CONFIG, lineHeight: 30 }));
    const je = el.querySelector(".exs-editor > json-editor");
    expect(je.rowHeight).toBe(30);
  });

  test("Save is disabled until there is a staged edit, and Reset is disabled when clean", async () => {
    const fake = new FakeConfig(CONFIG);
    const el = await mount(fake);
    const save = () => el.querySelector(".exs-btn--primary");
    const reset = () => el.querySelectorAll(".exs-btn")[0];
    expect(save().disabled).toBe(true);
    expect(reset().disabled).toBe(true);
    commit(el, DIRTY);
    await tick();
    expect(save().disabled).toBe(false);
    expect(reset().disabled).toBe(false);
  });
});
