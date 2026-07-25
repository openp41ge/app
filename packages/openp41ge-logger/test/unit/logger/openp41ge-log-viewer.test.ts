/**
 * Unit tests for openp41ge-log-viewer.ts (Lit version, light DOM).
 * Checks component state (_entries) for data correctness and DOM content
 * for rendering. Uses state checks for timing-sensitive Lit re-renders
 * in jsdom.
 */
import { describe, it, expect } from "vitest";
import { Openp41geLogViewer } from "@openp41ge-logger/openp41ge-log-viewer";
import { pushLog, clearLogBuffer, LogLevel, getLogBuffer } from "@openp41ge-logger/log-buffer";

beforeEach(() => {
  clearLogBuffer();
});

async function createViewer(): Promise<Openp41geLogViewer> {
  const el = document.createElement("openp41ge-log-viewer") as Openp41geLogViewer;
  document.body.appendChild(el);
  await (el as unknown as Openp41geLogViewer).updateComplete;
  return el;
}

async function destroyViewer(el: Openp41geLogViewer): Promise<void> {
  document.body.removeChild(el);
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
    expect(el.querySelector(".toolbar")).toBeTruthy();
    expect(el.querySelector(".log-list")).toBeTruthy();
    await destroyViewer(el);
  });

  it("subscribes to log updates on connect", async () => {
    const el = await createViewer();
    pushLog(LogLevel.INFO, "test", ["lifecycle"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect((el as any)._entries.length).toBe(1);
    await destroyViewer(el);
  });

  it("unsubscribes on disconnect and pushing logs does not crash", async () => {
    const el = await createViewer();
    await destroyViewer(el);
    pushLog(LogLevel.WARN, "test", ["after disconnect"]);
  });
});

// ── Toolbar buttons ──

describe("toolbar", () => {
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

  it("renders a Clear button", async () => {
    const el = await createViewer();
    expect(el.querySelector(".clear-btn")).toBeTruthy();
    await destroyViewer(el);
  });

  it("Clear button empties the log buffer", async () => {
    const el = await createViewer();
    pushLog(LogLevel.INFO, "test", ["to-clear"]);
    el.querySelector<HTMLButtonElement>(".clear-btn")!.click();
    expect(getLogBuffer()).toHaveLength(0);
    await destroyViewer(el);
  });
});

// ── Log entry rendering ──

describe("log entry rendering", () => {
  it("shows 'No log entries' when buffer is empty", async () => {
    const el = await createViewer();
    const listEl = el.querySelector(".log-list")!;
    expect(listEl.textContent).toContain("No log entries");
    await destroyViewer(el);
  });

  it("stores log entries with correct data", async () => {
    const el = await createViewer();
    pushLog(LogLevel.INFO, "my-module", ["hello world"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    const entries = (el as any)._entries;
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("my-module");
    expect(entries[0].text).toBe("hello world");
    expect(entries[0].level).toBe(LogLevel.INFO);
    await destroyViewer(el);
  });

  it("filters entries by min level via _setLevel", async () => {
    const el = await createViewer();
    pushLog(LogLevel.DEBUG, "mod", ["debug"]);
    pushLog(LogLevel.INFO, "mod", ["info"]);
    pushLog(LogLevel.WARN, "mod", ["warn"]);
    pushLog(LogLevel.ERROR, "mod", ["error"]);

    (el as any)._setLevel(LogLevel.WARN);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    const entries = (el as any)._entries;
    expect(entries.length).toBe(2);
    expect(entries[0].level).toBe(LogLevel.WARN);
    expect(entries[1].level).toBe(LogLevel.ERROR);
    await destroyViewer(el);
  });

  it("escapes HTML in log text via _escapeHtml", async () => {
    const el = await createViewer();
    const escaped = (el as any)._escapeHtml("<script>x</script>");
    expect(escaped).toBe("&lt;script&gt;x&lt;/script&gt;");
    await destroyViewer(el);
  });

  it("escapes HTML in log name via _escapeHtml", async () => {
    const el = await createViewer();
    const escaped = (el as any)._escapeHtml("<bad-name>");
    expect(escaped).toBe("&lt;bad-name&gt;");
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
    expect(el.querySelector(".toolbar")).toBeTruthy();
    await destroyViewer(el);
  });

  it("handles buffer being cleared while connected", async () => {
    const el = await createViewer();
    pushLog(LogLevel.INFO, "mod", ["will clear"]);
    clearLogBuffer();
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect((el as any)._entries.length).toBe(0);
    await destroyViewer(el);
  });

  it("stores entries in order", async () => {
    const el = await createViewer();
    pushLog(LogLevel.INFO, "mod", ["first"]);
    pushLog(LogLevel.INFO, "mod", ["second"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    const entries = (el as any)._entries;
    expect(entries.length).toBe(2);
    expect(entries[0].text).toBe("first");
    expect(entries[1].text).toBe("second");
    expect(entries[0].id).toBeLessThan(entries[1].id);
    await destroyViewer(el);
  });

  it("shows empty when filter hides all entries", async () => {
    const el = await createViewer();
    pushLog(LogLevel.DEBUG, "mod", ["only debug"]);
    (el as any)._setLevel(LogLevel.ERROR);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect((el as any)._entries.length).toBe(0);
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
    pushLog(LogLevel.INFO, "mod", ["entry"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect(listEl.scrollTop).toBe(listEl.scrollHeight);
    await destroyViewer(el);
  });

  it("pauses auto-scroll when user scrolls up", async () => {
    const el = await createViewer();
    pushLog(LogLevel.INFO, "mod", ["entry 1"]);
    pushLog(LogLevel.INFO, "mod", ["entry 2"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;

    const listEl = el.querySelector(".log-list")!;
    Object.defineProperties(listEl, {
      scrollHeight: { value: listEl.scrollHeight + 200, configurable: true },
      clientHeight: { value: 100, configurable: true },
    });
    listEl.scrollTop = 0;
    listEl.dispatchEvent(new Event("scroll"));
    pushLog(LogLevel.INFO, "mod", ["entry 3"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;

    expect(listEl.scrollTop).toBe(0);
    await destroyViewer(el);
  });

  it("resumes auto-scroll when buffer is cleared", async () => {
    const el = await createViewer();
    pushLog(LogLevel.INFO, "mod", ["entry"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;

    const listEl = el.querySelector(".log-list")!;
    Object.defineProperties(listEl, {
      scrollHeight: { value: listEl.scrollHeight + 200, configurable: true },
      clientHeight: { value: 100, configurable: true },
    });
    listEl.scrollTop = 0;
    listEl.dispatchEvent(new Event("scroll"));
    clearLogBuffer();

    pushLog(LogLevel.INFO, "mod", ["new entry after clear"]);
    await (el as unknown as Openp41geLogViewer).updateComplete;
    expect(listEl.scrollTop).toBe(listEl.scrollHeight);
    await destroyViewer(el);
  });
});
