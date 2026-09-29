/**
 * Unit tests for the standalone Logs window.
 *
 * Covers tab defaulting (one per logged system), opening a stream from the
 * picker drawer, tab activation/close, column add, and the drag/reorder/split
 * events the shared <tab-grid> bubbles up (grid-activate, grid-move,
 * grid-split, tab-bar-reorder, tab-bar-move-cell). The component re-uses the
 * in-memory log stream registry, so streams are registered here with
 * `registerLogStream`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Openp41geLogsWindow } from "../../../src/renderer/components/openp41ge-logs-window";
import { registerLogStream, _resetLogStreams } from "openp41ge-logger";

type Lw = Openp41geLogsWindow & Record<string, unknown>;

interface TestPlacement {
  position: { row: number; col: number };
  tabIds: string[];
}

function make(): Lw {
  return new Openp41geLogsWindow() as unknown as Lw;
}

function placements(el: Lw): TestPlacement[] {
  return (el as unknown as { _placements: TestPlacement[] })._placements;
}

function tabIds(el: Lw): string[] {
  return placements(el).flatMap((p) => p.tabIds);
}

function activeTabIds(el: Lw): Record<string, string> {
  return (el as unknown as { _activeTabIds: Record<string, string> })._activeTabIds;
}

function grid(el: Lw): HTMLElement {
  const g = (el as unknown as ShadowRoot).shadowRoot?.querySelector("tab-grid");
  if (!g) throw new Error("tab-grid not rendered");
  return g as HTMLElement;
}

function dispatch(el: Lw, name: string, detail: Record<string, unknown>): void {
  grid(el).dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
}

/** The “＋” button rendered at the right end of a column's tab bar. Both
 *  <tab-grid> and <tab-bar> render in light DOM, so the button is a plain
 *  descendant of the grid host. */
function tabBarAddButton(el: Lw): HTMLElement | null {
  return grid(el).querySelector<HTMLElement>(".tab-bar-add");
}

beforeEach(() => {
  _resetLogStreams();
});

afterEach(() => {
  _resetLogStreams();
});

