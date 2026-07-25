/**
 * Tests for FeStatusBar dirty/clean visual state — file size colour,
 * "● Modified" indicator text, and DOM updates on setDirty.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@openp41ge-file-editor/ui/openp41ge-bottom-bar.ts";
import type { FeStatusBar } from "@openp41ge-file-editor/ui/openp41ge-bottom-bar";

async function waitForRender(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
}

function createStatusBar(): FeStatusBar {
  const el = document.createElement("fe-status-bar") as FeStatusBar;
  document.body.appendChild(el);
  return el;
}

describe("FeStatusBar dirty state", () => {
  let bar: FeStatusBar;

  beforeEach(() => {
    bar = createStatusBar();
  });

  afterEach(() => {
    bar.remove();
    document.body.innerHTML = "";
  });

  function getSizeColor(): string {
    const size = bar.querySelector(".sbb-size");
    if (!size) return "";
    return getComputedStyle(size).color;
  }

  function getSizeText(): string {
    const size = bar.querySelector(".sbb-size");
    return size?.textContent ?? "";
  }

  it("shows size in grey and no Modified text when clean", async () => {
    bar.setSize("1.2 kB");
    await waitForRender();

    const text = getSizeText();
    expect(text).toBe("1.2 kB");
    expect(text).not.toContain("Modified");

    const color = getSizeColor();
    expect(color).toBe("rgb(119, 119, 119)"); // #777
  });

  it("shows amber Modified text when dirty", async () => {
    bar.setSize("1.2 kB");
    bar.setDirty(true);
    await waitForRender();

    const text = getSizeText();
    expect(text).toContain("1.2 kB");
    expect(text).toContain("Modified");

    const color = getSizeColor();
    expect(color).toBe("rgb(226, 183, 20)"); // #e2b714
  });

  it("reverts to grey and removes Modified text on setDirty(false)", async () => {
    bar.setSize("1.2 kB");
    bar.setDirty(true);
    await waitForRender();
    expect(getSizeText()).toContain("Modified");

    bar.setDirty(false);
    await waitForRender();

    const text = getSizeText();
    expect(text).not.toContain("Modified");
    expect(text).toBe("1.2 kB");

    const color = getSizeColor();
    expect(color).toBe("rgb(119, 119, 119)"); // #777
  });

  it("shows dirty indicator even before setSize is called", async () => {
    bar.setDirty(true);
    await waitForRender();

    const text = getSizeText();
    expect(text).toContain("Modified");
    // Size text should be empty (never set) but Modified still shows
    // The colour should still be amber
    const color = getSizeColor();
    expect(color).toBe("rgb(226, 183, 20)");
  });

  it("toggles dirty state back and forth", async () => {
    bar.setSize("500 B");
    await waitForRender();

    // Dirty on
    bar.setDirty(true);
    await waitForRender();
    expect(getSizeText()).toContain("Modified");
    expect(getSizeColor()).toBe("rgb(226, 183, 20)");

    // Dirty off
    bar.setDirty(false);
    await waitForRender();
    expect(getSizeText()).not.toContain("Modified");
    expect(getSizeColor()).toBe("rgb(119, 119, 119)");

    // Dirty on again
    bar.setDirty(true);
    await waitForRender();
    expect(getSizeText()).toContain("Modified");
    expect(getSizeColor()).toBe("rgb(226, 183, 20)");
  });

  it("updates size text while dirty preserves Modified indicator", async () => {
    bar.setSize("1 kB");
    bar.setDirty(true);
    await waitForRender();
    expect(getSizeText()).toContain("1 kB");

    bar.setSize("2 kB");
    await waitForRender();

    const text = getSizeText();
    expect(text).toContain("2 kB");
    expect(text).toContain("Modified");
    expect(getSizeColor()).toBe("rgb(226, 183, 20)");
  });
});
