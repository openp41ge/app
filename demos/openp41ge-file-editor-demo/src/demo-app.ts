/**
 * demo-app.ts — Multi-editor standalone demo for the <file-editor> component.
 *
 * Two side-by-side editors with a **global model cache**. When both editors
 * select the same file, they share the same PieceTreeTextContentModel
 * instance. Edits in one editor appear in the other in real time because
 * the model fires onDidChangeContent events that both editors' ViewModels
 * listen to.
 *
 * File contents persist in sessionStorage so edits survive page reloads.
 */

import "openp41ge-file-editor"; // registers <file-editor> and <fe-status-bar>
import type { FileEditorElement } from "openp41ge-file-editor/file-editor";
import { PieceTreeTextContentModel } from "openp41ge-file-editor/model/piece-tree-text-content-model";
import type { DirtyChangedDetail } from "openp41ge-file-editor/events";

import { initTextMate } from "openp41ge-file-editor/tokenization/textmate-init";
import { TokenRegistry } from "openp41ge-file-editor/tokenization/token-registry";
import { darkPlusTheme } from "openp41ge-file-editor/themes";

import samples from "./samples";
import type { SampleEntry } from "./samples";

// ─── Session storage ───────────────────────────────────────────────

const STORAGE_PREFIX = "fe-demo:";

function storageKey(filePath: string): string {
  return STORAGE_PREFIX + filePath;
}

/** Seed sessionStorage on first visit. */
(function seed(): void {
  for (const s of samples) {
    const key = storageKey(`demo/${s.fileName}`);
    if (sessionStorage.getItem(key) === null) {
      sessionStorage.setItem(key, s.content);
    }
  }
})();

// ─── Mock IPC ──────────────────────────────────────────────────────

(window as Record<string, unknown>).openp41ge ??= {};
(window as any).openp41ge.file = {
  readRange: async (filePath: string, offset: number, length: number) => {
    const content = sessionStorage.getItem(storageKey(filePath)) ?? "";
    return { data: content.slice(offset, offset + length), totalSize: content.length };
  },
  writeFile: async (filePath: string, content: string) => {
    sessionStorage.setItem(storageKey(filePath), content);
    return { success: true };
  },
};

// ─── Global theme state (shared across editors) ─────────────────────

let _isDark = true;

// ─── Global model cache ─────────────────────────────────────────────
// Models are shared by sample id across all editors. When both editors
// select the same file, they share the same model instance so edits in
// one appear in the other in real time.

const _modelCache = new Map<string, PieceTreeTextContentModel>();

function getContent(sample: SampleEntry): string {
  const key = storageKey(`demo/${sample.fileName}`);
  const stored = sessionStorage.getItem(key);
  if (stored !== null) return stored;
  sessionStorage.setItem(key, sample.content);
  return sample.content;
}

function getOrBuildModel(sample: SampleEntry): PieceTreeTextContentModel {
  const cached = _modelCache.get(sample.id);
  if (cached) return cached;

  const content = getContent(sample);
  const model = new PieceTreeTextContentModel(`demo/${sample.fileName}`, content, {
    fileReader: {
      readRange: async (_path: string, offset: number, length: number) => {
        // Read from the model's current in-memory content so edits are reflected
        const m = _modelCache.get(sample.id);
        const c = m ? m.getValue() : getContent(sample);
        return { data: c.slice(offset, offset + length), totalSize: c.length };
      },
      writeFile: async () => ({ success: true }),
    },
  });
  _modelCache.set(sample.id, model);
  return model;
}

// ─── Editor instance manager ───────────────────────────────────────

interface EditorState {
  editor: FileEditorElement;
  select: HTMLSelectElement;
  dirtyIndicator: HTMLElement;
  languageBadge: HTMLElement;
  themeToggle: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
  currentSample: SampleEntry | null;
  index: number;
}

function createEditorState(editorIndex: number): EditorState {
  const panel = document.querySelector<HTMLElement>(`.editor-panel[data-panel="${editorIndex}"]`)!;
  const root = panel.querySelector<HTMLElement>(`file-editor[data-editor-id="${editorIndex}"]`)!;

  return {
    editor: root as FileEditorElement,
    select: panel.querySelector<HTMLSelectElement>(".file-select")!,
    dirtyIndicator: panel.querySelector<HTMLElement>(".dirty-indicator")!,
    languageBadge: panel.querySelector<HTMLElement>(".language-badge")!,
    themeToggle: panel.querySelector<HTMLButtonElement>(".theme-toggle")!,
    saveBtn: panel.querySelector<HTMLButtonElement>(".save-btn")!,
    currentSample: null,
    index: editorIndex,
  };
}

// ─── Editor operations ─────────────────────────────────────────────

