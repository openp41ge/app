/**
 * Tests for FileEditorController tab visibility forwarding.
 *
 * When a file editor tab becomes inactive/active, the controller must forward
 * that signal to the <file-editor> element via setActive() so the editor can
 * pause its rendering work while hidden and resume (with a refresh) when shown.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FileEditorController } from "@openp41ge/renderer/apps/file-viewer/file-editor-controller";

// Mock the app module before any imports resolve
vi.mock("@openp41ge/renderer/app", () => {
  return {
    appServices: {
      modelRegistry: {
        getOrCreate: vi.fn(),
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

function createEditorStub(): HTMLElement & { setActive: ReturnType<typeof vi.fn> } {
  const el = document.createElement("div");
  (el as any).style = { cssText: "" };
  (el as any).formatterRegistry = null;
  (el as any).setTheme = vi.fn();
  (el as any).setEditorLineHeight = vi.fn();
  (el as any).setEditorFontSize = vi.fn();
  (el as any).setActive = vi.fn();
  return el as any;
}

describe("FileEditorController visibility (pause inactive editors)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    (window as any).openp41ge.workspace.dispatch = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("forwards deactivation to the editor as setActive(false)", () => {
    const controller = new FileEditorController("tab-1", "file-viewer", "/test/file.txt");
    const editorStub = createEditorStub();
    (controller as any)._editor = editorStub;

    controller.setVisible(false);

    expect(editorStub.setActive).toHaveBeenCalledTimes(1);
    expect(editorStub.setActive).toHaveBeenCalledWith(false);
  });

  it("forwards activation to the editor as setActive(true)", () => {
    const controller = new FileEditorController("tab-2", "file-viewer", "/test/file.txt");
    const editorStub = createEditorStub();
    (controller as any)._editor = editorStub;

    controller.setVisible(true);

    expect(editorStub.setActive).toHaveBeenCalledTimes(1);
    expect(editorStub.setActive).toHaveBeenCalledWith(true);
  });

  it("does not throw when setVisible is called before mount or after unmount", () => {
    const controller = new FileEditorController("tab-3", "file-viewer", "/test/file.txt");

    // Before mount / after unmount the editor element is null — no-op, no throw.
    expect(() => controller.setVisible(false)).not.toThrow();
    expect(() => controller.setVisible(true)).not.toThrow();
  });
});
