/**
 * Unit tests for the drag-ghost content builder (`buildBitmapGhostHtml`).
 *
 * Verifies the workspace-skeleton "lift off" spring: the bitmap is rendered at
 * the largest frame (source × LIFT_MAX_SCALE) so it never clips, and springs up
 * from the source size to full, anchored at the grab point. Non-lift (
 * file/tab) swaps stay 1:1 with no animation.
 */
import { describe, it, expect } from "vitest";
import { buildBitmapGhostHtml, buildBitmapImgHtml, buildWorkspaceGhostHtml, LIFT_MAX_SCALE } from "../../../src/main/services/drag-ghost-manager.js";

const SPRING_EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

describe("buildBitmapGhostHtml", () => {
  it("renders a non-lift bitmap 1:1 at its source size with no animation", () => {
    const html = buildBitmapGhostHtml("data:image/png;base64,AAA", 132, 84, 0, false, 40, 20);
    expect(html).toContain("width:132px;height:84px");
    expect(html).not.toContain("@keyframes");
    expect(html).not.toContain("transform-origin");
    expect(html).not.toContain("op41ge-lift");
  });

  it("keeps the inset trim for a non-lift bitmap (image = outer − 2·inset)", () => {
    // inset 6 on a 132×84 source → image is 120×72 with a 6px margin.
    const html = buildBitmapGhostHtml("data:image/png;base64,AAA", 132, 84, 6, false, 70, 40);
    expect(html).toContain("width:120px;height:72px");
    expect(html).toContain("margin:6px;");
  });

  it("renders a lift-off bitmap at the largest frame (source × LIFT_MAX_SCALE)", () => {
    const html = buildBitmapGhostHtml("data:image/png;base64,AAA", 132, 84, 0, true, 40, 20);
    const maxW = Math.round(132 * LIFT_MAX_SCALE);
    const maxH = Math.round(84 * LIFT_MAX_SCALE);
    expect(html).toContain(`width:${maxW}px;height:${maxH}px`);
  });

  it("anchors the spring at the grab point via transform-origin", () => {
    const html = buildBitmapGhostHtml("data:image/png;base64,AAA", 132, 84, 0, true, 40, 20);
    const ox = Math.round(40 * LIFT_MAX_SCALE);
    const oy = Math.round(20 * LIFT_MAX_SCALE);
    expect(html).toContain(`transform-origin:${ox}px ${oy}px`);
  });

  it("includes the overshoot spring keyframes and easing", () => {
    const html = buildBitmapGhostHtml("data:image/png;base64,AAA", 132, 84, 0, true, 40, 20);
    expect(html).toContain("@keyframes op41ge-lift");
    expect(html).toContain(SPRING_EASE);
    const startScale = 1 / LIFT_MAX_SCALE;
    expect(html).toContain(`from{transform:scale(${startScale})}`);
    expect(html).toContain("to{transform:scale(1)}");
  });

  it("renders a workspace placeholder card at the lifted frame with the spring", () => {
    const html = buildWorkspaceGhostHtml("Two", "\ud83c\udf84", 132, 84, 40, 20);
    const maxW = Math.round(132 * LIFT_MAX_SCALE);
    const maxH = Math.round(84 * LIFT_MAX_SCALE);
    expect(html).toContain(`width:${maxW}px;height:${maxH}px`);
    expect(html).toContain("Two");
    expect(html).toContain("transform-origin:" + Math.round(40 * LIFT_MAX_SCALE) + "px " + Math.round(20 * LIFT_MAX_SCALE) + "px");
    expect(html).toContain("op41ge-lift");
    expect(html).toContain(SPRING_EASE);
  });

  it("renders a lift bitmap img at the lifted frame with the spring (no full doc)", () => {
    const html = buildBitmapImgHtml("data:image/png;base64,AAA", 132, 84, 0, true, 40, 20);
    expect(html).toContain("<img");
    expect(html).not.toContain("<!DOCTYPE");
    expect(html).toContain("width:" + Math.round(132 * LIFT_MAX_SCALE) + "px");
    expect(html).toContain("op41ge-lift");
    expect(html).toContain("transform-origin:" + Math.round(40 * LIFT_MAX_SCALE) + "px");
  });

  it("renders a non-lift bitmap img 1:1 at its source size (no animation)", () => {
    const html = buildBitmapImgHtml("data:image/png;base64,AAA", 132, 84, 6, false, 70, 40);
    expect(html).toContain("width:120px;height:72px");
    expect(html).toContain("margin:6px;");
    expect(html).not.toContain("op41ge-lift");
  });
});

// ─── DragGhostManager.setOpacity ────────────────────────────────────────

import { vi } from "vitest";
import { DragGhostManager } from "../../../src/main/services/drag-ghost-manager.js";

class FakeWindow {
  destroyed = false;
  executed: string[] = [];
  webContents = {
    on: () => {},
    executeJavaScript: (js: string) => {
      this.executed.push(js);
      return Promise.resolve("");
    },
  };
  constructor(public _opts: Record<string, unknown> = {}) {}
  setIgnoreMouseEvents(): void {}
  loadURL(): void {}
  getBounds(): { x: number; y: number; width: number; height: number } {
    return { x: 0, y: 0, width: 100, height: 40 };
  }
  setBounds(): void {}
  show(): void {}
  isDestroyed(): boolean {
    return this.destroyed;
  }
  close(): void {
    this.destroyed = true;
  }
  on(): void {}
}

function lastExecuted(ghost: DragGhostManager): FakeWindow | null {
  return (ghost as unknown as { _ghost: FakeWindow | null })._ghost;
}

describe("DragGhostManager.setOpacity", () => {
  it("fades the ghost body to the requested opacity with a CSS transition", () => {
    const mgr = new DragGhostManager(FakeWindow as never);
    mgr.show("A", 0, 0, undefined, 100, 30);
    const win = lastExecuted(mgr)!;
    mgr.setOpacity(0.33);
    expect(win.executed.at(-1)).toContain('transition="opacity 120ms ease"');
    expect(win.executed.at(-1)).toContain('opacity="0.33"');
  });

  it("restores to full opacity when set back to 1", () => {
    const mgr = new DragGhostManager(FakeWindow as never);
    mgr.show("A", 0, 0, undefined, 100, 30);
    const win = lastExecuted(mgr)!;
    mgr.setOpacity(0.33);
    mgr.setOpacity(1);
    expect(win.executed.at(-1)).toContain('opacity="1"');
  });

  it("clamps out-of-range opacities into [0, 1]", () => {
    const mgr = new DragGhostManager(FakeWindow as never);
    mgr.show("A", 0, 0, undefined, 100, 30);
    const win = lastExecuted(mgr)!;
    mgr.setOpacity(2);
    expect(win.executed.at(-1)).toContain('opacity="1"');
    mgr.setOpacity(-1);
    expect(win.executed.at(-1)).toContain('opacity="0"');
  });

  it("does not call into a destroyed ghost", () => {
    const mgr = new DragGhostManager(FakeWindow as never);
    mgr.show("A", 0, 0, undefined, 100, 30);
    const win = lastExecuted(mgr)!;
    win.destroyed = true;
    expect(() => mgr.setOpacity(0.33)).not.toThrow();
    expect(win.executed).toEqual([]);
  });
});
