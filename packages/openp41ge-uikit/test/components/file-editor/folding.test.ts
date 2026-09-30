// @ts-nocheck
import { describe, test, expect, beforeEach } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine";
import "../../../src/components/file-editor/file-editor";

// ── File-editor folding (indentation-based) ────────────────────────────────
// The file editor folds by indentation. The grammar-driven _enableFolds() path
// can't run in jsdom (no oniguruma), so these tests drive the fold machinery
// directly through the public-ish internal methods.

const CONTENT = [
  "function foo() {", // 1  (indent 0)  ← fold header
  "  if (x) {", //       2  (indent 1)
  "    return 1;", //    3  (indent 2)
  "  }", //              4  (indent 1)
  "  return 2;", //      5  (indent 1)
  "}", //                6  (indent 0)
  "const y = 3;", //     7  (indent 0)
].join("\n");

async function mount() {
  const el = document.createElement("file-editor");
  el.filePath = "/repo/app.ts";
  el.fileName = "app.ts";
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 30));
  const model = new PieceTreeTextContentModel("file:///app.ts", CONTENT);
  el.textContentModel = model;
  await el.loadFile("file:///app.ts", "app.ts");
  await new Promise((r) => setTimeout(r, 35));
  return el;
}

async function mountJson() {
  const el = document.createElement("file-editor");
  el.filePath = "/repo/app.json";
  el.fileName = "app.json";
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 30));
  const text = [
    "{", //                        1 root
    '  "a": {', //                  2 object header
    '    "x": 1,', //               3
    '    "y": "hello"', //          4
    "  },", //                      5
    '  "deps": [', //               6 array header
    '    "vue",', //                7
    '    "react"', //               8
    "  ],", //                      9
    '  "c": "z"', //               10
    "}", //                        11
  ].join("\n");
  const model = new PieceTreeTextContentModel("file:///app.json", text);
  el.textContentModel = model;
  await el.loadFile("file:///app.json", "app.json");
  await new Promise((r) => setTimeout(r, 35));
  return el;
}

