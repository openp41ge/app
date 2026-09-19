/**
 * The workspace window manager should use the floating OverlayScrollbar and
 * auto-hide (fade out) it after the cursor leaves the content area — matching
 * the chat / file-editor scrollbars.
 *
 * The window manager attaches OverlayScrollbar to .wm-body (container:
 * .wm-drawer-layer) with autoHide:true. These tests pin that a vertical overlay
 * track exists and that it toggles .os-hidden on pointerenter/pointerleave of
 * the drawer layer.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Openp41geWindowManager } from "../../../src/renderer/components/openp41ge-window-manager";

const AUTO_HIDE_MS = 2500;

function stubWindow(): void {
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    drag: {
      start: vi.fn(),
      activate: vi.fn(),
      move: vi.fn(),
      end: vi.fn(),
      prepareBitmap: vi.fn(),
      onEndSession: vi.fn(() => () => {}),
    },
    windowManager: {
      openWindowSummaries: vi.fn().mockResolvedValue([]),
      onOpenWindowsChanged: vi.fn(() => () => {}),
      openWorkspaceWindow: vi.fn(),
      onActivateTab: vi.fn(() => () => {}),
    },
    workspace: {
      getWindowId: vi.fn(() => "win-ws1-0"),
      getLaunchTab: vi.fn(() => null),
    },
  };
}

async function mount(): Promise<Openp41geWindowManager> {
  const wm = new Openp41geWindowManager();
  document.body.appendChild(wm);
  await wm.updateComplete;
  // Let the async _load() settle + the updated() scrollbar attach run.
  await vi.advanceTimersByTimeAsync(40);
  return wm;
}

const pointer = (el: Element, type: string): void => el.dispatchEvent(new Event(type));

describe("window-manager scrollbar auto-hide", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubWindow();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  test("attaches a floating overlay vertical scrollbar to the workspace list", async () => {
    const wm = await mount();
    const body = wm.shadowRoot!.querySelector<HTMLElement>(".wm-body");
    const layer = wm.shadowRoot!.querySelector<HTMLElement>(".wm-drawer-layer");
    const track = wm.shadowRoot!.querySelector<HTMLElement>(".os-track--v");
    expect(body).toBeTruthy();
    expect(layer).toBeTruthy();
    expect(track).toBeTruthy();
  });

  test("fades the scrollbar out after the cursor leaves the content area", async () => {
    const wm = await mount();
    const layer = wm.shadowRoot!.querySelector<HTMLElement>(".wm-drawer-layer")!;
    const track = wm.shadowRoot!.querySelector<HTMLElement>(".os-track--v")!;
    expect(track.classList.contains("os-hidden")).toBe(false);

    // Shown while the cursor is inside.
    pointer(layer, "pointerenter");
    expect(track.classList.contains("os-hidden")).toBe(false);

    // Cursor leaves; bar stays visible during the grace delay.
    pointer(layer, "pointerleave");
    expect(track.classList.contains("os-hidden")).toBe(false);
    vi.advanceTimersByTime(AUTO_HIDE_MS + 100);
    // Faded out after the cursor leaves.
    expect(track.classList.contains("os-hidden")).toBe(true);
  });

  test("re-entering before the delay keeps the scrollbar visible", async () => {
    const wm = await mount();
    const layer = wm.shadowRoot!.querySelector<HTMLElement>(".wm-drawer-layer")!;
    const track = wm.shadowRoot!.querySelector<HTMLElement>(".os-track--v")!;

    pointer(layer, "pointerleave");
    vi.advanceTimersByTime(AUTO_HIDE_MS - 500);
    pointer(layer, "pointerenter");
    // Poked by re-entry before the fade timer fires → stays visible.
    vi.advanceTimersByTime(AUTO_HIDE_MS + 200);
    expect(track.classList.contains("os-hidden")).toBe(false);
  });
});
