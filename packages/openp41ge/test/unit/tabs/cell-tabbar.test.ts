/**
 * Tests for <openp41ge-cell-tabbar> Lit component.
 *
 * The component renders tab buttons for a single grid cell and dispatches
 * CustomEvents for tab activation and close.
 */

import { vi, describe, test, expect, beforeEach } from "vitest";
import "@openp41ge/renderer/components/openp41ge-cell-tabbar";
import type {
  CellTabBarData,
  Openp41geCellTabbar,
} from "@openp41ge/renderer/components/openp41ge-cell-tabbar";
import type { Tab } from "@openp41ge/layout/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

function createMockTab(id: string, title?: string, appType = "terminal"): Tab {
  return { id: id as any, appType, title: title ?? id, config: {} };
}

function createData(overrides?: Partial<CellTabBarData>): CellTabBarData {
  const tabs: Record<string, Tab> = {
    "tab-1": createMockTab("tab-1", "Terminal 1"),
    "tab-2": createMockTab("tab-2", "Terminal 2"),
    "tab-3": createMockTab("tab-3", "Editor"),
  };
  return {
    tabIds: ["tab-1", "tab-2", "tab-3"],
    activeTabId: "tab-2",
    getTab: (id: string) => tabs[id] ?? undefined,
    winId: "win-1",
    worksetId: "page-1",
    ...overrides,
  };
}

// Helper to find tab button elements (direct children of the bar, not the wrapper)
function getTabButtons(el: Openp41geCellTabbar): NodeListOf<HTMLElement> {
  // Lit renders <div class="cell-tab-bar"> with <div> children for each tab
  const bar = el.querySelector(".cell-tab-bar");
  if (!bar)
    return document.createDocumentFragment().querySelectorAll("*") as NodeListOf<HTMLElement>;
  return bar.querySelectorAll(":scope > div");
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("openp41ge-cell-tabbar", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("renders tab buttons for each tab ID", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    const buttons = getTabButtons(el);
    expect(buttons.length).toBe(3);
    // Each button contains a label span
    const labels = el.querySelectorAll("span[data-tab-id]");
    expect(labels.length).toBe(3);
  });

  test("marks the active tab with active background", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData({ activeTabId: "tab-2" });
    document.body.appendChild(el);
    await el.updateComplete;

    const buttons = getTabButtons(el);
    expect(buttons.length).toBe(3);
    // jsdom normalizes hex to rgb(...)
    const activeBg = Array.from(buttons).filter(
      (b) => b.style.backgroundColor === "rgb(42, 42, 42)" || b.style.background === "#2a2a2a",
    );
    expect(activeBg.length).toBe(1);
  });

  test("falls back to first tab when no activeTabId is set", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData({ activeTabId: undefined });
    document.body.appendChild(el);
    await el.updateComplete;

    const buttons = getTabButtons(el);
    expect(buttons.length).toBe(3);
    // First tab is active (no activeTabId → first in array)
    const activeBg = Array.from(buttons).filter(
      (b) => b.style.backgroundColor === "rgb(42, 42, 42)" || b.style.background === "#2a2a2a",
    );
    expect(activeBg.length).toBe(1);
  });

  test("shows empty when no data is set", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    document.body.appendChild(el);
    await el.updateComplete;
    // Lit leaves internal comment markers in light DOM even for empty templates
    // Check that no tab bar wrapper and no tab buttons are rendered
    expect(el.querySelector(".cell-tab-bar")).toBeNull();
  });

  test("shows empty when data is set to null", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = null;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.querySelector(".cell-tab-bar")).toBeNull();
  });

  test("dispatches cell-tab:activate on tab click", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData({ activeTabId: "tab-1" });
    document.body.appendChild(el);
    await el.updateComplete;

    const handler = vi.fn();
    el.addEventListener("cell-tab:activate", handler);

    // Click the second tab button
    const buttons = getTabButtons(el);
    (buttons[1] as HTMLElement).click();

    expect(handler).toHaveBeenCalledTimes(1);
    const detail = handler.mock.calls[0][0].detail;
    expect(detail.winId).toBe("win-1");
    expect(detail.worksetId).toBe("page-1");
    expect(detail.tabId).toBe("tab-2");
  });

  test("dispatches cell-tab:close on close button click", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    const handler = vi.fn();
    el.addEventListener("cell-tab:close", handler);

    // Click the close button on the second tab
    const closeButtons = el.querySelectorAll("[data-close-btn]");
    expect(closeButtons.length).toBe(3);
    (closeButtons[1] as HTMLElement).click();

    expect(handler).toHaveBeenCalledTimes(1);
    const detail = handler.mock.calls[0][0].detail;
    expect(detail.tabId).toBe("tab-2");
  });

  test("close click does not bubble to tab activation", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    const activateHandler = vi.fn();
    const closeHandler = vi.fn();
    el.addEventListener("cell-tab:activate", activateHandler);
    el.addEventListener("cell-tab:close", closeHandler);

    // Click the close button on the first tab
    const closeButtons = el.querySelectorAll("[data-close-btn]");
    (closeButtons[0] as HTMLElement).click();

    expect(closeHandler).toHaveBeenCalledTimes(1);
    expect(activateHandler).not.toHaveBeenCalled();
  });

  test("re-renders when data changes", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    expect(getTabButtons(el).length).toBe(3);

    // Change to 1 tab
    el.data = createData({ tabIds: ["tab-1"], activeTabId: "tab-1" });
    await el.updateComplete;
    expect(getTabButtons(el).length).toBe(1);
  });

  test("label text matches tab title", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    const labels = el.querySelectorAll("span[data-tab-id]");
    expect(labels.length).toBe(3);
    expect(labels[0].textContent).toBe("Terminal 1");
    expect(labels[1].textContent).toBe("Terminal 2");
    expect(labels[2].textContent).toBe("Editor");
  });

  test("event bubbles", async () => {
    const el = document.createElement("openp41ge-cell-tabbar") as Openp41geCellTabbar;
    el.data = createData();
    document.body.appendChild(el);
    await el.updateComplete;

    const handler = vi.fn();
    document.body.addEventListener("cell-tab:activate", handler);

    const buttons = getTabButtons(el);
    (buttons[0] as HTMLElement).click();

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
