/**
 * Unit tests for openp41ge-log-viewer.ts (Lit version, light DOM).
 *
 * The viewer is a **backward-paging**, flat (non-grouped) datetime-ordered log
 * list. It uses `MemLogPageReader` by default (the in-memory bus) and accepts
 * an injected `LogPageReader`. These tests exercise the default in-memory
 * reader path: initial latest load, prepending older pages on scroll-up,
 * live appends, level/source/system filters, and auto-scroll-to-bottom.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Openp41geLogViewer } from "@openp41ge-logger/openp41ge-log-viewer";
import { pushLog, clearLogBuffer, LogLevel } from "@openp41ge-logger/log-buffer";
import { LOG_PAGE_DEFAULT_LIMIT } from "@openp41ge-logger/log-page-reader";

beforeEach(() => {
  clearLogBuffer();
});

/** Create a viewer appended to the DOM, and flush the async initial load. */
async function createViewer(): Promise<Openp41geLogViewer> {
  const el = document.createElement("openp41ge-log-viewer") as Openp41geLogViewer;
  document.body.appendChild(el);
  await (el as unknown as Openp41geLogViewer).updateComplete;
  // Flush the async `loadLatest` continuation before asserting on loaded data.
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as Openp41geLogViewer).updateComplete;
  return el;
}

async function destroyViewer(el: Openp41geLogViewer): Promise<void> {
  document.body.removeChild(el);
}

/** Render elements that match `.log-entry`. */
function entries(el: Openp41geLogViewer): Element[] {
  return [...el.querySelectorAll(".log-entry")];
}

// ── Registration ──

describe("Openp41geLogViewer (custom element registration)", () => {
  it("has a static tagName property", () => {
    expect(Openp41geLogViewer.tagName).toBe("openp41ge-log-viewer");
  });
  it("creates an element via document.createElement", () => {
    const el = document.createElement("openp41ge-log-viewer");
    expect(el).toBeInstanceOf(Openp41geLogViewer);
  });
  it("is defined as a custom element", () => {
    expect(customElements.get("openp41ge-log-viewer")).toBe(Openp41geLogViewer);
  });
});

// ── Lifecycle ──

