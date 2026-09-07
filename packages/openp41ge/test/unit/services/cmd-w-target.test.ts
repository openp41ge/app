// @vitest-environment node
/**
 * Unit tests for resolveCmdWTarget — the pure Cmd+W target resolver.
 *
 * Verifies: no grid tabs → close window; the target is the most-recently
 * activated OPEN tab (activation-history order, not right-to-left); closed /
 * not-open tabs in the history are skipped; empty history falls back to the
 * last grid tab; unknown window/workspace → null.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";
import { resolveCmdWTarget } from "../../../src/renderer/services/cmd-w-target";
import { TabActivationHistory } from "../../../src/renderer/services/tab-activation-history";

const winId = (ws: types.Workspace): string => ws.windows[0].id;

describe("resolveCmdWTarget", () => {
  beforeEach(() => {
    TabActivationHistory._reset();
  });

  it("returns close-window when the grid has no tabs", () => {
    const ws = types.createWorkspace("w1");
    expect(resolveCmdWTarget(ws, winId(ws))).toEqual({ kind: "close-window" });
  });

  it("closes the most-recently-activated tab (activation order, not right-to-left)", () => {
    const ws = types.createWorkspace("w2");
    const id = winId(ws);
    let r = ops.addTabToCell(ws, id, types.createTab("t1", "terminal", "T1"), 0, 0);
    r = ops.addTabToCell(r, id, types.createTab("t2", "markdown", "T2"), 0, 0);
    r = ops.addTabToCell(r, id, types.createTab("t3", "video", "T3"), 0, 0);

    // Activation order: t1 → t3 → t2. Most recent = t2 (not rightmost t3).
    TabActivationHistory.pushActivation(id, "t1");
    TabActivationHistory.pushActivation(id, "t3");
    TabActivationHistory.pushActivation(id, "t2");

    expect(resolveCmdWTarget(r, id)).toEqual({ kind: "close-tab", tabId: "t2" });
  });

  it("skips tabs that were closed (removed from grid), even if still in history", () => {
    const ws = types.createWorkspace("w3");
    const id = winId(ws);
    let r = ops.addTabToCell(ws, id, types.createTab("t1", "terminal", "T1"), 0, 0);
    r = ops.addTabToCell(r, id, types.createTab("t2", "markdown", "T2"), 0, 0);
    r = ops.addTabToCell(r, id, types.createTab("t3", "video", "T3"), 0, 0);

    TabActivationHistory.pushActivation(id, "t1");
    TabActivationHistory.pushActivation(id, "t2");
    TabActivationHistory.pushActivation(id, "t3");

    // User closes t3. Most recent open tab is now t2.
    r = ops.removeTabFromCell(r, id, "t3");
    expect(resolveCmdWTarget(r, id)).toEqual({ kind: "close-tab", tabId: "t2" });
  });

  it("falls back to the last grid tab when no activations have been recorded", () => {
    const ws = types.createWorkspace("w4");
    const id = winId(ws);
    let r = ops.addTabToCell(ws, id, types.createTab("t1", "terminal", "T1"), 0, 0);
    r = ops.addTabToCell(r, id, types.createTab("t2", "markdown", "T2"), 0, 0);
    r = ops.addTabToCell(r, id, types.createTab("t3", "video", "T3"), 0, 0);

    // Empty history — fall back to the rightmost/last grid tab.
    expect(resolveCmdWTarget(r, id)).toEqual({ kind: "close-tab", tabId: "t3" });
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
    TabActivationHistory.pushActivation(id, "t1");
    // The resolver reports a grid tab id, never a system-tab id.
    expect(resolveCmdWTarget(r, id)).toEqual({ kind: "close-tab", tabId: "t1" });
  });
});
