/**
 * Unit tests for <openp41ge-logs-pane> — the manager window's unified Logs tab.
 *
 * Verifies: it renders log entries from the log bus (in-memory fallback path,
 * since jsdom has no `log:read-backward` bridge), errors are shown and open a
 * detail drawer on click, and the filter drawer filters by level / stream / text.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Openp41geLogsPane } from "../../../src/renderer/components/openp41ge-logs-pane";
import {
  pushLog,
  setMinLevel,
  LogLevel,
  clearLogBuffer,
  registerLogStream,
  _resetLogStreams,
} from "openp41ge-logger";

async function settled(el: Openp41geLogsPane): Promise<void> {
  await vi.waitFor(() => {
    expect(el.shadowRoot?.querySelector(".lp-loading")).toBeNull();
  });
  await el.updateComplete;
}

function rows(el: Openp41geLogsPane): HTMLElement[] {
  return [...(el.shadowRoot?.querySelectorAll<HTMLElement>("[data-testid=lp-entry]") ?? [])];
}

describe("openp41ge-logs-pane", () => {
  let el: Openp41geLogsPane;

  beforeEach(async () => {
    setMinLevel(LogLevel.DEBUG);
    clearLogBuffer();
    _resetLogStreams();
    // Force the in-memory bus fallback (no `log:read-backward` bridge in tests).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).openp41ge) (window as any).openp41ge.logs = undefined;
    el = new Openp41geLogsPane();
    document.body.appendChild(el);
    await settled(el);
  });

  afterEach(() => {
    el.remove();
    clearLogBuffer();
    _resetLogStreams();
  });

  it("renders log entries from the log bus", async () => {
    pushLog(LogLevel.INFO, "sys", "stream-a", "hello world");
    await settled(el);
    const items = rows(el);
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain("hello world");
    expect(items[0].textContent).toContain("[stream-a]");
  });

  it("renders all streams in one datetime-ordered list", async () => {
    pushLog(LogLevel.INFO, "a", "s1", "line one");
    pushLog(LogLevel.WARN, "b", "s2", "line two");
    await settled(el);

    const items = rows(el);
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("line one");
    expect(items[1].textContent).toContain("line two");
    // Both streams present together (no per-system grouping).
    expect(items[0].textContent).toContain("[s1]");
    expect(items[1].textContent).toContain("[s2]");
  });

  it("shows an empty state when the bus is empty", async () => {
    const empty = el.shadowRoot?.querySelector(".lp-empty");
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain("No log entries");
  });

  it("opens the detail drawer when an ERROR row is clicked", async () => {
    pushLog(LogLevel.ERROR, "sys", "stream-a", "an error happened");
    await settled(el);

    const errRow = rows(el)[0];
    expect(errRow.classList.contains("lp-entry--error")).toBe(true);

    errRow.click();
    await el.updateComplete;

    const drawer = el.shadowRoot?.querySelector("[data-testid=lp-detail-drawer]");
    expect(drawer).not.toBeNull();
    expect(drawer!.textContent).toContain("an error happened");
    expect(drawer!.textContent).toContain("error");
  });

  it("does not open the detail drawer for non-error rows", async () => {
    pushLog(LogLevel.INFO, "sys", "stream-a", "just info");
    await settled(el);

    rows(el)[0].click();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector("[data-testid=lp-detail-drawer]")).toBeNull();
  });

  it("opens the filter drawer and filters by minimum level", async () => {
    pushLog(LogLevel.DEBUG, "sys", "s", "debug line");
    pushLog(LogLevel.ERROR, "sys", "s", "error line");
    await settled(el);
    expect(rows(el).length).toBe(2);

    const filterBtn = el.shadowRoot?.querySelector<HTMLElement>("[data-testid=lp-filter-btn]");
    filterBtn!.click();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector("[data-testid=lp-filter-drawer]")).not.toBeNull();

    el.shadowRoot?.querySelector<HTMLElement>("[data-testid=lp-level-ERROR]")!.click();
    await el.updateComplete;

    const items = rows(el);
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain("error line");
  });

  it("filters by stream", async () => {
    registerLogStream("a", "first-stream");
    registerLogStream("b", "second-stream");
    pushLog(LogLevel.INFO, "a", "first-stream", "alpha");
    pushLog(LogLevel.INFO, "b", "second-stream", "beta");
    await settled(el);
    expect(rows(el).length).toBe(2);

    const filterBtn = el.shadowRoot?.querySelector<HTMLElement>("[data-testid=lp-filter-btn]");
    filterBtn!.click();
    await el.updateComplete;

    const firstStream = el.shadowRoot?.querySelector<HTMLElement>(
      "[data-testid=lp-stream-first-stream] input",
    );
    firstStream!.click();
    await el.updateComplete;

    const items = rows(el);
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain("alpha");
  });

  it("filters by text query", async () => {
    pushLog(LogLevel.INFO, "a", "s", "unique needle");
    pushLog(LogLevel.INFO, "b", "s2", "unrelated");
    await settled(el);
    expect(rows(el).length).toBe(2);

    const filterBtn = el.shadowRoot?.querySelector<HTMLElement>("[data-testid=lp-filter-btn]");
    filterBtn!.click();
    await el.updateComplete;

    const input = el.shadowRoot?.querySelector<HTMLInputElement>("[data-testid=lp-query]");
    input!.value = "needle";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await el.updateComplete;

    const items = rows(el);
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain("unique needle");
  });

  it("clears filters", async () => {
    pushLog(LogLevel.ERROR, "s", "stream", "boom");
    await settled(el);

    const filterBtn = el.shadowRoot?.querySelector<HTMLElement>("[data-testid=lp-filter-btn]");
    filterBtn!.click();
    await el.updateComplete;
    el.shadowRoot?.querySelector<HTMLElement>("[data-testid=lp-level-ERROR]")!.click();
    await el.updateComplete;
    expect(rows(el).length).toBe(1);

    el.shadowRoot?.querySelector<HTMLElement>(".lp-drawer-actions .lp-btn--clear")!.click();
    await el.updateComplete;
    expect(rows(el).length).toBe(1); // still shows the single ERROR row
  });
});
