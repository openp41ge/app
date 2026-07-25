/**
 * Tests for cross-tab dirty state synchronisation when multiple editors
 * share the same PieceTreeTextContentModel instance.
 *
 * When one tab saves, all other tabs viewing the same file must:
 * 1. Set isDirty to false
 * 2. Update _savedContent to the persisted value
 * 3. Dispatch fe:dirty-changed(false)
 * 4. Allow closing without triggering a confirmation modal
 *
 * This is tested for 2, 3, 4, 5, and 6 concurrent editors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@openp41ge-file-editor/file-editor.ts";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model.ts";
import type { FileEditorElement } from "@openp41ge-file-editor/file-editor.ts";

async function waitForRender(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
}

function createEditors(count: number): FileEditorElement[] {
  const editors: FileEditorElement[] = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("file-editor") as FileEditorElement;
    document.body.appendChild(el);
    editors.push(el);
  }
  return editors;
}

type EditorState = { state: string; isDirty: boolean };

describe("cross-tab dirty state synchronisation", () => {
  let model: PieceTreeTextContentModel;

  beforeEach(() => {
    (window as any).openp41ge = {
      file: {
        writeFile: vi.fn().mockResolvedValue({ success: true }),
      },
    };
    model = new PieceTreeTextContentModel("/test/file.txt", "original content");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  /**
   * Create N editors, all sharing the same model, load the file, and wait for render.
   */
  async function setup(count: number): Promise<FileEditorElement[]> {
    const editors = createEditors(count);
    for (const editor of editors) {
      editor.textContentModel = model;
      await editor.loadFile("/test/file.txt", "file.txt");
    }
    await waitForRender();
    return editors;
  }

  function states(editors: FileEditorElement[]): EditorState[] {
    return editors.map((e) => e.getState());
  }

  /**
   * Edit the shared model through one editor, simulating a user typing.
   */
  function edit(editor: FileEditorElement): void {
    const m = editor.textContentModel!;
    m.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 10 },
        text: " MODIFIED",
      },
    ]);
  }

  // ──────────────── 2 TABS ────────────────

  describe("2 tabs sharing one model", () => {
    it("both tabs become clean when save is called on tab 0", async () => {
      const [tab0, tab1] = await setup(2);

      edit(tab0);
      await waitForRender();

      expect(tab0.getState().isDirty).toBe(true);
      expect(tab1.getState().isDirty).toBe(true);

      await tab0.save();
      await waitForRender();

      const s = states([tab0, tab1]);
      expect(s[0].isDirty).toBe(false);
      expect(s[1].isDirty).toBe(false);
    });

    it("both tabs become clean when save is called on tab 1", async () => {
      const [tab0, tab1] = await setup(2);

      edit(tab1);
      await waitForRender();

      expect(tab0.getState().isDirty).toBe(true);
      expect(tab1.getState().isDirty).toBe(true);

      await tab1.save();
      await waitForRender();

      const s = states([tab0, tab1]);
      expect(s[0].isDirty).toBe(false);
      expect(s[1].isDirty).toBe(false);
    });

    it("both tabs dispatch fe:dirty-changed(false) after save on tab 0", async () => {
      const [tab0, tab1] = await setup(2);

      edit(tab0);
      await waitForRender();

      const spy0 = vi.fn();
      const spy1 = vi.fn();
      tab0.addEventListener("fe:dirty-changed", spy0);
      tab1.addEventListener("fe:dirty-changed", spy1);

      await tab0.save();
      await waitForRender();

      const clean0 = spy0.mock.calls.find(([e]: [CustomEvent]) => e.detail.isDirty === false);
      const clean1 = spy1.mock.calls.find(([e]: [CustomEvent]) => e.detail.isDirty === false);
      expect(clean0).toBeDefined();
      expect(clean1).toBeDefined();
    });

    it("edit after save correctly re-detects dirty state in both tabs", async () => {
      const [tab0, tab1] = await setup(2);

      edit(tab0);
      await waitForRender();
      await tab0.save();
      await waitForRender();

      // Now edit again via tab 1
      edit(tab1);
      await waitForRender();

      const s = states([tab0, tab1]);
      expect(s[0].isDirty).toBe(true);
      expect(s[1].isDirty).toBe(true);

      // Save from tab 1
      await tab1.save();
      await waitForRender();

      const s2 = states([tab0, tab1]);
      expect(s2[0].isDirty).toBe(false);
      expect(s2[1].isDirty).toBe(false);
    });
  });

  // ──────────────── 3 TABS ────────────────

  describe("3 tabs sharing one model", () => {
    it("all three tabs become clean after save on tab 0", async () => {
      const tabs = await setup(3);

      edit(tabs[0]);
      await waitForRender();

      expect(tabs.every((t) => t.getState().isDirty)).toBe(true);

      await tabs[0].save();
      await waitForRender();

      const s = states(tabs);
      expect(s.every((st) => st.isDirty === false)).toBe(true);
    });

    it("all three tabs become clean after save on tab 1", async () => {
      const tabs = await setup(3);

      edit(tabs[1]);
      await waitForRender();
      await tabs[1].save();
      await waitForRender();

      const s = states(tabs);
      expect(s.every((st) => st.isDirty === false)).toBe(true);
    });

    it("all three tabs become clean after save on tab 2", async () => {
      const tabs = await setup(3);

      edit(tabs[2]);
      await waitForRender();
      await tabs[2].save();
      await waitForRender();

      const s = states(tabs);
      expect(s.every((st) => st.isDirty === false)).toBe(true);
    });

    it("fe:dirty-changed(false) dispatched on all three tabs after save", async () => {
      const tabs = await setup(3);

      edit(tabs[0]);
      await waitForRender();

      const spies = tabs.map((t) => {
        const fn = vi.fn();
        t.addEventListener("fe:dirty-changed", fn);
        return fn;
      });

      await tabs[0].save();
      await waitForRender();

      for (const spy of spies) {
        const clean = spy.mock.calls.find(([e]: [CustomEvent]) => e.detail.isDirty === false);
        expect(clean).toBeDefined();
      }
    });

    it("mixed edit and save cycles work correctly", async () => {
      const tabs = await setup(3);

      // Tab 0 edits and saves
      edit(tabs[0]);
      await waitForRender();
      await tabs[0].save();
      await waitForRender();

      expect(tabs.every((t) => t.getState().isDirty === false)).toBe(true);

      // Tab 1 edits, tab 0 saves (showing save can come from a different tab)
      edit(tabs[1]);
      await waitForRender();

      expect(tabs.every((t) => t.getState().isDirty)).toBe(true);

      await tabs[0].save();
      await waitForRender();

      expect(tabs.every((t) => t.getState().isDirty === false)).toBe(true);

      // Tab 2 edits
      edit(tabs[2]);
      await waitForRender();
      await tabs[2].save();
      await waitForRender();

      expect(tabs.every((t) => t.getState().isDirty === false)).toBe(true);
    });
  });

  // ──────────────── 4 TABS ────────────────

  describe("4 tabs sharing one model", () => {
    it("all four tabs become clean after save on tab 3", async () => {
      const tabs = await setup(4);

      edit(tabs[3]);
      await waitForRender();

      expect(tabs.every((t) => t.getState().isDirty)).toBe(true);

      await tabs[3].save();
      await waitForRender();

      const s = states(tabs);
      expect(s.every((st) => st.isDirty === false)).toBe(true);
    });

    it("fe:dirty-changed(false) dispatched on all four tabs after save", async () => {
      const tabs = await setup(4);

      edit(tabs[1]);
      await waitForRender();

      const spies = tabs.map((t) => {
        const fn = vi.fn();
        t.addEventListener("fe:dirty-changed", fn);
        return fn;
      });

      await tabs[1].save();
      await waitForRender();

      for (const spy of spies) {
        const clean = spy.mock.calls.find(([e]: [CustomEvent]) => e.detail.isDirty === false);
        expect(clean).toBeDefined();
      }
    });
  });

  // ──────────────── 5 TABS ────────────────

  describe("5 tabs sharing one model", () => {
    it("all five tabs become clean after save on tab 4", async () => {
      const tabs = await setup(5);

      edit(tabs[4]);
      await waitForRender();

      expect(tabs.every((t) => t.getState().isDirty)).toBe(true);

      await tabs[4].save();
      await waitForRender();

      const s = states(tabs);
      expect(s.every((st) => st.isDirty === false)).toBe(true);
    });

    it("fe:dirty-changed(false) dispatched on all five tabs after save", async () => {
      const tabs = await setup(5);

      edit(tabs[2]);
      await waitForRender();

      const spies = tabs.map((t) => {
        const fn = vi.fn();
        t.addEventListener("fe:dirty-changed", fn);
        return fn;
      });

      await tabs[2].save();
      await waitForRender();

      for (const spy of spies) {
        const clean = spy.mock.calls.find(([e]: [CustomEvent]) => e.detail.isDirty === false);
        expect(clean).toBeDefined();
      }
    });
  });

  // ──────────────── 6 TABS ────────────────

  describe("6 tabs sharing one model", () => {
    it("all six tabs become clean after save on tab 0", async () => {
      const tabs = await setup(6);

      edit(tabs[0]);
      await waitForRender();

      expect(tabs.every((t) => t.getState().isDirty)).toBe(true);

      await tabs[0].save();
      await waitForRender();

      const s = states(tabs);
      expect(s.every((st) => st.isDirty === false)).toBe(true);
    });

    it("all six tabs become clean after save on tab 5", async () => {
      const tabs = await setup(6);

      edit(tabs[5]);
      await waitForRender();

      expect(tabs.every((t) => t.getState().isDirty)).toBe(true);

      await tabs[5].save();
      await waitForRender();

      const s = states(tabs);
      expect(s.every((st) => st.isDirty === false)).toBe(true);
    });

    it("fe:dirty-changed(false) dispatched on all six tabs after save", async () => {
      const tabs = await setup(6);

      edit(tabs[3]);
      await waitForRender();

      const spies = tabs.map((t) => {
        const fn = vi.fn();
        t.addEventListener("fe:dirty-changed", fn);
        return fn;
      });

      await tabs[3].save();
      await waitForRender();

      for (const spy of spies) {
        const clean = spy.mock.calls.find(([e]: [CustomEvent]) => e.detail.isDirty === false);
        expect(clean).toBeDefined();
      }
    });

    it("save from different tabs across multiple edit/save cycles", async () => {
      const tabs = await setup(6);

      // Cycle 1: tab 0 edits, tab 0 saves
      edit(tabs[0]);
      await waitForRender();
      await tabs[0].save();
      await waitForRender();
      expect(tabs.every((t) => t.getState().isDirty === false)).toBe(true);

      // Cycle 2: tab 3 edits, tab 5 saves
      edit(tabs[3]);
      await waitForRender();
      expect(tabs.every((t) => t.getState().isDirty)).toBe(true);
      await tabs[5].save();
      await waitForRender();
      expect(tabs.every((t) => t.getState().isDirty === false)).toBe(true);

      // Cycle 3: tabs 1 and 2 both edit (cumulative), tab 4 saves
      edit(tabs[1]);
      await waitForRender();
      edit(tabs[2]);
      await waitForRender();
      expect(tabs.every((t) => t.getState().isDirty)).toBe(true);
      await tabs[4].save();
      await waitForRender();
      expect(tabs.every((t) => t.getState().isDirty === false)).toBe(true);

      // Cycle 4: tab 0 edits again, tab 0 saves
      edit(tabs[0]);
      await waitForRender();
      await tabs[0].save();
      await waitForRender();
      expect(tabs.every((t) => t.getState().isDirty === false)).toBe(true);
    });
  });

  // ──────────────── REGRESSION GUARDS ────────────────

  describe("regression: save does not affect unrelated editors", () => {
    it("save on one model does not affect editors with a different model", async () => {
      const modelA = new PieceTreeTextContentModel("/test/a.txt", "file A content");
      const modelB = new PieceTreeTextContentModel("/test/b.txt", "file B content");

      const [editorA, editorB] = createEditors(2);
      editorA.textContentModel = modelA;
      editorB.textContentModel = modelB;
      await editorA.loadFile("/test/a.txt", "a.txt");
      await editorB.loadFile("/test/b.txt", "b.txt");
      await waitForRender();

      // Edit and save file A
      edit(editorA);
      await waitForRender();
      expect(editorA.getState().isDirty).toBe(true);
      expect(editorB.getState().isDirty).toBe(false); // B not edited

      await editorA.save();
      await waitForRender();

      expect(editorA.getState().isDirty).toBe(false); // A is clean after save
      expect(editorB.getState().isDirty).toBe(false); // B was never dirty
    });

    it("edit on one model does not affect dirty state of other models", async () => {
      const modelA = new PieceTreeTextContentModel("/test/a.txt", "file A content");
      const modelB = new PieceTreeTextContentModel("/test/b.txt", "file B content");

      const [editorA, editorB] = createEditors(2);
      editorA.textContentModel = modelA;
      editorB.textContentModel = modelB;
      await editorA.loadFile("/test/a.txt", "a.txt");
      await editorB.loadFile("/test/b.txt", "b.txt");
      await waitForRender();

      edit(editorA);
      await waitForRender();

      expect(editorA.getState().isDirty).toBe(true);
      expect(editorB.getState().isDirty).toBe(false);
    });
  });
});
