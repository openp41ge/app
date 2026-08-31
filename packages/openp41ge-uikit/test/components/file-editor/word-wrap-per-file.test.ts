// @ts-nocheck
/**
 * Word wrap is a PER-FILE preference.
 *
 * The old implementation persisted wrap to a single extension-wide localStorage
 * key (`openp41ge:wordWrap:<ext>`), so toggling wrap in one file applied it to
 * every file of that extension. Now:
 *
 *  - The editor resolves wrap per PATH:
 *      per-file override (`openp41ge:wordWrap:path:<path>`) wins.
 *      otherwise the Editor-settings DEFAULT (set via setWordWrapDefault) wins.
 *  - Toggling wrap on a file writes ONLY that file's key and never affects any
 *    other open file.
 *  - The old extension-wide key is ignored.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import "../../../src/components/file-editor/file-editor";

const CONTENT = "const x = 1;\nconsole.log(x);\n";

function pathKey(p) {
  return "openp41ge:wordWrap:path:" + p;
}

async function mountEditor(file = "app.ts", path = `/repo/${file}`): Promise<HTMLElement> {
  const el = document.createElement("file-editor");
  el.filePath = path;
  el.fileName = file;
  el.textContentModel = new PieceTreeTextContentModel(`file:///${file}`, CONTENT);
  document.body.appendChild(el);
  // Lit mount + firstUpdated + _initWithModel (wrap resolves here).
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

function wrapFlag(el) {
  return el._wordWrapEnabled;
}

function setStored(paths) {
  for (const [p, v] of Object.entries(paths)) {
    if (v === null) localStorage.removeItem(pathKey(p));
    else localStorage.setItem(pathKey(p), v);
  }
}

describe("per-file word wrap", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  test("the default applies when a file has no per-file override", async () => {
    const el = await mountEditor("a.ts");
    el.setWordWrapDefault(true);
    expect(wrapFlag(el)).toBe(true);
    // Changing the default re-applies live (no override present).
    el.setWordWrapDefault(false);
    expect(wrapFlag(el)).toBe(false);
  });

  test("a saved per-file override WINS over the default", async () => {
    setStored({ "/repo/b.ts": "false" });
    const a = await mountEditor("a.ts"); // no override
    a.setWordWrapDefault(true);
    const b = await mountEditor("b.ts", "/repo/b.ts"); // saved override false
    expect(wrapFlag(a)).toBe(true);
    expect(wrapFlag(b)).toBe(false);
    // Default change does NOT disturb the file with an override.
    a.setWordWrapDefault(true);
    b.setWordWrapDefault(true);
    expect(wrapFlag(b)).toBe(false);
  });

  test("toggling wrap on one file never affects another file", async () => {
    setStored({ "/repo/a.ts": "false" });
    const a = await mountEditor("a.ts");
    const b = await mountEditor("b.ts");
    b._toggleWordWrap(true);

    expect(wrapFlag(a)).toBe(false);
    expect(wrapFlag(b)).toBe(true);
    // Only the toggled file's key is written.
    expect(localStorage.getItem(pathKey("/repo/a.ts"))).toBe("false");
    expect(localStorage.getItem(pathKey("/repo/b.ts"))).toBe("true");
    // No extension-global key is written anymore.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      expect(k.startsWith("openp41ge:wordWrap:path:")).toBe(true);
    }
  });

  test("the old extension-global key is ignored", async () => {
    localStorage.setItem("openp41ge:wordWrap:ts", "true"); // legacy
    const el = await mountEditor("legacy.ts");
    el.setWordWrapDefault(false);
    expect(wrapFlag(el)).toBe(false); // default wins; legacy key ignored
  });

  test("wrap state is remembered per PATH across editor instances", async () => {
    const el = await mountEditor("remember.ts");
    el._toggleWordWrap(true);
    expect(localStorage.getItem(pathKey("/repo/remember.ts"))).toBe("true");

    // A fresh editor for the same path picks up the saved per-file state.
    document.body.innerHTML = "";
    const again = await mountEditor("remember.ts");
    expect(wrapFlag(again)).toBe(true);
  });
});
