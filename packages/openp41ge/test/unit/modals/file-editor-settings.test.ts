/**
 * Tests for <openp41ge-file-editor-settings>.
 *
 * The Editor overlay tab edits `editor.maxFileSize` (shown in MB,
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
    expect(el.textContent).toContain("What is the max allowed file size?");
    // A text field (not number) so the native up/down spinner arrows never show.
    expect(input.type).toBe("text");
  });

  test("max file size renders as a card: question above input, explanation below it", async () => {
    const fake = new FakeConfig({ "editor.maxFileSize": 50 * 1024 * 1024 });
    const el = await mount(fake);
    const card = el.querySelector(".fes-card");
    expect(card).not.toBeNull();

    const question = el.querySelector(".fes-card-question");
    const input = el.querySelector("#fes-maxsize");
    const help = el.querySelector(".fes-card-help");
    expect(question.textContent.trim()).toBe("What is the max allowed file size?");
    expect(input).not.toBeNull();

    // The value sits beneath the question; the explanation sits below the input.
    const following = (a, b) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(card.contains(question) && card.contains(input) && card.contains(help)).toBe(true);
    expect(following(question, input)).toBe(true);
    expect(following(input, help)).toBe(true);
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
    expect(el.textContent).toContain("between 1 and 4096 MB");
    // Input reverted to the stored value (50)
    expect(input.value).toBe("50");
  });

  test("rejects non-numeric text without saving", async () => {
    const fake = new FakeConfig({ "editor.maxFileSize": 50 * 1024 * 1024 });
    const el = await mount(fake);
    const input = el.querySelector("#fes-maxsize");
    input.value = "oops";
    input.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 10));

    expect(fake.sets).toHaveLength(0); // nothing persisted
    expect(el.textContent).toContain("between 1 and 4096 MB");
    expect(input.value).toBe("50"); // reverted to the stored value
  });

  test("rejects mis-grouped separators (e.g. 1,02,4) without saving", async () => {
    const fake = new FakeConfig({ "editor.maxFileSize": 50 * 1024 * 1024 });
    const el = await mount(fake);
    const input = el.querySelector("#fes-maxsize");
    input.value = "1,02,4";
    input.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 10));

    expect(fake.sets).toHaveLength(0);
    expect(input.value).toBe("50");
  });

  test("accepts thousands separators and normalizes the display", async () => {
    const fake = new FakeConfig({ "editor.maxFileSize": 50 * 1024 * 1024 });
    const el = await mount(fake);
    const input = el.querySelector("#fes-maxsize");
    input.value = "1,024";
    input.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 10));

    const lastSet = fake.sets[fake.sets.length - 1];
    expect(lastSet.value).toBe(1024 * 1024 * 1024);
    expect(el.textContent).toContain("larger than 1024 MB");
    expect(input.value).toBe("1024"); // normalized, separators stripped
  });

  test("clicking anywhere in the card focuses the input", async () => {
    const fake = new FakeConfig({ "editor.maxFileSize": 50 * 1024 * 1024 });
    const el = await mount(fake);
    const input = el.querySelector("#fes-maxsize");
    (document.activeElement as HTMLElement | null)?.blur();

    // Click a non-input part of the card (the explanation) and verify focus
    // lands on the limit input via the card-wide click handler.
    el.querySelector(".fes-card-help").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.activeElement).toBe(input);
  });

  test("accepts plain integers of any length (no separators needed)", async () => {
    const fake = new FakeConfig({ "editor.maxFileSize": 50 * 1024 * 1024 });
    const el = await mount(fake);
    const input = el.querySelector("#fes-maxsize");
    input.value = "1024";
    input.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 10));

    const lastSet = fake.sets[fake.sets.length - 1];
    expect(lastSet.value).toBe(1024 * 1024 * 1024);
    expect(input.value).toBe("1024");
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
