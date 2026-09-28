/**
 * Tests for <openp41ge-manager-settings> — the management window's global
 * Settings tab, which edits only the openp41ge platform-wide settings
 * (app theme, line height, font size) — NOT the whole config.
 *
 * Verifies the no-auto-save contract: edits stage in the JSON editor, and
 * only an explicit Save writes the platform keys (sub-package sections such
 * as editor/agent are left untouched). Reset discards staged edits.
 */
// @ts-nocheck
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/renderer/components/openp41ge-manager-settings";

/** Minimal config bridge fake capturing set() calls. */
class FakeBridge {
  constructor(initial) {
    this.config = JSON.parse(JSON.stringify(initial ?? {}));
    this.sets = [];
  }
  async getAll() {
    return JSON.parse(JSON.stringify(this.config));
  }
  async set(key, value) {
    this.sets.push({ key, value: JSON.parse(JSON.stringify(value)) });
    const keys = key.split(".");
    let obj = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
  }
}

const CONFIG = {
  version: 1,
  appTheme: "dark",
  updateChannel: "latest",
  lineHeight: 20,
  fontSize: 14,
  editor: { fontFamily: "mono", maxFileSize: 52428800 },
  agent: { providerId: "vllm", providers: { vllm: { baseUrl: "http://x", defaultModel: "" } } },
};

/** Only the platform-wide keys are editable in the global surface. */
const GLOBAL = { appTheme: "dark", updateChannel: "latest", lineHeight: 20, fontSize: 14 };
const DIRTY = { appTheme: "dark", updateChannel: "alpha", lineHeight: 32, fontSize: 14 };

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

describe("openp41ge-manager-settings — global platform settings JSON editor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("renders a <json-editor> bound ONLY to the platform settings", async () => {
    const bridge = new FakeBridge(CONFIG);
    const el = await mount(bridge);
    const je = el.shadowRoot.querySelector(".mms-editor > json-editor");
    expect(je).toBeTruthy();
    // Sub-package sections (editor/agent) are NOT surfaced.
    expect(je.editedValue).toEqual(GLOBAL);
    expect(el.shadowRoot.querySelector(".mms-footer")).toBeTruthy();
  });

  test("shows 'All changes saved.' when clean", async () => {
    const el = await mount(new FakeBridge(CONFIG));
    expect(el.shadowRoot.querySelector(".mms-status").textContent).toContain("All changes saved");
  });

  test("stages edits but does NOT persist until Save (no auto-save)", async () => {
    const bridge = new FakeBridge(CONFIG);
    const el = await mount(bridge);
    commit(el, DIRTY);
    await tick();
    expect(el.shadowRoot.querySelector(".mms-status").textContent).toContain("Unsaved changes");
    // Nothing written to the bridge just from staging.
    expect(bridge.sets.length).toBe(0);
  });

  test("Save writes ONLY the platform keys and marks clean", async () => {
    const bridge = new FakeBridge(CONFIG);
    const el = await mount(bridge);
    commit(el, DIRTY);
    await tick();
    el.shadowRoot.querySelector(".mms-btn--primary").click();
    await tick();
    expect(bridge.sets.length).toBeGreaterThan(0);
    const keys = bridge.sets.map((s) => s.key);
    expect(keys.sort()).toEqual(["appTheme", "fontSize", "lineHeight", "updateChannel"]);
    // Sub-package sections are NOT persisted from this surface.
    expect(keys).not.toContain("editor");
    expect(keys).not.toContain("agent");
    // The staged line height persists at the top level.
    const lh = bridge.sets.find((s) => s.key === "lineHeight");
    expect(lh.value).toBe(32);
    // The auto-update channel persists at the top level.
    const uc = bridge.sets.find((s) => s.key === "updateChannel");
    expect(uc.value).toBe("alpha");
    expect(el.shadowRoot.querySelector(".mms-status").textContent).toContain("All changes saved");
  });

  test("Reset discards the staged edits", async () => {
    const bridge = new FakeBridge(CONFIG);
    const el = await mount(bridge);
    commit(el, { ...DIRTY, lineHeight: 99 });
    await tick();
    el.shadowRoot.querySelectorAll(".mms-btn")[0].click();
    await tick();
    const je = el.shadowRoot.querySelector("json-editor");
    expect(je.editedValue).toEqual(GLOBAL);
    expect(bridge.sets.length).toBe(0);
  });

  test("row height follows the global line-height", async () => {
    const el = await mount(new FakeBridge({ ...CONFIG, lineHeight: 30 }));
    const je = el.shadowRoot.querySelector("json-editor");
    expect(je.rowHeight).toBe(30);
  });

  test("falls back when the config bridge is missing", async () => {
    delete (window as unknown as { openp41ge?: unknown }).openp41ge;
    const el = await mount(null);
    await tick();
    expect(el.shadowRoot.querySelector(".mms-note--error")).toBeTruthy();
  });
});
