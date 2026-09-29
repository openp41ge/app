/**
 * Tests for <openp41ge-manager-settings> — the management window's global
 * Settings tab, which edits only the openp41ge platform-wide settings
 * (app theme, line height, font size) — NOT the whole config.
 *
 * The JSON editor shows ONLY the values the user has overridden (defaults are
 * implied). A "show defaults" toggle renders the full effective document with
 * the default-valued parts faded. Save/Reset/toggle are driven by the window's
 * custom settings bottom bar through this component's public API, and the
 * component emits a `manager-settings-state` event so the footer stays in sync.
 *
 * The config file stores only overrides; the bridge's `getOverrides()` returns
 * that exact persisted document (including pinned values equal to a default),
 * and `getAll()` returns the defaults-merged effective document. The component
 * edits the override document 1:1, so deleting a row removes it from the file
 * and clicking "overwrite" on a faded default row pins it in.
 */
// @ts-nocheck
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/renderer/components/openp41ge-manager-settings";

const DEFAULT_GLOBAL = { appTheme: "dark", updateChannel: "latest", lineHeight: 20, fontSize: 14 };

function deepMerge(base, override) {
  const out = JSON.parse(JSON.stringify(base));
  const apply = (target, src) => {
    if (!src || typeof src !== "object" || Array.isArray(src)) return;
    for (const [k, v] of Object.entries(src)) {
      if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) {
        apply(target[k], v);
      } else {
        target[k] = v;
      }
    }
  };
  apply(out, override);
  return out;
}

/** Fake of the IPC config bridge. `overrides` is the persisted file doc. */
class FakeBridge {
  constructor(overrides = {}, opts = {}) {
    this.overrides = JSON.parse(JSON.stringify(overrides));
    this.defaults = opts.defaults ?? JSON.parse(JSON.stringify(DEFAULT_GLOBAL));
    this.sets = [];
  }
  async getAll() {
    return deepMerge(this.defaults, this.overrides);
  }
  async getDefaults() {
    return JSON.parse(JSON.stringify(this.defaults));
  }
  async getOverrides() {
    return JSON.parse(JSON.stringify(this.overrides));
  }
  async set(key, value) {
    this.sets.push({ key, value: JSON.parse(JSON.stringify(value)) });
    const keys = key.split(".");
    let obj = this.overrides;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
  }
}

/** Pinned default (explicitly written even though it equals the default). */
const PINNED = { lineHeight: 20 };
/** Two overrides staged by the user. */
const OVERRIDES = { updateChannel: "alpha", lineHeight: 32 };

async function mount(bridge) {
  const el = document.createElement("openp41ge-manager-settings");
  el.configBridge = bridge;
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 20));
  return el;
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/** Dispatch a change event as the <json-editor> would after an edit. */
function commit(el, value) {
  const je = el.shadowRoot.querySelector("json-editor");
  je.dispatchEvent(new CustomEvent("json-editor-change", { detail: { value } }));
}

/** Dispatch an overwrite event as <json-editor> emits on a faded default row. */
function overwrite(el, path, value) {
  const je = el.shadowRoot.querySelector("json-editor");
  je.dispatchEvent(new CustomEvent("json-editor-overwrite", { detail: { path, value } }));
}

