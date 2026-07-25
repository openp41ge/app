/**
 * Tests for auto-pin on edit behaviour.
 *
 * When a file is edited in an unpinned (preview) tab, the FileEditorController
 * must dispatch `cell-tab:pin` on the document so the openp41ge platform can
 * pin the tab (preventing the preview-replacement behaviour).
 *
 * The controller registers a `fe:dirty-changed` listener when mounted.
 * On the first transition from clean to dirty, it dispatches `cell-tab:pin`.
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

/**
 * Wrap an editor stub in a DOM hierarchy that mirrors production:
 *   <openp41ge-tab-content winId="..." pageId="...">
 *     <div class="openp41ge-grid-cell">
 *       <div> (the editor stub) </div>
 *     </div>
 *   </openp41ge-tab-content>
 *
 * This is required because the auto-pin code dispatches `cell-tab:pin` on
 * tabContent only when a `.openp41ge-grid-cell` ancestor is found.
 */
function wrapEditorInCell(
  editor: HTMLElement,
  winId = "win-1",
  worksetId = "ws-1",
): { tabContent: HTMLElement; cell: HTMLElement } {
  // Production DOM hierarchy:
  //   div.openp41ge-grid-cell
  //     openp41ge-tab-content  (container, returned as tabContent)
  //       div  (editor stub)
  const tabContent = document.createElement("openp41ge-tab-content");
  (tabContent as any).winId = winId;
  (tabContent as any).pageId = worksetId;
  tabContent.appendChild(editor);

  const cell = document.createElement("div");
  cell.className = "openp41ge-grid-cell";
  cell.appendChild(tabContent);

  document.body.appendChild(cell);
  return { tabContent, cell };
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

  it("dispatches cell-tab:pin on document when fe:dirty-changed fires with isDirty=true", async () => {
    const controller = new FileEditorController("tab-1", "file-editor", "/test/file.txt");
    (controller as any).tabId = "tab-1";

    const editorStub = createEditorStub();
    const { tabContent } = wrapEditorInCell(editorStub);
    (controller as any)._editor = editorStub;
    (controller as any).container = tabContent;
    (controller as any)._attachEventBridge();

    const pinSpy = vi.fn();
    document.addEventListener("cell-tab:pin", pinSpy);

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

    controller.unmount();
  });

  it("does not dispatch cell-tab:pin when going clean (isDirty=false)", async () => {
    const controller = new FileEditorController("tab-2", "file-editor", "/test/file.txt");
    (controller as any).tabId = "tab-2";

    const editorStub = createEditorStub();
    const { tabContent } = wrapEditorInCell(editorStub);
    (controller as any)._editor = editorStub;
    (controller as any).container = tabContent;
    (controller as any)._attachEventBridge();

    const pinSpy = vi.fn();
    document.addEventListener("cell-tab:pin", pinSpy);

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
    controller.unmount();
  });

  it("does not dispatch cell-tab:pin on subsequent dirty transitions (already dirty)", async () => {
    const controller = new FileEditorController("tab-3", "file-editor", "/test/file.txt");
    (controller as any).tabId = "tab-3";

    const editorStub = createEditorStub();
    const { tabContent } = wrapEditorInCell(editorStub);
    (controller as any)._editor = editorStub;
    (controller as any).container = tabContent;
    (controller as any)._attachEventBridge();

    const pinSpy = vi.fn();
    document.addEventListener("cell-tab:pin", pinSpy);

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

    controller.unmount();
  });

  it("does not dispatch cell-tab:pin when there is no tabId", async () => {
    const controller = new FileEditorController("tab-4", "file-editor", "/test/file.txt");
    (controller as any).tabId = null;

    const editorStub = createEditorStub();
    document.body.appendChild(editorStub);
    (controller as any)._editor = editorStub;
    // container is NOT set
    (controller as any)._attachEventBridge();

    const pinSpy = vi.fn();
    document.addEventListener("cell-tab:pin", pinSpy);

    controller._isDirty = false;
    editorStub.dispatchEvent(
      new CustomEvent("fe:dirty-changed", {
        bubbles: true,
        composed: true,
        detail: { isDirty: true },
      }),
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(pinSpy).not.toHaveBeenCalled();
    controller.unmount();
  });
});
