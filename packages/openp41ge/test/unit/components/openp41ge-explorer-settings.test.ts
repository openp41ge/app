/**
 * Tests for <openp41ge-explorer-settings> — the Explorer settings surface in
 * the settings drawer, which edits `explorer.indentSize` and
 * `explorer.prefetchDepth`.
 *
 * The surface body is entirely the JSON editor (no header/footer — those live
 * in the drawer head via `renderHeadAction`). Verifies the no-auto-save
 * contract: edits stage in the JSON editor, and only an explicit Save writes
 * the Explorer keys. Reset discards staged edits.
 */
// @ts-nocheck
import { describe, test, expect, beforeEach } from "vitest";
import { render } from "lit";
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

/** Render the surface's drawer head actions (Reset + Save) into a container. */
function head(el) {
  const box = document.createElement("div");
  render(el.renderHeadAction(), box);
  return box;
}

describe("openp41ge-explorer-settings — Explorer settings JSON editor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("renders a full-height <json-editor> with no header/footer", async () => {
    const el = await mount(new FakeConfig(CONFIG));
    const je = el.querySelector(".exs-editor > json-editor");
    expect(je).toBeTruthy();
    expect(je.editedValue).toEqual({ indentSize: 16, prefetchDepth: 2 });
    // Header + hint and the body footer are gone (actions live in the head).
    expect(el.querySelector(".exs-section-title")).toBeNull();
    expect(el.querySelector(".exs-hint")).toBeNull();
    expect(el.querySelector(".exs-footer")).toBeNull();
    expect(el.querySelector(".exs-status")).toBeNull();
    // The editor pane fills the surface.
    expect(el.querySelector(".exs-editor")).toBeTruthy();
  });

  test("defaults to the sensible defaults when the keys are absent", async () => {
    const el = await mount(new FakeConfig({ lineHeight: 20 }));
    const je = el.querySelector(".exs-editor > json-editor");
    expect(je.editedValue).toEqual({ indentSize: 16, prefetchDepth: 2 });
  });

  test("exposes Reset/Save as drawer head actions", async () => {
    const el = await mount(new FakeConfig(CONFIG));
    const h = head(el);
    expect(h.querySelector(".sdw-reset")).toBeTruthy();
    const save = h.querySelector(".sdw-save");
    expect(save).toBeTruthy();
    // Clean: Reset disabled, Save not marked dirty.
    expect(h.querySelector(".sdw-reset").disabled).toBe(true);
    expect(save.classList.contains("sdw-save--dirty")).toBe(false);
  });

  test("stages edits but does NOT persist until Save (no auto-save)", async () => {
    const fake = new FakeConfig(CONFIG);
    const el = await mount(fake);
    commit(el, DIRTY);
    await tick();
    const h = head(el);
    // Dirty: Save is highlighted blue, Reset enabled.
    expect(h.querySelector(".sdw-save").classList.contains("sdw-save--dirty")).toBe(true);
    expect(h.querySelector(".sdw-reset").disabled).toBe(false);
    // Nothing written to the config service just from staging.
    expect(fake.sets.length).toBe(0);
  });

  test("Save writes BOTH Explorer keys and marks clean", async () => {
    const fake = new FakeConfig(CONFIG);
    const el = await mount(fake);
    commit(el, DIRTY);
    await tick();
    head(el).querySelector(".sdw-save").click();
    await tick();
    expect(fake.sets.length).toBe(2);
    const keys = fake.sets.map((s) => s.key).sort();
    expect(keys).toEqual(["explorer.indentSize", "explorer.prefetchDepth"]);
    const indent = fake.sets.find((s) => s.key === "explorer.indentSize");
    expect(indent.value).toBe(24);
    const prefetch = fake.sets.find((s) => s.key === "explorer.prefetchDepth");
    expect(prefetch.value).toBe(3);
    // Clean again: Save no longer dirty, Reset disabled.
    const h = head(el);
    expect(h.querySelector(".sdw-save").classList.contains("sdw-save--dirty")).toBe(false);
    expect(h.querySelector(".sdw-reset").disabled).toBe(true);
  });

  test("Reset discards the staged edits", async () => {
    const fake = new FakeConfig(CONFIG);
    const el = await mount(fake);
    commit(el, { indentSize: 48, prefetchDepth: 0 });
    await tick();
    head(el).querySelector(".sdw-reset").click();
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

  test("Reset is disabled when clean, and Save highlights dirty after a staged edit", async () => {
    const fake = new FakeConfig(CONFIG);
    const el = await mount(fake);
    const reset = () => head(el).querySelector(".sdw-reset");
    const save = () => head(el).querySelector(".sdw-save");
    expect(reset().disabled).toBe(true);
    expect(save().classList.contains("sdw-save--dirty")).toBe(false);
    commit(el, DIRTY);
    await tick();
    expect(reset().disabled).toBe(false);
    expect(save().classList.contains("sdw-save--dirty")).toBe(true);
  });
});
