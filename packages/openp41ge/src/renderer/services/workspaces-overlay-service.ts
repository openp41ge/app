/**
 * WorkspacesOverlayService — manages the full-app workspaces overlay.
 *
 * The overlay covers only the tab/sidebar area (between the window title bar
 * and the bottom bar). It opens from the title-bar workspace button or the
 * File menu (New/Open Workspace). Only one overlay at a time; the title-bar
 * button toggles it.
 */

type Listener = () => void;

export type WorkspacesOverlayMode = "list" | "create";

class WorkspacesOverlayService {
  private _isOpen = false;
  private _mode: WorkspacesOverlayMode = "list";
  private _listeners: Set<Listener> = new Set();

  get isOpen(): boolean {
    return this._isOpen;
  }

  get mode(): WorkspacesOverlayMode {
    return this._mode;
  }

  /** Open the overlay, optionally straight into the create form. */
  open(mode: WorkspacesOverlayMode = "list"): void {
    if (this._isOpen && this._mode === mode) return;
    this._isOpen = true;
    this._mode = mode;
    this._notify();
  }

  /** Toggle open/closed (used by the title-bar workspace button). */
  toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open("list");
    }
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this._notify();
  }

  subscribe(fn: Listener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }
}

export const workspacesOverlayService = new WorkspacesOverlayService();
