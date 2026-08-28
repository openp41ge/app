// @ts-nocheck
/**
 * Unit tests for FileDragSource — the explorer file drag source.
 *
 * The visible ghost is the main-process DragGhostManager window (which must
 * travel outside the browser window), rendered from a captured bitmap of the
 * source row. The in-DOM ghost is therefore invisible, and the source row is
 * left untouched (opacity is NOT dimmed) so the capturePage snapshot taken at
 * drag threshold is pristine.
 */

import { FileDragSource } from "@openp41ge/renderer/services/drag-sources/file-drag-source";

function makeRow(label = "app.ts"): HTMLElement {
  const row = document.createElement("div");
  row.className = "tree-node";
  row.style.cssText =
    "display:flex;align-items:center;gap:2px;height:26px;padding-left:16px;background:#1e1e1e;color:#d4d4d4;";
  row.setAttribute("data-file-path", `/repo/${label}`);
  const labelEl = document.createElement("span");
  labelEl.className = "tree-label";
  labelEl.textContent = label;
  row.appendChild(labelEl);
  return row;
}

describe("FileDragSource", () => {
  test("createGhost returns an invisible, pointer-inert element (visual is the BrowserWindow ghost bitmap)", () => {
    const source = new FileDragSource("/repo/app.ts", "app.ts");
    const ghost = source.createGhost();

    expect(ghost.style.pointerEvents).toBe("none");
    expect(ghost.style.opacity).toBe("0");
  });

  test("onDragStart does not dim the source row (bitmap is captured at full opacity)", () => {
    const row = makeRow();
    const source = new FileDragSource("/repo/app.ts", "app.ts");
    source.onDragStart();
    expect(row.style.opacity).toBe("");
  });

  test("onDragEnd removes the in-DOM ghost", () => {
    const source = new FileDragSource("/repo/app.ts", "app.ts");
    const ghost = source.createGhost();
    document.body.appendChild(ghost);

    source.onDragEnd({ success: false });
    expect(ghost.parentNode).toBeNull();
  });

  test("getDragData reports the file payload", () => {
    const source = new FileDragSource("/repo/app.ts", "app.ts");
    expect(source.getDragData()).toEqual({
      type: "file",
      filePath: "/repo/app.ts",
      fileName: "app.ts",
    });
  });
});
