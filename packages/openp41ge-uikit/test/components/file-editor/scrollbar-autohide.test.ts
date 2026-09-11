// @ts-nocheck
/**
 * The file editor's scrollbars should auto-hide (fade out) after the cursor
 * leaves the content area — for both the vertical OverlayScrollbar and the
 * bespoke custom horizontal .fe-hscroll bar. These pin the hide/show class
 * toggling driven by pointerenter/pointerleave on the content hover zone.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { PieceTreeTextContentModel } from "openp41ge-editor-engine/model/piece-tree-text-content-model";
import "../../../src/components/file-editor/file-editor";

const CONTENT = "const alpha = 1;\nconst beta = 2;\nconsole.log(alpha, beta);\n";
const AUTO_HIDE_MS = 2500;

async function mountEditor(): Promise<HTMLElement> {
  const el = document.createElement("file-editor") as HTMLElement & {
    filePath: string;
    fileName: string;
    textContentModel: unknown;
  };
  el.filePath = `/repo/app.ts`;
  el.fileName = "app.ts";
  el.textContentModel = new PieceTreeTextContentModel("file:///app.ts", CONTENT);
  document.body.appendChild(el);
  // Let Lit mount + firstUpdated + _initWithModel + the vertical/horizontal
  // scrollbar setup run.
  await new Promise((r) => setTimeout(r, 40));
  return el;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pointer = (el: Element, type: string): void => el.dispatchEvent(new Event(type));

describe("file-editor scrollbar auto-hide", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("vertical bar fades out a few seconds after the cursor leaves", async () => {
    const el = await mountEditor();
    const zone = el.querySelector(".fe-viewport-container") as HTMLElement;
    const track = el.querySelector(".os-track--v") as HTMLElement;
    expect(zone).toBeTruthy();
    expect(track).toBeTruthy();

    pointer(zone, "pointerenter");
    await sleep(20);
    expect(track.classList.contains("os-hidden")).toBe(false);

    pointer(zone, "pointerleave");
    expect(track.classList.contains("os-hidden")).toBe(false); // still shown mid-delay
    await sleep(AUTO_HIDE_MS + 100);
    expect(track.classList.contains("os-hidden")).toBe(true);
  });

  test("horizontal bar fades out a few seconds after the cursor leaves", async () => {
    const el = await mountEditor();
    const zone = el.querySelector(".fe-viewport-container") as HTMLElement;
    const track = el.querySelector(".fe-hscroll") as HTMLElement;
    expect(track).toBeTruthy();

    pointer(zone, "pointerenter");
    await sleep(20);
    expect(track.classList.contains("fe-hscroll-hidden")).toBe(false);

    pointer(zone, "pointerleave");
    expect(track.classList.contains("fe-hscroll-hidden")).toBe(false);
    await sleep(AUTO_HIDE_MS + 100);
    expect(track.classList.contains("fe-hscroll-hidden")).toBe(true);
  });

  test("re-entering before the delay keeps both bars visible", async () => {
    const el = await mountEditor();
    const zone = el.querySelector(".fe-viewport-container") as HTMLElement;
    const vTrack = el.querySelector(".os-track--v") as HTMLElement;
    const hTrack = el.querySelector(".fe-hscroll") as HTMLElement;

    pointer(zone, "pointerenter");
    pointer(zone, "pointerleave");
    await sleep(1000);
    pointer(zone, "pointerenter"); // returns before the 2500ms delay elapses
    await sleep(AUTO_HIDE_MS + 100);

    expect(vTrack.classList.contains("os-hidden")).toBe(false);
    expect(hTrack.classList.contains("fe-hscroll-hidden")).toBe(false);
  });
});
