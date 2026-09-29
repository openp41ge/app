/**
 * The sidebar tab bar's ＋ (add) button carries its own separators (left border,
 * plus a bottom border while the sidebar hosts no tabs) and portalled corner
 * overdraws. When the sidebar hosts NO tabs, those separators + overdraws are
 * shown only while the button is hovered — otherwise the empty bar would look
 * like a stray bordered box. When the sidebar hosts tabs, the vertical
 * strip-separator (left border) + its overdraws are always present.
 */

import { describe, it, expect, beforeEach } from "vitest";

import "../../../src/renderer/components/openp41ge-sidebar";

type SidebarTab = { id: string; title: string; appType: string; pinned: boolean };

async function makeSidebar(tabs: SidebarTab[]): Promise<HTMLElement> {
  const el = document.createElement("openp41ge-sidebar") as HTMLElement & {
    side: "left" | "right";
    windowId: string;
    isOpen: boolean;
    systemTabs: SidebarTab[];
    updateComplete: Promise<unknown>;
  };
  el.side = "left";
  el.windowId = "w";
  el.isOpen = true;
  el.systemTabs = tabs;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

const addBtn = (el: HTMLElement) => el.querySelector<HTMLElement>(".sidebar-tab-add")!;
const strokes = () => [...document.body.querySelectorAll("overdraw-line")];

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("openp41ge-sidebar ＋ button hover-only separators", () => {
  it("shows no border and no overdraws on an EMPTY sidebar until hovered", async () => {
    const el = await makeSidebar([]);

    const btn = addBtn(el);
    expect(btn.classList.contains("sidebar-tab-add-empty")).toBe(true);
    // 1px taller (content-box, height 35 + 1px border-bottom) so the hovered
    // bottom border stroke lands on the grid tab-bar's bottom separator line.
    expect(btn.style.height).toBe("35px");
    // No inline border while empty (the hover CSS class owns it).
    expect(btn.style.borderLeft).toBe("");
    expect(btn.style.borderBottom).toBe("");
    // No overdraw strokes until hover.
    expect(strokes()).toHaveLength(0);
  });

  it("attaches the left + bottom overdraws on mouseenter and removes them on mouseleave", async () => {
    const el = await makeSidebar([]);
    const btn = addBtn(el);

    btn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    const on = strokes();
    // left edge (up+down) + bottom edge (left+right) → 4 strokes.
    expect(on.map((l) => `${l.getAttribute("corner")}${l.getAttribute("dir")}`).sort()).toEqual([
      "bl-bottomleft",
      "bl-leftdown",
      "br-bottomright",
      "tl-leftup",
    ]);

    btn.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(strokes()).toHaveLength(0);
  });

  it("keeps the left separator + overdraw always on a sidebar that hosts tabs", async () => {
    const el = await makeSidebar([
      { id: "sys-e", title: "Explorer", appType: "explorer", pinned: true },
    ]);
    const btn = addBtn(el);
    await el.updateComplete;

    expect(btn.classList.contains("sidebar-tab-add-empty")).toBe(false);
    // Standard height (content-box 34px) when the bar hosts tabs.
    expect(btn.style.height).toBe("34px");
    // The vertical strip-separator is always present (inline).
    expect(btn.style.borderLeft).toContain("var(--border-divider");
    // Left-edge strokes (only the ＋ produces corner tl-left/bl-left) persist
    // without any hover.
    const leftStrokes = strokes().filter(
      (l) => l.getAttribute("corner") === "tl-left" || l.getAttribute("corner") === "bl-left",
    );
    expect(leftStrokes.map((l) => l.getAttribute("dir")).sort()).toEqual(["down", "up"]);
  });
});
