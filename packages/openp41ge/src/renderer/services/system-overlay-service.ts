/**
 * SystemOverlayService — full-window "system overlay" with registerable tabs.
 *
 * The overlay replaces the old workspaces-only overlay and the legacy settings
 * modal: it is the surface where systems expose configuration + internal data
 * as a top-bar tab. Packages register a tab during startup via
 * `systemOverlayService.registerTab({ id, label, icon?, createController })`;
 * the overlay renders a top bar of registered tabs plus the active tab's
 * controller content.
 *
 * Only one overlay at a time. `open(mode, tab)` opens it (optionally straight
 * into a tab / mode); the title-bar button toggles it.
 */

import type { EditorSystemTabController } from "../controllers/types";

type Listener = () => void;

export type SystemOverlayMode = "list" | "create";

/** A tab a system can register for the system overlay top bar. */
export interface SystemOverlayTabRegistration {
  id: string;
  label: string;
  /** Optional unicode glyph shown before the label in the top bar. */
  icon?: string;
  createController: (tabId: string) => EditorSystemTabController;
}

class SystemOverlayService {
  private _isOpen = false;
  private _mode: SystemOverlayMode = "list";
  /** Tab the overlay should open/switch to (consumed by the overlay host). */
  private _requestedTab: string | null = null;
  /** Tab currently shown (reported by the overlay host). */
  private _activeTab: string | null = null;
  private _tabs = new Map<string, SystemOverlayTabRegistration>();
  private _listeners: Set<Listener> = new Set();

  get isOpen(): boolean {
    return this._isOpen;
  }

  get mode(): SystemOverlayMode {
    return this._mode;
  }

  /** Tab the host should adopt (defaults to the first registered tab). */
  get requestedTab(): string | null {
    return this._requestedTab;
  }

  /** Currently active feature tab (reported by the overlay host). */
  get activeTab(): string | null {
    return this._activeTab;
  }

  /** Registered tabs in registration order. */
  get registeredTabs(): SystemOverlayTabRegistration[] {
    return Array.from(this._tabs.values());
  }

  /** First registered tab id, or null when nothing is registered yet. */
  get defaultTabId(): string | null {
    return this._tabs.values().next().value?.id ?? null;
  }

  /**
   * Register a system overlay tab (idempotent by id — re-registering replaces
   * the existing registration, useful for hot reload / overrides).
   */
  registerTab(reg: SystemOverlayTabRegistration): void {
    this._tabs.set(reg.id, reg);
  }

  /** Remove a previously registered tab. */
  unregisterTab(id: string): void {
    this._tabs.delete(id);
  }

  getTab(id: string): SystemOverlayTabRegistration | undefined {
    return this._tabs.get(id);
  }

  /**
   * Open the overlay (or switch to a tab if already open).
   * If `tab` is given the overlay switches to that feature tab; otherwise it
   * falls back to the previously requested tab or the first registered tab.
   */
  open(mode?: SystemOverlayMode, tab?: string): void {
    this._requestedTab = tab ?? this._requestedTab;
    if (mode !== undefined) this._mode = mode;
    if (this._isOpen) {
      // Already open — re-notify so a newly requested tab is adopted.
      this._notify();
      return;
    }
    this._isOpen = true;
    this._notify();
  }

  /** Toggle open/closed (used by the title-bar workspace button). */
  toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Open the overlay on a specific tab (default mode). */
  openTab(tab: string): void {
    this.open("list", tab);
  }

  /** Report the tab the overlay host is currently showing. */
  reportActiveTab(tab: string): void {
    this._activeTab = tab;
  }

  /** Consume + reset the tab requested on the last open. */
  takeRequestedTab(): string | null {
    const t = this._requestedTab;
    this._requestedTab = null;
    return t;
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

export const systemOverlayService = new SystemOverlayService();
