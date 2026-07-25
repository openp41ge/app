/**
 * Tests for format button visibility in the bottom bar.
 *
 * Verifies that the sbb-format-btn appears in the DOM for every file
 * extension that has a built-in formatter registered, and is absent
 * for extensions without formatters (Markdown, Shell, unknown).
 *
 * This tests the full pipeline:
 *   ExtensionFormatterRegistry ← registerBuiltinFormatters
 *   → FileEditorElement._wireFormatter() → FeStatusBar.setFormatter()
 *   → conditional rendering of .sbb-format-btn
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@openp41ge-file-editor/file-editor.ts";
import { ExtensionFormatterRegistry } from "@openp41ge-file-editor/services/extension-formatter-registry";
import { registerBuiltinFormatters } from "@openp41ge-file-editor/services/formatters";
import { PieceTreeTextContentModel } from "@openp41ge-file-editor/model/piece-tree-text-content-model";
import type { FileEditorElement } from "@openp41ge-file-editor/file-editor.ts";

// ── Test data ─────────────────────────────────────────────────────────────

/** All extensions that SHOULD have a format button visible. */
const SUPPORTED_EXTENSIONS = [
  // BraceIndent (2 spaces) — JS/TS family
  "js",
  "mjs",
  "cjs",
  "jsx",
  "ts",
  "mts",
  "cts",
  "tsx",
  // BraceIndent (4 spaces) — C-family, Rust, Go, Python, Ruby, Java
  "java",
  "c",
  "h",
  "cpp",
  "hpp",
  "cc",
  "cxx",
  "hxx",
  "c++",
  "h++",
  "rs",
  "go",
  "py",
  "pyw",
  "pyx",
  "pyi",
  "rb",
  "erb",
  "rbi",
  // HTML family
  "html",
  "htm",
  "xhtml",
  // CSS family
  "css",
  "scss",
  "less",
  // YAML (including lock files like yarn.lock)
  "yaml",
  "yml",
  "lock",
  // Markdown
  "md",
  "markdown",
  // Shell
  "sh",
  "bash",
  "zsh",
  // SQL
  "sql",
  // TOML
  "toml",
  // Dockerfile (both cases)
  "dockerfile",
  // Dockerfile (both cases)
  "Dockerfile",
  // HCL / Terraform
  "hcl",
  "tf",
  "tfvars",
  // PHP — gets HTML Indent (last registered formatter wins) — all variants
  "php",
  "phtml",
  "php3",
  "php4",
  "php5",
  // JSON — registered by the controller, not by registerBuiltinFormatters
  // but we test it via a custom registry setup
];

/** Extensions that should NOT have a format button. */
const UNSUPPORTED_EXTENSIONS = [
  // Unknown / no formatter
  "xyz",
  "pyc",
  "",
  "txt",
  "log",
  "csv",
  "xml",
];

// ── Helpers ───────────────────────────────────────────────────────────────

async function waitForRender(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
}

function createFileEditor(): FileEditorElement {
  const el = document.createElement("file-editor") as FileEditorElement;
  document.body.appendChild(el);
  return el;
}

/**
 * Check if the format button (.sbb-format-btn) is present in the editor's DOM.
 * Lit conditionally renders this element based on _hasFormatter state.
 */
function hasFormatButton(editor: FileEditorElement): boolean {
  return editor.querySelector(".sbb-format-btn") !== null;
}

/**
 * Create a registry with builtin formatters + JSON formatter (to mirror
 * the real setup in file-editor-controller.ts).
 */
function createFullRegistry(): ExtensionFormatterRegistry {
  const registry = new ExtensionFormatterRegistry();

  // Register JSON formatter (same as in file-editor-controller.ts)
  const jsonFormatter = {
    name: "JSON Pretty Print",
    format(content: string): string {
      try {
        return JSON.stringify(JSON.parse(content), null, 2) + "\n";
      } catch {
        return content;
      }
    },
  };
  registry.register(["json", "jsonc"], jsonFormatter);

  // Register all built-in formatters
  registerBuiltinFormatters(registry);

  return registry;
}