describe("file-editor folding", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("_enableFolds computes indentation regions and marks chevrons", async () => {
    const el = await mount();
    el._enableFolds();
    await new Promise((r) => setTimeout(r, 20));

    expect(el._foldEnabled).toBe(true);
    // Header at line 1 wraps its whole body (incl. the closing brace) 2..6;
    // the nested if folds its own body 3..4.
    expect(el._foldRegions).toEqual([
      { startLine: 1, endLine: 6 },
      { startLine: 2, endLine: 4 },
    ]);
    // Chevron data is present only on fold headers.
    expect(el._gutterDataFor(1).hasChevron).toBe(true);
    expect(el._gutterDataFor(1).folded).toBe(false);
    expect(el._gutterDataFor(2).hasChevron).toBe(true);
    expect(el._gutterDataFor(6).hasChevron).toBe(false);
  });

  test("collapsing a header hides its body and removes its gutter rows", async () => {
    const el = await mount();
    el._enableFolds();
    el._toggleFoldAt(1);
    await new Promise((r) => setTimeout(r, 20));

    // Header stays visible; body lines 2..6 (incl. the closing `}`) are hidden;
    // the sibling stays.
    expect(el.isLineFolded(1)).toBe(false);
    for (const hidden of [2, 3, 4, 5, 6]) expect(el.isLineFolded(hidden)).toBe(true);
    expect(el.isLineFolded(7)).toBe(false);

    // The gutter band skips the hidden lines.
    const keys = el._gutterRows(1, 7).map((r) => r.key);
    expect(keys).toEqual([1, 7]);

    // The chevron flips to the collapsed state.
    expect(el._gutterDataFor(1).folded).toBe(true);
  });

  test("expanding the header restores the hidden lines", async () => {
    const el = await mount();
    el._enableFolds();
    el._toggleFoldAt(1);
    el._toggleFoldAt(1);
    await new Promise((r) => setTimeout(r, 20));

    for (const line of [1, 2, 3, 4, 5, 6, 7]) {
      expect(el.isLineFolded(line)).toBe(false);
    }
    expect(el._gutterRows(1, 7).map((r) => r.key)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(el._gutterDataFor(1).folded).toBe(false);
  });

  test("collapsing a nested header only hides its own body", async () => {
    const el = await mount();
    el._enableFolds();
    // Collapse line 2 (the nested if block) only.
    el._toggleFoldAt(2);
    await new Promise((r) => setTimeout(r, 20));

    expect(el.isLineFolded(2)).toBe(false);
    expect(el.isLineFolded(3)).toBe(true);
    expect(el.isLineFolded(4)).toBe(true);
    expect(el.isLineFolded(5)).toBe(false);
    expect(el._gutterRows(1, 7).map((r) => r.key)).toEqual([1, 2, 5, 6, 7]);
  });

  test("collapsing an object header greys the bracket and injects a type summary", async () => {
    const el = await mountJson();
    el._enableFolds();
    el._toggleFoldAt(2); // collapse the "a" object
    await new Promise((r) => setTimeout(r, 20));

    // The header renders the key prefix and ONE grey suffix (brackets + meta)
    // — no doubled opening brace.
    const info = el._foldSummaryAt(2);
    expect(info).toEqual({
      prefix: '  "a": ',
      meta: "{ 2 properties \u00b7 1 string \u00b7 1 number },",
    });
    // The closing brace line is folded away (absorbed into the region).
    expect(el.isLineFolded(5)).toBe(true);
  });

  test("collapsing an array header greys the bracket and shows an item summary", async () => {
    const el = await mountJson();
    el._enableFolds();
    el._toggleFoldAt(6); // collapse the "deps" array
    await new Promise((r) => setTimeout(r, 20));

    expect(el._foldSummaryAt(6)).toEqual({
      prefix: '  "deps": ',
      meta: "[ 2 items \u00b7 2 strings ],",
    });
    expect(el.isLineFolded(9)).toBe(true);
  });

  test("collapsing a top-level object summary is shown on the rendered row", async () => {
    const el = await mountJson();
    el._enableFolds();
    el._toggleFoldAt(2);
    await new Promise((r) => setTimeout(r, 20));

    const header = [...el.querySelectorAll(".view-line")].find((l) =>
      l.querySelector(":scope > .fe-fold-ellipsis"),
    );
    expect(header).toBeTruthy();
    expect(header!.textContent).toContain("{ 2 properties \u00b7 1 string \u00b7 1 number }");
    // Exactly one `{` in the rendered header: the grey suffix's, not a doubled
    // opening bracket from the original content.
    expect(header!.textContent.split("{").length - 1).toBe(1);
  });

  test("a non-bracket (indent-only) fold falls back to a line-count summary", async () => {
    const el = document.createElement("file-editor");
    el.filePath = "/repo/app.py";
    el.fileName = "app.py";
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 30));
    const py = ["def foo():", "    print(1)", "    print(2)"].join("\n");
    const model = new PieceTreeTextContentModel("file:///app.py", py);
    el.textContentModel = model;
    await el.loadFile("file:///app.py", "app.py");
    await new Promise((r) => setTimeout(r, 35));
    el._enableFolds();
    el._toggleFoldAt(1);
    await new Promise((r) => setTimeout(r, 20));

    // No braces → no bracket summary; report the hidden line span instead.
    expect(el._foldSummaryAt(1)).toEqual({ prefix: "def foo():", meta: " \u2026 2 lines" });
  });

  test("content edits that remove a fold collapse prune the dead header", async () => {
    const el = await mount();
    el._enableFolds();
    el._toggleFoldAt(1);
    // Replace the whole buffer with a flat file (no indent) → no regions.
    const model = el.textContentModel;
    el.textContentModel.pushEditOperations([
      {
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 7, endColumn: 14 },
        text: "a\nb\nc",
      },
    ]);
    await new Promise((r) => setTimeout(r, 30));
    el._computeFolds();
    await new Promise((r) => setTimeout(r, 20));

    expect(el._foldRegions.length).toBe(0);
    expect(el._collapsedHeaders.size).toBe(0);
    for (let l = 1; l <= 3; l++) expect(el.isLineFolded(l)).toBe(false);
  });

  test("_teardownFolds resets the fold state and hides the column", async () => {
    const el = await mount();
    el._enableFolds();
    el._toggleFoldAt(1);

    el._teardownFolds();

    expect(el._foldEnabled).toBe(false);
    expect(el._foldRegions).toEqual([]);
    expect(el._collapsedHeaders.size).toBe(0);
    expect(el._hiddenLines.size).toBe(0);
    for (let l = 1; l <= 7; l++) expect(el.isLineFolded(l)).toBe(false);
  });

  test("loading a new (non-code) model drops folding for that file", async () => {
    const el = await mount();
    el._enableFolds();
    el._toggleFoldAt(1);

    // Simulate opening a no-grammar file: init resets folds and (with no
    // language detected) leaves them off for that file.
    el.filePath = "/repo/data.zzq";
    el.fileName = "data.zzq";
    el._initWithModel(new PieceTreeTextContentModel("file:///data.zzq", "a\nb\nc"));
    await new Promise((r) => setTimeout(r, 30));

    expect(el._foldEnabled).toBe(false);
    expect(el._foldRegions).toEqual([]);
    expect(el._hiddenLines.size).toBe(0);
  });

  test("hover box spans number + fold columns on non-foldable rows, and stays on the number column on foldable rows", async () => {
    const el = await mount();
    el._enableFolds();
    await new Promise((r) => setTimeout(r, 20));

    // In jsdom the viewport height is 0, so only a tiny visible band renders;
    // force the whole band into the gutter so every row's cell exists.
    el._syncGutterBand(1, 7);
    await new Promise((r) => setTimeout(r, 20));

    const hover = (ln: number) => {
      const cell = el._gutter.root.querySelector(
        `.eg-col--fe-number .eg-cell[data-key="${ln}"]`,
      ) as HTMLElement;
      cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true }));
    };
    const box = () => el._gutter.root.querySelector(".eg-hoverbox") as HTMLElement | null;
    const numW = () => parseFloat(el._gutter.root.querySelector(".eg-col--fe-number")!.style.width);
    const foldW = () => parseFloat(el._gutter.root.querySelector(".eg-col--fold")!.style.width);

    // Non-foldable row (line 7, no indent header) → box spans BOTH columns.
    hover(7);
    await new Promise((r) => setTimeout(r, 20));
    expect(box()).not.toBeNull();
    expect(parseFloat(box()!.style.width)).toBeCloseTo(numW() + foldW() + 1, 1); // +1px left overlap
    expect(box()!.style.left).toBe("-1px");

    // Foldable row (line 1 has a chevron) → box stays on the number column.
    hover(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(parseFloat(box()!.style.width)).toBeCloseTo(numW() + 1, 1);
  });

  test("clicking a line highlights both the number and fold gutter cells", async () => {
    const el = await mount();
    el._enableFolds();
    await new Promise((r) => setTimeout(r, 20));
    // Force the whole band into the gutter so every row's cell exists.
    el._syncGutterBand(1, 7);
    await new Promise((r) => setTimeout(r, 20));

    // Put the primary cursor on a non-foldable line (line 7) — the engine
    // fires onDidChange, which drives the gutter's active row.
    el._cursorController.setCursorStates([
      { position: { lineNumber: 7, column: 1 }, selectionAnchor: { lineNumber: 7, column: 1 } },
    ]);
    await new Promise((r) => setTimeout(r, 20));

    const num = el._gutter.root.querySelector(`.eg-col--fe-number .eg-cell[data-key="7"]`);
    const fold = el._gutter.root.querySelector(`.eg-col--fold .eg-cell[data-key="7"]`);
    // The number cell keeps its grey via active-line-number; the shared fold
    // column cell gets the host's eg-cell--active so BOTH columns highlight.
    expect(num?.classList.contains("active-line-number")).toBe(true);
    expect(fold?.classList.contains("eg-cell--active")).toBe(true);
  });

  test("fold column is as wide as the line height (square collapsible buttons)", async () => {
    const el = await mount();
    el._enableFolds();
    await new Promise((r) => setTimeout(r, 20));
    const foldW = () => parseFloat(el._gutter.root.querySelector(".eg-col--fold")!.style.width);
    expect(foldW()).toBeCloseTo(el._lineHeight, 0);
    // A different line height reflows the fold width to stay square.
    el.setEditorLineHeight(30);
    await new Promise((r) => setTimeout(r, 20));
    expect(foldW()).toBeCloseTo(30, 0);
  });
});
