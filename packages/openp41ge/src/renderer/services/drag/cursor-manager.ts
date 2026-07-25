/**
 * CursorManager — manages the "grabbing" cursor style during drag.
 *
 * Creates a single <style> element with `cursor: grabbing !important`
 * on `body.openp41ge-dragging` and toggles the body class. Only one style
 * element exists per session.
 */

export class CursorManager {
  private _active = false;

  /** Apply grabbing cursor. Safe to call multiple times — no-op on repeat. */
  enable(): void {
    if (this._active) return;
    if (document.getElementById("openp41ge-drag-cursor")) return;

    const style = document.createElement("style");
    style.id = "openp41ge-drag-cursor";
    style.textContent =
      "body.openp41ge-dragging, body.openp41ge-dragging * { cursor: grabbing !important; }";
    document.head.appendChild(style);
    document.body.classList.add("openp41ge-dragging");
    this._active = true;
  }

  /** Remove grabbing cursor. Safe to call multiple times. */
  disable(): void {
    const style = document.getElementById("openp41ge-drag-cursor");
    if (style) style.remove();
    document.body.classList.remove("openp41ge-dragging");
    this._active = false;
  }

  get isActive(): boolean {
    return this._active;
  }
}
