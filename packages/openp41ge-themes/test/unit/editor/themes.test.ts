/**
 * Tests for theme CSS generation — verifying that generateGlobalEditorCSS()
 * produces the expected styles for all selection highlight elements.
 */

import { describe, it, expect } from "vitest";
import { generateGlobalEditorCSS } from "@openp41ge-file-editor/themes/index";

describe("generateGlobalEditorCSS", () => {
  /**
   * The selection-corner-piece rule was missing, causing internal corner
   * filler elements to be invisible. Verify it's now present with the
   * correct background property.
   */
  it("includes .selection-corner-piece rule with selection background", () => {
    const css = generateGlobalEditorCSS();

    expect(css).toContain(".selection-corner-piece");
    expect(css).toContain("background: var(--fe-selection-bg, rgba(87, 145, 217, 0.3))");
    expect(css).toContain("position: absolute");
    expect(css).toContain("pointer-events: none");
  });

  it("includes .selection-highlight rule with selection background", () => {
    const css = generateGlobalEditorCSS();

    expect(css).toContain(".selection-highlight");
    expect(css).toContain("background: var(--fe-selection-bg, rgba(87, 145, 217, 0.3))");
    expect(css).toContain("position: absolute");
    expect(css).toContain("pointer-events: none");
  });

  it("includes .selection-intern-mask rule", () => {
    const css = generateGlobalEditorCSS();

    expect(css).toContain(".selection-intern-mask");
    expect(css).toContain("position: absolute");
    expect(css).toContain("pointer-events: none");
  });

  it("includes cursor-blink rule with cursor color variable", () => {
    const css = generateGlobalEditorCSS();

    expect(css).toContain(".cursor-blink");
    expect(css).toContain("background: var(--fe-cursor-color, #d4d4d4)");
  });

  it("includes radius classes for all four corners", () => {
    const css = generateGlobalEditorCSS();

    expect(css).toContain(".top-left-radius");
    expect(css).toContain(".top-right-radius");
    expect(css).toContain(".bottom-left-radius");
    expect(css).toContain(".bottom-right-radius");
  });

  it("includes current-line-highlight rule", () => {
    const css = generateGlobalEditorCSS();

    expect(css).toContain(".current-line-highlight");
    expect(css).toContain("background: var(--fe-current-line, rgba(255,255,255,0.06))");
  });

  it("includes font style tokens", () => {
    const css = generateGlobalEditorCSS();

    expect(css).toContain(".token-italic");
    expect(css).toContain(".token-bold");
    expect(css).toContain(".token-underline");
  });

  it("includes selection-highlight-secondary for reduced opacity", () => {
    const css = generateGlobalEditorCSS();

    expect(css).toContain(".selection-highlight-secondary");
    expect(css).toContain("opacity: 0.7");
  });
});
