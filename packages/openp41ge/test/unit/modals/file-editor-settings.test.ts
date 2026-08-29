/**
 * Tests for <openp41ge-file-editor-settings>.
 *
 * The File Editor Settings overlay tab edits `editor.maxFileSize` (shown in MB,
 * persisted in bytes). Verifies display, save, validation, and live updates.
 */
// @ts-nocheck
import { describe, test, expect, beforeEach } from "vitest";
import "../../../src/renderer/components/openp41ge-file-editor-settings";

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
    this.sets.push({ key, value });
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

async function mount(fake) {
  const el = document.createElement("openp41ge-file-editor-settings");
  el.configService = fake;
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 10));
  return el;
}

describe("openp41ge-file-editor-settings", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("shows the current maxFileSize in MB", async () => {
    const fake = new FakeConfig({ "editor.maxFileSize": 50 * 1024 * 1024 });
    const el = await mount(fake);
    const input = el.querySelector("#fes-maxsize");
    expect(input.value).toBe("50");
    expect(el.textContent).toContain("Max file size to open");
  });

  test("defaults to 50 MB when the key is absent", async () => {
    const fake = new FakeConfig({});
    const el = await mount(fake);
    expect(el.querySelector("#fes-maxsize").value).toBe("50");
  });

  test("changing the value persists bytes and shows a saved hint", async () => {
    const fake = new FakeConfig({ "editor.maxFileSize": 50 * 1024 * 1024 });
    const el = await mount(fake);
    const input = el.querySelector("#fes-maxsize");
    input.value = "100";
    input.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 10));

    const lastSet = fake.sets[fake.sets.length - 1];
    expect(lastSet.key).toBe("editor.maxFileSize");
    expect(lastSet.value).toBe(100 * 1024 * 1024);
    expect(el.textContent).toContain("larger than 100 MB");
    expect(input.value).toBe("100");
  });

  test("rejects values under 1 MB without saving", async () => {
    const fake = new FakeConfig({ "editor.maxFileSize": 50 * 1024 * 1024 });
    const el = await mount(fake);
    const input = el.querySelector("#fes-maxsize");
    input.value = "0";
    input.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 10));

    expect(fake.sets).toHaveLength(0); // nothing persisted
    expect(el.textContent).toContain("at least 1 MB");
    // Input reverted to the stored value (50)
    expect(input.value).toBe("50");
  });

  test("reacts to an external config change", async () => {
    const fake = new FakeConfig({ "editor.maxFileSize": 50 * 1024 * 1024 });
    const el = await mount(fake);
    expect(el.querySelector("#fes-maxsize").value).toBe("50");

    await fake.set("editor.maxFileSize", 120 * 1024 * 1024);
    await new Promise((r) => setTimeout(r, 10));
    expect(el.querySelector("#fes-maxsize").value).toBe("120");
  });
});
