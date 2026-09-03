/**
 * Unit tests for the drag-ghost content builder (`buildBitmapGhostHtml`).
 *
 * Verifies the workspace-skeleton "lift off" spring: the bitmap is rendered at
 * the largest frame (source × LIFT_MAX_SCALE) so it never clips, and springs up
 * from the source size to full, anchored at the grab point. Non-lift (
 * file/tab) swaps stay 1:1 with no animation.
 */
import { describe, it, expect } from "vitest";
import { buildBitmapGhostHtml, LIFT_MAX_SCALE } from "../../../src/main/services/drag-ghost-manager.js";

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
});
