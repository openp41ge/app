/**
 * Unit tests for OverdrawLine — a 1px fade-out accent line whose length is
 * derived from its index among siblings and frozen once drawn.
 */
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { OverdrawLine, OVERDRAW_LENGTHS, overdrawLengthForOrdinal } from "../../src/components/overdraw-line/overdraw-line";
import { attachTopCornerOverdraws, attachTopOverdraw, attachTopHorizontalOverdraws } from "../../src/components/overdraw-line/corner-accent";

describe("OverdrawLine", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("registers as <overdraw-line>", () => {
    expect(customElements.get("overdraw-line")).toBe(OverdrawLine);
  });

  test("defaults dir to right and reflects it", async () => {
    const el = new OverdrawLine();
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.dir).toBe("right");
    expect(el.getAttribute("dir")).toBe("right");

    el.dir = "up";
    await el.updateComplete;
    expect(el.getAttribute("dir")).toBe("up");
  });

  test("freezes the drawn length inline so it never changes afterwards", async () => {
    const el = new OverdrawLine();
    document.body.appendChild(el);
    await el.updateComplete;

    const frozen = el.style.getPropertyValue("--overdraw-length");
    // Drawn length is pinned to one of the cycle values.
    expect(frozen).toMatch(/^\d+px$/);
    expect(OVERDRAW_LENGTHS).toContain(parseInt(frozen, 10));

    // A subsequent update must not re-read or overwrite the frozen length.
    await el.updateComplete;
    expect(el.style.getPropertyValue("--overdraw-length")).toBe(frozen);
  });

  test("lengths vary document-wide rather than per sibling group", async () => {
    // Seven consecutively drawn lines map to all seven distinct lengths,
    // regardless of where the global ordinal currently sits — so a run of
    // lines anywhere in the app never repeats the same length.
    const els = Array.from({ length: 7 }, () => {
      const el = new OverdrawLine();
      document.body.appendChild(el);
      return el;
    });
    await Promise.all(els.map((el) => el.updateComplete));

    const lengths = els.map((el) =>
      parseInt(el.style.getPropertyValue("--overdraw-length"), 10),
    );
    expect(new Set(lengths).size).toBe(7);
    lengths.forEach((l) => expect(OVERDRAW_LENGTHS).toContain(l));
  });

  test("overdrawLengthForOrdinal is deterministic and consecutive values differ", () => {
    // Same ordinal always yields the same length (stable sequence).
    expect(overdrawLengthForOrdinal(0)).toBe(overdrawLengthForOrdinal(0));
    expect(overdrawLengthForOrdinal(23)).toBe(overdrawLengthForOrdinal(23));

    // Consecutive ordinals never repeat a length, and the cycle returns to
    // the start after the full set.
    for (let i = 0; i < OVERDRAW_LENGTHS.length; i++) {
      expect(overdrawLengthForOrdinal(i)).not.toBe(overdrawLengthForOrdinal(i + 1));
    }
    expect(overdrawLengthForOrdinal(OVERDRAW_LENGTHS.length)).toBe(
      overdrawLengthForOrdinal(0),
    );

    // All values stay in the intended narrow band.
    for (let i = 0; i < 100; i++) {
      const l = overdrawLengthForOrdinal(i);
      expect(OVERDRAW_LENGTHS).toContain(l);
      expect(l).toBeGreaterThanOrEqual(4);
      expect(l).toBeLessThanOrEqual(10);
    }
  });

  test("attachTopCornerOverdraws adds the four top-corner lines and is idempotent", () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);

    attachTopCornerOverdraws(btn);

    const lines = Array.from(btn.querySelectorAll("overdraw-line"));
    expect(lines).toHaveLength(4);
    expect(
      lines.map((l) => `${l.getAttribute("corner")}${l.getAttribute("dir")}`).sort(),
    ).toEqual(["tlleft", "tlup", "trright", "trup"]);
    // Only the top corners are drawn — a line pointing down from a bottom-bar
    // button would run off the window.
    expect(lines.every((l) => !l.getAttribute("dir")!.endsWith("down"))).toBe(true);
    // The host becomes the containing block for the absolutely positioned lines.
    expect(getComputedStyle(btn).position).toBe("relative");

    // Re-calling must not duplicate the accents.
    attachTopCornerOverdraws(btn);
    expect(btn.querySelectorAll("overdraw-line")).toHaveLength(4);
  });

  test("attachTopOverdraw adds a single up-line at the top of a divider and is idempotent", () => {
    const sep = document.createElement("span");
    sep.className = "bb-sep";
    document.body.appendChild(sep);

    attachTopOverdraw(sep);

    const lines = Array.from(sep.querySelectorAll("overdraw-line"));
    expect(lines).toHaveLength(1);
    expect(lines[0].getAttribute("dir")).toBe("up");
    // The line's solid end sits on the divider's top edge, extending upward.
    expect(lines[0].style.bottom).toBe("100%");
    expect(getComputedStyle(sep).position).toBe("relative");

    // Re-calling must not duplicate the accent.
    attachTopOverdraw(sep);
    expect(sep.querySelectorAll("overdraw-line")).toHaveLength(1);
  });

  test("attachTopHorizontalOverdraws portals the two horizontal top-corner lines to a top layer and is idempotent", async () => {
    const box = document.createElement("div");
    box.className = "composer";
    document.body.appendChild(box);

    attachTopHorizontalOverdraws(box);

    // The lines are NOT children of the box: they are portalled into a
    // fixed, top-layer element on the body so they escape any `overflow:
    // hidden` ancestor (panel / tab-content) and paint above neighbouring
    // grid tabs and sidebars.
    const layer = document.body.querySelector<HTMLElement>(".p41ge-overdraw-layer");
    expect(layer).toBeTruthy();
    const lines = Array.from(layer!.querySelectorAll("overdraw-line"));
    expect(lines).toHaveLength(2);
    expect(
      lines.map((l) => `${l.getAttribute("corner")}${l.getAttribute("dir")}`).sort(),
    ).toEqual(["tlleft", "trright"]);
    expect(lines.every((l) => l.getAttribute("dir") !== "up")).toBe(true);
    expect(layer!.style.position).toBe("fixed");
    // Below the settings-drawer host (z-index 1001) so its full-window dim mask
    // renders over the bleed lines (dimming them) instead of the lines painting
    // bright above the mask; still above the page's own grid chrome.
    expect(layer!.style.zIndex).toBe("999");
    expect(box.querySelectorAll("overdraw-line")).toHaveLength(0);

    // Re-calling must not duplicate the accents.
    attachTopHorizontalOverdraws(box);
    expect(document.body.querySelectorAll(".p41ge-overdraw-layer")).toHaveLength(1);
    expect(layer!.querySelectorAll("overdraw-line")).toHaveLength(2);

    // Removing the host (e.g. a toggled find bar) drops its portal layer.
    box.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.querySelector(".p41ge-overdraw-layer")).toBeNull();
  });

  test("attachTopHorizontalOverdraws hides each line while an OPAQUE overlay covers its corner and restores it when uncovered", async () => {
    const box = document.createElement("div");
    box.className = "composer";
    document.body.appendChild(box);

    // jsdom does no hit-testing and reports zero-size rects, so stub both so
    // the per-corner occlusion rule can be exercised deterministically.
    const rect = { top: 10, left: 10, width: 200, height: 60, right: 210, bottom: 70 } as DOMRect;
    box.getBoundingClientRect = () => rect;
    // The real occluder: an OPAQUE drawer surface whose transparent child
    // (.sdw-body) is what `elementFromPoint` returns at a covered point, so
    // the opacity must be discovered by walking up to the parent. The overlay
    // covers by x-coordinate.
    const drawer = document.createElement("div");
    drawer.className = "drawer";
    drawer.style.backgroundColor = "rgb(51, 51, 51)";
    const drawerBody = document.createElement("div");
    drawerBody.className = "sdw-body";
    drawer.appendChild(drawerBody);
    document.body.appendChild(drawer);
    const hadEP = "elementFromPoint" in document;
    const real = document.elementFromPoint;
    // Left line samples x=rect.left+1=11, right line samples x=rect.right-1=209.
    // A PARTIAL-width drawer covers x<100 → only the left (spawn-side) corner.
    const hitAt = (x: number) => (x < 100 ? drawerBody : box);
    document.elementFromPoint = ((x: number) =>
      hitAt(x)) as unknown as typeof document.elementFromPoint;

    attachTopHorizontalOverdraws(box);
    const layer = document.body.querySelector<HTMLElement>(".p41ge-overdraw-layer")!;
    const [tl, tr] = Array.from(layer.querySelectorAll("overdraw-line"));

    // Changing the `elementFromPoint` stub doesn't itself trigger a re-place;
    // the body-subtree observer only fires on DOM mutation, so mutate once.
    const reflow = async () => {
      const d = document.createElement("i");
      document.body.appendChild(d);
      d.remove();
      await new Promise((r) => setTimeout(r, 0));
    };

    // Partial-width drawer: left line hidden (covered), right line shown
    // (the semi-transparent dim mask ignores nothing — it simply isn't an
    // opaque cover, and the drawer doesn't reach the right corner).
    expect(tl.style.display).toBe("none");
    expect(tr.style.display).not.toBe("none");

    // An opaque background counts as a cover even while the surface is
    // fading in (opacity < 1 during an entrance animation) — the rule is
    // about whether it hides the border, not about its transient opacity.
    drawer.style.opacity = "0.4";
    await reflow();
    expect(tl.style.display).toBe("none");
    expect(tr.style.display).not.toBe("none");
    drawer.style.opacity = "";

    // Full-width drawer covers both corners → both lines hidden.
    const fullHit = () => drawerBody;
    document.elementFromPoint = fullHit as unknown as typeof document.elementFromPoint;
    await reflow();
    expect(tl.style.display).toBe("none");
    expect(tr.style.display).toBe("none");

    // Drawer closed: host topmost at both corners → both restored.
    document.elementFromPoint = (() => box) as unknown as typeof document.elementFromPoint;
    await reflow();
    expect(tl.style.display).not.toBe("none");
    expect(tr.style.display).not.toBe("none");

    if (hadEP) document.elementFromPoint = real;
    else delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    box.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.querySelector(".p41ge-overdraw-layer")).toBeNull();
  });

  test("uses the elementsFromPoint stack so transparent chrome above an opaque cover still hides the line", async () => {
    const box = document.createElement("div");
    box.className = "composer";
    box.style.backgroundColor = "rgb(30, 30, 30)";
    document.body.appendChild(box);
    const rect = { top: 10, left: 10, width: 200, height: 60, right: 210, bottom: 70 } as DOMRect;
    box.getBoundingClientRect = () => rect;

    // The real layout at a covered corner: an opaque drawer with transparent
    // chrome layer(s) drawn ON TOP of it (a window-manager grid notch, the
    // drawer surface, its `.sdw-body`). A single `elementFromPoint` hit
    // returns only the topmost notch, so the cover must be found by scanning
    // the full stacking stack.
    const drawer = document.createElement("div");
    drawer.className = "sdw-drawer";
    drawer.style.backgroundColor = "rgb(22, 22, 22)";
    document.body.appendChild(drawer);
    const notch = document.createElement("div");
    notch.className = "wv-notch-v left-notch";
    notch.style.backgroundColor = "transparent";
    document.body.appendChild(notch);
    const surface = document.createElement("div");
    surface.className = "openp41ge-settings-surface";
    surface.style.backgroundColor = "transparent";
    document.body.appendChild(surface);
    const drawerBody = document.createElement("div");
    drawerBody.className = "sdw-body";
    drawerBody.style.backgroundColor = "transparent";
    document.body.appendChild(drawerBody);

    const hadEFP = "elementsFromPoint" in document;
    const realEFP = document.elementsFromPoint;
    // Left line samples x=11 (covered: transparent chrome over the opaque
    // drawer), right line samples x=209 (not covered: the opaque host is the
    // topmost opaque element there).
    const stackAt = (x: number) =>
      x < 100 ? [notch, surface, drawerBody, drawer, box] : [box];
    document.elementsFromPoint = ((x: number) =>
      stackAt(x)) as unknown as typeof document.elementsFromPoint;

    attachTopHorizontalOverdraws(box);
    const layer = document.body.querySelector<HTMLElement>(".p41ge-overdraw-layer")!;
    const [tl, tr] = Array.from(layer.querySelectorAll("overdraw-line"));

    expect(tl.style.display).toBe("none");
    expect(tr.style.display).not.toBe("none");

    if (hadEFP) document.elementsFromPoint = realEFP;
    else delete (document as { elementsFromPoint?: unknown }).elementsFromPoint;
    box.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.querySelector(".p41ge-overdraw-layer")).toBeNull();
  });
});
