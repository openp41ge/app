// @ts-nocheck
/**
 * Tests for the <fe-status-bar> top-corner overdraw accents on its action
 * buttons.
 *
 * Bottom-bar buttons sit at the bottom edge of the window, so each one carries
 * the four top-corner <overdraw-line> accents (top-left horizontal + vertical,
 * top-right horizontal + vertical) — the same convention as the Explorer
 * sidebar's bottom bar. This pins:
 *   - every .p41ge-icon-btn renders with 4 corner accents after updated()
 *   - a button (format) added at runtime gets its accents too (idempotent
 *     re-sync in updated())
 *   - each accent is lifted above the editor's z-index:6 sticky gutter (the
 *     line-number / fold column) so the vertical separator overdraws stay
 *     visible where they rise into the gutter
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import "../../../src/components/file-editor/openp41ge-bottom-bar";

async function mount(): Promise<HTMLElement> {
  const el = document.createElement("fe-status-bar") as HTMLElement;
  document.body.appendChild(el);
  await (el as any).updateComplete;
  return el;
}

describe("fe-status-bar top-corner overdraws", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  test("every bottom-bar button carries the four top-corner overdraw lines", async () => {
    const bar = await mount();
    // Show the format button (otherwise only find + wrap render).
    (bar as any).setFormatter(() => {});
    await (bar as any).updateComplete;

    const btns = [...bar.querySelectorAll<HTMLElement>(".p41ge-icon-btn")];
    expect(btns.length).toBeGreaterThan(0);
    for (const btn of btns) {
      const caps = [...btn.querySelectorAll("overdraw-line")];
      expect(caps.length).toBe(4);
      const corners = caps.map((l) => `${l.getAttribute("corner")}-${l.getAttribute("dir")}`);
      expect(corners).toContain("tl-left");
      expect(corners).toContain("tl-up");
      expect(corners).toContain("tr-right");
      expect(corners).toContain("tr-up");
    }
  });

  test("each accent is lifted above the editor's z-index:6 sticky gutter", async () => {
    const bar = await mount();
    for (const btn of bar.querySelectorAll<HTMLElement>(".p41ge-icon-btn")) {
      for (const line of btn.querySelectorAll<HTMLElement>("overdraw-line")) {
        expect(line.style.zIndex).toBe("20");
      }
    }
  });

  test("a button added at runtime gets its accents on the next update", async () => {
    const bar = await mount();
    (bar as any).addButton({
      id: "zoom",
      icon: "<svg></svg>",
      onClick: () => {},
    });
    await (bar as any).updateComplete;

    const custom = bar.querySelector<HTMLElement>(".sbb-custom-btn");
    expect(custom).toBeTruthy();
    expect(custom!.querySelectorAll("overdraw-line").length).toBe(4);
  });
});
