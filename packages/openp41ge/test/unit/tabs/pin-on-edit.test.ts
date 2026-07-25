/**
 * Tests for auto-pin on edit behaviour.
 *
 * When a file is edited in an unpinned (preview) tab, the FileEditorController
 * must dispatch `grid-pin` on the container so the Openp41geTabsEventHandler
 * can pin the tab (preventing the preview-replacement behaviour).
 *
 * The controller registers a `fe:dirty-changed` listener when mounted.
 * On the first transition from clean to dirty, it dispatches `grid-pin`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FileEditorController } from "@openp41ge/renderer/apps/file-viewer/file-editor-controller";

// Mock the app module before any imports resolve
vi.mock("@openp41ge/renderer/app", () => {
  return {
    appServices: {
      modelRegistry: {
        getOrCreate: vi.fn().mockResolvedValue({
          uri: "/test/file.txt",
          getValue: () => "test content",
          lineCount: 1,
          onDidChangeContent: vi.fn().mockReturnValue({ dispose: vi.fn() }),
          onDidChangeDirty: vi.fn().mockReturnValue({ dispose: vi.fn() }),
          markClean: vi.fn(),
          isDirty: false,
          dispose: vi.fn(),
        }),
        release: vi.fn(),
        get: vi.fn(),
        has: vi.fn().mockReturnValue(false),
        get size() {
          return 0;
        },
      },
      configService: {
        getSyntaxTheme: vi.fn().mockReturnValue("default"),
        get: vi.fn(),
      },
    },
  };
});

// Stub the Electron preload API
(window as any).openp41ge = {
  workspace: {
    dispatch: vi.fn(),
  },
  file: {
    readRange: vi.fn().mockResolvedValue({ data: "test content", totalSize: 12 }),
    writeFile: vi.fn().mockResolvedValue({ success: true }),
  },
};

function createEditorStub(): HTMLDivElement {
  const el = document.createElement("div");
  (el as any).style = { cssText: "" };
  (el as any).formatterRegistry = null;
  (el as any).setTheme = vi.fn();
  (el as any).setEditorLineHeight = vi.fn();
  (el as any).setEditorFontSize = vi.fn();
  return el;
}

describe("auto-pin on edit", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    (window as any).openp41ge.workspace.dispatch = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("dispatches grid-pin on document when fe:dirty-changed fires with isDirty=true", async () => {
    const controller = new FileEditorController("tab-1", "file-editor", "/test/file.txt");
    (controller as any).tabId = "tab-1";

    const editorStub = createEditorStub();
    // Container is the controller's mount target — dispatch is on this element
    const container = document.createElement("div");
    container.appendChild(editorStub);
    document.body.appendChild(container);

    (controller as any)._editor = editorStub;
    (controller as any).container = container;
    (controller as any)._attachEventBridge();

    const pinSpy = vi.fn();
    document.addEventListener("grid-pin", pinSpy);

    controller._isDirty = false;
    editorStub.dispatchEvent(
      new CustomEvent("fe:dirty-changed", {
        bubbles: true,
        composed: true,
        detail: { isDirty: true },
      }),
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(pinSpy).toHaveBeenCalledTimes(1);
    const pinDetail = (pinSpy.mock.calls[0][0] as CustomEvent).detail;
    expect(pinDetail.tabId).toBe("tab-1");
    expect(pinDetail.pinned).toBe(true);

    container.remove();
    controller.unmount();
  });

  it("does not dispatch grid-pin when going clean (isDirty=false)", async () => {
    const controller = new FileEditorController("tab-2", "file-editor", "/test/file.txt");
    (controller as any).tabId = "tab-2";

    const editorStub = createEditorStub();
    const container = document.createElement("div");
    container.appendChild(editorStub);
    document.body.appendChild(container);

    (controller as any)._editor = editorStub;
    (controller as any).container = container;
    (controller as any)._attachEventBridge();

    const pinSpy = vi.fn();
    document.addEventListener("grid-pin", pinSpy);

    controller._isDirty = false;
    editorStub.dispatchEvent(
      new CustomEvent("fe:dirty-changed", {
        bubbles: true,
        composed: true,
        detail: { isDirty: false },
      }),
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(pinSpy).not.toHaveBeenCalled();
    container.remove();
    controller.unmount();
  });

  it("does not dispatch grid-pin on subsequent dirty transitions (already dirty)", async () => {
    const controller = new FileEditorController("tab-3", "file-editor", "/test/file.txt");
    (controller as any).tabId = "tab-3";

    const editorStub = createEditorStub();
    const container = document.createElement("div");
    container.appendChild(editorStub);
    document.body.appendChild(container);

    (controller as any)._editor = editorStub;
    (controller as any).container = container;
    (controller as any)._attachEventBridge();

    const pinSpy = vi.fn();
    document.addEventListener("grid-pin", pinSpy);

    controller._isDirty = false;
    editorStub.dispatchEvent(
      new CustomEvent("fe:dirty-changed", {
        bubbles: true,
        composed: true,
        detail: { isDirty: true },
      }),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(pinSpy).toHaveBeenCalledTimes(1);

    // Second dirty transition (already dirty) → should NOT pin again
    editorStub.dispatchEvent(
      new CustomEvent("fe:dirty-changed", {
        bubbles: true,
        composed: true,
        detail: { isDirty: true },
      }),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(pinSpy).toHaveBeenCalledTimes(1);

    container.remove();
    controller.unmount();
  });

  // Note: tabId is a required constructor parameter (string), so it can
  // never be null at runtime. No test needed for the null case.
});
