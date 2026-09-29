/**
 * DragOrchestrator onTargetChange hook.
 *
 * The orchestrator notifies its host whenever the active drop target changes
 * (or becomes null) OR the cursor's tab-bar hover state changes. The host uses
 * this to fade the drag ghost while the cursor is over a tab bar (so the drop
 * indicator shows through) and to soften the drop box. These tests pin that the
 * callback fires with the newly-resolved target on a target change, with null
 * when the cursor leaves every target / the drag ends, and that it fires a
 * second time (with `overTabBar` toggled) when the cursor moves between a tab
 * bar and the cell/sidebar body beneath the SAME resolved target.
 */
import { describe, it, expect, afterEach } from "vitest";
import { DragOrchestrator } from "openp41ge-tabs/orchestrator";
import type {
  IDragSource,
  IDropTarget,
  DragResult,
  TargetFeedback,
} from "openp41ge-tabs/interfaces";

const cleanup: HTMLElement[] = [];
afterEach(() => {
  for (const c of cleanup) c.remove();
  cleanup.length = 0;
  document.body.style.overflow = "";
});

function makeTarget(type: string, overTabBar: boolean = false): IDropTarget {
  return {
    type,
    element: document.createElement("div"),
    onHover: () => ({ overTabBar }) as TargetFeedback | null,
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

type Change = { target: IDropTarget | null; overTabBar: boolean };

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
    const orchestrator = new DragOrchestrator(
      () => null,
      (t) => seen.push(t),
    );

    orchestrator.startDrag(makeSource(), 0, 0);
    dragTo(orchestrator, 5, 5);
    expect(seen).toEqual([]);

    orchestrator.cancelDrag();
    expect(seen).toEqual([]);
  });

  it("fires `overTabBar: true` when the cursor moves onto a tab-bar target", () => {
    const target = makeTarget("tab-bar", true);
    const seen: Change[] = [];
    const orchestrator = new DragOrchestrator(resolverFor(target, 10), (t, o) =>
      seen.push({ target: t, overTabBar: o }),
    );

    orchestrator.startDrag(makeSource(), 0, 0);
    dragTo(orchestrator, 20, 5); // enter the tab-bar zone

    expect(seen).toEqual([{ target, overTabBar: true }]);
    orchestrator.cancelDrag();
  });

  it("toggles overTabBar without changing the resolved target", () => {
    // The SAME resolved sidebar target toggles its reported tab-bar state as the
    // cursor moves between the tab bar and the body. The host must be notified
    // so it can fade the ghost only while over the tab bar.
    let overTabBar = false;
    const target: IDropTarget = {
      type: "sidebar-tab-bar",
      element: document.createElement("div"),
      onHover: () => ({ overTabBar }) as TargetFeedback | null,
      onDrop: async () => ({ success: true }) as DragResult,
      onLeave: () => {},
    };
    const seen: Change[] = [];
    const orchestrator = new DragOrchestrator(resolverFor(target, 10), (t, o) =>
      seen.push({ target: t, overTabBar: o }),
    );

    orchestrator.startDrag(makeSource(), 0, 0);
    dragTo(orchestrator, 20, 5); // over the body (overTabBar=false) → target
    expect(seen).toEqual([{ target, overTabBar: false }]);

    overTabBar = true;
    dragTo(orchestrator, 30, 5); // over the tab bar (same target) → toggle
    expect(seen).toEqual([
      { target, overTabBar: false },
      { target, overTabBar: true },
    ]);

    overTabBar = false;
    dragTo(orchestrator, 40, 5); // back over the body → toggle again
    expect(seen).toEqual([
      { target, overTabBar: false },
      { target, overTabBar: true },
      { target, overTabBar: false },
    ]);

    orchestrator.cancelDrag();
  });

  it("does not re-fire when overTabBar is unchanged", () => {
    const target = makeTarget("tab-bar", true);
    const seen: Change[] = [];
    const orchestrator = new DragOrchestrator(resolverFor(target, 10), (t, o) =>
      seen.push({ target: t, overTabBar: o }),
    );

    orchestrator.startDrag(makeSource(), 0, 0);
    dragTo(orchestrator, 20, 5);
    dragTo(orchestrator, 30, 5);
    dragTo(orchestrator, 40, 5);

    expect(seen).toEqual([{ target, overTabBar: true }]);
    orchestrator.cancelDrag();
  });

  it("restores default state on cancel after a tab-bar hover", () => {
    const target = makeTarget("tab-bar", true);
    const seen: Change[] = [];
    const orchestrator = new DragOrchestrator(resolverFor(target, 10), (t, o) =>
      seen.push({ target: t, overTabBar: o }),
    );

    orchestrator.startDrag(makeSource(), 0, 0);
    dragTo(orchestrator, 20, 5); // over tab bar → dim
    orchestrator.cancelDrag(); // → restore

    expect(seen).toEqual([
      { target, overTabBar: true },
      { target: null, overTabBar: false },
    ]);
  });
});
