// @ts-nocheck
/**
 * Regression test: the file editor's VERTICAL scrollbar must be a floating
 * overlay, not the native bar.
 *
 * A native `::-webkit-scrollbar` reserves an 8px layout gutter — content never
 * renders behind it, so there is a blank strip along the right edge. The editor
 * replaces it with the uikit `OverlayScrollbar`, which:
 *   - hides the native bar (`scrollbar-width: none` + `data-overlay-scrollbar`),
 *   - draws its track in the non-scrolling `.fe-viewport-container`, so the
 *     translucent thumb floats OVER the text (content stays visible behind it).
 *
 * The viewport keeps its native `overflow-y:auto` scroll mechanism (wheel /
 * trackpad still scroll), so only the visible bar is replaced.
 */
import { describe, test, expect } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import "../../../src/components/file-editor/file-editor";

const CONTENT = "const x = 1;\nconsole.log(x);\n";

async function mountEditor(file = "app.ts"): Promise<HTMLElement> {
  const el = document.createElement("file-editor") as HTMLElement & {
    filePath: string;
    fileName: string;
    textContentModel: unknown;
  };
  el.filePath = `/repo/${file}`;
  el.fileName = file;
  el.textContentModel = new PieceTreeTextContentModel(`file:///${file}`, CONTENT);
  document.body.appendChild(el);
  // Let Lit mount + firstUpdated + _initWithModel run.
  await new Promise((r) => setTimeout(r, 30));
  return el;
}

describe("file editor overlay vertical scrollbar", () => {
  test("hides the native vertical scrollbar on the viewport", async () => {
    const el = await mountEditor();
    const viewport = el.querySelector(".fe-viewport") as HTMLElement;
    expect(viewport).toBeTruthy();
    expect(viewport.hasAttribute("data-overlay-scrollbar")).toBe(true);
    expect(viewport.style.scrollbarWidth).toBe("none");
  });

  test("renders its track in the non-scrolling container (floats over content)", async () => {
    const el = await mountEditor();
    const container = el.querySelector(".fe-viewport-container") as HTMLElement;
    expect(container).toBeTruthy();
    // The track lives in the container, NOT inside the scrolling viewport, so
    // it cannot scroll away with the content.
    const track = container.querySelector(".os-track--v");
    expect(track).toBeTruthy();
    expect(track.parentElement).toBe(container);
    expect(viewportScrollsVertically(track)).toBe(false);
  });
});

function viewportScrollsVertically(track: HTMLElement): boolean {
  // The track must not be a descendant of the scroll target. The viewport has
  // overflow-y:auto; a track nested inside it would slide with the content.
  let node: HTMLElement | null = track;
  while (node) {
    if (node.classList.contains("fe-viewport")) return true;
    node = node.parentElement;
  }
  return false;
}
