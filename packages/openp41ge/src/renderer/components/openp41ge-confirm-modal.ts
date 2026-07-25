/**
 * <openp41ge-confirm-modal> — reusable confirmation dialog (Lit).
 *
 * Usage:
 *   const modal = document.createElement("openp41ge-confirm-modal");
 *   modal.message = `Close "${name}"?`;
 *   modal.confirmLabel = "Close";
 *   document.body.appendChild(modal);
 *   const confirmed = await modal.waitForResult();
 *   modal.remove();
 */

import { LitElement, html, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import { appServices } from "../app";

const DEFAULT_CONFIRM_STYLE =
  "background:var(--accent);border:none;border-radius:4px;color:#fff;font-size:12px;padding:6px 16px;cursor:pointer;";
const DEFAULT_CANCEL_STYLE =
  "background:var(--bg-tertiary);border:none;border-radius:4px;color:var(--text-secondary);font-size:12px;padding:6px 16px;cursor:pointer;outline:none;";

class Openp41geConfirmModal extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property() _message = "";
  @property() _detail = "";
  @property() _title = "";
  @property() _confirmLabel = "Confirm";
  @property() _cancelLabel = "Cancel";
  @property() _confirmStyle = DEFAULT_CONFIRM_STYLE;

  get message(): string {
    return this._message;
  }
  set message(v: string) {
    this._message = v;
  }
  get detail(): string {
    return this._detail;
  }
  set detail(v: string) {
    this._detail = v;
  }
  get title(): string {
    return this._title;
  }
  set title(v: string) {
    this._title = v;
  }
  get confirmLabel(): string {
    return this._confirmLabel;
  }
  set confirmLabel(v: string) {
    this._confirmLabel = v;
  }
  get cancelLabel(): string {
    return this._cancelLabel;
  }
  set cancelLabel(v: string) {
    this._cancelLabel = v;
  }
  get confirmStyle(): string {
    return this._confirmStyle;
  }
  set confirmStyle(v: string) {
    this._confirmStyle = v;
  }

  private _resolve: ((value: boolean) => void) | null = null;
  private _cleanup: (() => void) | null = null;
  private _renderDone = false;

  waitForResult(): Promise<boolean> {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._renderDone = false;
      // Perform update synchronously so DOM is available immediately
      this.performUpdate();
    });
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Lock the keyboard manager so all shortcuts are suppressed
    appServices.keyboardManager.pushModal();
    // Inject focus styles for both modal buttons
    if (!document.getElementById("openp41ge-confirm-style")) {
      const s = document.createElement("style");
      s.id = "openp41ge-confirm-style";
      s.textContent = `
        .openp41ge-confirm-ok:focus { outline: 2px solid #4a9eff !important; outline-offset: 2px; }
        .openp41ge-confirm-cancel:focus { outline: 2px solid #4a9eff !important; outline-offset: 2px; }
      `;
      document.head.appendChild(s);
    }
    // Backdrop click handler is defined in render() as @click on the overlay div
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    appServices.keyboardManager.popModal();
    this._cleanup?.();
  }

  private _done(result: boolean): void {
    this._cleanup?.();
    this._cleanup = null;
    this._resolve?.(result);
    this.remove();
  }

  private _esc(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  render(): TemplateResult {
    if (this._renderDone) return html``;
    this._renderDone = true;

    const titlePart = this._title
      ? html`<div
          style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:8px;"
        >
          ${this._title}
        </div>`
      : "";

    const detailPart = this._detail
      ? html`<div
          style="font-size:12px;color:var(--text-muted);margin-bottom:16px;line-height:1.4;"
        >
          ${this._detail}
        </div>`
      : "";

    return html`
      <div
        style="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;"
        @click=${(e: MouseEvent) => {
          if ((e.target as HTMLElement) === e.currentTarget) this._done(false);
        }}
      >
        <div
          style="background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5);padding:20px 24px;min-width:320px;max-width:420px;"
        >
          ${titlePart}
          <div
            style="font-size:13px;color:var(--text-secondary);white-space:pre-line;margin-bottom:${detailPart ? "4" : "16"}px;"
          >
            ${this._message}
          </div>
          ${detailPart}
          <div style="display:flex;gap:8px;justify-content:flex-start;">
            <button
              class="openp41ge-confirm-cancel"
              style="${DEFAULT_CANCEL_STYLE}"
              @click=${() => this._done(false)}
            >
              ${this._cancelLabel}
            </button>
            <button
              class="openp41ge-confirm-ok"
              style="${this._confirmStyle}"
              @click=${() => this._done(true)}
            >
              ${this._confirmLabel}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  updated(): void {
    if (this._renderDone) {
      // Keyboard: Tab focus cycle, Enter confirms, Escape cancels
      // Register synchronously (not inside RAF) so it's active immediately.
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          this._done(false);
        } else if (e.key === "Enter") {
          e.preventDefault();
          // Activate whichever button is currently focused
          const cancelBtn = this.querySelector(".openp41ge-confirm-cancel") as HTMLElement | null;
          if (document.activeElement === cancelBtn) {
            this._done(false);
          } else {
            this._done(true);
          }
        } else if (e.key === "Tab") {
          e.preventDefault();
          const cancelBtn = this.querySelector(".openp41ge-confirm-cancel") as HTMLElement | null;
          const okBtn = this.querySelector(".openp41ge-confirm-ok") as HTMLElement | null;
          if (e.shiftKey) {
            // Shift+Tab: go backwards — Cancel → Confirm
            if (document.activeElement === okBtn && cancelBtn) {
              cancelBtn.focus();
            } else if (cancelBtn && okBtn) {
              okBtn.focus();
            }
          } else {
            // Tab: go forwards — Confirm → Cancel
            if (document.activeElement === cancelBtn && okBtn) {
              okBtn.focus();
            } else if (okBtn && cancelBtn) {
              cancelBtn.focus();
            }
          }
        }
      };
      document.addEventListener("keydown", keyHandler);
      this._cleanup = () => document.removeEventListener("keydown", keyHandler);

      // Auto-focus the Confirm button when the modal opens
      requestAnimationFrame(() => {
        const okBtn = this.querySelector(".openp41ge-confirm-ok") as HTMLElement | null;
        if (okBtn && document.activeElement !== okBtn) {
          okBtn.focus();
        }
      });
    }
  }
}

customElements.define("openp41ge-confirm-modal", Openp41geConfirmModal);

export function showConfirmModal(options: {
  message: string;
  title?: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: string;
}): Promise<boolean> {
  const modal = document.createElement("openp41ge-confirm-modal") as Openp41geConfirmModal;
  modal.message = options.message;
  if (options.title) modal.title = options.title;
  if (options.detail) modal.detail = options.detail;
  modal.confirmLabel = options.confirmLabel ?? "Confirm";
  modal.cancelLabel = options.cancelLabel ?? "Cancel";
  if (options.confirmStyle) modal.confirmStyle = options.confirmStyle;
  document.body.appendChild(modal);
  return modal.waitForResult();
}
