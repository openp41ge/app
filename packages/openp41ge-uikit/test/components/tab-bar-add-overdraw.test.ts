import { describe, it, expect, beforeEach } from "vitest";
import "../../src/components/tabs/tab-bar";

/**
 * Regression: the trailing "＋" add button (<tab-bar showAdd>) must carry its
 * own bottom separator line (continuing the bar's bottom divider) and have its
 * left separator + bottom border over-drawn past its corners, exactly like the
 * tab buttons' separators. Before the fix the button's solid background covered
 * the bar's bottom border and nothing bled past the corners.
 */
describe("<tab-bar> add-button separators", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function makeBar(showAdd: boolean): any {
    const bar = document.createElement("tab-bar") as any;
    bar.tabIds = ["a"];
    bar.tabs = { a: { title: "A" } };
    bar.activeTabId = "a";
    bar.showAdd = showAdd;
    document.body.appendChild(bar);
    return bar;
  }

  function countOverdrawLines(): number {
    let n = 0;
    for (const layer of document.querySelectorAll<HTMLElement>("div[style*='position: fixed']")) {
      n += layer.querySelectorAll("overdraw-line").length;
    }
    return n;
  }

  it("renders a ＋ button whose stylesheet rule draws its own bottom separator line", async () => {
    const bar = makeBar(true);
    await bar.updateComplete;
    const add = bar.querySelector<HTMLElement>(".tab-bar-add");
    expect(add).toBeTruthy();
    // jsdom's getComputedStyle can't apply the lit-injected light-DOM stylesheet,
    // so assert the generated rule itself carries both separator borders. This is
    // the regression: the button's solid background used to cover the bar's
    // bottom border because it had no own `border-bottom`.
    const cssText = Array.from(bar.querySelectorAll<HTMLStyleElement>("style"))
      .map((s) => s.textContent ?? "")
      .join("\n");
    const rule = cssText.match(/\.tab-bar-add\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("border-bottom: 1px solid var(--border-divider, #2d2d2d)");
    expect(rule).toContain("border-left: 1px solid #333");
  });

  it("overdraws the ＋ button's left separator and bottom border (4 extra strokes)", async () => {
    const bar = makeBar(false);
    await bar.updateComplete;
    // one tab (right+bottom) → 4 strokes
    expect(countOverdrawLines()).toBe(4);
    bar.showAdd = true;
    await bar.updateComplete;
    // adding the ＋ button contributes its own left+bottom edge set → +4
    expect(countOverdrawLines()).toBe(8);
  });

  it("keeps the ＋ button, its bottom border and overdraw after a re-render", async () => {
    const bar = makeBar(true);
    await bar.updateComplete;
    expect(bar.querySelector(".tab-bar-add")).toBeTruthy();
    const strokes = countOverdrawLines();
    // toggle a sibling property to force a re-render and re-attach
    bar.activeTabId = "";
    await bar.updateComplete;
    expect(bar.querySelector(".tab-bar-add")).toBeTruthy();
    expect(countOverdrawLines()).toBe(strokes);
  });

  it("locks the ✕ close glyph to the UI font so it never shrinks under a monospace root", async () => {
    const bar = makeBar(false);
    await bar.updateComplete;
    const cssText = Array.from(bar.querySelectorAll<HTMLStyleElement>("style"))
      .map((s) => s.textContent ?? "")
      .join("\n");
    // Regression: the Logs window sets monospace on its root, so an inherited
    // font-family shrank the ✕ glyph. The close button must pin `--font-ui`.
    const rule = cssText.match(/\.tab-close\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("font-family: var(--font-ui");
    // The ✕ glyph must never inherit the tab's italic either.
    expect(rule).toContain("font-style: normal");
  });
});
