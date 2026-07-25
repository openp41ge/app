/**
 * Tests for <openp41ge-tab-content> — the content area for a single tab (Lit).
 *
 * Verifies that setting tabData with the same tab ID does NOT trigger
 * a re-render or re-mount of the controller (which would cause the
 * "updateTabTitle dispatched over and over" bug).
 */

import { vi, describe, test, expect, beforeEach } from "vitest";
import type { Tab } from "@openp41ge/layout/types";
import type { PaneController } from "@openp41ge/renderer/controllers/types";
import { Openp41geTabContent } from "@openp41ge/renderer/components/openp41ge-tab-content";

// Helper: create a minimal PaneController mock
function createMockController(id: string): PaneController {
  return {
    paneId: id,
    appType: "file-viewer",
    filePath: "/test/file.ts",
    _mode: "preview",
    _isDirty: false,
    container: null,
    init: vi.fn(),
    mount: vi.fn(),
    unmount: vi.fn(),
    setVisible: vi.fn(),
    snapshot: vi.fn(() => ({})),
    restore: vi.fn(),
    loadFile: vi.fn(),
    saveDraft: vi.fn(),
    get state() {
      return {};
    },
    set state(_v: Record<string, unknown>) {},
  } as unknown as PaneController;
}

// Helper: create a minimal Tab
function createTab(id: string, title = "test.ts"): Tab {
  return {
    id,
    title,
    appType: "file-viewer",
    config: { filePath: "/test/file.ts" },
  } as Tab;
}

describe("Openp41geTabContent — tabData same-ID guard", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("mount() called once for first tab, NOT called again with same-ID tabData", async () => {
    const controller = createMockController("tab-1");
    const tab = createTab("tab-1");

    const el = new Openp41geTabContent();
    document.body.appendChild(el);

    // Set controller then tabData — first mount happens via firstUpdated()
    el.controller = controller;
    el.tabData = tab;
    await el.updateComplete;
    expect(vi.mocked(controller.mount).mock.calls.length).toBe(1);

    // Set tabData again with SAME ID — mount() should NOT be called again
    el.tabData = tab;
    await el.updateComplete;
    expect(vi.mocked(controller.mount).mock.calls.length).toBe(1);
  });

  test("mount() called again only when tabData ID changes", async () => {
    const controller = createMockController("tab-1");
    const el = new Openp41geTabContent();
    document.body.appendChild(el);

    el.controller = controller;
    el.tabData = createTab("tab-1");
    await el.updateComplete;
    expect(vi.mocked(controller.mount).mock.calls.length).toBe(1);

    // Same ID — no re-mount
    el.tabData = createTab("tab-1", "same-title.ts");
    await el.updateComplete;
    expect(vi.mocked(controller.mount).mock.calls.length).toBe(1);

    // Different ID — need a different controller for the new tab
    const controller2 = createMockController("tab-2");
    el.controller = controller2;
    el.tabData = createTab("tab-2", "other.ts");
    await el.updateComplete;
    // Old controller unmounted, new controller mounted
    expect(vi.mocked(controller.unmount).mock.calls.length).toBe(1);
    expect(vi.mocked(controller2.mount).mock.calls.length).toBe(1);
  });

  test("setting same controller object does NOT re-trigger mount", async () => {
    const controller = createMockController("tab-1");
    const el = new Openp41geTabContent();
    document.body.appendChild(el);

    // First set triggers mount
    el.controller = controller;
    el.tabData = createTab("tab-1");
    await el.updateComplete;
    expect(vi.mocked(controller.mount).mock.calls.length).toBe(1);

    // Clear spy count
    vi.mocked(controller.mount).mockClear();

    // Set SAME controller again — should be a no-op (same reference)
    el.controller = controller;
    await el.updateComplete;
    expect(vi.mocked(controller.mount).mock.calls.length).toBe(0);
  });
});
