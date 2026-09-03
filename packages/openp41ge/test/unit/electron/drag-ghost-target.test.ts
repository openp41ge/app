/**
 * Unit tests for `computeGhostShowWindows` — the pure decision that governs
 * which window paints a cross-window drop indicator during a drag.
 *
 * Regression guard for: dragging a workspace skeleton over the Workspace
 * Manager while it covers a workspace window. The overlaid (behind) window's
 * grid bounds overlap the cursor but the source is on top, so the behind
 * window must NOT light up a drop indicator.
 */
import { describe, it, expect } from "vitest";
import {
  computeGhostShowWindows,
  containsPoint,
  type Rect,
} from "../../../electron/drag-ghost-target";

const source: Rect = { x: 0, y: 0, width: 400, height: 300 };
const behind: Rect = { x: 200, y: 0, width: 400, height: 300 };

const windows = [
  { id: "source", bounds: source },
  { id: "behind", bounds: behind },
];

describe("computeGhostShowWindows", () => {
  it("shows nothing while the cursor is still over the source window", () => {
    // Cursor at (300,100): inside BOTH source (0-400) and behind (200-600).
    // The source is on top, so no window may light up.
    const show = computeGhostShowWindows(source, windows, { x: 300, y: 100 });
    expect(show.size).toBe(0);
  });

  it("shows a target window once the cursor leaves the source", () => {
    // Cursor at (500,100): outside source, inside behind.
    const show = computeGhostShowWindows(source, windows, { x: 500, y: 100 });
    expect(show.has("behind")).toBe(true);
    expect(show.has("source")).toBe(false);
  });

  it("shows nothing when the cursor is over no window", () => {
    const show = computeGhostShowWindows(source, windows, { x: 900, y: 900 });
    expect(show.size).toBe(0);
  });

  it("shows nothing when the cursor is over the source only", () => {
    const show = computeGhostShowWindows(source, windows, { x: 100, y: 100 });
    expect(show.size).toBe(0);
  });

  it("with no source bounds, shows every window under the cursor", () => {
    const show = computeGhostShowWindows(null, windows, { x: 300, y: 100 });
    expect(show.has("source")).toBe(true);
    expect(show.has("behind")).toBe(true);
  });

  it("hides the behind window when the cursor moves back over the source", () => {
    // Same point as the leave-source case, but with the cursor back over the
    // source (source wins) — the stale behind indicator must be cleared.
    const overSource = computeGhostShowWindows(source, windows, { x: 300, y: 100 });
    expect(overSource.size).toBe(0);
  });
});

describe("containsPoint", () => {
  it("inclusive of boundaries", () => {
    expect(containsPoint(source, { x: 0, y: 0 })).toBe(true);
    expect(containsPoint(source, { x: 400, y: 300 })).toBe(true);
    expect(containsPoint(source, { x: 401, y: 300 })).toBe(false);
    expect(containsPoint(source, { x: 400, y: 301 })).toBe(false);
  });
});
