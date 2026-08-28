/**
 * Unit tests for <debug-log-panel> — the app-log panel hosted inside the
 * workspaces overlay's "Logs" feature tab (Logs sub-tab = queryable virtual
 * list + Debug session toggle; Events sub-tab = collapsible structured events).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LogLevel, pushLog, clearLogBuffer, setMinLevel, getMinLevel } from "openp41ge-logger";
import { DebugLogPanel, isDebugSeed } from "@openp41ge/renderer/components/debug-log-panel";
import {
  systemOverlayService,
  type SystemOverlayTabRegistration,
} from "@openp41ge/renderer/services/system-overlay-service";

let setDebugMock: ReturnType<typeof vi.fn>;

async function createPanel(): Promise<DebugLogPanel> {
  const el = document.createElement("debug-log-panel") as DebugLogPanel;
  document.body.appendChild(el);
  await (el as unknown as DebugLogPanel).updateComplete;
  return el;
}

async function destroy(el: DebugLogPanel): Promise<void> {
  document.body.removeChild(el);
}

beforeEach(() => {
  clearLogBuffer();
  setMinLevel(LogLevel.INFO);
  setDebugMock = vi.fn();
  if (!(window as unknown as Record<string, unknown>).openp41ge) {
    (window as unknown as Record<string, unknown>).openp41ge = {};
  }
  (
    (window as unknown as { openp41ge: Record<string, unknown> }).openp41ge as {
      logs?: Record<string, unknown>;
    }
  ).logs = { setDebug: setDebugMock };
});

afterEach(() => {
  vi.restoreAllMocks();
  setMinLevel(LogLevel.INFO);
});

describe("debug-log-panel registration", () => {
  it("is defined as a custom element", () => {
    expect(customElements.get("debug-log-panel")).toBe(DebugLogPanel);
  });

  it("creates an element via document.createElement", () => {
    const el = document.createElement("debug-log-panel");
    expect(el).toBeInstanceOf(DebugLogPanel);
  });
});

describe("Logs sub-tab", () => {
  it("renders the toolbar (Debug toggle, level select, search, sub-tabs, Clear)", async () => {
    const el = await createPanel();
    expect(el.querySelector(".dbg")).toBeTruthy();
    expect(el.querySelector("select")).toBeTruthy();
    expect(el.querySelector(".search")).toBeTruthy();
    expect(el.querySelector(".tabs")).toBeTruthy();
    expect(el.querySelectorAll(".tab").length).toBe(2);
    expect(el.querySelector(".btn")).toBeTruthy();
    // Hosted panel fills its parent: no header, no close, no drag handle.
    expect(el.querySelector(".header")).toBeNull();
    await destroy(el);
  });

  it("captures INFO/WARN/ERROR by default and shows them", async () => {
    const el = await createPanel();
    pushLog(LogLevel.INFO, "app", ["hello"]);
    pushLog(LogLevel.WARN, "app", ["careful"]);
    (el as unknown as { _refresh: () => void })._refresh();
    await (el as unknown as DebugLogPanel).updateComplete;

    const entries = (el as unknown as { _entries: unknown[] })._entries;
    expect(entries).toHaveLength(2);
    await destroy(el);
  });

  it("applies the search filter", async () => {
    const el = await createPanel();
    pushLog(LogLevel.INFO, "app", ["ghost-update"]);
    pushLog(LogLevel.INFO, "app", ["mousemove"]);
    (el as unknown as { _search: string; _refresh: () => void })._search = "ghost";
    (el as unknown as { _refresh: () => void })._refresh();
    await (el as unknown as DebugLogPanel).updateComplete;
    expect(
      (el as unknown as { _entries: Array<{ message: string }> })._entries.map((e) => e.message),
    ).toEqual(["ghost-update"]);
    await destroy(el);
  });

  it("virtualizes: renders only the visible window of rows", async () => {
    const el = await createPanel();
    for (let i = 0; i < 500; i++) {
      pushLog(LogLevel.INFO, "spam", [`entry ${i}`]);
    }
    (el as unknown as { _scrollTop: number })._scrollTop = 250 * 21; // mid-list
    (el as unknown as { _refresh: () => void })._refresh();
    await (el as unknown as DebugLogPanel).updateComplete;

    const rows = el.querySelectorAll(".log-row");
    expect((el as unknown as { _entries: unknown[] })._entries.length).toBe(500);
    // Viewport (320px) + overscan → far fewer DOM rows than entries.
    expect(rows.length).toBeLessThan(100);
    expect(rows.length).toBeGreaterThan(0);
    await destroy(el);
  });

  it("Debug toggle calls setMinLevel + preload logs.setDebug", async () => {
    const el = await createPanel();
    (el as unknown as { _toggleDebugSession: (on: boolean) => void })._toggleDebugSession(true);
    expect(getMinLevel()).toBe(LogLevel.DEBUG);
    expect(setDebugMock).toHaveBeenCalledWith(true);

    (el as unknown as { _toggleDebugSession: (on: boolean) => void })._toggleDebugSession(false);
    expect(getMinLevel()).toBe(LogLevel.INFO);
    expect(setDebugMock).toHaveBeenCalledWith(false);
    await destroy(el);
  });

  it("captures DEBUG entries only once the debug session is on", async () => {
    const el = await createPanel();
    pushLog(LogLevel.DEBUG, "cross-window-drag", ["mousemove"]); // dropped (INFO)
    (el as unknown as { _refresh: () => void })._refresh();
    expect((el as unknown as { _entries: unknown[] })._entries).toHaveLength(0);

    (el as unknown as { _toggleDebugSession: (on: boolean) => void })._toggleDebugSession(true);
    pushLog(LogLevel.DEBUG, "cross-window-drag", ["ghost-update"]);
    (el as unknown as { _refresh: () => void })._refresh();
    const entries = (el as unknown as { _entries: Array<{ message: string }> })._entries;
    expect(entries.map((e) => e.message)).toEqual(["ghost-update"]);
    await destroy(el);
  });
});

describe("Events sub-tab", () => {
  it("shows the empty state when no debug events are captured", async () => {
    const el = await createPanel();
    (el as unknown as { _tab: string })._tab = "events";
    (el as unknown as { _refresh: () => void })._refresh();
    await (el as unknown as DebugLogPanel).updateComplete;
    expect(el.querySelector(".event-list")?.textContent).toContain("No debug events");
    await destroy(el);
  });

  it("lists debug events with collapsible data", async () => {
    const el = await createPanel();
    setMinLevel(LogLevel.DEBUG);
    pushLog(LogLevel.DEBUG, "cross-window-drag", "ghost-update", { col: 2, isBoundary: true });
    (el as unknown as { _tab: string })._tab = "events";
    (el as unknown as { _refresh: () => void })._refresh();
    await (el as unknown as DebugLogPanel).updateComplete;

    expect(el.querySelector(".ev-src")?.textContent).toBe("cross-window-drag");
    expect(el.querySelector(".ev-label")?.textContent).toBe("ghost-update");
    expect(el.querySelector(".event-data")).toBeNull(); // collapsed by default

    const toggle = el.querySelector<HTMLButtonElement>(".ev-toggle");
    expect(toggle).toBeTruthy();
    toggle!.click();
    await (el as unknown as DebugLogPanel).updateComplete;
    const dataEl = el.querySelector(".event-data");
    expect(dataEl?.textContent).toContain('"isBoundary": true');
    await destroy(el);
  });
});

describe("isDebugSeed", () => {
  it("is false without the env flag or storage override", () => {
    try {
      localStorage.setItem("openp41ge-debug", "0");
    } catch {
      /* ignore */
    }
    expect(isDebugSeed()).toBe(false);
    try {
      localStorage.setItem("openp41ge-debug", "1");
    } catch {
      /* ignore */
    }
    expect(isDebugSeed()).toBe(true);
    try {
      localStorage.removeItem("openp41ge-debug");
    } catch {
      /* ignore */
    }
  });
});