describe("openp41ge-manager-settings — global platform settings JSON editor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("renders a <json-editor> bound ONLY to the platform overrides", async () => {
    const el = await mount(new FakeBridge({}));
    const je = el.shadowRoot.querySelector(".mms-editor > json-editor");
    expect(je).toBeTruthy();
    // Nothing overridden and nothing pinned → no rows shown.
    expect(je.editedValue).toEqual({});
  });

  test("keeps sub-package sections (editor/agent) out of the global editor", async () => {
    const el = await mount(
      new FakeBridge({ editor: { fontFamily: "mono", maxFileSize: 52428800 }, lineHeight: 32 }),
    );
    const je = el.shadowRoot.querySelector("json-editor");
    expect(je.editedValue).toEqual({ lineHeight: 32 });
    expect(JSON.stringify(je.editedValue)).not.toContain("editor");
    expect(JSON.stringify(je.editedValue)).not.toContain("agent");
  });

  test("shows overrides when the config differs from the defaults", async () => {
    const el = await mount(new FakeBridge({ lineHeight: 32, updateChannel: "beta" }));
    const je = el.shadowRoot.querySelector("json-editor");
    expect(je.editedValue).toEqual({ lineHeight: 32, updateChannel: "beta" });
  });

  test("shows a pinned default value as an explicit override", async () => {
    // The user explicitly wrote `lineHeight: 20` even though it's the default.
    const el = await mount(new FakeBridge(PINNED));
    const je = el.shadowRoot.querySelector("json-editor");
    expect(je.editedValue).toEqual({ lineHeight: 20 });
    expect(el.isDirty).toBe(false);
  });

  test("is clean when there are no staged edits", async () => {
    const el = await mount(new FakeBridge({}));
    expect(el.isDirty).toBe(false);
  });

  test("stages edits but does NOT persist until save (no auto-save)", async () => {
    const bridge = new FakeBridge({});
    const el = await mount(bridge);
    commit(el, OVERRIDES);
    await tick();
    expect(el.isDirty).toBe(true);
    // Nothing written to the bridge just from staging.
    expect(bridge.sets.length).toBe(0);
  });

  test("save writes ONLY the override platform keys and marks clean", async () => {
    const bridge = new FakeBridge({});
    const el = await mount(bridge);
    commit(el, OVERRIDES);
    await tick();
    await el.save();
    await tick();
    expect(bridge.sets.length).toBeGreaterThan(0);
    const keys = bridge.sets.map((s) => s.key).sort();
    expect(keys).toEqual(["lineHeight", "updateChannel"]);
    const lh = bridge.sets.find((s) => s.key === "lineHeight");
    expect(lh.value).toBe(32);
    const uc = bridge.sets.find((s) => s.key === "updateChannel");
    expect(uc.value).toBe("alpha");
    expect(el.isDirty).toBe(false);
  });

  test("save writes the override keys in alphabetical order", async () => {
    const bridge = new FakeBridge({});
    const el = await mount(bridge);
    // Staged in a non-alphabetical order (updateChannel before lineHeight).
    commit(el, { updateChannel: "alpha", lineHeight: 32 });
    await tick();
    await el.save();
    await tick();
    expect(bridge.sets.map((s) => s.key)).toEqual(["lineHeight", "updateChannel"]);
    // The staged document is reflected back in sorted order.
    expect(Object.keys(el._overrides)).toEqual(["lineHeight", "updateChannel"]);
  });

  test("loads the override keys alphabetically for display", async () => {
    // The persisted file stores keys in a non-alphabetical order.
    const bridge = new FakeBridge({ updateChannel: "alpha", lineHeight: 32 });
    const el = await mount(bridge);
    await tick();
    expect(Object.keys(el._overrides)).toEqual(["lineHeight", "updateChannel"]);
    // The editor is seeded with the sorted overrides (default view = overrides only).
    const je = el.shadowRoot.querySelector("json-editor");
    expect(Object.keys(je.editedValue)).toEqual(["lineHeight", "updateChannel"]);
    // Loaded state is clean (no staged edit), so nothing to save.
    expect(el.isDirty).toBe(false);
  });

  test("overwriting a default value pins it (dirty, persists on save)", async () => {
    const bridge = new FakeBridge({});
    const el = await mount(bridge);
    // The user clicks "overwrite" on the faded `lineHeight` default row.
    overwrite(el, ["lineHeight"], 20);
    await tick();
    expect(el.isDirty).toBe(true);
    const je = el.shadowRoot.querySelector("json-editor");
    // The override document now contains the pinned value, and it's passed to
    // the editor as an explicit path so it won't be treated as an untouched default.
    expect(je.editedValue).toEqual({ lineHeight: 20 });
    expect(je.explicitPaths).toContain("lineHeight");
    // Saving persists the pin.
    await el.save();
    await tick();
    expect(bridge.overrides).toEqual({ lineHeight: 20 });
    expect(el.isDirty).toBe(false);
  });

  test("reset discards the staged edits (including a just-added pin)", async () => {
    const bridge = new FakeBridge({});
    const el = await mount(bridge);
    overwrite(el, ["lineHeight"], 20);
    await tick();
    expect(el.isDirty).toBe(true);
    el.reset();
    await tick();
    const je = el.shadowRoot.querySelector("json-editor");
    expect(je.editedValue).toEqual({});
    expect(bridge.sets.length).toBe(0);
    expect(el.isDirty).toBe(false);
  });

  test("show-defaults renders the full effective document (defaults faded)", async () => {
    const el = await mount(new FakeBridge({ lineHeight: 32 }));
    el.toggleShowDefaults();
    await tick();
    const je = el.shadowRoot.querySelector("json-editor");
    expect(je.showDefaults).toBe(true);
    expect(je.value).toEqual({ ...DEFAULT_GLOBAL, lineHeight: 32 });
    expect(je.shadowRoot.querySelectorAll(".je-row--faded").length).toBeGreaterThan(0);
    el.toggleShowDefaults();
    await tick();
    expect(je.showDefaults).toBe(false);
  });

  test("emits manager-settings-state so the parent footer stays in sync", async () => {
    const el = await mount(new FakeBridge({}));
    let last = null;
    el.addEventListener("manager-settings-state", (e) => {
      last = e.detail;
    });
    commit(el, OVERRIDES);
    await tick();
    expect(last.dirty).toBe(true);
    expect(last.showDefaults).toBe(false);
  });

  test("row height follows the global line-height", async () => {
    const el = await mount(new FakeBridge({ lineHeight: 30 }));
    const je = el.shadowRoot.querySelector("json-editor");
    expect(je.rowHeight).toBe(30);
  });

  test("falls back when the config bridge is missing", async () => {
    delete (window as unknown as { openp41ge?: unknown }).openp41ge;
    const el = await mount(null);
    await tick();
    expect(el.shadowRoot.querySelector(".mms-note--error")).toBeTruthy();
  });

  test("degrades gracefully when getDefaults is unavailable instead of hard-failing", async () => {
    const bridge = new FakeBridge({ lineHeight: 32 });
    bridge.getDefaults = async () => {
      throw new Error("No handler registered for 'config:get-defaults'");
    };
    const el = await mount(bridge);
    await tick();
    expect(el.shadowRoot.querySelector(".mms-note--error")).toBeNull();
    expect(el.shadowRoot.querySelector(".mms-editor > json-editor")).toBeTruthy();
    expect(el.isDirty).toBe(false);
  });

  test("degrades gracefully when getOverrides is unavailable (falls back to getAll)", async () => {
    const bridge = new FakeBridge({ lineHeight: 32 });
    bridge.getOverrides = async () => {
      throw new Error("No handler registered for 'config:get-overrides'");
    };
    const el = await mount(bridge);
    await tick();
    expect(el.shadowRoot.querySelector(".mms-note--error")).toBeNull();
    const je = el.shadowRoot.querySelector("json-editor");
    // Recovered the override from the merged effective config.
    expect(je.editedValue).toEqual({ lineHeight: 32 });
  });
});