describe("openp41ge-logs-window", () => {
  it("opens one tab per logged system in a single column by default", async () => {
    registerLogStream("sys-a", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    const systems = (el as unknown as { _tabs: Array<{ system: string }> })._tabs.map(
      (t) => t.system,
    );
    expect(systems.sort()).toEqual(["sys-a", "sys-b"]);
    expect(placements(el)).toHaveLength(1);
    expect(placements(el)[0].tabIds).toHaveLength(2);
    expect(activeTabIds(el)["0"]).toBe(placements(el)[0].tabIds[0]);

    el.remove();
  });

  it("does not open default tabs before any stream registers", async () => {
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    expect((el as unknown as { _defaultsApplied: boolean })._defaultsApplied).toBe(false);
    expect((el as unknown as { _tabs: unknown[] })._tabs).toEqual([]);
    expect(placements(el)).toEqual([]);
    el.remove();
  });

  it("opens a stream from the picker and reuses the existing tab", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    expect(tabIds(el)).toHaveLength(1);

    (el as unknown as { _openPicker(): void })._openPicker();
    await el.updateComplete;
    const picker = (el as unknown as ShadowRoot).shadowRoot?.querySelector(
      '[data-testid="lw-picker"]',
    );
    expect(picker).toBeTruthy();

    (el as unknown as { _openStream(system: string, col?: number): void })._openStream("sys-a");
    await el.updateComplete;
    // Same system → reuse the single existing tab.
    expect(tabIds(el)).toHaveLength(1);

    el.remove();
  });

  it("closes a tab and keeps the column usable", async () => {
    registerLogStream("sys-a", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const first = placements(el)[0].tabIds[0];

    (el as unknown as { _closeTab(tabId: string): void })._closeTab(first);
    await el.updateComplete;
    expect(tabIds(el)).toHaveLength(1);
    expect((el as unknown as { _tabs: unknown[] })._tabs).toHaveLength(1);
    expect(placements(el)).toHaveLength(1);

    el.remove();
  });

  it("adds an empty column", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    (el as unknown as { _addColumn(): void })._addColumn();
    await el.updateComplete;
    expect(placements(el)).toHaveLength(2);
    expect(placements(el)[1].tabIds).toEqual([]);
    el.remove();
  });

  it("activates a tab via grid-activate", async () => {
    registerLogStream("sys-a", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const p = placements(el)[0];
    dispatch(el, "grid-activate", { tabId: p.tabIds[1], col: 0 });
    await el.updateComplete;
    expect(activeTabIds(el)["0"]).toBe(p.tabIds[1]);
    el.remove();
  });

  it("reorders tabs within a column via tab-bar-reorder", async () => {
    registerLogStream("sys-a", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const before = placements(el)[0].tabIds;

    // Move the last tab to index 0.
    dispatch(el, "tab-bar-reorder", { col: 0, fromIndex: 1, toIndex: 0 });
    await el.updateComplete;
    expect(placements(el)[0].tabIds).toEqual([before[1], before[0]]);
    el.remove();
  });

  it("moves a tab across columns via tab-bar-move-cell", async () => {
    registerLogStream("sys-a", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const [first, second] = placements(el)[0].tabIds;

    // Add a second column, then move the first tab into it at the front.
    (el as unknown as { _addColumn(): void })._addColumn();
    await el.updateComplete;
    dispatch(el, "tab-bar-move-cell", { tabId: first, targetCol: 1, dropIndex: 0 });
    await el.updateComplete;
    expect(placements(el)).toHaveLength(2);
    expect(placements(el)[0].tabIds).toEqual([second]);
    expect(placements(el)[1].tabIds).toEqual([first]);
    expect(activeTabIds(el)["1"]).toBe(first);
    el.remove();
  });

  it("splits a tab into a new column via grid-split", async () => {
    registerLogStream("sys-a", "name-a");
    registerLogStream("sys-b", "name-b");
    registerLogStream("sys-c", "name-c");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const tabs = placements(el)[0].tabIds;

    // Split the middle tab off to the right (splitCol 0, splitLeft false).
    dispatch(el, "grid-split", { tabId: tabs[1], splitCol: 0, splitLeft: false });
    await el.updateComplete;
    expect(placements(el)).toHaveLength(2);
    expect(placements(el)[1].tabIds).toEqual([tabs[1]]);
    expect(activeTabIds(el)["1"]).toBe(tabs[1]);
    el.remove();
  });

  it("moves an empty grid's first tab via grid-move", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const tab = placements(el)[0].tabIds[0];

    dispatch(el, "grid-move", { tabId: tab, targetCol: 0, insertAt: -1 });
    await el.updateComplete;
    expect(placements(el)).toHaveLength(1);
    expect(placements(el)[0].tabIds).toEqual([tab]);
    el.remove();
  });

  it("has a clean top bar (no title, no add buttons)", async () => {
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const root = el.shadowRoot as unknown as ShadowRoot;
    expect(root.querySelector(".lw-title")).toBeNull();
    expect(root.querySelector('[data-testid="lw-add-stream"]')).toBeNull();
    expect(root.querySelector('[data-testid="lw-add-column"]')).toBeNull();
    el.remove();
  });

  it("renders a + button at the end of the tab bar that opens the picker", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    // The <tab-bar> is a nested custom element; let it finish its first render.
    const g = grid(el);
    await (g as unknown as { updateComplete: Promise<void> }).updateComplete;
    const bar = g.querySelector("tab-bar") as unknown as {
      updateComplete: Promise<void>;
    } | null;
    await bar?.updateComplete;

    const addBtn = tabBarAddButton(el);
    expect(addBtn).toBeTruthy();
    addBtn!.click();
    await el.updateComplete;

    const picker = (el.shadowRoot as unknown as ShadowRoot).querySelector(
      '[data-testid="lw-picker"]',
    );
    expect(picker).toBeTruthy();
    el.remove();
  });

  it("toggles the sidebar on Cmd+B and opens a stream from it", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    // Sidebar is closed (and not rendered) by default.
    expect(
      (el.shadowRoot as unknown as ShadowRoot).querySelector('[data-testid="lw-sidebar"]'),
    ).toBeNull();

    // A stream registered after the default tabs were applied has no default
    // tab; opening it from the sidebar adds a new tab.
    registerLogStream("sys-b", "name-b");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true, bubbles: true }));
    await el.updateComplete;

    const sidebar = (el.shadowRoot as unknown as ShadowRoot).querySelector<HTMLElement>(
      '[data-testid="lw-sidebar"]',
    );
    expect(sidebar).toBeTruthy();
    expect(sidebar!.getAttribute("data-side")).toBe("right");

    // Click the sys-b row (registrations are listed in registration order).
    const rows = sidebar!.querySelectorAll<HTMLElement>('[data-testid="lw-sidebar-row"]');
    const targetRow = Array.from(rows).find((r) => r.getAttribute("data-system") === "sys-b");
    expect(targetRow).toBeTruthy();
    targetRow!.click();
    await el.updateComplete;
    const systems = (el as unknown as { _tabs: Array<{ system: string }> })._tabs.map(
      (t) => t.system,
    );
    expect(systems).toContain("sys-b");
    el.remove();
  });

  it("toggles the sidebar from the titlebar button", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    const btn = (el.shadowRoot as unknown as ShadowRoot).querySelector<HTMLElement>(
      '[data-testid="lw-sidebar-toggle"]',
    );
    expect(btn).toBeTruthy();
    expect(
      (el.shadowRoot as unknown as ShadowRoot).querySelector('[data-testid="lw-sidebar"]'),
    ).toBeNull();

    btn!.click();
    await el.updateComplete;
    expect(
      (el.shadowRoot as unknown as ShadowRoot).querySelector('[data-testid="lw-sidebar"]'),
    ).toBeTruthy();

    btn!.click();
    await el.updateComplete;
    expect(
      (el.shadowRoot as unknown as ShadowRoot).querySelector('[data-testid="lw-sidebar"]'),
    ).toBeNull();
    el.remove();
  });
});