async function loadSample(st: EditorState, sample: SampleEntry): Promise<void> {
  st.currentSample = sample;

  const model = getOrBuildModel(sample);
  st.editor.textContentModel = model;

  // Update toolbar
  st.languageBadge.textContent =
    sample.languageId.charAt(0).toUpperCase() + sample.languageId.slice(1);
  st.dirtyIndicator.classList.remove("dirty-visible");
  st.dirtyIndicator.classList.add("dirty-hidden");

  await (st.editor as any).updateComplete;
  await st.editor.loadFile(`demo/${sample.fileName}`, sample.fileName);
}

function invalidateModel(sampleId: string): void {
  _modelCache.delete(sampleId);
}

function setupEditor(st: EditorState): void {
  const { editor, select, dirtyIndicator, themeToggle, saveBtn } = st;

  // ── File switching ──
  select.addEventListener("change", () => {
    const sample = samples.find((s) => s.id === select.value);
    if (sample) loadSample(st, sample).catch((err) => console.error(err));
  });

  // ── Theme toggle (global state shared across editors) ──
  themeToggle.addEventListener("click", () => {
    _isDark = !_isDark;
    document.body.classList.toggle("light-theme", !_isDark);
    const themeId = _isDark ? "openp41ge-dark" : "openp41ge-light";
    for (const s of allStates) s.editor.setTheme(themeId);
    for (const s of allStates) s.themeToggle.textContent = _isDark ? "🌓" : "☀️";
  });

  // ── Save ──
  saveBtn.addEventListener("click", async () => {
    const success = await editor.save();
    if (success) {
      dirtyIndicator.classList.remove("dirty-visible");
      dirtyIndicator.classList.add("dirty-hidden");
      if (st.currentSample) invalidateModel(st.currentSample.id);
    }
  });

  // ── Dirty indicator from events ──
  editor.addEventListener("fe:dirty-changed", ((e: CustomEvent<DirtyChangedDetail>) => {
    if (e.detail.isDirty) {
      dirtyIndicator.classList.remove("dirty-hidden");
      dirtyIndicator.classList.add("dirty-visible");
    } else {
      dirtyIndicator.classList.remove("dirty-visible");
      dirtyIndicator.classList.add("dirty-hidden");
    }
  }) as EventListener);
}

// ─── Focus tracking ────────────────────────────────────────────────

const activeLabel = document.getElementById("active-editor-label")!;
const focusDebug = document.getElementById("focus-debug")!;

function trackFocus(states: EditorState[]): void {
  document.addEventListener("focusin", () => {
    for (const st of states) {
      const textarea = st.editor.querySelector<HTMLElement>(".fe-hidden-textarea");
      if (textarea && document.activeElement === textarea) {
        activeLabel.textContent = `Active: Editor ${st.index + 1}`;
        focusDebug.textContent = `Focus: ${st.currentSample?.fileName ?? "—"}`;
        break;
      }
    }
  });
}

// ─── Keyboard shortcut (global) ────────────────────────────────────

document.addEventListener("keydown", async (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
    e.preventDefault();
    const activeEl = document.activeElement;
    for (const st of [state0, state1]) {
      if (st.editor.contains(activeEl)) {
        await st.editor.save();
        st.dirtyIndicator.classList.remove("dirty-visible");
        st.dirtyIndicator.classList.add("dirty-hidden");
        if (st.currentSample) invalidateModel(st.currentSample.id);
        break;
      }
    }
  }
});

// ─── Init ──────────────────────────────────────────────────────────

const state0 = createEditorState(0);
const state1 = createEditorState(1);
const allStates = [state0, state1];

async function init(): Promise<void> {
  // Pre-initialise TextMate once for both editors
  try {
    const { registry } = await initTextMate(darkPlusTheme.rawTheme);
    const tokenRegistry = new TokenRegistry(registry);
    state0.editor.tokenRegistry = tokenRegistry;
    state1.editor.tokenRegistry = tokenRegistry;
    console.log("[demo] TextMate initialised");
  } catch (err) {
    console.warn("[demo] TextMate init failed:", err);
  }

  // Wire up each editor
  for (const st of allStates) {
    setupEditor(st);
  }

  // Track focus across editors
  trackFocus(allStates);

  // Load both editors with the same initial file (shared model)
  try {
    const first = samples.find((s) => s.id === "typescript")!;
    state0.select.value = first.id;
    await loadSample(state0, first);
    console.log("[demo] Editor 1 loaded:", first.fileName);

    state1.select.value = first.id;
    await loadSample(state1, first);
    console.log("[demo] Editor 2 loaded:", first.fileName);
    console.log("[demo] Both editors share the same model — edits in one appear in the other!");
  } catch (err) {
    console.error("[demo] Init failed:", err);
  }
}

init();
