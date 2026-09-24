/**
 * Tests for <openp41ge-settings-drawer-host> click-away behavior.
 *
 * The "negative" drawer host overlays the grid area. Pressing on the grid
 * OUTSIDE an open drawer (a sibling of the host, so `host.contains(target)` is
 * false) should dismiss the whole drawer stack, while pressing on the drawer
 * itself must leave it open.
 */
// @ts-nocheck
import { describe, it, expect, afterEach } from "vitest";
import "../../../src/renderer/components/openp41ge-settings-drawer-host";

/** A minimal mountable settings surface (just needs `title` + settable props). */
function makeSurface() {
  const el = document.createElement("div");
  el.title = "Test surface";
  el.appType = "agent";
  return el;
}

async function mountHost() {
  const host = document.createElement("openp41ge-settings-drawer-host");
  // jsdom reports a zero-size rect; give the host a real grid-area box so the
  // click-away coordinate check works.
  Object.defineProperty(host, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON() {},
    }),
  });
  document.body.appendChild(host);
  await host.updateComplete;
  return host;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("openp41ge-settings-drawer-host click-away", () => {
  it("closes the drawer when pressing outside it, via the document listener", async () => {
    const host = await mountHost();
    host.openSurface(makeSurface(), "right");
    await host.updateComplete;
    expect(host.isOpen).toBe(true);

    // A press on the dim mask (a host child that is not a drawer) dismisses it.
    const mask = host.querySelector(".sdw-mask");
    expect(mask).not.toBeNull();
    mask.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: 500,
        clientY: 300,
      }),
    );

    expect(host.isOpen).toBe(false);
  });

  it("does not close when pressing on the drawer itself", async () => {
    const host = await mountHost();
    host.openSurface(makeSurface(), "right");
    await host.updateComplete;
    expect(host.isOpen).toBe(true);

    // Press on a target that is a descendant of the host (i.e. a drawer).
    const drawer = host.querySelector(".sdw-drawer") ?? host;
    host._onDocumentPointerDown({ target: drawer, clientX: 500, clientY: 300 });

    expect(host.isOpen).toBe(true);
  });

  it("ignores presses outside the grid area (sidebars/titlebar)", async () => {
    const host = await mountHost();
    host.openSurface(makeSurface(), "left");
    expect(host.isOpen).toBe(true);

    // Press outside the grid rect (e.g. on a sidebar gear) must not close.
    host._onDocumentPointerDown({ target: document.body, clientX: 900, clientY: 100 });

    expect(host.isOpen).toBe(true);
  });
  it("renders a dim mask while a drawer is open and removes it when closed", async () => {
    const host = await mountHost();
    expect(host.querySelector(".sdw-mask")).toBeNull();

    host.openSurface(makeSurface(), "left");
    await host.updateComplete;
    expect(host.querySelector(".sdw-mask")).not.toBeNull();

    host.closeAll();
    await host.updateComplete;
    expect(host.querySelector(".sdw-mask")).toBeNull();
  });

  it("dispatches drawer-open-changed with the open side, then null on close", async () => {
    const host = await mountHost();
    const sides: Array<string | null> = [];
    host.addEventListener("drawer-open-changed", (e) => {
      sides.push((e as CustomEvent<{ side: string | null }>).detail?.side ?? null);
    });

    host.openSurface(makeSurface(), "left");
    await host.updateComplete;
    expect(sides).toEqual(["left"]);

    host.closeAll();
    await host.updateComplete;
    expect(sides).toEqual(["left", null]);
  });
});

describe("openp41ge-settings-drawer-host open width", () => {
  it("opens at the widest allowed width (max drawer width)", async () => {
    const host = await mountHost();
    Object.defineProperty(host, "clientWidth", { configurable: true, value: 800 });
    host.openSurface(makeSurface(), "right");
    await host.updateComplete;
    expect(host.drawerWidthFor("right")).toBe(host.maxDrawerWidth);
  });

  it("clamps to the grid width when the grid is narrower than the max", async () => {
    const host = await mountHost();
    Object.defineProperty(host, "clientWidth", { configurable: true, value: 500 });
    host.openSurface(makeSurface(), "right");
    await host.updateComplete;
    expect(host.drawerWidthFor("right")).toBe(500);
  });

  it("never opens below the (unchanged) min width", async () => {
    const host = await mountHost();
    Object.defineProperty(host, "clientWidth", { configurable: true, value: 100 });
    host.openSurface(makeSurface(), "right");
    await host.updateComplete;
    expect(host.drawerWidthFor("right")).toBe(host.defaultDrawerWidth);
  });
});
