/**
 * ServiceModalService — manages a single visible modal.
 *
 * Only one modal can be open at a time. Opening a new modal while one is
 * visible closes the current one first. Components and handlers call
 * `openModal()` / `closeModal()` on this service.
 */

import type { EditorSystemTabController } from "../controllers/types";
import type { IKeyboardManager } from "../interfaces/keyboard-manager";
import { getEditorSystemTabRegistration } from "../apps/app-registry";

export type ModalAppType = "workspace-manager" | "settings";

interface ModalState {
  appType: ModalAppType;
  controller: EditorSystemTabController;
}

class ServiceModalService {
  private _current: ModalState | null = null;
  private _listeners: Set<() => void> = new Set();
  private _keyboardManager: IKeyboardManager | null = null;

  /** Inject the keyboard manager to enable shortcut suppression while modal is open. */
  setKeyboardManager(km: IKeyboardManager): void {
    this._keyboardManager = km;
  }

  /** True when a modal is currently open. */
  get isOpen(): boolean {
    return this._current !== null;
  }

  /** The currently visible app type, or null. */
  get currentAppType(): ModalAppType | null {
    return this._current?.appType ?? null;
  }

  /** Open a modal. Closes the current one if another is open. */
  openModal(appType: ModalAppType): void {
    if (this._current?.appType === appType) {
      // Same modal already open — close it (toggle)
      this.closeModal();
      return;
    }

    // Close current if any
    if (this._current) {
      this._current.controller.unmount?.();
      this._current = null;
    } else {
      // Only push modal if there wasn't a previous one to close
      this._keyboardManager?.pushModal();
    }

    // Look up the registration for this app type
    const reg = getEditorSystemTabRegistration(appType);
    if (!reg) {
      console.warn(`[ServiceModal] No registration for appType "${appType}"`);
      return;
    }

    const controller = reg.createController(`modal-${appType}-${Date.now()}`);
    controller.mount?.();
    this._current = { appType, controller };
    this._notify();
  }

  /** Close the current modal, if any. */
  closeModal(): void {
    if (!this._current) return;
    this._current.controller.unmount?.();
    this._current = null;
    this._keyboardManager?.popModal();
    this._notify();
  }

  /** Get the current modal's controller, if any. */
  getController(): EditorSystemTabController | null {
    return this._current?.controller ?? null;
  }

  /** Subscribe to open/close changes. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }
}

export const serviceModalService = new ServiceModalService();
