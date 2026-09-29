/**
 * Unit tests for <openp41ge-error-grid> — the manager window's Errors tab.
 *
 * The grid renders the reactive captured-error store (error-capture-service)
 * and lets the user dismiss a single card or clear them all. Errors are fired
 * through the installed window.onerror handler, so the store + toast + grid
 * all observe the same captured errors.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  installErrorCapture,
  clearCapturedErrors,
} from "@openp41ge/renderer/services/error-capture-service";
import { Openp41geErrorGrid } from "@openp41ge/renderer/components/openp41ge-error-grid";

function fireError(message: string, source = "b.js", withStack = true): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.onerror as any)(message, source, 1, 2, withStack ? new Error(message) : undefined);
}

describe("openp41ge-error-grid", () => {
  let grid: Openp41geErrorGrid | null = null;

  beforeEach(() => {
    installErrorCapture();
    grid = new Openp41geErrorGrid();
    document.body.appendChild(grid);
    return grid.updateComplete;
  });

  afterEach(() => {
    grid?.remove();
    grid = null;
    clearCapturedErrors();
    document.querySelector("openp41ge-toast")?.replaceChildren();
  });

  async function refresh(): Promise<void> {
    await (grid as Openp41geErrorGrid).updateComplete;
  }

  it("shows an empty state when there are no errors", () => {
    expect(grid!.shadowRoot?.textContent).toContain("No errors captured.");
    expect(grid!.shadowRoot?.querySelector(".eg-card")).toBeNull();
  });

  it("renders one card per captured error with its message and source", async () => {
    fireError("grid msg one", "src/one.ts");
    fireError("grid msg two", "src/two.ts");
    await refresh();

    const cards = grid!.shadowRoot!.querySelectorAll(".eg-card");
    expect(cards.length).toBe(2);
    // Newest first.
    expect(cards[0]!.textContent).toContain("grid msg two");
    expect(cards[0]!.textContent).toContain("src/two.ts");
    expect(cards[1]!.textContent).toContain("grid msg one");
    expect(grid!.shadowRoot!.textContent).toContain("2 errors captured");
  });

  it("tags each card with its error-type badge", async () => {
    fireError("badge me");
    await refresh();
    const badge = grid!.shadowRoot!.querySelector(".eg-badge");
    expect(badge?.textContent).toBe("Exception");
  });

  it("dismisses a single card via its remove button", async () => {
    fireError("keep me");
    fireError("drop me");
    await refresh();
    expect(grid!.shadowRoot!.querySelectorAll(".eg-card").length).toBe(2);

    const cards = grid!.shadowRoot!.querySelectorAll(".eg-card");
    (cards[0]!.querySelector(".eg-remove") as HTMLElement).click(); // newest = "drop me"
    await refresh();

    const remaining = grid!.shadowRoot!.querySelectorAll(".eg-card");
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.textContent).toContain("keep me");
  });

  it("clears all errors via the Clear all button", async () => {
    fireError("one");
    fireError("two");
    await refresh();
    expect(grid!.shadowRoot!.querySelectorAll(".eg-card").length).toBe(2);

    (grid!.shadowRoot!.querySelector(".eg-clear") as HTMLElement).click();
    await refresh();

    expect(grid!.shadowRoot!.querySelectorAll(".eg-card").length).toBe(0);
    expect(grid!.shadowRoot!.textContent).toContain("No errors captured.");
  });

  it("expands and collapses the stack trace", async () => {
    fireError("stack me");
    await refresh();
    const toggle = grid!.shadowRoot!.querySelector(".eg-stack-toggle") as HTMLElement | null;
    expect(toggle).not.toBeNull();
    expect(grid!.shadowRoot!.querySelector(".eg-stack")).toBeNull();

    toggle!.click();
    await refresh();
    expect(grid!.shadowRoot!.querySelector(".eg-stack")).not.toBeNull();
    expect(grid!.shadowRoot!.textContent).toContain("stack me");

    (grid!.shadowRoot!.querySelector(".eg-stack-toggle") as HTMLElement).click();
    await refresh();
    expect(grid!.shadowRoot!.querySelector(".eg-stack")).toBeNull();
  });
});
