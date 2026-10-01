/**
 * Unit tests for the standalone Logs window.
 *
 * Covers tab defaulting (only the platform log auto-opens), opening a stream
 * from the picker drawer, tab activation/close, column add, and the
 * drag/reorder/split events the shared <tab-grid> bubbles up (grid-activate,
 * grid-move, grid-split, tab-bar-reorder, tab-bar-move-cell). The component
 * re-uses the in-memory log stream registry, so streams are registered here
 * with `registerLogStream`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

function openStream(el: Lw, system: string): void {
  (
    el as unknown as { _openStream(system: string, col?: number, pinned?: boolean): void }
  )._openStream(system);
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
  it("opens only the platform log by default; other systems are not auto-opened", async () => {
    registerLogStream("openp41ge", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    const systems = (el as unknown as { _tabs: Array<{ system: string }> })._tabs.map(
      (t) => t.system,
    );
    expect(systems).toEqual(["openp41ge"]);
    expect(placements(el)).toHaveLength(1);
    expect(placements(el)[0].tabIds).toHaveLength(1);
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

  it("opens a stream from the sidebar and reuses the existing tab", async () => {
    registerLogStream("openp41ge", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    expect(tabIds(el)).toHaveLength(1);

    (
      el as unknown as { _openStream(system: string, col?: number, pinned?: boolean): void }
    )._openStream("openp41ge");
    await el.updateComplete;
    // Same system → reuse the single existing tab.
    expect(tabIds(el)).toHaveLength(1);

    el.remove();
  });

  it("opens a stream as an unpinned preview, then promotes it to pinned", async () => {
    registerLogStream("openp41ge", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    // sys-b is not open; a single click (pinned=false) opens an unpinned preview.
    (
      el as unknown as { _openStream(system: string, col?: number, pinned?: boolean): void }
    )._openStream("sys-b", undefined, false);
    await el.updateComplete;
    const sysB = (
      el as unknown as { _tabs: Array<{ system: string; pinned: boolean }> }
    )._tabs.find((t) => t.system === "sys-b");
    expect(sysB?.pinned).toBe(false);

    // A drag/drop open (pinned=true) promotes the preview to pinned.
    (
      el as unknown as { _openStream(system: string, col?: number, pinned?: boolean): void }
    )._openStream("sys-b", undefined, true);
    await el.updateComplete;
    const pinnedB = (
      el as unknown as { _tabs: Array<{ system: string; pinned: boolean }> }
    )._tabs.find((t) => t.system === "sys-b");
    expect(pinnedB?.pinned).toBe(true);
    expect(tabIds(el)).toHaveLength(2);

    el.remove();
  });

  it("replaces the unpinned preview in a column when another stream is previewed", async () => {
    registerLogStream("sys-a", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    (
      el as unknown as { _openStream(system: string, col?: number, pinned?: boolean): void }
    )._openStream("sys-c", undefined, false);
    await el.updateComplete;
    const syses = (el as unknown as { _tabs: Array<{ system: string }> })._tabs.map(
      (t) => t.system,
    );
    expect(syses).toContain("sys-c");
    const sysC = (
      el as unknown as { _tabs: Array<{ system: string; pinned: boolean }> }
    )._tabs.find((t) => t.system === "sys-c");
    expect(sysC?.pinned).toBe(false);

    // Previewing sys-d replaces the sys-c preview in the same column.
    (
      el as unknown as { _openStream(system: string, col?: number, pinned?: boolean): void }
    )._openStream("sys-d", undefined, false);
    await el.updateComplete;
    const after = (el as unknown as { _tabs: Array<{ system: string }> })._tabs.map(
      (t) => t.system,
    );
    expect(after).not.toContain("sys-c");
    expect(after).toContain("sys-d");

    el.remove();
  });

  it("opens a dropped stream row as a pinned tab via grid-open-tab", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    dispatch(el, "grid-open-tab", {
      tabType: "log-viewer",
      tabConfig: { system: "sys-b" },
      targetCol: 0,
      pinned: true,
    });
    await el.updateComplete;
    const sysB = (
      el as unknown as { _tabs: Array<{ system: string; pinned: boolean }> }
    )._tabs.find((t) => t.system === "sys-b");
    expect(sysB).toBeTruthy();
    expect(sysB?.pinned).toBe(true);
    el.remove();
  });

  it("closes a tab and keeps the column usable", async () => {
    registerLogStream("openp41ge", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    (
      el as unknown as { _openStream(system: string, col?: number, pinned?: boolean): void }
    )._openStream("sys-b");
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
    registerLogStream("openp41ge", "name-a");
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
    registerLogStream("openp41ge", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    openStream(el, "sys-b");
    await el.updateComplete;
    const p = placements(el)[0];
    dispatch(el, "grid-activate", { tabId: p.tabIds[1], col: 0 });
    await el.updateComplete;
    expect(activeTabIds(el)["0"]).toBe(p.tabIds[1]);
    el.remove();
  });

  it("reorders tabs within a column via tab-bar-reorder", async () => {
    registerLogStream("openp41ge", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    openStream(el, "sys-b");
    await el.updateComplete;
    const before = placements(el)[0].tabIds;

    // Move the last tab to index 0.
    dispatch(el, "tab-bar-reorder", { col: 0, fromIndex: 1, toIndex: 0 });
    await el.updateComplete;
    expect(placements(el)[0].tabIds).toEqual([before[1], before[0]]);
    el.remove();
  });

  it("moves a tab across columns via tab-bar-move-cell", async () => {
    registerLogStream("openp41ge", "name-a");
    registerLogStream("sys-b", "name-b");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    openStream(el, "sys-b");
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
    registerLogStream("openp41ge", "name-a");
    registerLogStream("sys-b", "name-b");
    registerLogStream("sys-c", "name-c");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    openStream(el, "sys-b");
    openStream(el, "sys-c");
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
    registerLogStream("openp41ge", "name-a");
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

  it("resolves the grid drop target from the shadow root (pierces shadow DOM)", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const sr = el.shadowRoot as unknown as ShadowRoot;
    const g = grid(el);
    expect(g.dropTarget).toBeTruthy();

    // Regression: `document.elementFromPoint` returns the shadow HOST for a
    // point inside this window, so `.closest("tab-bar"/"tab-grid")` never
    // matched and a drag could resolve no drop target (tabs couldn't be moved
    // or split into cells). The resolver must resolve from the shadow root.
    // jsdom's elementFromPoint is unimplemented, so stub it to return a real
    // element inside the grid's tab bar, i.e. exactly what the fix does.
    const probe = g.querySelector<HTMLElement>("tab-bar") ?? (g as HTMLElement);
    (
      sr as ShadowRoot & { elementFromPoint: (x: number, y: number) => Element | null }
    ).elementFromPoint = () => probe;
    const dt = (el as unknown as { _resolveTarget(x: number, y: number): unknown })._resolveTarget(
      100,
      100,
    );
    expect(dt).toBeTruthy();
    el.remove();
  });

  it("paints the grid drop indicator (ghost overlay) during a drag and clears it on drop", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const g = grid(el);

    // Regression: the orchestrator resolves the grid drop target but never
    // renders its ghost, so the logs window showed no split/cell indicator.
    // The host must paint the overlay itself from the drop target's feedback.
    const source = { getDragData: () => ({ type: "tab", tabId: "x", winId: "w" }) };
    const target = {
      element: g,
      onHover: () => ({ showGhost: true, ghostConfig: { cols: 2, boundaryIndex: 1 } }),
    };
    (el as unknown as { _resolveTarget: () => unknown })._resolveTarget = () => target;
    (el as unknown as { _beginDrag: (s: unknown) => void })._beginDrag(source);
    (el as unknown as { _updateGridGhost: (x: number, y: number) => void })._updateGridGhost(
      100,
      100,
    );

    expect(g.querySelector(".openp41ge-ghost-overlay")).toBeTruthy();

    (el as unknown as { _onDragEnd: () => void })._onDragEnd();
    expect(g.querySelector(".openp41ge-ghost-overlay")).toBeNull();
    el.remove();
  });

  it("drives the main-process bitmap drag ghost from drag events (tab & stream)", async () => {
    registerLogStream("sys-a", "name-a");
    const start = vi.fn();
    const move = vi.fn();
    const end = vi.fn();
    (window as unknown as { openp41ge: unknown }).openp41ge = { drag: { start, move, end } };

    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    // Tab drag: the deferred start is captured on mousedown and fired on the
    // first POSITION event (after the drag threshold), so the main process can
    // capturePage a bitmap of the tab button. The in-DOM grid ghost must not
    // appear before the threshold.
    const tabPending = {
      label: "sys-a",
      screenX: 100,
      screenY: 200,
      tabId: "t1",
      winId: "logs-window",
      worksetId: "logs-window",
      width: 120,
      height: 30,
      offsetX: 4,
      offsetY: 5,
      captureRect: { x: 10, y: 20, width: 116, height: 26 },
    };
    (el as unknown as { _pendingTabDragStart: unknown })._pendingTabDragStart = tabPending;
    (el as unknown as { _beginDrag: (s: unknown) => void })._beginDrag({
      getDragData: () => ({ type: "tab", tabId: "t1" }),
    });

    document.dispatchEvent(
      new CustomEvent("openp41ge-drag-position", {
        detail: { screenX: 300, screenY: 400 },
      }),
    );
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0]).toBe("sys-a");
    expect(start.mock.calls[0][11]).toBe("tab"); // dragType
    expect(start.mock.calls[0][13]).toEqual(tabPending.captureRect);
    expect(start.mock.calls[0][14]).toBe(2); // capture inset
    expect(start.mock.calls[0][3]).toBeUndefined(); // no emoji
    expect(move).toHaveBeenCalledWith(300, 400);

    (el as unknown as { _onDragEnd: () => void })._onDragEnd();
    expect(end).toHaveBeenCalledTimes(1);
    expect((el as unknown as { _pendingTabDragStart: unknown })._pendingTabDragStart).toBeNull();
    el.remove();
  });

  it("fires a row-style open-tab ghost for a sidebar stream drag", async () => {
    registerLogStream("sys-a", "name-a");
    const start = vi.fn();
    const move = vi.fn();
    const end = vi.fn();
    (window as unknown as { openp41ge: unknown }).openp41ge = { drag: { start, move, end } };

    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    const streamPending = {
      label: "sys-a",
      screenX: 50,
      screenY: 60,
      system: "sys-a",
      winId: "logs-window",
      offsetX: 2,
      offsetY: 3,
      width: 200,
      height: 24,
      captureRect: { x: 1, y: 1, width: 196, height: 20 },
    };
    (el as unknown as { _pendingStreamDragStart: unknown })._pendingStreamDragStart = streamPending;
    (el as unknown as { _beginDrag: (s: unknown) => void })._beginDrag({
      getDragData: () => ({ type: "open-tab" }),
    });

    document.dispatchEvent(
      new CustomEvent("openp41ge-drag-position", {
        detail: { screenX: 90, screenY: 120 },
      }),
    );
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][11]).toBe("open-tab"); // row-style dragType
    expect(start.mock.calls[0][13]).toEqual(streamPending.captureRect);
    // The open-tab payload rides so a target (or this window) can open the
    // stream-scoped pane from the drag data.
    expect(start.mock.calls[0][15]).toEqual({
      appType: "log-viewer",
      tabConfig: { system: "sys-a" },
    });

    (el as unknown as { _onDragEnd: () => void })._onDragEnd();
    expect(end).toHaveBeenCalledTimes(1);
    expect(
      (el as unknown as { _pendingStreamDragStart: unknown })._pendingStreamDragStart,
    ).toBeNull();
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

  it("has no + button at the end of the tab bar (streams open from the sidebar)", async () => {
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

    // The logs window opts out of the trailing “＋” (barShowAdd=false).
    expect(tabBarAddButton(el)).toBeNull();
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

  it("renders a workspace-style sidebar tab bar with a ＋ button on the right edge", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    (el as unknown as { _sidebarOpen: boolean })._sidebarOpen = true;
    await el.updateComplete;

    const sr = el.shadowRoot as unknown as ShadowRoot;
    // Streams opens by default; Search does not.
    expect(sr.querySelector('[data-testid="lw-sbtab-streams"]')).toBeTruthy();
    expect(sr.querySelector('[data-testid="lw-sbtab-search"]')).toBeNull();
    expect(sr.querySelector('[data-testid="lw-sbtab-streams"]')?.classList.contains("active")).toBe(
      true,
    );
    // The ＋ button is pinned to the right edge of the tab bar.
    const add = sr.querySelector<HTMLElement>('[data-testid="lw-sb-add"]');
    expect(add).toBeTruthy();
    expect(add!.textContent?.trim()).toBe("＋");
    // Workspace-style tab chrome (close affordance + tab label).
    const tab = sr.querySelector<HTMLElement>('[data-testid="lw-sbtab-streams"]');
    expect(tab!.querySelector(".lw-sb-tab-label")?.textContent?.trim()).toBe("Streams");
    expect(tab!.querySelector(".lw-sb-tab-close")).toBeTruthy();
    expect(tab!.querySelector(".lw-sb-add")).toBeNull();
    el.remove();
  });

  it("opens Streams and Search from the ＋ menu", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    (el as unknown as { _sidebarOpen: boolean })._sidebarOpen = true;
    await el.updateComplete;

    // Capture the context menu the ＋ creates (it isn't registered in jsdom).
    let captured: {
      items?: Array<{ label: string; action?: () => void; badge?: string }>;
    } | null = null;
    const orig = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(
      (tag: string, opts?: ElementCreationOptions) => {
        const node = orig(tag, opts);
        if (String(tag).toLowerCase() === "openp41ge-contextmenu") captured = node as never;
        return node;
      },
    );

    const add = (el.shadowRoot as unknown as ShadowRoot).querySelector<HTMLElement>(
      '[data-testid="lw-sb-add"]',
    );
    add!.click();
    expect(captured).toBeTruthy();
    expect(captured!.items?.map((i) => i.label)).toEqual(["Streams", "Search"]);
    // Streams is already open, so it carries an "open" badge; Search is not.
    expect(captured!.items?.[0]?.badge).toBe("open");
    expect(captured!.items?.[1]?.badge).toBe("");

    // Choose Search from the menu → opens + activates it.
    captured!.items![1]?.action?.();
    await el.updateComplete;
    expect(
      (el.shadowRoot as unknown as ShadowRoot).querySelector('[data-testid="lw-sbtab-search"]'),
    ).toBeTruthy();
    expect(
      (el.shadowRoot as unknown as ShadowRoot)
        .querySelector('[data-testid="lw-sbtab-search"]')
        ?.classList.contains("active"),
    ).toBe(true);
    // The side content shows the search pane.
    expect(
      (el.shadowRoot as unknown as ShadowRoot).querySelector('[data-testid="lw-search"]'),
    ).toBeTruthy();

    vi.restoreAllMocks();
    el.remove();
  });

  it("closes a sidebar tab and falls back to the remaining one", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    (el as unknown as { _sidebarOpen: boolean })._sidebarOpen = true;
    await el.updateComplete;
    (el as unknown as { _openSidebarTab: (id: string) => void })._openSidebarTab("search");
    await el.updateComplete;

    const sr = el.shadowRoot as unknown as ShadowRoot;
    expect(sr.querySelector('[data-testid="lw-sbtab-search"]')).toBeTruthy();
    expect(sr.querySelector('[data-testid="lw-sbtab-streams"]')).toBeTruthy();

    // Close Search (active) → Streams becomes active; Search tab goes away.
    (sr.querySelector('[data-testid="lw-sbtab-close-search"]') as HTMLElement).click();
    await el.updateComplete;
    expect(sr.querySelector('[data-testid="lw-sbtab-search"]')).toBeNull();
    expect(sr.querySelector('[data-testid="lw-sbtab-streams"]')?.classList.contains("active")).toBe(
      true,
    );
    el.remove();
  });

  it("renders a resize notch (drag bar) with a hover drag-line on the grid-facing edge", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    (el as unknown as { _sidebarOpen: boolean })._sidebarOpen = true;
    await el.updateComplete;

    const sr = el.shadowRoot as unknown as ShadowRoot;
    const notch = sr.querySelector<HTMLElement>(".lw-notch-v.right-notch");
    expect(notch).toBeTruthy();
    // The notch hosts the shared blue drag-line + its overdraw companion.
    const line = notch!.querySelector<HTMLElement>("drag-line");
    expect(line).toBeTruthy();
    expect(notch!.querySelector("drag-line-overdraw")).toBeTruthy();
    // On the grid-facing edge: for the right sidebar it sits between the grid
    // and the sidebar (grid → notch → sidebar).
    const gridEl = sr.querySelector<HTMLElement>(".lw-grid");
    const sidebar = sr.querySelector<HTMLElement>('[data-testid="lw-sidebar"]');
    expect(gridEl!.compareDocumentPosition(notch!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      notch!.compareDocumentPosition(sidebar!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Hovering the notch lights the drag-line; leaving it hides it again.
    expect(line!.hasAttribute("show")).toBe(false);
    notch!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(line!.hasAttribute("show")).toBe(true);
    notch!.dispatchEvent(new MouseEvent("mouseleave"));
    expect(line!.hasAttribute("show")).toBe(false);
    el.remove();
  });

  it("drags the sidebar resize notch to resize it, clamped to min/max", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    (el as unknown as { _sidebarOpen: boolean })._sidebarOpen = true;
    await el.updateComplete;

    const sr = el.shadowRoot as unknown as ShadowRoot;
    const notch = sr.querySelector<HTMLElement>(".lw-notch-v.right-notch")!;
    const sidebar = sr.querySelector<HTMLElement>('[data-testid="lw-sidebar"]')!;
    expect(sidebar.style.width).toBe("260px");

    // Right sidebar drag: dragging left (-dx) widens it — 100 → 40 = +60px.
    notch.dispatchEvent(new MouseEvent("mousedown", { clientX: 100 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 40 }));
    expect(sidebar.style.width).toBe("320px");
    // The drag-line stays lit while dragging.
    expect(notch.querySelector("drag-line")?.hasAttribute("show")).toBe(true);
    // Mouseup ends the drag and hides the drag-line.
    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(sidebar.style.width).toBe("320px");
    expect(notch.querySelector("drag-line")?.hasAttribute("show")).toBe(false);
    expect((el as unknown as { _sidebarWidth: number })._sidebarWidth).toBe(320);

    // Clamp to the maximum sidebar width.
    notch.dispatchEvent(new MouseEvent("mousedown", { clientX: 100 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: -100000 }));
    expect(parseInt(sidebar.style.width, 10)).toBe(600);
    document.dispatchEvent(new MouseEvent("mouseup"));

    // Clamp to the minimum sidebar width.
    notch.dispatchEvent(new MouseEvent("mousedown", { clientX: 100 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100000 }));
    expect(parseInt(sidebar.style.width, 10)).toBe(160);
    document.dispatchEvent(new MouseEvent("mouseup"));
    el.remove();
  });

  it("shows edge shadows on the sidebar tab strip while it overflows", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    (el as unknown as { _sidebarOpen: boolean })._sidebarOpen = true;
    (el as unknown as { _openSidebarTab: (id: string) => void })._openSidebarTab("search");
    await el.updateComplete;

    const sr = el.shadowRoot as unknown as ShadowRoot;
    const scroll = sr.querySelector<HTMLElement>(".lw-sb-tabs")!;
    const left = sr.querySelector<HTMLElement>(".lw-sb-shadow.left")!;
    const right = sr.querySelector<HTMLElement>(".lw-sb-shadow.right")!;
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();

    // Simulate a strip that overflows to the right (no scroll yet).
    Object.defineProperty(scroll, "scrollWidth", { value: 400, configurable: true });
    Object.defineProperty(scroll, "clientWidth", { value: 200, configurable: true });
    Object.defineProperty(scroll, "scrollLeft", { value: 0, configurable: true, writable: true });
    scroll.dispatchEvent(new Event("scroll"));
    await el.updateComplete;
    expect(right.style.opacity).toBe("1");
    expect(left.style.opacity).toBe("0");

    // Scrolled to the right end → left shadow shows, right hides.
    scroll.scrollLeft = 200;
    scroll.dispatchEvent(new Event("scroll"));
    await el.updateComplete;
    expect(left.style.opacity).toBe("1");
    expect(right.style.opacity).toBe("0");

    // Middle → both edges overflow.
    scroll.scrollLeft = 100;
    scroll.dispatchEvent(new Event("scroll"));
    await el.updateComplete;
    expect(left.style.opacity).toBe("1");
    expect(right.style.opacity).toBe("1");
    el.remove();
  });

  it("scrolls the sidebar tab strip to reveal a clicked tab that is clipped", async () => {
    registerLogStream("sys-a", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    (el as unknown as { _sidebarOpen: boolean })._sidebarOpen = true;
    (el as unknown as { _openSidebarTab: (id: string) => void })._openSidebarTab("search");
    await el.updateComplete;

    const sr = el.shadowRoot as unknown as ShadowRoot;
    const scroll = sr.querySelector<HTMLElement>(".lw-sb-tabs")!;
    const searchTab = sr.querySelector<HTMLElement>('[data-testid="lw-sbtab-search"]')!;

    // The strip is scrolled right and the Search tab sits off the right edge.
    Object.defineProperty(scroll, "scrollLeft", { value: 100, configurable: true, writable: true });
    const orig = searchTab.getBoundingClientRect.bind(searchTab);
    vi.spyOn(searchTab, "getBoundingClientRect").mockReturnValue({
      left: 400,
      right: 520,
      top: 0,
      bottom: 0,
      width: 120,
      height: 34,
      x: 400,
      y: 0,
    } as DOMRect);
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 200,
      top: 0,
      bottom: 0,
      width: 200,
      height: 34,
      x: 0,
      y: 0,
    } as DOMRect);
    void orig;

    searchTab.click();
    await el.updateComplete;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    // scrollLeft = max(0, 400 - 0 + 100 - 8) = 492
    expect((el as unknown as { _sidebarTab: string })._sidebarTab).toBe("search");
    expect(scroll.scrollLeft).toBe(492);
    vi.restoreAllMocks();
    el.remove();
  });
});

describe("log detail drawer", () => {
  const entry = {
    timestamp: 1234567890000,
    level: 3,
    levelLabel: "ERROR",
    system: "openp41ge",
    source: "mod",
    message: "boom\n    at fn (a.js:1:2)",
    process: "renderer",
  };

  /** Dispatch a log-row-click whose composed path reports the given cell. */
  function clickRow(el: Lw, cell: Element | null): void {
    const evt = new CustomEvent("log-row-click", {
      detail: { entry },
      bubbles: true,
    }) as CustomEvent & { composedPath(): EventTarget[] };
    Object.defineProperty(evt, "composedPath", {
      value: () => (cell ? [cell, document] : []),
    });
    (el as unknown as ShadowRoot).shadowRoot!.dispatchEvent(evt);
  }

  /** A connected grid-cell element with a mocked bounding box. */
  function mockCell(left: number, width: number): HTMLElement {
    const cell = document.createElement("div");
    cell.className = "grid-cell";
    document.body.appendChild(cell);
    vi.spyOn(cell, "getBoundingClientRect").mockReturnValue({
      left,
      top: 50,
      width,
      height: 600,
      right: left + width,
      bottom: 650,
    } as DOMRect);
    return cell;
  }

  it("opens a detail drawer when the viewer emits a log-row-click", async () => {
    registerLogStream("openp41ge", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    clickRow(el, null);
    await el.updateComplete;

    const drawers = (el as unknown as { _drawers: Array<Record<string, unknown>> })._drawers;
    expect(drawers).toHaveLength(1);
    expect(drawers[0].detail.message).toBe("boom");
    expect(drawers[0].detail.stack).toContain("at fn (a.js:1:2)");
    expect(drawers[0].detail.source).toBe("mod");
    expect(drawers[0].detail.process).toBe("renderer");

    const drawer = (el as unknown as ShadowRoot).shadowRoot!.querySelector(
      '[data-testid="lw-detail-drawer"]',
    );
    expect(drawer).toBeTruthy();
    expect(drawer?.textContent).toContain("boom");
    expect(drawer?.textContent).toContain("at fn (a.js:1:2)");

    // The drawer overlays the tab bar, so it carries a top bar with a title and
    // a close button (matching the tab bar's height).
    const head = drawer!.querySelector<HTMLElement>(".lw-drawer-head")!;
    expect(head).toBeTruthy();
    expect(drawer!.querySelector('[data-testid="lw-drawer-title"]')!.textContent?.trim()).toBe(
      "Log details",
    );

    // Clicking the mask closes the drawer.
    const mask = (el as unknown as ShadowRoot).shadowRoot!.querySelector<HTMLElement>(
      ".lw-drawer-mask",
    )!;
    mask.click();
    await el.updateComplete;
    expect((el as unknown as { _drawers: unknown[] })._drawers).toHaveLength(0);

    el.remove();
  });

  it("renders Message/Stack in code blocks and decodes HTML entities", async () => {
    registerLogStream("openp41ge", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    const ent = {
      timestamp: 1234567890000,
      level: 3,
      levelLabel: "ERROR",
      system: "openp41ge",
      source: "mod",
      message: 'parse error at "line" &amp; more\n    at fn &quot;quoted&quot; (a.js:1:2)',
      process: "renderer",
    };
    const evt = new CustomEvent("log-row-click", {
      detail: { entry: ent },
      bubbles: true,
    }) as CustomEvent & { composedPath(): EventTarget[] };
    Object.defineProperty(evt, "composedPath", { value: () => [document] });
    (el as unknown as ShadowRoot).shadowRoot!.dispatchEvent(evt);
    await el.updateComplete;

    const sr = (el as unknown as ShadowRoot).shadowRoot!;

    // Both Message and Stack sit in square, bordered code-block wrappers with
    // corner overdraw accents; the inner <pre> holds the selectable content.
    const messageBlock = sr.querySelector<HTMLElement>('[data-testid="lw-codeblock-message"]')!;
    const stackBlock = sr.querySelector<HTMLElement>('[data-testid="lw-codeblock-stack"]')!;
    expect(messageBlock.classList.contains("lw-codeblock")).toBe(true);
    expect(stackBlock.classList.contains("lw-codeblock")).toBe(true);
    expect(messageBlock.querySelectorAll("overdraw-line").length).toBe(8);
    expect(stackBlock.querySelectorAll("overdraw-line").length).toBe(8);

    const message = messageBlock.querySelector<HTMLElement>("pre")!;
    const stack = stackBlock.querySelector<HTMLElement>("pre")!;

    // Entities are decoded; real quotes render as quotes, not &quot;/&amp;.
    expect(message.textContent).toBe('parse error at "line" & more');
    expect(stack.textContent).toBe('    at fn "quoted" (a.js:1:2)');
    expect(sr.querySelector(".lw-detail-body")?.textContent).not.toContain("&quot;");
    expect(sr.querySelector(".lw-detail-body")?.textContent).not.toContain("&amp;");

    el.remove();
  });

  it("copies a code block's decoded text via its copy button", async () => {
    registerLogStream("openp41ge", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    const ent = {
      timestamp: 1234567890000,
      level: 3,
      levelLabel: "ERROR",
      system: "openp41ge",
      source: "mod",
      message: "say &quot;hi&quot; &amp; bye",
      process: "renderer",
    };
    const evt = new CustomEvent("log-row-click", {
      detail: { entry: ent },
      bubbles: true,
    }) as CustomEvent & { composedPath(): EventTarget[] };
    Object.defineProperty(evt, "composedPath", { value: () => [document] });
    (el as unknown as ShadowRoot).shadowRoot!.dispatchEvent(evt);
    await el.updateComplete;

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const btn = (el as unknown as ShadowRoot).shadowRoot!.querySelector<HTMLElement>(
      '[data-testid="lw-copy-message"]',
    )!;
    expect(btn).toBeTruthy();
    btn.click();
    await new Promise((r) => setTimeout(r, 0));

    // It copies the DECODED text (no literal &quot;/&amp;).
    expect(writeText).toHaveBeenCalledWith('say "hi" & bye');

    el.remove();
  });

  it("closes a drawer via its top-bar close button", async () => {
    registerLogStream("openp41ge", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    clickRow(el, null);
    await el.updateComplete;

    const close = (el as unknown as ShadowRoot).shadowRoot!.querySelector<HTMLElement>(
      '[data-testid="lw-drawer-close"]',
    )!;
    expect(close).toBeTruthy();

    // The close button carries only the vertical overdraw accents: the up/down
    // strokes overdraw the button's top/bottom edges, while the horizontal
    // strokes are omitted because a border already runs along those edges
    // (the drawer's top line and the head's border-bottom).
    const lines = [...close.querySelectorAll("overdraw-line")];
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      const dir = line.getAttribute("dir");
      expect(dir).toMatch(/^(up|down)$/);
      // Fixed accent length so the up-strokes clearly overshoot into the
      // window titlebar above the drawer.
      expect(line.getAttribute("style")).toContain("--overdraw-length: 8px");
    }

    // The drawer itself carries the matching up-pointing accent on its
    // top-left corner, completing the hand-drawn line along the drawer's top
    // edge (the top-right corner is the close button's tr,up accent).
    const drawer = (el as unknown as ShadowRoot).shadowRoot!.querySelector<HTMLElement>(
      '[data-testid="lw-detail-drawer"]',
    )!;
    const drawerTopLine = drawer.querySelector<HTMLElement>('overdraw-line[corner="tl"][dir="up"]');
    expect(drawerTopLine).toBeTruthy();
    expect(drawerTopLine!.getAttribute("style")).toContain("--overdraw-length: 8px");

    // The drawer carries an empty bottom bar mirroring the top bar's 35px
    // height and surface background.
    const foot = drawer.querySelector<HTMLElement>('[data-testid="lw-drawer-foot"]');
    expect(foot).toBeTruthy();
    expect(foot!.textContent).toBe("");

    close.click();
    await el.updateComplete;
    expect((el as unknown as { _drawers: unknown[] })._drawers).toHaveLength(0);

    el.remove();
  });

  it("ignores log-row-click events without an entry", async () => {
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    (el as unknown as ShadowRoot).shadowRoot!.dispatchEvent(
      new CustomEvent("log-row-click", { detail: {}, bubbles: true }),
    );
    await el.updateComplete;
    expect((el as unknown as { _drawers: unknown[] })._drawers).toHaveLength(0);
    el.remove();
  });

  it("locks a drawer to its owning cell, clipped to the cell (not the grid)", async () => {
    registerLogStream("openp41ge", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    const grid = (el as unknown as ShadowRoot).shadowRoot!.querySelector<HTMLElement>(".lw-grid")!;
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
      width: 800,
      height: 600,
      right: 900,
      bottom: 650,
    } as DOMRect);

    // Cell occupies the left half of the grid (grid 800 wide; cell_l = 0, w=400).
    const cell = mockCell(100, 400);
    clickRow(el, cell);
    await el.updateComplete;

    const wrap = (el as unknown as ShadowRoot).shadowRoot!.querySelector<HTMLElement>(
      '[data-testid="lw-drawer-wrap"]',
    )!;
    expect(wrap).toBeTruthy();
    // Wrapper sits exactly over the cell (not the whole grid), clipping the
    // drawer's slide so it animates in from the cell's own right edge.
    expect(wrap.style.left).toBe("0px");
    expect(wrap.style.top).toBe("0px");
    expect(wrap.style.width).toBe("400px");
    expect(wrap.style.height).toBe("600px");
    expect(wrap.classList.contains("lw-drawer-wrap")).toBe(true);

    // The drawer lives inside the cell-sized wrapper.
    expect(wrap.querySelector('[data-testid="lw-detail-drawer"]')).toBeTruthy();

    cell.remove();
    el.remove();
  });

  it("keeps one drawer per cell, and closing one leaves the others open", async () => {
    registerLogStream("openp41ge", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;

    const grid = (el as unknown as ShadowRoot).shadowRoot!.querySelector<HTMLElement>(".lw-grid")!;
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
      width: 800,
      height: 600,
      right: 900,
      bottom: 650,
    } as DOMRect);

    const cellA = mockCell(100, 400);
    const cellB = mockCell(500, 400);
    clickRow(el, cellA);
    clickRow(el, cellB);
    await el.updateComplete;

    const wraps = (el as unknown as ShadowRoot).shadowRoot!.querySelectorAll<HTMLElement>(
      '[data-testid="lw-drawer-wrap"]',
    );
    expect(wraps).toHaveLength(2);
    // Cell A drawer only covers A; Cell B drawer only covers B.
    expect(wraps[0].style.width).toBe("400px");
    expect(wraps[0].style.left).toBe("0px");
    expect(wraps[1].style.width).toBe("400px");
    expect(wraps[1].style.left).toBe("400px");

    // Closing A's drawer (its mask is inside A's wrapper) leaves B open.
    wraps[0].querySelector<HTMLElement>(".lw-drawer-mask")!.click();
    await el.updateComplete;
    const drawerStore = (el as unknown as { _drawers: Array<{ cell: Element | null }> })._drawers;
    expect(drawerStore).toHaveLength(1);
    expect(drawerStore[0].cell).toBe(cellB);
    expect(
      (el as unknown as ShadowRoot).shadowRoot!.querySelectorAll('[data-testid="lw-drawer-wrap"]'),
    ).toHaveLength(1);

    cellA.remove();
    cellB.remove();
    el.remove();
  });

  it("replaces (not duplicates) a drawer when the same cell is clicked again", async () => {
    registerLogStream("openp41ge", "name-a");
    const el = make();
    document.body.appendChild(el as unknown as HTMLElement);
    await el.updateComplete;
    const cell = mockCell(100, 400);
    clickRow(el, cell);
    clickRow(el, cell);
    await el.updateComplete;
    expect((el as unknown as { _drawers: unknown[] })._drawers).toHaveLength(1);
    cell.remove();
    el.remove();
  });
});
