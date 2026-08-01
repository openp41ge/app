/**
 * ProjectPickerController — tab controller that renders the project picker
 * as an ephemeral tab inside the grid.
 *
 * Uses the existing <openp41ge-project-picker> component in inline mode.
 * The tab closes automatically when defocused (handled by the event handler),
 * or when the user presses Escape or clicks the close button.
 */

import { BaseController } from "../../controllers/base-controller";
import type { TabController } from "../../controllers/types";
import { createLogger } from "openp41ge-logger";
import { emitEvent } from "../../app";

const _log = createLogger("project-picker-controller");

export class ProjectPickerController extends BaseController implements TabController {
  private _pickerEl: HTMLElement | null = null;
  private _disconnected = false;
  private _boundOnSelected: ((e: Event) => void) | null = null;
  private _boundOnDismissed: ((e: Event) => void) | null = null;
  private _boundOnKeyDown: ((e: KeyboardEvent) => void) | null = null;

  constructor(tabId: string, appType: string) {
    super(tabId, appType);
  }

  mount(container: HTMLElement): void {
    this._disconnected = false;
    this.container = container;
    container.style.cssText =
      "width:100%;height:100%;overflow:hidden;background:var(--bg-primary, #1e1e1e);display:flex;flex-direction:column;";

    // Import and create the picker element
    import("../../components/openp41ge-project-picker").then(() => {
      if (this._disconnected || !this.container) return;

      const picker = document.createElement(
        "openp41ge-project-picker",
      ) as HTMLElement & { inline: boolean };
      picker.inline = true;
      this.container.appendChild(picker);
      this._pickerEl = picker;

      // Focus the search input after mount
      requestAnimationFrame(() => {
        const input = picker.shadowRoot?.querySelector(
          ".search-row input",
        ) as HTMLInputElement | null;
        if (input) input.focus();
      });

      // Wire up project selection
      this._boundOnSelected = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.name) {
          this._closeTab();
        }
      };
      picker.addEventListener("project:selected", this._boundOnSelected);

      // Wire up dismissal (Escape / close button)
      this._boundOnDismissed = () => {
        this._closeTab();
      };
      picker.addEventListener("project:dismissed", this._boundOnDismissed);

      // Keyboard: Escape to close
      this._boundOnKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          this._closeTab();
        }
      };
      picker.addEventListener("keydown", this._boundOnKeyDown);
    });
  }

  unmount(): void {
    this._disconnected = true;
    this._cleanup();
    if (this._pickerEl && this._pickerEl.parentElement) {
      this._pickerEl.remove();
    }
    this._pickerEl = null;
    this.container = null;
  }

  setVisible(_visible: boolean): void {
    // no special handling
  }

  snapshot(): Record<string, unknown> {
    // Ephemeral tabs are never persisted
    return {};
  }

  restore(_state: Record<string, unknown>): void {
    // Nothing to restore
  }

  private _closeTab(): void {
    if (this._disconnected) return;
    const winId = window.openp41ge.workspace.getWindowId();
    if (winId) {
      emitEvent("tab-remove-column", { windowId: winId, tabId: this.tabId });
    }
  }

  private _cleanup(): void {
    const picker = this._pickerEl;
    if (picker) {
      if (this._boundOnSelected) {
        picker.removeEventListener("project:selected", this._boundOnSelected);
      }
      if (this._boundOnDismissed) {
        picker.removeEventListener("project:dismissed", this._boundOnDismissed);
      }
      if (this._boundOnKeyDown) {
        picker.removeEventListener("keydown", this._boundOnKeyDown);
      }
    }
    this._boundOnSelected = null;
    this._boundOnDismissed = null;
    this._boundOnKeyDown = null;
  }
}
