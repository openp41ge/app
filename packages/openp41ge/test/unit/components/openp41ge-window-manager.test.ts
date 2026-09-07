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

function stubWindow(): {
  dragStart: ReturnType<typeof vi.fn>;
  dragActivate: ReturnType<typeof vi.fn>;
  dragMove: ReturnType<typeof vi.fn>;
  dragEnd: ReturnType<typeof vi.fn>;
} {
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
      prepareBitmap: vi.fn(),
      onEndSession: vi.fn(() => () => {}),
    },
    windowManager: {
      openWindowSummaries: vi.fn().mockResolvedValue([]),
      onOpenWindowsChanged: vi.fn(() => () => {}),
    },
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
  const e = new PointerEvent("pointerdown", {
    button: 0,
    clientX: x,
    clientY: y,
    screenX: sx,
    screenY: sy,
  });
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

  it("passes the grabbed point (not the centred half-size) as the drag offset on long-press", () => {
    // Thumb rect is {left:10, top:20, width:132, height:84}; pointer at (50,40).
    down(wm, "/w/two", 50, 40, 200, 300);
    vi.advanceTimersByTime(HOLD_MS + 5);
    const args = drags.dragStart.mock.calls[0] as unknown[];
    expect(args[9]).toBe(50 - 10); // offsetX = cursor - rect.left
    expect(args[10]).toBe(40 - 20); // offsetY = cursor - rect.top
    // Regression: it used to be the hard-coded half-size (66, 42) which centred
    // the ghost on the cursor instead of hanging it from the grab point.
    expect(args[9]).not.toBe(66);
    expect(args[10]).not.toBe(42);
  });

  it("passes the grabbed point as the drag offset on a quick drag", () => {
    down(wm, "/w/two", 50, 40, 200, 300);
    move(wm, 53, 100, 203, 360); // crosses the threshold → open drag
    const args = drags.dragStart.mock.calls[0] as unknown[];
    expect(args[9]).toBe(50 - 10);
    expect(args[10]).toBe(40 - 20);
  });

  it("steps the carousel between window skeletons via _gotoCarousel", () => {
    wm._workspaces = [{ filePath: "/w/two", data: { name: "Two", windows: [{}, {}] } }] as never;
    (wm as Wm)._gotoCarousel("/w/two", 1);
    expect((wm._carouselIndex as Map<string, number>).get("/w/two")).toBe(1);
    expect(wm._carouselLive).toBe(false);
    (wm as Wm)._gotoCarousel("/w/two", 0);
    expect((wm._carouselIndex as Map<string, number>).get("/w/two")).toBe(0);
  });

  it("clamps carousel navigation at the edges", () => {
    wm._workspaces = [{ filePath: "/w/two", data: { name: "Two", windows: [{}, {}] } }] as never;
    (wm as Wm)._gotoCarousel("/w/two", 9); // beyond last
    expect((wm._carouselIndex as Map<string, number>).get("/w/two")).toBe(1);
    (wm as Wm)._gotoCarousel("/w/two", -3); // before first
    expect((wm._carouselIndex as Map<string, number>).get("/w/two")).toBe(0);
  });

  it("marks the carousel as live (no transition) while swiping, then clears it", () => {
    wm._workspaces = [{ filePath: "/w/two", data: { name: "Two", windows: [{}, {}] } }] as never;
    (wm as Wm)._drag = {
      startX: 50,
      startY: 40,
      startScreenX: 200,
      startScreenY: 300,
      captureRect: null,
      path: "/w/two",
      label: "Two",
      active: true,
      mode: "carousel",
      windowCount: 2,
      baseIndex: 0,
    } as never;
    const move = new PointerEvent("pointermove", {
      clientX: 10,
      clientY: 42,
      screenX: 160,
      screenY: 302,
    });
    Object.defineProperty(move, "currentTarget", { value: { clientWidth: 132 } });
    (wm as Wm)._onThumbPointerMove(move as PointerEvent);
    expect((wm._carouselIndex as Map<string, number>).get("/w/two")).toBe(1);
    expect(wm._carouselLive).toBe(true);
    (wm as Wm)._teardownDrag();
    expect(wm._carouselLive).toBe(false);
  });
});

describe("Openp41geWindowManager header search", () => {
  type WmSearch = Wm & {
    _workspaces: Array<{ filePath: string; data: unknown }>;
    _matchesQuery(ws: { data: unknown }, q: string, cs: boolean, re: boolean): boolean;
    _filteredWorkspaces: Array<{ filePath: string; data: unknown }>;
    _searchOpen: boolean;
    _searchQuery: string;
    _caseSensitive: boolean;
    _useRegex: boolean;
    _exitSearch(): void;
    _onSearchKeydown(e: KeyboardEvent): void;
  };

  let wm: WmSearch;

  beforeEach(() => {
    stubWindow();
    wm = new Openp41geWindowManager() as unknown as WmSearch;
  });

  const W = (
    filePath: string,
    name: string,
    repos: Array<{ url: string; worktrees: string[] }> = [],
  ) => ({ filePath, data: { name, repos } });

  it("matches a workspace by name, repo URL, and worktree name", () => {
    const w = W("/a", "Alpha", [
      { url: "https://github.com/acme/app", worktrees: ["main", "feat-x"] },
    ]);
    expect(wm._matchesQuery(w, "alpha", false, false)).toBe(true);
    expect(wm._matchesQuery(w, "acme/app", false, false)).toBe(true);
    expect(wm._matchesQuery(w, "feat-x", false, false)).toBe(true);
    expect(wm._matchesQuery(w, "nomatch", false, false)).toBe(false);
  });

  it("is case-insensitive by default and case-sensitive when toggled", () => {
    const w = W("/a", "Alpha");
    expect(wm._matchesQuery(w, "alpha", false, false)).toBe(true);
    expect(wm._matchesQuery(w, "ALPHA", false, false)).toBe(true);
    expect(wm._matchesQuery(w, "alpha", true, false)).toBe(false);
    expect(wm._matchesQuery(w, "Alpha", true, false)).toBe(true);
  });

  it("supports regex matching and returns false for an invalid regex", () => {
    const w = W("/a", "Alpha");
    expect(wm._matchesQuery(w, "^Al", false, true)).toBe(true);
    expect(wm._matchesQuery(w, "A.*a$", false, true)).toBe(true);
    expect(wm._matchesQuery(w, "[", false, true)).toBe(false);
  });

  it("returns all workspaces for an empty query and filters otherwise", () => {
    wm._workspaces = [
      W("/a", "Alpha", [{ url: "https://x/y", worktrees: [] }]),
      W("/b", "Beta", [{ url: "https://x/z", worktrees: ["feat"] }]),
    ];
    wm._searchQuery = "feat";
    expect(wm._filteredWorkspaces.map((w) => w.filePath)).toEqual(["/b"]);

    wm._searchQuery = "";
    expect(wm._filteredWorkspaces).toHaveLength(2);
  });

  it("exits search on Escape and resets the query + toggles", () => {
    wm._searchOpen = true;
    wm._searchQuery = "foo";
    wm._caseSensitive = true;
    wm._useRegex = true;
    wm._onSearchKeydown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wm._searchOpen).toBe(false);
    expect(wm._searchQuery).toBe("");
    expect(wm._caseSensitive).toBe(false);
    expect(wm._useRegex).toBe(false);
  });

  it("exits search via the clear control and resets the query", () => {
    wm._searchOpen = true;
    wm._searchQuery = "bar";
    wm._exitSearch();
    expect(wm._searchOpen).toBe(false);
    expect(wm._searchQuery).toBe("");
  });
});
