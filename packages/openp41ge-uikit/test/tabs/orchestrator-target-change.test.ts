/**
 * DragOrchestrator onTargetChange hook.
 *
 * The orchestrator notifies its host whenever the active drop target changes
 * (or becomes null). The host uses this to fade the drag ghost while the
 * cursor hovers a tab bar (so the drop indicator shows through). These tests
 * pin that the callback fires with the newly-resolved target on a target
 * change, and with null when the cursor leaves every target / the drag ends.
 */
import { describe, it, expect, afterEach } from "vitest";
import { DragOrchestrator } from "openp41ge-tabs/orchestrator";
import type { IDragSource, IDropTarget, DragResult, TargetFeedback } from "openp41ge-tabs/interfaces";

const cleanup: HTMLElement[] = [];
afterEach(() => {
  for (const c of cleanup) c.remove();
  cleanup.length = 0;
  document.body.style.overflow = "";
});

function makeTarget(type: string): IDropTarget {
  return {
    type,
    element: document.createElement("div"),
    onHover: () => null as TargetFeedback | null,
    onDrop: async () => ({ success: true }) as DragResult,
    onLeave: () => {},
  };
}

function makeSource(): IDragSource {
  return {
    type: "tab",
    createGhost: () => document.createElement("div"),
    getDragData: () => ({ type: "tab", tabId: "a", winId: "w1", worksetId: "0", title: "A" }),
    onDragStart: () => {},
    onDragEnd: () => {},
  };
}

/** A resolver that returns a fixed target (or null) for a given zone. */
function resolverFor(target: IDropTarget | null, hitX: number) {
  return (clientX: number) => (clientX >= hitX ? target : null);
}

function dragTo(orchestrator: DragOrchestrator, clientX: number, clientY: number): void {
  document.dispatchEvent(
    new MouseEvent("mousemove", {
      bubbles: true,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
    }),
  );
}

describe("DragOrchestrator onTargetChange", () => {
  it("fires with the new target when the cursor enters a target zone", () => {
    const target = makeTarget("tab-bar");
    const seen: Array<IDropTarget | null> = [];
    const orchestrator = new DragOrchestrator(resolverFor(target, 10), (t) => seen.push(t));

    orchestrator.startDrag(makeSource(), 0, 0);
    // Move past the threshold (3px) and into the target zone.
    dragTo(orchestrator, 20, 5);
    // Move further within the zone; no change → no extra callback.
    dragTo(orchestrator, 40, 6);

    expect(seen).toEqual([target]);
    orchestrator.cancelDrag();
  });

  it("fires with null when the cursor leaves every target", () => {
    const target = makeTarget("sidebar-tab-bar");
    const seen: Array<IDropTarget | null> = [];
    const orchestrator = new DragOrchestrator(resolverFor(target, 10), (t) => seen.push(t));

    orchestrator.startDrag(makeSource(), 0, 0);
    dragTo(orchestrator, 20, 5); // enter zone → target
    dragTo(orchestrator, 5, 5); // leave zone → null

    expect(seen).toEqual([target, null]);
    orchestrator.cancelDrag();
  });

  it("fires with null when the drag is cancelled/ends", () => {
    const target = makeTarget("manager-tab-bar");
    const seen: Array<IDropTarget | null> = [];
    const orchestrator = new DragOrchestrator(resolverFor(target, 10), (t) => seen.push(t));

    orchestrator.startDrag(makeSource(), 0, 0);
    dragTo(orchestrator, 20, 5); // enter zone → target
    expect(seen).toEqual([target]);

    orchestrator.cancelDrag();
    expect(seen).toEqual([target, null]);
  });

  it("does not fire a redundant null when no target was ever active", () => {
    const seen: Array<IDropTarget | null> = [];
    const orchestrator = new DragOrchestrator(() => null, (t) => seen.push(t));

    orchestrator.startDrag(makeSource(), 0, 0);
    dragTo(orchestrator, 5, 5);
    expect(seen).toEqual([]);

    orchestrator.cancelDrag();
    expect(seen).toEqual([]);
  });
});
