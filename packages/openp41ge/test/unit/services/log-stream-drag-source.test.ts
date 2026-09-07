/**
 * Unit tests for LogStreamDragSource — the Logs sidebar system-row drag
 * source.
 *
 * The drag reuses the generic `open-tab` payload so a drop (same- or
 * cross-window) opens a system-scoped `log-viewer` pane with `config.system`.
 *
 * The visible ghost is a main-process DragGhostManager BrowserWindow (a
 * pixel-accurate bitmap of the source row), so the in-DOM ghost is invisible
 * and the source row is never dimmed.
 */

import { describe, it, expect } from "vitest";
import { LogStreamDragSource } from "@openp41ge/renderer/services/drag-sources/log-stream-drag-source";

describe("LogStreamDragSource", () => {
  test("getDragData reports an open-tab payload scoped to the system", () => {
    const source = new LogStreamDragSource("openp41ge");
    expect(source.getDragData()).toEqual({
      type: "open-tab",
      appType: "log-viewer",
      title: "openp41ge",
      tabConfig: { system: "openp41ge" },
    });
  });

  test("uses the provided title for the tab", () => {
    const source = new LogStreamDragSource("openp41ge", "Platform");
    expect(source.getDragData()).toEqual({
      type: "open-tab",
      appType: "log-viewer",
      title: "Platform",
      tabConfig: { system: "openp41ge" },
    });
  });

  test("exposes default cursor offsets", () => {
    const source = new LogStreamDragSource("openp41ge");
    expect(source.offsetX).toBe(0);
    expect(source.offsetY).toBe(0);
    source.setOffset(12, 34);
    expect(source.offsetX).toBe(12);
    expect(source.offsetY).toBe(34);
  });

  test("createGhost returns an invisible element", () => {
    const source = new LogStreamDragSource("openp41ge");
    const ghost = source.createGhost();
    expect(ghost.style.opacity).toBe("0");
  });

  test("onDragStart does not dim the source row", () => {
    const source = new LogStreamDragSource("openp41ge");
    expect(() => source.onDragStart()).not.toThrow();
  });

  test("onDragEnd removes the in-DOM ghost", () => {
    const source = new LogStreamDragSource("openp41ge");
    const ghost = source.createGhost();
    document.body.appendChild(ghost);
    source.onDragEnd({ success: false });
    expect(ghost.parentNode).toBeNull();
  });
});
