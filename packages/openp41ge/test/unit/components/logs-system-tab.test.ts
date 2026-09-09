/**
 * Unit tests for LogsSystemTabController — the Logs sidebar system list.
 *
 * Verifies it renders one row per system (aggregating that system's streams
 * into a single live count), refreshes on new log entries, and dispatches
 * `openp41ge:open-log-system` when a row is clicked.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LogsSystemTabController } from "../../../src/renderer/apps/system-tabs/logs-system-tab";
import {
  registerLogStream,
  pushLog,
  clearLogBuffer,
  setMinLevel,
  LogLevel,
  _resetLogStreams,
} from "openp41ge-logger";

describe("LogsSystemTabController", () => {
  let host: HTMLElement;
  let controller: LogsSystemTabController;

  beforeEach(() => {
    clearLogBuffer();
    setMinLevel(LogLevel.DEBUG);
    _resetLogStreams();
    host = document.createElement("div");
    document.body.appendChild(host);
    controller = new LogsSystemTabController("sys-logs");
    controller.mount(host);
  });

  afterEach(() => {
    controller.unmount();
    host.remove();
  });

  it("renders one row per system aggregating its streams", () => {
    registerLogStream("openp41ge", "alpha");
    registerLogStream("openp41ge", "beta");
    pushLog(LogLevel.INFO, "openp41ge", "alpha", "hello");
    pushLog(LogLevel.INFO, "openp41ge", "beta", "world");

    const rows = host.querySelectorAll("[data-log-system]");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("openp41ge");
    // "2 streams" label + total count = 2
    expect(rows[0].textContent).toContain("2 streams");
    expect(rows[0].textContent).toContain("2");
  });

  it("renders a separate row per system", () => {
    registerLogStream("openp41ge", "a");
    registerLogStream("openp41ge-terminal", "b");
    const rows = host.querySelectorAll("[data-log-system]");
    expect(rows).toHaveLength(2);
  });

  it("updates the count when a system emits new entries", () => {
    registerLogStream("openp41ge", "beta");
    pushLog(LogLevel.WARN, "openp41ge", "beta", "one");
    let row = host.querySelector('[data-log-system="openp41ge"]')!;
    expect(row.textContent).toContain("1");

    pushLog(LogLevel.ERROR, "openp41ge", "beta", "two");
    row = host.querySelector('[data-log-system="openp41ge"]')!;
    expect(row.textContent).toContain("2");
  });

  it("shows an empty state when no streams are registered", () => {
    expect(host.textContent).toContain("No log systems yet");
  });

  it("dispatches openp41ge:open-log-system when a row is clicked", () => {
    registerLogStream("openp41ge", "gamma");
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { system: string };
      expect(detail.system).toBe("openp41ge");
    };
    document.addEventListener("openp41ge:open-log-system", listener, { once: true });

    const row = host.querySelector('[data-log-system="openp41ge"]') as HTMLElement;
    row.click();

    document.removeEventListener("openp41ge:open-log-system", listener);
  });

  it("footer keeps the settings button and no longer carries the Debug checkbox", () => {
    // The debug-logging toggle moved into the Logs settings grid tab.
    const settingsBtn = host.querySelector('button[aria-label="Log settings"]');
    expect(settingsBtn).toBeTruthy();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  });
});
