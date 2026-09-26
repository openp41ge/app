// @vitest-environment jsdom
/**
 * CommandBus — verifies that closing a grid tab focuses the PREVIOUS entry in
 * the activation log (injected as the removeTabFromCell `focusTabId`), instead
 * of the layout's next tab.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommandBus } from "@openp41ge/renderer/services/command-bus";
import { TabActivationHistory } from "@openp41ge/renderer/services/tab-activation-history";

function workspaceWithCell(tabIds: string[]): unknown {
  return {
    windows: [{ id: "w1", grid: { placements: [{ tabIds }] } }],
  };
}

describe("CommandBus close-focus", () => {
  let dispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TabActivationHistory._reset();
    dispatch = vi.fn();
    (window as unknown as { openp41ge: { workspace: { dispatch: unknown } } }).openp41ge = {
      workspace: { dispatch },
    };
  });

  it("injects the previous open history entry as focusTabId when a tab is closed", () => {
    const bus = new CommandBus();
    bus.setWorkspaceGetter(() => workspaceWithCell(["t1", "t2", "t3"]) as never);

    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");
    TabActivationHistory.pushActivation("w1", "t3");

    bus.dispatch("removeTabFromCell", "w1", "t3");
    expect(dispatch).toHaveBeenCalledWith("removeTabFromCell", "w1", "t3", "t2");
    expect(TabActivationHistory.getCurrent("w1")).toBe("t2");
  });

  it("does not inject a focusTabId when there is no previous same-cell entry", () => {
    const bus = new CommandBus();
    bus.setWorkspaceGetter(() => workspaceWithCell(["t1"]) as never);

    TabActivationHistory.pushActivation("w1", "t1");

    bus.dispatch("removeTabFromCell", "w1", "t1");
    expect(dispatch).toHaveBeenCalledWith("removeTabFromCell", "w1", "t1");
  });

  it("skips closed same-cell entries and falls back to an earlier open one", () => {
    const bus = new CommandBus();
    bus.setWorkspaceGetter(() => workspaceWithCell(["t1", "t2", "t3"]) as never);

    TabActivationHistory.pushActivation("w1", "t1");
    TabActivationHistory.pushActivation("w1", "t2");
    TabActivationHistory.pushActivation("w1", "t3");

    // t2 is already closed (not in the live cell) → closing t3 focuses t1.
    bus.setWorkspaceGetter(() => workspaceWithCell(["t1", "t3"]) as never);
    bus.dispatch("removeTabFromCell", "w1", "t3");
    expect(dispatch).toHaveBeenCalledWith("removeTabFromCell", "w1", "t3", "t1");
  });

  it("leaves other operations untouched", () => {
    const bus = new CommandBus();
    bus.setWorkspaceGetter(() => workspaceWithCell(["t1"]) as never);

    bus.dispatch("foo", "bar");
    expect(dispatch).toHaveBeenCalledWith("foo", "bar");
  });
});