describe("Openp41geLogViewer lifecycle", () => {
  it("renders toolbar and log list in light DOM", async () => {
    const el = await createViewer();
    expect(el.querySelector(".bottom-bar")).toBeTruthy();
    expect(el.querySelector(".log-list")).toBeTruthy();
    await destroyViewer(el);
  });

  it("loads the latest entries on connect", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["pre-connect"]);
    const el = await createViewer();
    expect((el as any)._entries.length).toBe(1);
    await destroyViewer(el);
  });

  it("appends live entries pushed after connect", async () => {
    const el = await createViewer();
    pushLog(LogLevel.INFO, "test", "test", ["lifecycle"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect((el as any)._entries.length).toBe(1);
    await destroyViewer(el);
  });

  it("unsubscribes on disconnect and pushing logs does not crash", async () => {
    const el = await createViewer();
    await destroyViewer(el);
    pushLog(LogLevel.WARN, "test", "test", ["after disconnect"]);
  });

  it("falls back to the in-memory reader when the injected reader fails", async () => {
    const failing = {
      loadLatest: async () => {
        throw new Error("No handler registered");
      },
      loadOlder: async () => {
        throw new Error("No handler registered");
      },
      subscribe: () => () => {},
    };
    const el = document.createElement("openp41ge-log-viewer") as Openp41geLogViewer;
    el.pageReader = failing as never;
    document.body.appendChild(el);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as Openp41geLogViewer).updateComplete;

    // After the fallback, live entries from the in-memory bus should appear.
    pushLog(LogLevel.INFO, "test", "mod", ["after fallback"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect((el as any)._entries.length).toBe(1);
    await destroyViewer(el);
  });
});

// ── Toolbar buttons ──

describe("bottom bar", () => {
  it("renders four level filter buttons", async () => {
    const el = await createViewer();
    const buttons = el.querySelectorAll(".level-btn");
    expect(buttons).toHaveLength(4);
    expect(buttons[0].textContent?.trim()).toBe("DEBUG");
    expect(buttons[1].textContent?.trim()).toBe("INFO");
    expect(buttons[2].textContent?.trim()).toBe("WARN");
    expect(buttons[3].textContent?.trim()).toBe("ERROR");
    await destroyViewer(el);
  });

  it("DEBUG button is active by default", async () => {
    const el = await createViewer();
    const buttons = el.querySelectorAll(".level-btn");
    expect(buttons[0].classList.contains("active")).toBe(true);
    await destroyViewer(el);
  });

  it("clicking a level button activates it", async () => {
    const el = await createViewer();
    const buttons = el.querySelectorAll<HTMLButtonElement>(".level-btn");
    buttons[2].click(); // WARN
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect(buttons[0].classList.contains("active")).toBe(false);
    expect(buttons[2].classList.contains("active")).toBe(true);
    await destroyViewer(el);
  });

  it("does not render a Clear button (logs are a persistent record)", async () => {
    const el = await createViewer();
    expect(el.querySelector(".clear-btn")).toBeNull();
    await destroyViewer(el);
  });

  it("renders a Wrap toggle to the right of the level filter, with a separator", async () => {
    const el = await createViewer();
    const bar = el.querySelector(".bottom-bar")!;
    const wrapBtn = bar.querySelector(".wrap-btn")!;
    const sep = bar.querySelector(".sep")!;
    expect(wrapBtn).toBeTruthy();
    expect(sep).toBeTruthy();
    // The wrap button comes after the last level button, separated by the sep.
    const lastLevel = [...bar.querySelectorAll(".level-btn")][3];
    expect(
      lastLevel.compareDocumentPosition(wrapBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(sep.compareDocumentPosition(wrapBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await destroyViewer(el);
  });

  it("wrap is off by default (log lines do not wrap)", async () => {
    const el = await createViewer();
    expect(el.querySelector(".wrap-btn")!.classList.contains("active")).toBe(false);
    expect(el.querySelector(".log-list")!.classList.contains("nowrap")).toBe(true);
    await destroyViewer(el);
  });

  it("clicking the Wrap toggle enables then disables line wrapping", async () => {
    const el = await createViewer();
    const wrapBtn = el.querySelector<HTMLButtonElement>(".wrap-btn")!;
    // Default off → nowrap on.
    expect((el as any)._wrap).toBe(false);
    expect(el.querySelector(".log-list")!.classList.contains("nowrap")).toBe(true);

    // Toggle on.
    wrapBtn.click();
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect((el as any)._wrap).toBe(true);
    expect(wrapBtn.classList.contains("active")).toBe(true);
    expect(el.querySelector(".log-list")!.classList.contains("nowrap")).toBe(false);

    // Toggle back off.
    wrapBtn.click();
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect((el as any)._wrap).toBe(false);
    expect(wrapBtn.classList.contains("active")).toBe(false);
    expect(el.querySelector(".log-list")!.classList.contains("nowrap")).toBe(true);
    await destroyViewer(el);
  });
});

// ── Log entry rendering (flat, datetime order) ──

describe("log entry rendering", () => {
  it("shows 'No log entries' when empty", async () => {
    const el = await createViewer();
    const listEl = el.querySelector(".log-list")!;
    expect(listEl.textContent).toContain("No log entries");
    await destroyViewer(el);
  });

  it("stores log entries with correct data", async () => {
    const el = await createViewer();
    pushLog(LogLevel.INFO, "test", "my-module", ["hello world"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    const loaded = (el as any)._entries;
    expect(loaded.length).toBe(1);
    expect(loaded[0].source).toBe("my-module");
    expect(loaded[0].message).toBe("hello world");
    expect(loaded[0].level).toBe(LogLevel.INFO);
    await destroyViewer(el);
  });

  it("renders entries in datetime order", async () => {
    pushLog(LogLevel.INFO, "test", "mod", ["first"]);
    pushLog(LogLevel.INFO, "test", "mod", ["second"]);
    const el = await createViewer();
    const rows = entries(el);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("first");
    expect(rows[1].textContent).toContain("second");
    await destroyViewer(el);
  });

  it("does not render a system grouping header", async () => {
    pushLog(LogLevel.INFO, "sys-a", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "sys-b", "beta", ["b1"]);
    const el = await createViewer();
    expect(el.querySelector(".sys-header")).toBeNull();
    expect(el.querySelector(".stream-header")).toBeNull();
    await destroyViewer(el);
  });

  it("escapes HTML in log text and source", async () => {
    const el = await createViewer();
    const escaped = (el as any)._escapeHtml("<script>x</script>");
    expect(escaped).toBe("&lt;script&gt;x&lt;/script&gt;");
    await destroyViewer(el);
  });
});

// ── Level / source / system filtering ──

describe("filtering", () => {
  it("filters by min level", async () => {
    pushLog(LogLevel.DEBUG, "test", "mod", ["debug"]);
    pushLog(LogLevel.INFO, "test", "mod", ["info"]);
    pushLog(LogLevel.WARN, "test", "mod", ["warn"]);
    pushLog(LogLevel.ERROR, "test", "mod", ["error"]);
    const el = await createViewer();
    (el as any)._setLevel(LogLevel.WARN);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    const visible = (el as any)._visible;
    expect(visible.map((e: any) => e.level)).toEqual([LogLevel.WARN, LogLevel.ERROR]);
    await destroyViewer(el);
  });

  it("shows all sources (no source filter)", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.WARN, "test", "beta", ["b1"]);
    const el = await createViewer();
    el.source = "alpha";
    await (el as unknown as Openp41geLogViewer).updateComplete;
    const visible = (el as any)._visible;
    expect(visible).toHaveLength(2);
    await destroyViewer(el);
  });

  it("shows all systems (no system filter)", async () => {
    pushLog(LogLevel.INFO, "sys-a", "alpha", ["a"]);
    pushLog(LogLevel.INFO, "sys-b", "alpha", ["b"]);
    const el = await createViewer();
    el.system = "sys-a";
    await (el as unknown as Openp41geLogViewer).updateComplete;
    const visible = (el as any)._visible;
    expect(visible).toHaveLength(2);
    await destroyViewer(el);
  });
});

// ── Backward paging ──

describe("backward paging", () => {
  it("loads only the most-recent page and flags hasOlder", async () => {
    const n = LOG_PAGE_DEFAULT_LIMIT + 5;
    for (let i = 0; i < n; i++) {
      pushLog(LogLevel.INFO, "test", "mod", [`msg ${i}`]);
    }
    const el = await createViewer();
    const loaded = (el as any)._entries;
    expect(loaded.length).toBe(LOG_PAGE_DEFAULT_LIMIT);
    expect((el as any)._hasOlder).toBe(true);
    await destroyViewer(el);
  });

  it("prepends older entries when loading a previous page", async () => {
    const n = LOG_PAGE_DEFAULT_LIMIT + 3;
    for (let i = 0; i < n; i++) {
      pushLog(LogLevel.INFO, "test", "mod", [`msg ${i}`]);
    }
    const el = await createViewer();
    expect((el as any)._entries.length).toBe(LOG_PAGE_DEFAULT_LIMIT);
    await (el as any)._loadOlder();
    await new Promise((r) => setTimeout(r, 0));
    const loaded = (el as any)._entries;
    expect(loaded.length).toBe(n);
    expect(loaded[0].message).toBe("msg 0");
    await destroyViewer(el);
  });

  it("does nothing on scroll-up when hasOlder is false", async () => {
    pushLog(LogLevel.INFO, "test", "mod", ["only"]);
    const el = await createViewer();
    expect((el as any)._hasOlder).toBe(false);
    await (el as any)._loadOlder();
    expect((el as any)._entries.length).toBe(1);
    await destroyViewer(el);
  });
});

// ── Day boundary confirmation ──

describe("day boundary confirmation", () => {
  const mk = (message: string) => ({
    timestamp: Date.now(),
    level: LogLevel.INFO,
    levelLabel: "INFO",
    system: "test",
    source: "mod",
    message,
    process: "main",
  });

  function mountReader(reader: {
    latest: Record<string, unknown>;
    older: Record<string, unknown>;
  }): Openp41geLogViewer {
    const el = document.createElement("openp41ge-log-viewer") as Openp41geLogViewer;
    el.pageReader = {
      loadLatest: async () => reader.latest,
      loadOlder: async () => reader.older,
      subscribe: () => () => {},
    } as never;
    document.body.appendChild(el);
    return el;
  }

  async function flush(el: Openp41geLogViewer): Promise<void> {
    await (el as unknown as Openp41geLogViewer).updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as Openp41geLogViewer).updateComplete;
  }

  it("renders a clickable row labelled with nextDayLabel", async () => {
    const el = mountReader({
      latest: {
        entries: [mk("today")],
        hasOlder: false,
        cursor: null,
        nextDayCursor: { fileIndex: 1, lineCount: 0 },
        nextDayLabel: "Load yesterday's logs",
      },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);

    const row = el.querySelector(".day-boundary");
    expect(row).toBeTruthy();
    expect(row!.textContent).toContain("Load yesterday's logs");
    await destroyViewer(el);
  });

  it("clicking the row loads and prepends the previous day, then clears the row", async () => {
    let loadOlderCalled = false;
    const el = document.createElement("openp41ge-log-viewer") as Openp41geLogViewer;
    el.pageReader = {
      loadLatest: async () => ({
        entries: [mk("day0")],
        hasOlder: false,
        cursor: null,
        nextDayCursor: { fileIndex: 1, lineCount: 0 },
        nextDayLabel: "Load yesterday's logs",
      }),
      loadOlder: async () => {
        loadOlderCalled = true;
        return { entries: [mk("day1")], hasOlder: false, cursor: null };
      },
      subscribe: () => () => {},
    } as never;
    document.body.appendChild(el);
    await flush(el);

    (el as any).querySelector(".day-boundary").click();
    await flush(el);

    expect(loadOlderCalled).toBe(true);
    expect((el as any)._entries.map((e: any) => e.message)).toEqual(["day1", "day0"]);
    expect(el.querySelector(".day-boundary")).toBeNull();
    await destroyViewer(el);
  });

  it("does not silently cross the boundary on the auto scroll-up path", async () => {
    let loadOlderCalled = false;
    const el = document.createElement("openp41ge-log-viewer") as Openp41geLogViewer;
    el.pageReader = {
      loadLatest: async () => ({
        entries: [mk("day0")],
        hasOlder: false,
        cursor: null,
        nextDayCursor: { fileIndex: 1, lineCount: 0 },
        nextDayLabel: "Load yesterday's logs",
      }),
      loadOlder: async () => {
        loadOlderCalled = true;
        return { entries: [], hasOlder: false, cursor: null };
      },
      subscribe: () => () => {},
    } as never;
    document.body.appendChild(el);
    await flush(el);

    // Auto path (no target) must not load while hasOlder is false.
    await (el as any)._loadOlder();
    expect(loadOlderCalled).toBe(false);
    await destroyViewer(el);
  });
});

// ── Edge cases ──

describe("edge cases", () => {
  it("handles re-connecting", async () => {
    const el = document.createElement("openp41ge-log-viewer") as Openp41geLogViewer;
    document.body.appendChild(el);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    document.body.removeChild(el);
    document.body.appendChild(el);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect(el.querySelector(".bottom-bar")).toBeTruthy();
    await destroyViewer(el);
  });

  it("stores entries in order", async () => {
    pushLog(LogLevel.INFO, "test", "mod", ["first"]);
    pushLog(LogLevel.INFO, "test", "mod", ["second"]);
    const el = await createViewer();
    const loaded = (el as any)._entries;
    expect(loaded).toHaveLength(2);
    expect(loaded[0].message).toBe("first");
    expect(loaded[1].message).toBe("second");
    await destroyViewer(el);
  });
});

describe("registerOpenp41geLogViewer()", () => {
  it("is idempotent", async () => {
    const { registerOpenp41geLogViewer: register } =
      await import("@openp41ge-logger/openp41ge-log-viewer");
    expect(() => register()).not.toThrow();
    expect(customElements.get("openp41ge-log-viewer")).toBe(Openp41geLogViewer);
  });
});

// ── Scroll / auto-scroll ──

describe("auto-scroll behavior", () => {
  it("auto-scrolls to bottom when new entries arrive", async () => {
    const el = await createViewer();
    const listEl = el.querySelector(".log-list")!;
    Object.defineProperty(listEl, "scrollHeight", { value: 200, configurable: true });
    pushLog(LogLevel.INFO, "test", "mod", ["entry"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect(listEl.scrollTop).toBe(200);
    await destroyViewer(el);
  });

  it("pauses auto-scroll when user scrolls up", async () => {
    const el = await createViewer();
    const listEl = el.querySelector(".log-list")!;
    Object.defineProperties(listEl, {
      scrollHeight: { value: 300, configurable: true },
      clientHeight: { value: 100, configurable: true },
    });
    listEl.scrollTop = 0;
    listEl.dispatchEvent(new Event("scroll"));
    pushLog(LogLevel.INFO, "test", "mod", ["entry"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect(listEl.scrollTop).toBe(0);
    await destroyViewer(el);
  });
});

// ── Virtualized rendering ──

describe("virtualized rendering", () => {
  function mountMany(n: number): Openp41geLogViewer {
    const entries = Array.from({ length: n }, (_, i) => ({
      timestamp: 1_700_000_000_000 + i,
      level: LogLevel.INFO,
      levelLabel: "INFO",
      system: "test",
      source: "mod",
      message: `msg ${i}`,
      process: "main",
    }));
    const el = document.createElement("openp41ge-log-viewer") as Openp41geLogViewer;
    el.pageReader = {
      loadLatest: async () => ({ entries, hasOlder: false, cursor: null }),
      loadOlder: async () => ({ entries: [], hasOlder: false, cursor: null }),
      subscribe: () => () => {},
    } as never;
    document.body.appendChild(el);
    return el;
  }

  async function flush(el: Openp41geLogViewer): Promise<void> {
    await (el as unknown as Openp41geLogViewer).updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as Openp41geLogViewer).updateComplete;
  }

  /** Force the viewer to recompute its window with a non-zero viewport. */
  async function recomputeWithViewport(el: Openp41geLogViewer): Promise<void> {
    await (el as unknown as Openp41geLogViewer).updateComplete; // ensure .log-list exists
    const listEl = el.querySelector(".log-list")!;
    Object.defineProperty(listEl, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(listEl, "scrollHeight", { value: 1_000_000, configurable: true });
    listEl.dispatchEvent(new Event("scroll"));
    // Several cycles so the measured-height loop converges.
    for (let i = 0; i < 8; i++) {
      await flush(el);
    }
  }

  it("renders a bounded DOM window, not one node per loaded entry", async () => {
    const el = mountMany(1000);
    await recomputeWithViewport(el);

    expect((el as any)._entries.length).toBe(1000);
    const rows = el.querySelectorAll(".log-entry").length;
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThan(1000);
    await destroyViewer(el);
  });

  it("keeps DOM bounded even after the day-boundary row is added", async () => {
    const el = mountMany(1000);
    await recomputeWithViewport(el);
    // Force a boundary row to appear at the front and scroll to the top so it
    // is inside the visible window.
    (el as any)._nextDayCursor = { fileIndex: 1, lineCount: 0 };
    (el as any)._nextDayLabel = "Load yesterday's logs";
    (el as any)._layoutDirty = true;
    const listEl = el.querySelector(".log-list")!;
    listEl.scrollTop = 0;
    listEl.dispatchEvent(new Event("scroll"));
    await flush(el);

    expect(el.querySelector(".day-boundary")).toBeTruthy();
    const rows = el.querySelectorAll(".log-entry").length;
    expect(rows).toBeLessThan(1000);
    await destroyViewer(el);
  });
});

// ── In-log search (Cmd/Ctrl+F) ──

describe("in-log search", () => {
  const mk = (message: string, ts = Date.now()) => ({
    timestamp: ts,
    level: LogLevel.INFO,
    levelLabel: "INFO",
    system: "test",
    source: "mod",
    message,
    process: "main",
  });

  function mountReader(reader: {
    latest: Record<string, unknown>;
    older: Record<string, unknown>;
  }): Openp41geLogViewer {
    const el = document.createElement("openp41ge-log-viewer") as Openp41geLogViewer;
    el.pageReader = {
      loadLatest: async () => reader.latest,
      loadOlder: async () => reader.older,
      subscribe: () => () => {},
    } as never;
    document.body.appendChild(el);
    return el;
  }

  async function flush(el: Openp41geLogViewer): Promise<void> {
    await (el as unknown as Openp41geLogViewer).updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await (el as unknown as Openp41geLogViewer).updateComplete;
  }

  it("renders no find bar until opened", async () => {
    const el = await createViewer();
    expect(el.querySelector(".find-bar")).toBeNull();
    await destroyViewer(el);
  });

  it("opens the find bar on Cmd/Ctrl+F when the list is focused", async () => {
    const el = await createViewer();
    const listEl = el.querySelector(".log-list")!;
    listEl.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true }),
    );
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect(el.querySelector(".find-bar")).toBeTruthy();
    await destroyViewer(el);
  });

  it("opens the find bar via the bottom-bar search icon", async () => {
    const el = await createViewer();
    const btn = el.querySelector<HTMLButtonElement>(".find-entry-btn")!;
    btn.click();
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect(el.querySelector(".find-bar")).toBeTruthy();
    await destroyViewer(el);
  });

  it("highlights matches and shows the count", async () => {
    const el = mountReader({
      latest: { entries: [mk("foo one"), mk("bar")], hasOlder: false, cursor: null },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    const listEl = el.querySelector(".log-list")!;
    Object.defineProperty(listEl, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(listEl, "scrollHeight", { value: 500, configurable: true });
    listEl.dispatchEvent(new Event("scroll"));
    await flush(el);
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();
    await flush(el);

    expect(el.querySelectorAll("mark").length).toBeGreaterThan(0);
    expect(el.querySelector(".find-count")!.textContent).toBe("1/1");
    expect(el.querySelector("mark.find-match-active")).toBeTruthy();
    await destroyViewer(el);
  });

  it("counts each occurrence separately, not per row", async () => {
    const el = mountReader({
      latest: { entries: [mk("foo foo bar"), mk("nope")], hasOlder: false, cursor: null },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    const listEl = el.querySelector(".log-list")!;
    Object.defineProperty(listEl, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(listEl, "scrollHeight", { value: 500, configurable: true });
    listEl.dispatchEvent(new Event("scroll"));
    await flush(el);
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();
    await flush(el);

    // One row with two occurrences → two matches / instances.
    expect((el as any)._searchMatches).toHaveLength(2);
    expect(el.querySelector(".find-count")!.textContent).toBe("1/2");
    // Both occurrences in the same entry are highlighted; exactly one is active.
    expect(el.querySelectorAll("mark").length).toBe(2);
    expect(el.querySelectorAll("mark.find-match-active").length).toBe(1);

    // Next occurrence is the second "foo" in the same row, not a jump to a row.
    await (el as any)._nextMatch(1);
    expect((el as any)._activeMatchIndex).toBe(1);
    expect((el as any)._activeRange).toEqual({ start: 4, end: 7 });
    await destroyViewer(el);
  });

  it("searches today's logs including entries not yet loaded (drain)", async () => {
    const el = mountReader({
      latest: {
        entries: [mk("recent foo"), mk("recent two")],
        hasOlder: true,
        cursor: { fileIndex: 0, lineCount: 2 },
      },
      older: { entries: [mk("older foo"), mk("oldest")], hasOlder: false, cursor: null },
    });
    await flush(el);
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();

    const msgs = (el as any)._searchMatches.map((m: any) => m.entry.message);
    expect(msgs).toContain("recent foo");
    expect(msgs).toContain("older foo");
    expect(msgs).toHaveLength(2);
    await destroyViewer(el);
  });

  it("draining for search applies a single anchor reposition (typing does not scroll)", async () => {
    const el = mountReader({
      latest: {
        entries: [mk("recent foo")],
        hasOlder: true,
        cursor: { fileIndex: 0, lineCount: 1 },
      },
      older: { entries: [mk("older foo")], hasOlder: false, cursor: null },
    });
    await flush(el);
    const listEl = el.querySelector(".log-list")!;
    Object.defineProperty(listEl, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(listEl, "scrollHeight", { value: 500, configurable: true });
    listEl.scrollTop = 300;
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();
    await flush(el);
    // The drain accumulates every page and applies them in ONE `_entries`
    // assignment (rather than one render per page), which coupled with the
    // `overflow-anchor: none` on .log-list is what stopped the browser's scroll
    // anchoring from nudging scrollTop while typing. jsdom has no real
    // scrollHeight, so the anchor delta is 0 — scrollTop stays on the user's
    // position.
    expect((el as any)._entries.map((e: any) => e.message)).toEqual(["older foo", "recent foo"]);
    expect(listEl.scrollTop).toBe(300);
    await destroyViewer(el);
  });

  it("searches every loaded entry, including older days", async () => {
    const oldTs = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const el = mountReader({
      latest: {
        entries: [mk("today foo"), mk("old foo", oldTs)],
        hasOlder: false,
        cursor: null,
      },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();

    const msgs = (el as any)._searchMatches.map((m: any) => m.entry.message);
    expect(msgs).toContain("today foo");
    expect(msgs).toContain("old foo");
    await destroyViewer(el);
  });

  it("clicking the day-boundary row makes the loaded day searchable", async () => {
    const yesterdayTs = Date.now() - 24 * 60 * 60 * 1000;
    const el = mountReader({
      latest: {
        entries: [mk("today foo")],
        hasOlder: false,
        cursor: null,
        nextDayCursor: { fileIndex: 1, lineCount: 0 },
        nextDayLabel: "Load yesterday's logs",
      },
      older: { entries: [mk("yesterday foo", yesterdayTs)], hasOlder: false, cursor: null },
    });
    await flush(el);

    // Search today before confirming the boundary: today matches, yesterday does not.
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();
    let msgs = (el as any)._searchMatches.map((m: any) => m.entry.message);
    expect(msgs).toContain("today foo");
    expect(msgs).not.toContain("yesterday foo");

    // Confirm the boundary: the loaded day becomes part of the searchable surface.
    (el as any).querySelector(".day-boundary").click();
    await flush(el);
    // The click marks the window undrained and schedules a debounced refresh.
    await new Promise((r) => setTimeout(r, 200));
    await flush(el);

    msgs = (el as any)._searchMatches.map((m: any) => m.entry.message);
    expect(msgs).toContain("today foo");
    expect(msgs).toContain("yesterday foo");
    await destroyViewer(el);
  });

  it("level filter blocks results on filtered-out rows", async () => {
    pushLog(LogLevel.INFO, "test", "mod", ["visible foo"]);
    pushLog(LogLevel.DEBUG, "test", "mod", ["debug foo"]);
    const el = await createViewer();
    (el as any)._setLevel(LogLevel.INFO);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();

    const msgs = (el as any)._searchMatches.map((m: any) => m.entry.message);
    expect(msgs).toContain("visible foo");
    expect(msgs).not.toContain("debug foo");
    await destroyViewer(el);
  });

  it("Enter moves to the next match and scrolls to it", async () => {
    const el = mountReader({
      latest: { entries: [mk("foo one"), mk("foo two")], hasOlder: false, cursor: null },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    const listEl = el.querySelector(".log-list")!;
    Object.defineProperty(listEl, "clientHeight", { value: 200, configurable: true });
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();
    (el as any)._activeMatchIndex = 0;
    await (el as any)._nextMatch(1);

    expect((el as any)._activeMatchIndex).toBe(1);
    expect((el as any)._activeEntry.message).toBe("foo two");
    expect(listEl.scrollTop).toBeGreaterThan(0);
    await destroyViewer(el);
  });

  it("Escape closes the find bar and clears highlights", async () => {
    pushLog(LogLevel.INFO, "test", "mod", ["foo"]);
    const el = await createViewer();
    const listEl = el.querySelector(".log-list")!;
    Object.defineProperty(listEl, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(listEl, "scrollHeight", { value: 500, configurable: true });
    listEl.dispatchEvent(new Event("scroll"));
    await flush(el);
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();
    await flush(el);
    expect(el.querySelector("mark")).toBeTruthy();

    const input = el.querySelector<HTMLInputElement>("[data-testid=log-find-input]")!;
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await (el as unknown as Openp41geLogViewer).updateComplete;

    expect(el.querySelector(".find-bar")).toBeNull();
    expect(el.querySelector("mark")).toBeNull();
    expect((el as any)._searchMatches).toHaveLength(0);
    await destroyViewer(el);
  });

  it("renders prev/next arrow buttons together after the match count", async () => {
    const el = mountReader({
      latest: { entries: [mk("foo one"), mk("foo two")], hasOlder: false, cursor: null },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    const listEl = el.querySelector(".log-list")!;
    Object.defineProperty(listEl, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(listEl, "scrollHeight", { value: 500, configurable: true });
    listEl.dispatchEvent(new Event("scroll"));
    await flush(el);
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();
    await flush(el);

    expect(el.querySelector("[data-testid=log-find-prev]")).toBeTruthy();
    expect(el.querySelector("[data-testid=log-find-next]")).toBeTruthy();
    // Count is left of the arrows; both arrows are adjacent and after the count.
    const prev = el.querySelector("[data-testid=log-find-prev]")!;
    const next = el.querySelector("[data-testid=log-find-next]")!;
    const count = el.querySelector(".find-count")!;
    expect((count.compareDocumentPosition(prev) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(
      true,
    );
    expect((prev.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(
      true,
    );
    // The arrows are adjacent (prev immediately before next) — no count between them.
    expect(prev.nextElementSibling).toBe(next);
    await destroyViewer(el);
  });

  it("clicking the next/prev arrows cycles through matches", async () => {
    const el = mountReader({
      latest: { entries: [mk("foo one"), mk("foo two")], hasOlder: false, cursor: null },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    const listEl = el.querySelector(".log-list")!;
    Object.defineProperty(listEl, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(listEl, "scrollHeight", { value: 500, configurable: true });
    listEl.dispatchEvent(new Event("scroll"));
    await flush(el);
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();
    await flush(el);

    expect((el as any)._activeMatchIndex).toBe(0);
    (el as any).querySelector("[data-testid=log-find-next]").click();
    await flush(el);
    expect((el as any)._activeMatchIndex).toBe(1);
    (el as any).querySelector("[data-testid=log-find-prev]").click();
    await flush(el);
    expect((el as any)._activeMatchIndex).toBe(0);
    await destroyViewer(el);
  });

  it("opens the find bar on Cmd/Ctrl+F even when focus is on the host", async () => {
    const el = mountReader({
      latest: { entries: [mk("foo")], hasOlder: false, cursor: null },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    // Dispatch on the host element (not a descendant) — e.g. focus on the pane.
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true }),
    );
    await flush(el);
    expect((el as any)._searchOpen).toBe(true);
    expect(el.querySelector(".find-bar")).toBeTruthy();
    await destroyViewer(el);
  });

  it("focus() moves focus to the log list", async () => {
    const el = mountReader({
      latest: { entries: [mk("foo")], hasOlder: false, cursor: null },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    el.focus();
    await flush(el);
    expect(document.activeElement?.classList?.contains("log-list")).toBe(true);
    await destroyViewer(el);
  });

  it("opening the find bar with an empty query does not drain today's logs", async () => {
    const el = mountReader({
      latest: {
        entries: [mk("one"), mk("two")],
        hasOlder: true,
        cursor: { fileIndex: 0, lineCount: 2 },
      },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    expect((el as any)._searchDrained).toBe(false);
    // Open via Cmd/Ctrl+F (the query is still empty). Draining here would
    // prepend all of today's entries and (via the scroll-preserve delta)
    // yank a top-scrolled view down to the bottom the moment the bar opens.
    const listEl = el.querySelector(".log-list")!;
    listEl.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true }),
    );
    await flush(el);
    expect((el as any)._searchOpen).toBe(true);
    expect((el as any)._searchDrained).toBe(false);
    await destroyViewer(el);
  });

  it("does not open the find bar on Cmd/Ctrl+F when focus is outside the viewer", async () => {
    const el = mountReader({
      latest: { entries: [mk("foo")], hasOlder: false, cursor: null },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    // The user is on the sidebar (or any non-log pane): focus is on <body>.
    (document.activeElement as HTMLElement | null)?.blur?.();
    await flush(el);
    expect(document.activeElement === document.body).toBe(true);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true }),
    );
    await flush(el);
    expect((el as any)._searchOpen).toBe(false);
    expect(el.querySelector(".find-bar")).toBeNull();
    await destroyViewer(el);
  });

  it("keeps focus on the log list when clicking a non-interactive part of the pane", async () => {
    const el = mountReader({
      latest: { entries: [mk("foo")], hasOlder: false, cursor: null },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    const listEl = el.querySelector(".log-list")!;
    // Click the list background (not a button/input) → focus should stay on .log-list.
    listEl.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    await flush(el);
    expect(document.activeElement?.classList?.contains("log-list")).toBe(true);
    await destroyViewer(el);
  });

  it("does not steal focus from interactive controls on pointerdown", async () => {
    const el = mountReader({
      latest: { entries: [mk("foo")], hasOlder: false, cursor: null },
      older: { entries: [], hasOlder: false, cursor: null },
    });
    await flush(el);
    // Dispatch on a button inside the viewer — focus-grab must skip it.
    (el as any)._searchOpen = true;
    await (el as unknown as Openp41geLogViewer).updateComplete;
    const btn = el.querySelector<HTMLButtonElement>(".find-entry-btn")!;
    btn.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    await flush(el);
    expect(document.activeElement).not.toBe(el.querySelector(".log-list"));
    await destroyViewer(el);
  });
});

// ── Stream filter (bottom-bar funnel) ──

describe("stream filter", () => {
  const update = (el: Openp41geLogViewer) => (el as unknown as Openp41geLogViewer).updateComplete;

  it("renders a funnel filter button in the bottom bar", async () => {
    const el = await createViewer();
    expect(el.querySelector("[data-testid=log-filter-btn]")).toBeTruthy();
    await destroyViewer(el);
  });

  it("hides the filter bar until opened", async () => {
    const el = await createViewer();
    expect(el.querySelector(".filter-bar")).toBeNull();
    await destroyViewer(el);
  });

  it("opens the filter bar via the bottom-bar funnel button", async () => {
    const el = await createViewer();
    const btn = el.querySelector<HTMLButtonElement>("[data-testid=log-filter-btn]")!;
    btn.click();
    await update(el);
    expect(el.querySelector(".filter-bar")).toBeTruthy();
    expect((el as any)._filterOpen).toBe(true);
    await destroyViewer(el);
  });

  it("renders selected streams as removable pills", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    const el = await createViewer();
    (el as any)._filterOpen = true;
    (el as any)._addStream("alpha");
    (el as any)._addStream("beta");
    await update(el);
    const pills = el.querySelectorAll(".filter-pill");
    expect(pills).toHaveLength(2);
    expect(el.querySelector(".filter-pill-label")!.textContent).toBe("alpha");
    expect(el.querySelector(".filter-pill-x")).toBeTruthy();
    await destroyViewer(el);
  });

  it("clicking a pill's × removes the stream from the filter", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    const el = await createViewer();
    (el as any)._filterOpen = true;
    (el as any)._addStream("alpha");
    (el as any)._addStream("beta");
    await update(el);
    const x = el.querySelector<HTMLButtonElement>(".filter-pill-x")!;
    x.click();
    await update(el);
    expect((el as any)._selectedStreams).toEqual(["beta"]);
    expect(el.querySelectorAll(".filter-pill")).toHaveLength(1);
    await destroyViewer(el);
  });

  it("filter narrows the visible list to selected streams (OR, case-insensitive)", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    pushLog(LogLevel.INFO, "test", "gamma", ["g1"]);
    const el = await createViewer();
    (el as any)._addStream("alpha");
    (el as any)._addStream("BETA");
    await update(el);
    const visible = (el as any)._visible;
    expect(visible.map((e: any) => e.source).sort()).toEqual(["alpha", "beta"]);
    await destroyViewer(el);
  });

  it("selecting a value filters the rendered log rows to what is selected", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    pushLog(LogLevel.INFO, "test", "gamma", ["g1"]);
    const el = await createViewer();
    // All three streams are rendered initially.
    expect(entries(el)).toHaveLength(3);
    (el as any)._addStream("alpha");
    await update(el);
    expect(entries(el)).toHaveLength(1);
    expect(entries(el)[0].querySelector(".log-name")!.textContent).toBe("[alpha]");
    // Add a second stream → both are shown.
    (el as any)._addStream("beta");
    await update(el);
    expect(entries(el)).toHaveLength(2);
    await destroyViewer(el);
  });

  it("shows nothing when the selected streams match none of the loaded entries", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    const el = await createViewer();
    (el as any)._addStream("nope");
    await update(el);
    expect((el as any)._visible).toHaveLength(0);
    expect(entries(el)).toHaveLength(0);
    await destroyViewer(el);
  });

  it("clearing the selection restores all rendered logs", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    const el = await createViewer();
    (el as any)._addStream("alpha");
    await update(el);
    expect(entries(el)).toHaveLength(1);
    // Close the filter (resets the selection) → all streams render again.
    (el as any)._closeFilter();
    await update(el);
    expect(entries(el)).toHaveLength(2);
    await destroyViewer(el);
  });

  it("shows all streams when no streams are selected", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    const el = await createViewer();
    await update(el);
    expect((el as any)._visible).toHaveLength(2);
    expect(entries(el)).toHaveLength(2);
    await destroyViewer(el);
  });

  it("opens an auto-suggest popup instead of a native datalist", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    const el = await createViewer();
    (el as any)._filterOpen = true;
    await update(el);
    // The removable-pill filter no longer uses the native down-arrow datalist.
    expect(el.querySelector("datalist")).toBeNull();
    (el as any)._openSuggest();
    await update(el);
    expect(el.querySelector("[data-testid=log-filter-suggest]")).toBeTruthy();
    await destroyViewer(el);
  });

  it("lists the available streams in the popup", async () => {
    pushLog(LogLevel.INFO, "test", "zeta", ["z1"]);
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    const el = await createViewer();
    (el as any)._filterOpen = true;
    (el as any)._filterSuggestOpen = true;
    await update(el);
    const streams = [...el.querySelectorAll(".filter-suggest-label")].map((n) => n.textContent);
    expect(streams).toContain("zeta");
    expect(streams).toContain("alpha");
    await destroyViewer(el);
  });

  it("typing filters the popup list by stream name", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    const el = await createViewer();
    (el as any)._filterOpen = true;
    await update(el);
    const input = el.querySelector<HTMLInputElement>("[data-testid=log-filter-input]")!;
    input.value = "al";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await update(el);
    const streams = [...el.querySelectorAll(".filter-suggest-label")].map((n) => n.textContent);
    expect(streams).toEqual(["alpha"]);
    await destroyViewer(el);
  });

  it("arrow keys navigate the popup and Enter toggles the highlighted stream", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    const el = await createViewer();
    (el as any)._openFilter();
    await update(el);
    const input = el.querySelector<HTMLInputElement>("[data-testid=log-filter-input]")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await update(el);
    expect((el as any)._filterActiveIndex).toBe(0);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await update(el);
    expect((el as any)._selectedStreams).toEqual(["alpha"]);
    await destroyViewer(el);
  });

  it("Space toggles the highlighted stream in the popup", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    const el = await createViewer();
    (el as any)._openFilter();
    await update(el);
    const input = el.querySelector<HTMLInputElement>("[data-testid=log-filter-input]")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await update(el);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    await update(el);
    expect((el as any)._selectedStreams).toEqual(["alpha"]);
    await destroyViewer(el);
  });

  it("clicking a popup option toggles the stream on and off", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    const el = await createViewer();
    (el as any)._filterOpen = true;
    (el as any)._filterSuggestOpen = true;
    await update(el);
    el.querySelector<HTMLElement>(".filter-suggest-item")!.click();
    await update(el);
    expect((el as any)._selectedStreams).toEqual(["alpha"]);
    // Clicking again removes it (toggle). Re-query: the node may be re-rendered.
    el.querySelector<HTMLElement>(".filter-suggest-item")!.click();
    await update(el);
    expect((el as any)._selectedStreams).toEqual([]);
    await destroyViewer(el);
  });

  it("the popup stays open after selecting a stream via click", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    const el = await createViewer();
    (el as any)._filterOpen = true;
    (el as any)._filterSuggestOpen = true;
    await update(el);
    expect(el.querySelector("[data-testid=log-filter-suggest]")).toBeTruthy();
    // Click the first suggestion ("alpha"): it becomes a selected pill.
    el.querySelector<HTMLElement>(".filter-suggest-item")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await update(el);
    // The popup remains open so a second stream can be picked.
    expect((el as any)._filterSuggestOpen).toBe(true);
    expect((el as any)._selectedStreams).toEqual(["alpha"]);
    expect(el.querySelector("[data-testid=log-filter-suggest]")).toBeTruthy();
    await destroyViewer(el);
  });

  it("clicking the filter input reopens the suggestions even after they were closed", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    const el = await createViewer();
    (el as any)._filterOpen = true;
    await update(el);
    // Popup open, then closed (e.g. the input kept focus but the popup hid).
    (el as any)._openSuggest();
    await update(el);
    expect(el.querySelector("[data-testid=log-filter-suggest]")).toBeTruthy();
    (el as any)._closeSuggest();
    await update(el);
    expect(el.querySelector("[data-testid=log-filter-suggest]")).toBeNull();
    // Clicking the already-focused input reopens the popup (no @focus event).
    const input = el.querySelector<HTMLInputElement>("[data-testid=log-filter-input]")!;
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await update(el);
    expect((el as any)._filterSuggestOpen).toBe(true);
    expect(el.querySelector("[data-testid=log-filter-suggest]")).toBeTruthy();
    await destroyViewer(el);
  });

  it("closes the popup when focus leaves the filter bar (clicking away)", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    const el = await createViewer();
    (el as any)._filterOpen = true;
    (el as any)._filterSuggestOpen = true;
    await update(el);
    expect(el.querySelector("[data-testid=log-filter-suggest]")).toBeTruthy();
    const input = el.querySelector<HTMLInputElement>("[data-testid=log-filter-input]")!;
    input.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }),
    );
    await update(el);
    expect((el as any)._filterSuggestOpen).toBe(false);
    expect(el.querySelector("[data-testid=log-filter-suggest]")).toBeNull();
    await destroyViewer(el);
  });

  it("clicking the stream name in a log row opens the filter and adds it", async () => {
    pushLog(LogLevel.INFO, "test", "dev-tools", ["hello"]);
    const el = await createViewer();
    const name = el.querySelector<HTMLElement>(".log-name")!;
    name.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await update(el);
    expect((el as any)._filterOpen).toBe(true);
    expect((el as any)._selectedStreams).toEqual(["dev-tools"]);
    expect(el.querySelector(".filter-bar")).toBeTruthy();
    await destroyViewer(el);
  });

  it("clicking a suggestion does not close the popup opened via a stream name", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    pushLog(LogLevel.INFO, "test", "beta", ["b1"]);
    const el = await createViewer();
    // Open the filter by clicking a blue stream name (like a user would).
    el.querySelector<HTMLElement>(".log-name")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await update(el);
    // Let the deferred _focusFilter run so the input is focused and the popup
    // opens via its @focus handler.
    await new Promise((r) => setTimeout(r, 0));
    await update(el);
    expect((el as any)._filterOpen).toBe(true);
    expect((el as any)._filterSuggestOpen).toBe(true);
    // In a real browser the host-level pointerdown listener fires here; it used
    // to grab focus to .log-list, blurring the input and closing the popup.
    const betaItem = [...el.querySelectorAll<HTMLElement>(".filter-suggest-item")].find(
      (n) => n.querySelector(".filter-suggest-label")?.textContent === "beta",
    )!;
    betaItem.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    await update(el);
    // The popup must stay open (focus stays in the filter bar), and the click
    // adds the second stream.
    expect((el as any)._filterSuggestOpen).toBe(true);
    betaItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await update(el);
    expect((el as any)._selectedStreams).toEqual(["alpha", "beta"]);
    expect((el as any)._filterSuggestOpen).toBe(true);
    await destroyViewer(el);
  });

  it("can be open at the same time as search, with the filter bar above search", async () => {
    const el = await createViewer();
    el.querySelector<HTMLButtonElement>("[data-testid=log-find-btn]")!.click();
    await update(el);
    el.querySelector<HTMLButtonElement>("[data-testid=log-filter-btn]")!.click();
    await update(el);

    const filterBar = el.querySelector(".filter-bar")!;
    const findBar = el.querySelector(".find-bar")!;
    expect(filterBar).toBeTruthy();
    expect(findBar).toBeTruthy();
    // The stream filter bar sits directly above the search bar.
    expect(
      filterBar.compareDocumentPosition(findBar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await destroyViewer(el);
  });

  it("Escape closes the filter bar and clears the selection", async () => {
    pushLog(LogLevel.INFO, "test", "alpha", ["a1"]);
    const el = await createViewer();
    (el as any)._filterOpen = true;
    (el as any)._selectedStreams = ["alpha"];
    await update(el);
    const input = el.querySelector<HTMLInputElement>("[data-testid=log-filter-input]")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await update(el);
    expect((el as any)._filterOpen).toBe(false);
    expect((el as any)._selectedStreams).toEqual([]);
    await destroyViewer(el);
  });

  it("a stream filter narrows active search matches", async () => {
    pushLog(LogLevel.INFO, "test", "mod", ["foo one"]);
    pushLog(LogLevel.INFO, "test", "other", ["foo two"]);
    const el = await createViewer();
    (el as any)._searchOpen = true;
    (el as any)._searchQuery = "foo";
    await (el as any)._refreshSearch();
    await update(el);
    // Filter to the "mod" stream → only its match survives.
    (el as any)._addStream("mod");
    const msgs = (el as any)._searchMatches.map((m: any) => m.entry.message);
    expect(msgs).toEqual(["foo one"]);
    await destroyViewer(el);
  });
});
