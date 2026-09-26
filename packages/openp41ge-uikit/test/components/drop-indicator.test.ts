/**
 * Unit tests for the drop-indicator family: <drop-line>, <drag-line> and
 * <drop-box>. These are style-driven hosts, so the tests pin the attribute
 * defaults / reflections and the styles the components install into their
 * shadow roots (jsdom does not compute shadow styles for the host element, so
 * we assert on the `<style>` text rather than `getComputedStyle`).
 */
import { describe, test, expect, beforeEach } from "vitest";
import { DropLine } from "../../src/components/drop-indicator/drop-line";
import { DragLine } from "../../src/components/drop-indicator/drag-line";
import { DragLineOverdraw } from "../../src/components/drop-indicator/drag-line-overdraw";
import { DropBox, type DropFadeDirection } from "../../src/components/drop-indicator/drop-box";
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

describe("drag-line-overdraw", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("registers as <drag-line-overdraw>", () => {
    expect(customElements.get("drag-line-overdraw")).toBe(DragLineOverdraw);
  });

  test("renders a fixed upward-fading line, drag-line width", async () => {
    const el = new DragLineOverdraw();
    document.body.appendChild(el);
    await el.updateComplete;
    const css = styleOf(el);
    expect(css).toContain("position: fixed");
    expect(css).toContain("--drop-width: 3px");
    expect(css).toContain("linear-gradient(to top");
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
