/**
 * Unit tests for the Window Manager skeleton drag state machine.
 *
 * Covers the workspace skeleton gesture:
 *  - long-press (hold > HOLD_MS) shows the drag element without pointer movement
 *  - a quick drag that crosses the threshold cancels the pending long-press and
 *    starts the drag from the move handler
 *  - a quick click (down + up before the hold) never starts a drag
 *  - a fast flick is a drag-out, not a carousel swipe, and a swipe that pulls off
 *    the row or is released outside the window becomes a drag-out
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
  openWorkspaceWindow: ReturnType<typeof vi.fn>;
} {
  const dragStart = vi.fn();
  const dragActivate = vi.fn();
  const dragMove = vi.fn();
  const dragEnd = vi.fn();
  const openWorkspaceWindow = vi.fn();
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
      openWorkspaceWindow,
      onActivateTab: vi.fn(() => () => {}),
    },
    workspace: {
      getLaunchTab: vi.fn(() => null),
    },
    welcome: {
      isDismissed: vi.fn().mockResolvedValue(false),
    },
  };
  return { dragStart, dragActivate, dragMove, dragEnd, openWorkspaceWindow };
}

/** A workspace with `n` window skeletons, so the carousel gesture is available. */
function withWindows(wm: Wm, path: string, n: number): void {
  wm._workspaces = [
    { filePath: path, data: { name: "Two", windows: Array.from({ length: n }, () => ({})) } },
  ] as never;
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
    move(wm, 53, 100, 203, 360); // vertical → open, crosses the threshold

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

  it("opens a drag-out on a sideways move — the carousel swipe gesture is gone", () => {
    withWindows(wm, "/w/two", 2);
    down(wm, "/w/two", 300, 40, 450, 300);
    move(wm, 230, 42, 380, 302); // well inside the window

    // No matter how horizontal the move, there is no carousel to page — it is a
    // drag-out.
    expect((wm._drag as { mode: string }).mode).toBe("open");
    expect(drags.dragStart).toHaveBeenCalledTimes(1);
    expect(drags.dragActivate).toHaveBeenCalledTimes(1);
  });

  it("opens on a release outside the window", () => {
    withWindows(wm, "/w/two", 2);
    down(wm, "/w/two", 300, 40, 450, 300);
    move(wm, 230, 42, 380, 302);

    up(wm, 230, 42, window.screenX + window.outerWidth + 50, 302);

    expect(drags.openWorkspaceWindow).toHaveBeenCalledWith("/w/two");
  });

  it("does not open when a drag is released inside the window", () => {
    withWindows(wm, "/w/two", 2);
    down(wm, "/w/two", 300, 40, 450, 300);
    move(wm, 230, 42, 380, 302);
    up(wm, 230, 42, 380, 302);

    expect(drags.openWorkspaceWindow).not.toHaveBeenCalled();
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

describe("Openp41geWindowManager workspace row thumbnails", () => {
  let wm: Wm;

  beforeEach(() => {
    stubWindow();
    wm = new Openp41geWindowManager() as Wm;
    (wm as Wm)._loaded = true;
    document.body.appendChild(wm as unknown as HTMLElement);
  });

  afterEach(() => {
    wm.remove();
  });

  function setWorkspace(windows: number): void {
    (wm as Wm)._workspaces = [
      { filePath: "/w/a", data: { name: "Alpha", windows: Array.from({ length: windows }, () => ({})) } },
    ] as never;
    return wm.requestUpdate();
  }

  it("trades a thumbnail for a +N more label once the row overflows", async () => {
    setWorkspace(4);
    await (wm as Wm).updateComplete;

    // Overflowing rows show 2 thumbnails + a two-line "+ 2" / "more" counter.
    const thumbs = wm.shadowRoot?.querySelectorAll(".ws-thumb");
    expect(thumbs?.length).toBe(2);
    const more = wm.shadowRoot?.querySelector(".ws-more");
    expect(more?.querySelectorAll("span")?.length).toBe(2);
    expect(more?.querySelector(".ws-more-count")?.textContent).toBe("+ 2");
    expect(more?.querySelector(".ws-more-word")?.textContent).toBe("more");
    expect(wm.shadowRoot?.querySelector(".ws-chevron")).toBeNull();
    expect(wm.shadowRoot?.querySelector(".ws-edit")).not.toBeNull();
  });

  it("shows three thumbnails (no more label) when exactly three windows exist", async () => {
    setWorkspace(3);
    await (wm as Wm).updateComplete;

    expect(wm.shadowRoot?.querySelectorAll(".ws-thumb")?.length).toBe(3);
    expect(wm.shadowRoot?.querySelector(".ws-more")).toBeNull();
  });

  it("does not open the workspace on a single row click", async () => {
    setWorkspace(1);
    await (wm as Wm).updateComplete;

    const row = wm.shadowRoot?.querySelector(".ws-row");
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    expect((window as unknown as { openp41ge: { windowManager: { openWorkspaceWindow: ReturnType<typeof vi.fn> } } }).openp41ge.windowManager.openWorkspaceWindow).not.toHaveBeenCalled();
  });

  it("opens the workspace window on a row double-click", async () => {
    setWorkspace(1);
    await (wm as Wm).updateComplete;

    const row = wm.shadowRoot?.querySelector(".ws-row");
    row?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true }));

    expect((window as unknown as { openp41ge: { windowManager: { openWorkspaceWindow: ReturnType<typeof vi.fn> } } }).openp41ge.windowManager.openWorkspaceWindow).toHaveBeenCalledWith("/w/a");
  });

  it("opens the drawer on an edit-button click, without opening the window", async () => {
    setWorkspace(1);
    await (wm as Wm).updateComplete;

    const edit = wm.shadowRoot?.querySelector<HTMLElement>(".ws-edit")!;
    edit.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    const om = (window as unknown as { openp41ge: { windowManager: { openWorkspaceWindow: ReturnType<typeof vi.fn> } } }).openp41ge.windowManager.openWorkspaceWindow;
    expect(om).not.toHaveBeenCalled();
    expect((wm as Wm)._drawers).toHaveLength(1);
    expect(((wm as Wm)._drawers as Array<{ workspacePath: string }>)[0].workspacePath).toBe("/w/a");
  });

  it("extends the footer's three vertical separators with up overdraws", async () => {
    expect(wm.shadowRoot?.querySelector(".ws-list-footer")).not.toBeNull();

    const lines = wm.shadowRoot?.querySelectorAll(".ws-list-footer overdraw-line");
    expect(lines?.length).toBe(3);

    const search = wm.shadowRoot?.querySelector<HTMLElement>(".ws-list-footer .dw-search > overdraw-line");
    expect(search?.getAttribute("dir")).toBe("up");
    expect(search?.style.right).toBe("-1px");
    expect(search?.style.left).toBe("");

    for (const btn of wm.shadowRoot?.querySelectorAll<HTMLElement>(".ws-list-footer .dw-add, .ws-list-footer .dw-delete") ?? []) {
      const line = btn.querySelector<HTMLElement>("overdraw-line");
      expect(line?.getAttribute("dir")).toBe("up");
      expect(line?.style.left).toBe("-1px");
      expect(line?.style.right).toBe("");
    }

    // Idempotent: triggering another update must not duplicate the lines.
    (wm as Wm).requestUpdate();
    await (wm as Wm).updateComplete;
    expect(wm.shadowRoot?.querySelectorAll(".ws-list-footer overdraw-line")?.length).toBe(3);
  });

  it("gives each search-bar button an up and a down overdraw on its left separator", async () => {
    (wm as Wm)._searchOpen = true;
    (wm as Wm).requestUpdate();
    await (wm as Wm).updateComplete;

    const buttons = wm.shadowRoot?.querySelectorAll<HTMLElement>(".wm-search-bar .wm-search-toggle, .wm-search-bar .wm-search-clear");
    expect(buttons?.length).toBe(3);

    for (const btn of buttons ?? []) {
      const top = btn.querySelector<HTMLElement>("overdraw-line[dir=up]");
      const bottom = btn.querySelector<HTMLElement>("overdraw-line[dir=down]");
      expect(top?.style.left).toBe("-1px");
      expect(top?.style.bottom).toBe("100%");
      expect(bottom?.style.left).toBe("-1px");
      expect(bottom?.style.top).toBe("100%");
    }

    // Idempotent: another update must not duplicate (2 lines per button).
    (wm as Wm).requestUpdate();
    await (wm as Wm).updateComplete;
    expect(wm.shadowRoot?.querySelectorAll(".wm-search-bar overdraw-line")?.length).toBe(6);
  });

  it("hides the search-bar overdraws when a workspace drawer is open", async () => {
    (wm as Wm)._searchOpen = true;
    (wm as Wm).requestUpdate();
    await (wm as Wm).updateComplete;

    (wm as Wm)._drawers = [{ id: "d1", workspacePath: "/w/a", kind: "workspace", title: "A", data: { repos: [] } }] as never;
    (wm as Wm).requestUpdate();
    await (wm as Wm).updateComplete;

    for (const line of wm.shadowRoot?.querySelectorAll<HTMLElement>(".wm-search-bar overdraw-line") ?? []) {
      expect(line.style.display).toBe("none");
    }

    (wm as Wm)._drawers = [] as never;
    (wm as Wm).requestUpdate();
    await (wm as Wm).updateComplete;
    for (const line of wm.shadowRoot?.querySelectorAll<HTMLElement>(".wm-search-bar overdraw-line") ?? []) {
      expect(line.style.display).toBe("");
    }
  });
});
