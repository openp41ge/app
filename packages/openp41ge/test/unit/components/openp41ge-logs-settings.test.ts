/**
 * Unit tests for <openp41ge-logs-settings> — the Logs settings "General" card.
 * Verifies it shows the question/toggle, reflects the current capture level on
 * connect, and raises/lowers the threshold + notifies the main process on
 * toggle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../../../src/renderer/components/openp41ge-logs-settings";
import type { Openp41geLogsSettings } from "../../../src/renderer/components/openp41ge-logs-settings";
import { setMinLevel, getMinLevel, LogLevel } from "openp41ge-logger";

const flush = () => new Promise((r) => setTimeout(r, 0));

async function renderSettings(): Promise<
  Openp41geLogsSettings & { updateComplete: Promise<unknown> }
> {
  const el = document.createElement("openp41ge-logs-settings") as Openp41geLogsSettings & {
    updateComplete: Promise<unknown>;
  };
  document.body.appendChild(el);
  await el.updateComplete;
  if (!el.shadowRoot) {
    // Lit hasn't rendered yet — give it a cycle.
    await flush();
  }
  return el;
}

type ToggleHost = HTMLElement & {
  checked: boolean;
  onLabel: string;
  offLabel: string;
  updateComplete: Promise<unknown>;
};

function getToggle(el: HTMLElement): ToggleHost {
  return el.shadowRoot!.querySelector("openp41ge-toggle") as ToggleHost;
}

async function readyToggle(el: HTMLElement): Promise<ToggleHost> {
  const toggle = getToggle(el);
  await toggle.updateComplete;
  return toggle;
}

/** Simulate the user clicking the toggle to the given state. */
async function clickToggle(el: HTMLElement, checked: boolean): Promise<void> {
  const toggle = await readyToggle(el);
  const input = toggle.shadowRoot!.querySelector<HTMLInputElement>("input")!;
  input.checked = checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await toggle.updateComplete;
}

describe("openp41ge-logs-settings", () => {
  const setDebug = vi.fn();

  beforeEach(() => {
    setDebug.mockClear();
    (window as unknown as { openp41ge: { logs: { setDebug: typeof setDebug } } }).openp41ge = {
      logs: { setDebug },
    };
    setMinLevel(LogLevel.INFO);
  });

  afterEach(() => {
    setMinLevel(LogLevel.INFO);
  });

  it("renders the GENERAL section and the debug-logging question", async () => {
    const el = await renderSettings();
    const text = el.shadowRoot?.textContent ?? "";
    expect(text).toContain("General");
    expect(text).toContain("Would you like to capture debug logs?");
    const toggle = await readyToggle(el);
    expect(toggle.onLabel).toBe("Yes");
    expect(toggle.offLabel).toBe("No");
    el.remove();
  });

  it("reflects an enabled debug session on connect", async () => {
    setMinLevel(LogLevel.DEBUG);
    const el = await renderSettings();
    expect((await readyToggle(el)).checked).toBe(true);
    el.remove();
  });

  it("raises the capture level to DEBUG and notifies the main process when enabled", async () => {
    const el = await renderSettings();
    await clickToggle(el, true);
    expect(getMinLevel()).toBe(LogLevel.DEBUG);
    expect(setDebug).toHaveBeenCalledWith(true);
    el.remove();
  });

  it("lowers the capture level to INFO and notifies the main process when disabled", async () => {
    const el = await renderSettings();
    await clickToggle(el, false);
    expect(getMinLevel()).toBe(LogLevel.INFO);
    expect(setDebug).toHaveBeenCalledWith(false);
    el.remove();
  });
});
