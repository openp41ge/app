/**
 * Unit tests for the drop-indicator family: <drop-line>, <drag-line> and
 * <drop-box>. These are style-driven hosts, so the tests pin the attribute
 * defaults / reflections and the styles the components install into their
 * shadow roots (jsdom does not compute shadow styles for the host element, so
 * we assert on the `<style>` text rather than `getComputedStyle`).
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { DropLine } from "../../src/components/drop-indicator/drop-line";
import { DragLine } from "../../src/components/drop-indicator/drag-line";
import { DragLineOverdraw } from "../../src/components/drop-indicator/drag-line-overdraw";
import { DropBox, type DropFadeDirection } from "../../src/components/drop-indicator/drop-box";
import { DropBoxOverdraw } from "../../src/components/drop-indicator/drop-box-overdraw";
import { DROP_INDICATOR_COLOR, DROP_LINE_GLOW } from "../../src/components/drop-indicator/color";

function styleOf(el: HTMLElement): string {
  const style = el.shadowRoot?.querySelector("style");
  if (!style) return "";
  return style.textContent ?? "";
}

describe("drop-line", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("registers as <drop-line>", () => {
    expect(customElements.get("drop-line")).toBe(DropLine);
  });

  test("defaults to the solid blue drop color and a vertical orientation", async () => {
    const el = new DropLine();
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.orientation).toBe("vertical");
    expect(el.getAttribute("orientation")).toBe("vertical");
    expect(el.getAttribute("overdraw")).toBeNull();
    const css = styleOf(el);
    expect(css).toContain("--drop-color: rgb(74, 158, 255)");
    expect(css).toContain("background: var(--drop-color)");
  });

  test("reflecting horizontal + overdraw flips geometry and adds the fade mask", async () => {
    const el = new DropLine();
    el.orientation = "horizontal";
    el.overdraw = true;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.getAttribute("orientation")).toBe("horizontal");
    expect(el.getAttribute("overdraw")).toBe("");
    const css = styleOf(el);
    expect(css).toContain("[overdraw][orientation=\"horizontal\"]");
    expect(css).toContain("linear-gradient(to right");
  });

  test("exposes the shared color/glow constants", () => {
    expect(DROP_INDICATOR_COLOR).toBe("rgb(74, 158, 255)");
    expect(DROP_LINE_GLOW).toContain("74, 158, 255");
  });
});

describe("drag-line", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("registers as <drag-line>", () => {
    expect(customElements.get("drag-line")).toBe(DragLine);
  });

  test("is translucent, hidden by default, and shown by the show attribute", async () => {
    const el = new DragLine();
    document.body.appendChild(el);
    await el.updateComplete;
    const css = styleOf(el);
    expect(css).toContain("--drop-color: rgba(74, 158, 255, 0.7)");
    expect(css).toContain("opacity: 0");
    expect(css).toContain(":host([show])");
    expect(el.hasAttribute("show")).toBe(false);

    el.show = true;
    await el.updateComplete;
    expect(el.hasAttribute("show")).toBe(true);
  });
});

describe("drop-box", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("registers as <drop-box>", () => {
    expect(customElements.get("drop-box")).toBe(DropBox);
  });

  test("has a blue border (inset ring), a transparent default, and the wash on by default", async () => {
    const el = new DropBox();
    document.body.appendChild(el);
    await el.updateComplete;
    const css = styleOf(el);
    expect(css).toContain("--drop-color: rgb(74, 158, 255)");
    expect(css).toContain("--drop-wash: rgba(74, 158, 255, 0.2)");
    expect(css).toContain(":host([wash])");
    // The border is an inset box-shadow ring (the app's global `border-width:
    // 0` reset overrides a shadow-root :host border, so a real border would
    // compute to 0). Pin that here so it never regresses to `border:`.
    expect(css).toContain("inset 0 0 0 var(--drop-border) var(--drop-color)");
    expect(css).not.toContain("border: var(--drop-border)");
    // The drop indicator has sharp (square) corners — no border radius.
    expect(css).toContain("--drop-radius: 0px");
    expect(el.hasAttribute("wash")).toBe(true);
  });

  test("fade direction reflects and drives a directional mask", async () => {
    const el = new DropBox();
    el.fade = "right";
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.getAttribute("fade")).toBe("right");
    const css = styleOf(el);
    expect(css).toContain("[fade=\"right\"]");
    expect(css).toContain("linear-gradient(to right");

    el.wash = false;
    await el.updateComplete;
    expect(el.hasAttribute("wash")).toBe(false);
  });

  test("DropFadeDirection type is a literal union", () => {
    const d: DropFadeDirection = "left";
    expect(["none", "left", "right"]).toContain(d);
  });
});

describe("drop-box-overdraw", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  function mount(fade: "left" | "right"): { box: HTMLElement; el: DropBoxOverdraw } {
    const host = document.createElement("div");
    host.style.position = "relative";
    const box = document.createElement("drop-box");
    box.setAttribute("fade", fade);
    const el = new DropBoxOverdraw();
    host.appendChild(box);
    host.appendChild(el);
    document.body.appendChild(host);
    return { box, el };
  }

  test("registers as <drop-box-overdraw>", () => {
    expect(customElements.get("drop-box-overdraw")).toBe(DropBoxOverdraw);
  });

  test("renders top-horizontal + top-vertical + bottom-horizontal accents, fading toward the box's solid far edge", async () => {
    const { el } = mount("left");
    await el.updateComplete;
    const caps = el.shadowRoot?.querySelectorAll<HTMLElement>(".od-cap");
    expect(caps?.length).toBe(3);
    // fade=left means the box's solid far edge is the RIGHT; accents bleed right.
    expect(caps?.[0].className).toContain("od-top-h");
    expect(caps?.[0].getAttribute("dir")).toBe("right");
    expect(caps?.[1].className).toContain("od-top-v");
    expect(caps?.[1].getAttribute("dir")).toBe("up");
    expect(caps?.[2].className).toContain("od-bot-h");
    expect(caps?.[2].getAttribute("dir")).toBe("right");
    // The accents inherit the drop-box blue, match its border thickness, and
    // sit below the real box.
    expect(styleOf(el)).toContain(".od-layer overdraw-line");
    expect(styleOf(el)).toContain("--overdraw-color: var(--drop-color)");
    expect(styleOf(el)).toContain("--overdraw-thickness: var(--drop-border)");
    expect(styleOf(el)).toContain("--drop-border: 3px");
  });

  test("places accents along the box's far edge and top/bottom borders", async () => {
    const host = document.createElement("div");
    host.style.position = "relative";
    const box = document.createElement("drop-box");
    box.setAttribute("fade", "left");
    // Mock the box rect BEFORE mount so the component's initial placement uses it.
    const rect = { left: 791, top: 35, right: 891, bottom: 860, width: 100, height: 825 };
    const spy = vi.spyOn(box, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
    const el = new DropBoxOverdraw();
    host.appendChild(box);
    host.appendChild(el);
    document.body.appendChild(host);
    await el.updateComplete;

    const caps = el.shadowRoot?.querySelectorAll<HTMLElement>(".od-cap");
    // Accents are as thick as the box's border (--drop-border = 3px, matching
    // the 3px drag line).
    expect(caps![0].style.getPropertyValue("--overdraw-thickness")).toBe("3px");
    expect(caps![1].style.getPropertyValue("--overdraw-thickness")).toBe("3px");
    expect(caps![2].style.getPropertyValue("--overdraw-thickness")).toBe("3px");
    // The wide (3px) strokes get a longer fade length and a smaller solid hold
    // so they melt away gradually instead of ending in a hard line.
    expect(caps![0].style.getPropertyValue("--overdraw-length")).toBe("16px");
    expect(caps![0].style.getPropertyValue("--overdraw-hold")).toBe("30%");
    for (const cap of caps!) expect(cap.style.getPropertyValue("--overdraw-hold")).toBe("30%");
    // Horizontal accents start at the box's far (right) edge, matching the
    // top border at r.top and the bottom border at r.bottom - thickness.
    expect(caps![0].style.left).toBe("891px");
    expect(caps![0].style.top).toBe("35px");
    expect(caps![2].style.left).toBe("891px");
    expect(caps![2].style.top).toBe("857px"); // 860 - 3px border
    // Vertical accent rises from the top border, flush with the far edge's
    // border span (right edge minus border width).
    expect(caps![1].style.left).toBe("888px"); // 891 - 3px
    expect(caps![1].style.bottom).toBe(`${window.innerHeight - 35}px`);
    // All accents become visible once placed.
    expect(caps![0].style.opacity).toBe("1");
    expect(caps![1].style.opacity).toBe("1");
    expect(caps![2].style.opacity).toBe("1");
    spy.mockRestore();
  });

  test("does not render accents when the sibling box has no fade", async () => {
    const host = document.createElement("div");
    const box = document.createElement("drop-box");
    const el = new DropBoxOverdraw();
    host.appendChild(box);
    host.appendChild(el);
    document.body.appendChild(host);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelectorAll(".od-layer").length).toBe(0);
  });
});

describe("drag-line-overdraw", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("registers as <drag-line-overdraw>", () => {
    expect(customElements.get("drag-line-overdraw")).toBe(DragLineOverdraw);
  });

  test("renders a fixed full-height mirror line, drag-line width", async () => {
    const el = new DragLineOverdraw();
    document.body.appendChild(el);
    await el.updateComplete;
    const css = styleOf(el);
    expect(css).toContain("position: fixed");
    expect(css).toContain("--drop-width: 3px");
    expect(css).toContain("linear-gradient");
    expect(css).toContain("to bottom");
    // Sits below the sibling <drag-line> so it never double-renders; it only
    // peeks out where the drag line is clipped and in the fade above it.
    expect(css).toContain("z-index: -1");
    expect(el.shadowRoot?.querySelector(".od")).toBeTruthy();
  });

  test("shows only while the sibling <drag-line> has `show`", async () => {
    const notch = document.createElement("div");
    const dragLine = document.createElement("drag-line");
    const el = new DragLineOverdraw();
    notch.appendChild(dragLine);
    notch.appendChild(el);
    document.body.appendChild(notch);
    await el.updateComplete;

    const od = el.shadowRoot?.querySelector<HTMLElement>(".od");
    expect(od).toBeTruthy();
    expect(od!.style.opacity).toBe("0");

    dragLine.setAttribute("show", "");
    await new Promise((r) => setTimeout(r, 0));
    expect(od!.style.opacity).toBe("1");

    dragLine.removeAttribute("show");
    await new Promise((r) => setTimeout(r, 0));
    expect(od!.style.opacity).toBe("0");
  });

  test("re-targets the observer when the sibling <drag-line> is replaced", async () => {
    const notch = document.createElement("div");
    const el = new DragLineOverdraw();
    document.body.appendChild(notch);
    notch.innerHTML = "<drag-line></drag-line>";
    notch.appendChild(el);
    await el.updateComplete;

    const od = el.shadowRoot?.querySelector<HTMLElement>(".od");
    // Replace the drag-line (simulating a panel re-render that recreates it).
    notch.querySelector("drag-line")!.remove();
    const replacement = document.createElement("drag-line");
    notch.insertBefore(replacement, el);
    await el.updateComplete;

    replacement.setAttribute("show", "");
    await new Promise((r) => setTimeout(r, 0));
    expect(od!.style.opacity).toBe("1");

    replacement.removeAttribute("show");
    await new Promise((r) => setTimeout(r, 0));
    expect(od!.style.opacity).toBe("0");
  });

  test("mirrors the full drag-line height so it peeks out where clipped", async () => {
    const notch = document.createElement("div");
    const dragLine = document.createElement("drag-line");
    const el = new DragLineOverdraw();
    notch.appendChild(dragLine);
    notch.appendChild(el);
    document.body.appendChild(notch);
    await el.updateComplete;

    // The overdraw mirrors the drag line's full rect (not just a stub): its
    // height is drag-line height + overdraw length, so where the drag line is
    // clipped by an ancestor's overflow the mirror still paints the cut edge.
    const rect = { left: 100, top: 200, width: 3, height: 500, right: 103, bottom: 700 };
    const spy = vi.spyOn(dragLine, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
    dragLine.setAttribute("show", "");
    await new Promise((r) => setTimeout(r, 0));

    const od = el.shadowRoot?.querySelector<HTMLElement>(".od");
    expect(od!.style.width).toBe("3px");
    expect(od!.style.left).toBe("100px");
    expect(od!.style.top).toBe("186px"); // 200 - 14 (default overdraw length)
    expect(od!.style.height).toBe("514px"); // 500 + 14
    spy.mockRestore();
  });

  test("hides and tears down cleanly when disconnected", async () => {
    const notch = document.createElement("div");
    const dragLine = document.createElement("drag-line");
    const el = new DragLineOverdraw();
    notch.appendChild(dragLine);
    notch.appendChild(el);
    document.body.appendChild(notch);
    await el.updateComplete;
    dragLine.setAttribute("show", "");
    await new Promise((r) => setTimeout(r, 0));
    expect(el.shadowRoot?.querySelector(".od")?.textContent).toBe("");
    notch.remove();
    expect(el.isConnected).toBe(false);
  });
});