describe("system overlay tab flow", () => {
  const fakeCtl = (): SystemOverlayTabRegistration => ({
    id: `t${Math.random().toString(36).slice(2, 8)}`,
    label: "Tab",
    createController: () => ({ id: "x", appType: "x", title: "Tab", render: () => "" }),
  });

  afterEach(() => {
    systemOverlayService.close();
    for (const t of [...systemOverlayService.registeredTabs]) {
      systemOverlayService.unregisterTab(t.id);
    }
  });

  it("registerTab adds to registeredTabs in order and registerTab dedupes by id", () => {
    const a = fakeCtl();
    const b = fakeCtl();
    systemOverlayService.registerTab(a);
    systemOverlayService.registerTab(b);
    expect(systemOverlayService.registeredTabs.map((t) => t.id)).toEqual([a.id, b.id]);
    const a2 = fakeCtl();
    a2.id = a.id;
    systemOverlayService.registerTab(a2);
    expect(systemOverlayService.registeredTabs).toHaveLength(2);
    expect(systemOverlayService.getTab(a.id)).toBe(a2);
  });

  it("open(tab) sets the requested tab and takeRequestedTab consumes it once", () => {
    const a = fakeCtl();
    systemOverlayService.registerTab(a);
    systemOverlayService.open("list", a.id);
    expect(systemOverlayService.requestedTab).toBe(a.id);
    expect(systemOverlayService.takeRequestedTab()).toBe(a.id);
    // Consumed — resets to null (host falls back to the default tab).
    expect(systemOverlayService.requestedTab).toBeNull();
  });

  it("open() without a tab keeps the previously requested tab (null on first open)", () => {
    systemOverlayService.close();
    systemOverlayService.open();
    expect(systemOverlayService.isOpen).toBe(true);
    expect(systemOverlayService.requestedTab).toBeNull();
  });

  it("reportActiveTab tracks the active feature tab", () => {
    systemOverlayService.reportActiveTab("logs");
    expect(systemOverlayService.activeTab).toBe("logs");
    systemOverlayService.reportActiveTab("workspaces");
    expect(systemOverlayService.activeTab).toBe("workspaces");
  });

  it("toggle closes an open overlay and reopens on default", () => {
    systemOverlayService.close();
    systemOverlayService.toggle();
    expect(systemOverlayService.isOpen).toBe(true);
    systemOverlayService.toggle();
    expect(systemOverlayService.isOpen).toBe(false);
  });
});