/** Stub the Electron preload API so file reading doesn't fail. */
function stubElectronAPI(): void {
  (window as any).openp41ge = {
    file: {
      readRange: vi.fn().mockResolvedValue({ data: "hello world\n" }),
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("format button visibility", () => {
  beforeEach(() => {
    stubElectronAPI();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  describe("supported extensions show the format button", () => {
    for (const ext of SUPPORTED_EXTENSIONS) {
      it(`shows format button for .${ext}`, async () => {
        const editor = createFileEditor();
        editor.formatterRegistry = createFullRegistry();
        await editor.updateComplete;
        await waitForRender();

        const path = `/test/file.${ext}`;
        const model = new PieceTreeTextContentModel(path, "content\n");
        editor.textContentModel = model;
        await editor.loadFile(path, `file.${ext}`);
        await waitForRender();

        expect(hasFormatButton(editor)).toBe(true);
      });
    }
  });

  describe("unsupported extensions hide the format button", () => {
    for (const ext of UNSUPPORTED_EXTENSIONS) {
      const label = ext ? `.${ext}` : "empty extension";
      it(`hides format button for ${label}`, async () => {
        const editor = createFileEditor();
        editor.formatterRegistry = createFullRegistry();
        await editor.updateComplete;
        await waitForRender();

        const path = ext ? `/test/file.${ext}` : "/test/README";
        const model = new PieceTreeTextContentModel(path, "content\n");
        editor.textContentModel = model;
        await editor.loadFile(path, ext ? `file.${ext}` : "README");
        await waitForRender();

        expect(hasFormatButton(editor)).toBe(false);
      });
    }
  });

  describe("format button behavior is dynamic", () => {
    it("shows format button after loading a supported extension, then hides it after loading an unsupported extension", async () => {
      const editor = createFileEditor();
      editor.formatterRegistry = createFullRegistry();
      await editor.updateComplete;
      await waitForRender();

      // Load a .ts file — button should be visible
      const tsPath = "/test/file.ts";
      const tsModel = new PieceTreeTextContentModel(tsPath, "const x = 1;\n");
      editor.textContentModel = tsModel;
      await editor.loadFile(tsPath, "file.ts");
      await waitForRender();
      expect(hasFormatButton(editor)).toBe(true);

      // Load a .txt file — button should be hidden (no formatter for plain text)
      const txtPath = "/test/file.txt";
      const txtModel = new PieceTreeTextContentModel(txtPath, "plain text\n");
      editor.textContentModel = txtModel;
      await editor.loadFile(txtPath, "file.txt");
      await waitForRender();
      expect(hasFormatButton(editor)).toBe(false);

      // Load a .json file — button should be visible again
      const jsonPath = "/test/file.json";
      const jsonModel = new PieceTreeTextContentModel(jsonPath, '{"a":1}\n');
      editor.textContentModel = jsonModel;
      await editor.loadFile(jsonPath, "file.json");
      await waitForRender();
      expect(hasFormatButton(editor)).toBe(true);
    });

    it("hides format button when formatterRegistry is null", async () => {
      const editor = createFileEditor();
      // Deliberately leave formatterRegistry as null
      await editor.updateComplete;
      await waitForRender();

      const path = "/test/file.js";
      const model = new PieceTreeTextContentModel(path, "const x = 1;\n");
      editor.textContentModel = model;
      await editor.loadFile(path, "file.js");
      await waitForRender();

      expect(hasFormatButton(editor)).toBe(false);
    });

    it("hides format button when formatterRegistry has no matching formatter", async () => {
      const editor = createFileEditor();
      // Empty registry — no formatters at all
      editor.formatterRegistry = new ExtensionFormatterRegistry();
      await editor.updateComplete;
      await waitForRender();

      const path = "/test/file.js";
      const model = new PieceTreeTextContentModel(path, "const x = 1;\n");
      editor.textContentModel = model;
      await editor.loadFile(path, "file.js");
      await waitForRender();

      expect(hasFormatButton(editor)).toBe(false);
    });
  });

  describe("JSON format behaviour unchanged", () => {
    it("shows format button for .json and .jsonc (via JSON Pretty Print)", async () => {
      const editor = createFileEditor();
      editor.formatterRegistry = createFullRegistry();
      await editor.updateComplete;
      await waitForRender();

      for (const ext of ["json", "jsonc"]) {
        const path = `/test/file.${ext}`;
        const model = new PieceTreeTextContentModel(path, '{"a":1}\n');
        editor.textContentModel = model;
        await editor.loadFile(path, `file.${ext}`);
        await waitForRender();

        expect(hasFormatButton(editor)).toBe(true);
      }
    });
  });
});
