/**
 * ModalStateService — application-wide modal state machine.
 *
 * Manages application states: default, confirmation, projects.
 * Each modal state scopes keyboard and pointer controls to the active modal,
 * preventing them from reaching default application handlers.
 *
 * States:
 *   default       — normal app operation, no modal visible
 *   confirmation  — confirm/cancel dialog (existing <openp41ge-confirm-modal>)
 *   projects      — project picker/creator (new <openp41ge-project-picker>)
 *
 * The service provides:
 *   - Enter/exit methods for each state
 *   - Keyboard event capture (Escape to dismiss, arrows + Enter for lists)
 *   - Focus trap management
 *   - State change notifications via callback
 */

import { createLogger } from "openp41ge-logger";

const log = createLogger("modal-state-service");

export type ModalState = "default" | "confirmation" | "projects";

export interface ModalStateChangeListener {
  (state: ModalState, previous: ModalState): void;
}

export class ModalStateService {
  private _state: ModalState = "default";
  private _previous: ModalState = "default";
  private _listeners: Set<ModalStateChangeListener> = new Set();
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _focusTrapElement: HTMLElement | null = null;

  /** Get the current modal state. */
  get state(): ModalState {
    return this._state;
  }

  /** Subscribe to state changes. Returns unsubscribe function. */
  onChange(listener: ModalStateChangeListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Notify all listeners of a state change. */
  private _notify(newState: ModalState): void {
    for (const listener of this._listeners) {
      try {
        listener(newState, this._previous);
      } catch (err) {
        log.error("ModalStateChangeListener error:", err);
      }
    }
  }

  // ─── State transitions ──────────────────────────────────────────────

  /** Enter a modal state — captures keyboard events. */
  private _enter(state: ModalState): void {
    if (this._state === state) return;
    this._previous = this._state;
    this._state = state;
    this._installKeyboardCapture();
    this._notify(state);
    log.info(`modal state: ${this._previous} → ${state}`);
  }

  /** Return to default state — releases keyboard capture. */
  private _exitToDefault(): void {
    if (this._state === "default") return;
    this._previous = this._state;
    this._state = "default";
    this._releaseKeyboardCapture();
    this._notify("default");
    log.info(`modal state: ${this._previous} → default`);
  }

  // ─── Public API ─────────────────────────────────────────────────────

  /** Show a confirmation modal. */
  showConfirmation(): void {
    this._enter("confirmation");
  }

  /** Show the project picker/creator modal. */
  showProjects(): void {
    this._enter("projects");
  }

  /** Dismiss the current modal and return to default. */
  dismiss(): void {
    this._exitToDefault();
  }

  /** Set the focus trap element for keyboard navigation within the modal. */
  setFocusTrap(element: HTMLElement | null): void {
    this._focusTrapElement = element;
  }

  // ─── Keyboard capture ──────────────────────────────────────────────

  private _installKeyboardCapture(): void {
    if (this._keyHandler) return;
    this._keyHandler = (e: KeyboardEvent) => {
      // Global handler for all modal states
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.dismiss();
        // Dispatch a custom event so the active modal element can clean up
        document.dispatchEvent(new CustomEvent("modal:dismiss"));
        return;
      }

      // Delegate to the active modal's keyboard handler if one is set
      if (this._focusTrapElement) {
        const customEvent = new CustomEvent("modal:keydown", {
          detail: { key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey },
          cancelable: true,
        });
        this._focusTrapElement.dispatchEvent(customEvent);
        if (customEvent.defaultPrevented) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    // Capture during capture phase so we intercept before app handlers
    document.addEventListener("keydown", this._keyHandler, true);
  }

  private _releaseKeyboardCapture(): void {
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler, true);
      this._keyHandler = null;
    }
    this._focusTrapElement = null;
  }
}
