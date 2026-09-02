/**
 * Unit tests for the Window Manager skeleton drag state machine.
 *
 * Covers the workspace skeleton gesture:
 *  - long-press (hold > HOLD_MS) shows the drag element without pointer movement
 *  - a quick drag that crosses the threshold cancels the pending long-press and
 *    starts the drag from the move handler
 *  - a quick click (down + up before the hold) never starts a drag
 *
 * The drag IPC (`window.openp41ge.drag.*`) is stubbed so we can assert when a
 * native drag session is started/activated/ended without a real Electron main
 * process.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Openp41geWindowManager } from "../../../src/renderer/components/openp41ge-window-manager";

const HOLD_MS = 350;

type Wm = Openp41geWindowManager & Record<string, unknown>;

function stubWindow(): { dragStart: ReturnType<typeof vi.fn>; dragActivate: ReturnType<typeof vi.fn>; dragMove: ReturnType<typeof vi.fn>; dragEnd: ReturnType<typeof vi.fn> } {
  const dragStart = vi.fn();
  const dragActivate = vi.fn();
  const dragMove = vi.fn();
  const dragEnd = vi.fn();
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    drag: {
      start: dragStart,
      activate: dragActivate,
      move: dragMove,
      end: dragEnd,
      onEndSession: vi.fn(() => () => {}),
    },
    windowManager: { openWindowSummaries: vi.fn().mockResolvedValue([]) },
  };
  return { dragStart, dragActivate, dragMove, dragEnd };
}

/** A fake drag source element for the pointer events. */
function makeThumb(): HTMLElement {
  return {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 132, height: 84 }),
  } as unknown as HTMLElement;
}

function down(wm: Wm, path: string, x = 50, y = 40, sx = 200, sy = 300): void {
  const e = new PointerEvent("pointerdown", { button: 0, clientX: x, clientY: y, screenX: sx, screenY: sy });
  Object.defineProperty(e, "currentTarget", { value: makeThumb() });
  (wm as Wm)._onThumbPointerDown(e as PointerEvent, path, false);
}

function move(wm: Wm, x = 53, y = 100, sx = 203, sy = 360): void {
  const e = new PointerEvent("pointermove", { clientX: x, clientY: y, screenX: sx, screenY: sy });
  Object.defineProperty(e, "currentTarget", { value: makeThumb() });
  (wm as Wm)._onThumbPointerMove(e as PointerEvent);
}

function up(wm: Wm, x = 53, y = 100, sx = 203, sy = 360): void {
  const e = new PointerEvent("pointerup", { clientX: x, clientY: y, screenX: sx, screenY: sy });
  Object.defineProperty(e, "currentTarget", { value: makeThumb() });
  (wm as Wm)._onThumbPointerUp(e as PointerEvent);
}

describe("Openp41geWindowManager skeleton drag", () => {
  let wm: Wm;
  let drags: ReturnType<typeof stubWindow>;

  beforeEach(() => {
    vi.useFakeTimers();
    drags = stubWindow();
    wm = new Openp41geWindowManager() as Wm;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("begins a pending drag on pointerdown", () => {
    down(wm, "/w/two");
    expect(wm._drag).not.toBeNull();
    expect((wm._drag as { active: boolean }).active).toBe(false);
    expect(wm._holdTimer).not.toBeNull();
    expect(drags.dragStart).not.toHaveBeenCalled();
  });

  it("starts the open drag (ghost) after a long-press with no movement", () => {
    down(wm, "/w/two", 50, 40, 200, 300);
    vi.advanceTimersByTime(HOLD_MS + 5);

    expect((wm._drag as { active: boolean }).active).toBe(true);
    expect((wm._drag as { mode: string }).mode).toBe("open");
    expect(wm._suppressClick).toBe(true);
    expect(wm._holdTimer).toBeNull();
    expect(drags.dragStart).toHaveBeenCalledTimes(1);
    expect(drags.dragActivate).toHaveBeenCalledTimes(1);
    expect(drags.dragMove).toHaveBeenCalled();
  });

  it("cancels the pending long-press and starts the drag on a quick move past threshold", () => {
    down(wm, "/w/two", 50, 40, 200, 300);
    move(wm, 53, 100, 203, 360); // vertical → open, crosses the 8px threshold

    expect(wm._holdTimer).toBeNull();
    expect((wm._drag as { active: boolean }).active).toBe(true);
    expect((wm._drag as { mode: string }).mode).toBe("open");
    expect(drags.dragStart).toHaveBeenCalledTimes(1);

    // The long-press must NOT also fire now the drag has started.
    vi.advanceTimersByTime(HOLD_MS + 5);
    expect(drags.dragStart).toHaveBeenCalledTimes(1);
    expect(drags.dragActivate).toHaveBeenCalledTimes(1);
  });

  it("keeps the drag from starting on a quick click (no move, release before hold)", () => {
    down(wm, "/w/two", 50, 40, 200, 300);
    up(wm, 50, 40, 200, 300); // release before the hold timer fires

    expect(wm._holdTimer).toBeNull();
    expect(wm._drag).toBeNull();
    expect(drags.dragStart).not.toHaveBeenCalled();
    expect(drags.dragActivate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(HOLD_MS + 5);
    expect(drags.dragStart).not.toHaveBeenCalled();
  });

  it("passes the skeleton capture rect to drag.start for the bitmap ghost", () => {
    down(wm, "/w/two", 50, 40, 200, 300);
    vi.advanceTimersByTime(HOLD_MS + 5);
    const args = drags.dragStart.mock.calls[0] as unknown[];
    const captureRect = args[args.length - 2];
    expect(captureRect).toEqual({ x: 10, y: 20, width: 132, height: 84 });
  });
});
