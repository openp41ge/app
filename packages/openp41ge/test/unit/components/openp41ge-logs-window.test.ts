/**
 * Unit tests for the standalone Logs window.
 *
 * Covers tab defaulting (one per logged system), opening a stream from the
 * picker drawer, tab activation/close, and column splitting. The component
 * re-uses the in-memory log stream registry, so streams are registered here
 * with `registerLogStream`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Openp41geLogsWindow } from "../../../src/renderer/components/openp41ge-logs-window";
import { registerLogStream, _resetLogStreams } from "openp41ge-logger";

type Lw = Openp41geLogsWindow & Record<string, unknown>;

function make(): Lw {
  return new Openp41geLogsWindow() as unknown as Lw;
}

beforeEach(() => {
  _resetLogStreams();
});

afterEach(() => {
  _resetLogStreams();
});

describe("openp41ge-logs-window", () => {
  it("opens one tab per logged system by default", async () => {
    registerLogStream("sys-a", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    const tabs = (el as unknown as { _tabs: Array<{ system: string }> })._tabs;
    expect(tabs.map((t) => t.system).sort()).toEqual(["sys-a", "sys-b"]);
    expect((el as unknown as { _cells: Array<{ tabIds: string[] }> })._cells.length).toBe(1);

    el.remove();
  });

  it("does not open default tabs before any stream registers", async () => {
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    expect((el as unknown as { _defaultsApplied: boolean })._defaultsApplied).toBe(false);
    expect((el as unknown as { _tabs: unknown[] })._tabs).toEqual([]);
    el.remove();
  });

  it("opens a stream from the picker and activates it", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    // Open the picker drawer.
    (el as unknown as { _openPicker(cellId: string): void })._openPicker(
      (el as unknown as { _cells: Array<{ id: string }> })._cells[0].id,
    );
    await el.updateComplete;
    expect((el as unknown as { _pickerFor: string | null })._pickerFor).not.toBeNull();

    // Pick the stream (same system → reuse the existing default tab, activate).
    (el as unknown as { _openStream(system: string, cellId: string | null): void })._openStream(
      "sys-a",
      (el as unknown as { _cells: Array<{ id: string }> })._cells[0].id,
    );
    await el.updateComplete;
    expect((el as unknown as { _tabs: Array<{ system: string }> })._tabs).toHaveLength(1);

    el.remove();
  });

  it("closes a tab and keeps the column usable", async () => {
    registerLogStream("sys-a", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const cells = (el as unknown as { _cells: Array<{ id: string; tabIds: string[] }> })._cells;
    const cell = cells[0];
    const firstTab = cell.tabIds[0];

    (el as unknown as { _closeTab(cellId: string, tabId: string): void })._closeTab(
      cell.id,
      firstTab,
    );
    await el.updateComplete;
    const after = (el as unknown as { _cells: Array<{ tabIds: string[] }> })._cells[0];
    expect(after.tabIds).toHaveLength(1);
    expect((el as unknown as { _tabs: unknown[] })._tabs).toHaveLength(1);

    el.remove();
  });

  it("splits a column", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const cell = (el as unknown as { _cells: Array<{ id: string }> })._cells[0];
    (el as unknown as { _splitCell(cellId: string): void })._splitCell(cell.id);
    await el.updateComplete;
    expect((el as unknown as { _cells: unknown[] })._cells).toHaveLength(2);
    el.remove();
  });
});
