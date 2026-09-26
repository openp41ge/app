// @vitest-environment jsdom
/**
 * Unit tests for RegisterTabActivationRecorderStep — the startup step that
 * records tab activations into TabActivationHistory.
 *
 * A restored workspace is not seeded as a full navigation chain, but the
 * grid's currently-active tab IS tracked as the history's current position so
 * Cmd+W targets the tab the user is looking at (not the rightmost), and
 * Back/Forward have a correct starting point.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Workspace } from "@openp41ge/layout/types";
import * as types from "@openp41ge/layout/types";
import * as ops from "@openp41ge/layout/operations";
import { RegisterTabActivationRecorderStep } from "../../../src/renderer/bootstrap/steps/register-tab-activation-recorder.step";
import { TabActivationHistory } from "../../../src/renderer/services/tab-activation-history";
import { Openp41geTabsEventHandler } from "../../../src/renderer/services/openp41ge-tabs-event-handler";

type FakeContext = {
  windowType: "workspace" | "window-manager";
  windowId: string | null;
  workspaceState: {
    subscribe: (cb: (ws: Workspace) => void) => () => void;
    getWorkspace: () => Workspace | null;
    setState: (ws: Workspace) => void;
  };
};

function makeContext(winId: string | null): FakeContext {
  const listeners: Array<(ws: Workspace) => void> = [];
  let current: Workspace | null = null;
  return {
    windowType: "workspace",
    windowId: winId,
    workspaceState: {
      subscribe: (cb) => {
        listeners.push(cb);
        return () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      getWorkspace: () => current,
      setState: (ws) => {
        current = ws;
        for (const cb of listeners) cb(ws);
      },
    },
  };
}

describe("RegisterTabActivationRecorderStep", () => {
  beforeEach(() => {
    TabActivationHistory._reset();
    Openp41geTabsEventHandler.lastFocusedCol = {};
    delete (window as unknown as { openp41ge?: unknown }).openp41ge;
  });

  it("seeds only the active tab of a restored workspace (no navigation chain)", async () => {
    const base = types.createWorkspace("ws1");
    const winId = base.windows[0].id;

    // Restored workspace: t1, t2, t3 in one cell, with t2 (middle) active.
    let ws = ops.addTabToCell(base, winId, types.createTab("t1", "terminal", "T1"), 0, 0);
    ws = ops.addTabToCell(ws, winId, types.createTab("t2", "markdown", "T2"), 0, 0);
    ws = ops.addTabToCell(ws, winId, types.createTab("t3", "video", "T3"), 0, 0);
    ws = ops.activateTabInCell(ws, winId, "t2");

    const context = makeContext(winId);
    const step = new RegisterTabActivationRecorderStep();
    await step.run(context);

    // First observation = restored workspace → seed active tab as current.
    context.workspaceState.setState(ws);

    expect(TabActivationHistory.getCurrent(winId)).toBe("t2");
    // No back chain is fabricated from the restored order.
    expect(TabActivationHistory.canGoBack(winId)).toBe(false);
  });

  it("records newly-opened tabs as fresh activations after the baseline", async () => {
    const base = types.createWorkspace("ws2");
    const winId = base.windows[0].id;
    let ws = types.createWorkspace("ws2");

    const context = makeContext(winId);
    const step = new RegisterTabActivationRecorderStep();
    await step.run(context);

    // Empty restore (baseline).
    context.workspaceState.setState(ws);

    // User opens t1 then t2.
    ws = ops.addTabToCell(ws, winId, types.createTab("t1", "terminal", "T1"), 0, 0);
    context.workspaceState.setState(ws);
    ws = ops.addTabToCell(ws, winId, types.createTab("t2", "markdown", "T2"), 0, 0);
    context.workspaceState.setState(ws);

    expect(TabActivationHistory.getCurrent(winId)).toBe("t2");
    expect(TabActivationHistory.canGoBack(winId)).toBe(true);
  });

  it("does NOT remove closed tabs from the immutable log", async () => {
    const base = types.createWorkspace("ws3");
    const winId = base.windows[0].id;
    let ws = base;

    const context = makeContext(winId);
    const step = new RegisterTabActivationRecorderStep();
    await step.run(context);
    context.workspaceState.setState(ws); // baseline

    ws = ops.addTabToCell(ws, winId, types.createTab("t1", "terminal", "T1"), 0, 0);
    context.workspaceState.setState(ws);
    ws = ops.addTabToCell(ws, winId, types.createTab("t2", "markdown", "T2"), 0, 0);
    context.workspaceState.setState(ws);

    // User closes t2 — the log is not modified (closed tabs are only skipped
    // when navigating, never removed).
    ws = ops.removeTabFromCell(ws, winId, "t2");
    context.workspaceState.setState(ws);

    expect(TabActivationHistory.getHistory(winId)).toEqual(["t1", "t2"]);
    // Back/Forward skip the closed t2.
    expect(TabActivationHistory.goBack(winId, (t) => t !== "t2")).toBe("t1");
  });
});
