// @vitest-environment node
/**
 * Unit tests for resolveCmdWTarget — the pure Cmd+W target resolver.
 *
 * Cmd+W closes the grid tab the user is CURRENTLY focused on: the active tab
 * of the focused cell/column (not the rightmost tab). When no grid tabs
 * remain, it closes the window. Sidebar/system tabs are never candidates, and
 * an unknown window/workspace → null. (Back/Forward navigation is handled
 * separately by TabActivationHistory.)
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";
import { resolveCmdWTarget } from "../../../src/renderer/services/cmd-w-target";
import { Openp41geTabsEventHandler } from "../../../src/renderer/services/openp41ge-tabs-event-handler";

const winId = (ws: types.Workspace): string => ws.windows[0].id;

describe("resolveCmdWTarget", () => {
  beforeEach(() => {
    Openp41geTabsEventHandler.lastFocusedCol = {};
  });

  it("returns close-window when the grid has no tabs", () => {
    const ws = types.createWorkspace("w1");
    expect(resolveCmdWTarget(ws, winId(ws))).toEqual({ kind: "close-window" });
  });

  it("closes the ACTIVE tab of the cell, not the rightmost", () => {
    const ws = types.createWorkspace("w2");
    const id = winId(ws);
    let r = ops.addTabToCell(ws, id, types.createTab("t1", "terminal", "T1"), 0, 0);
    r = ops.addTabToCell(r, id, types.createTab("t2", "markdown", "T2"), 0, 0);
    r = ops.addTabToCell(r, id, types.createTab("t3", "video", "T3"), 0, 0);

    // The user focuses the MIDDLE tab (t2). Cmd+W must close t2, not the
    // rightmost t3.
    r = ops.activateTabInCell(r, id, "t2");
    expect(resolveCmdWTarget(r, id)).toEqual({ kind: "close-tab", tabId: "t2" });
  });

  it("closes the active tab of the focused column in a multi-cell grid", () => {
    const ws = types.createWorkspace("w3");
    const id = winId(ws);
    ws.windows[0].grid.cols = 3;
    let r = ops.addTabToCell(ws, id, types.createTab("t1", "terminal", "T1"), 0, 0);
    r = ops.addTabToCell(r, id, types.createTab("t2", "markdown", "T2"), 0, 1);
    r = ops.addTabToCell(r, id, types.createTab("t3", "video", "T3"), 0, 2);

    // Focus the middle column (col 1); its active tab is t2. Cmd+W closes t2.
    Openp41geTabsEventHandler.lastFocusedCol[id] = 1;
    expect(resolveCmdWTarget(r, id)).toEqual({ kind: "close-tab", tabId: "t2" });
  });

  it("defaults to col 0 when no column has been focused", () => {
    const ws = types.createWorkspace("w4");
    const id = winId(ws);
    ws.windows[0].grid.cols = 3;
    let r = ops.addTabToCell(ws, id, types.createTab("t1", "terminal", "T1"), 0, 0);
    r = ops.addTabToCell(r, id, types.createTab("t2", "markdown", "T2"), 0, 1);
    r = ops.addTabToCell(r, id, types.createTab("t3", "video", "T3"), 0, 2);

    // No focus recorded → default to col 0's active tab (t1).
    expect(resolveCmdWTarget(r, id)).toEqual({ kind: "close-tab", tabId: "t1" });
  });

  it("returns null for an unknown window or null workspace", () => {
    const ws = types.createWorkspace("w5");
    expect(resolveCmdWTarget(ws, "nope")).toBeNull();
    expect(resolveCmdWTarget(null, "x")).toBeNull();
  });

  it("only ever targets a grid tab — never a sidebar/system tab", () => {
    const ws = types.createWorkspace("w6");
    const id = winId(ws);
    const r = ops.addTabToCell(ws, id, types.createTab("t1", "terminal", "T1"), 0, 0);
    // The resolver reports a grid tab id, never a system-tab id.
    expect(resolveCmdWTarget(r, id)).toEqual({ kind: "close-tab", tabId: "t1" });
  });
});
