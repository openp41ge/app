import type { EventRouter } from "./event-router";

/**
 * DOM Bridge — intercepts browser-native DOM events and routes them
 * through the EventRouter.
 *
 * Captured on the document in capture phase. Native propagation is
 * suppressed via stopImmediatePropagation to prevent ad-hoc listeners
 * from also reacting.
 */
export class DOMBridge {
  private _router: EventRouter;
  private _attached = false;

  constructor(router: EventRouter) {
    this._router = router;
  }

  /** Start intercepting DOM events. */
  attach(): void {
    if (this._attached) return;
    this._attached = true;

    // Mousedown — determine which zone was clicked
    document.addEventListener(
      "mousedown",
      (e: MouseEvent) => {
        e.stopImmediatePropagation();
        const target = e.target as HTMLElement;
        const eventType = this._determineMousedownEvent(target, e.clientX);
        if (eventType) {
          this._router.emit(eventType, { x: e.clientX, y: e.clientY, target: target.tagName });
        }
      },
      true, // capture phase
    );

    // Window focus/blur
    window.addEventListener("focus", () => {
      this._router.emit("window-focus", {});
    });

    window.addEventListener("blur", () => {
      this._router.emit("window-blur", {});
    });
  }

  /** Stop intercepting DOM events. */
  detach(): void {
    // In practice, the bridge lives for the lifetime of the app.
    // This is here for completeness and testing.
    this._attached = false;
  }

  private _determineMousedownEvent(target: HTMLElement, clientX: number): string | null {
    const leftSidebar = document.querySelector("openp41ge-sidebar[side=left]");
    const rightSidebar = document.querySelector("openp41ge-sidebar[side=right]");
    const grid = document.querySelector("openp41ge-grid");

    if (leftSidebar?.contains(target)) {
      return "sidebar-click-left";
    }
    if (rightSidebar?.contains(target)) {
      return "sidebar-click-right";
    }
    if (grid?.contains(target)) {
      return "grid-click";
    }
    // Fallback: use X coordinate to guess zone
    const winWidth = window.innerWidth;
    if (clientX < winWidth * 0.2) return "sidebar-click-left";
    if (clientX > winWidth * 0.8) return "sidebar-click-right";
    return "grid-click";
  }
}
