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
  "bg-accent border-none rounded text-white text-sm px-4 py-1.5 cursor-pointer";
const DEFAULT_CANCEL_STYLE =
  "bg-bg-tertiary border-none rounded text-secondary text-sm px-4 py-1.5 cursor-pointer outline-none";

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
  @property() _checkboxLabel = "";
  @property() _checkboxDetail = "";
  // Not a @property(): toggling must NOT trigger a Lit re-render, because
  // render() short-circuits to empty after the first paint (_renderDone).
  // Keeping this a plain field lets the native input reflect its own state.
  private _checked = false;

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
    // Map legacy style names to Tailwind classes
    if (v === "danger") {
      // Faded danger background + bright danger text (matches the
      // workspace-manager footer's Delete/Save button pattern).
      this._confirmStyle = "openp41ge-confirm-danger rounded px-4 py-1.5 text-sm border-none cursor-pointer";
    } else if (v.includes(";") || v.includes(":")) {
      // Legacy inline style string — keep as-is for backward compat
      this._confirmStyle = v;
    } else {
      this._confirmStyle = v;
    }
  }
  get checkboxLabel(): string {
    return this._checkboxLabel;
  }
  set checkboxLabel(v: string) {
    this._checkboxLabel = v;
  }
  get checkboxDetail(): string {
    return this._checkboxDetail;
  }
  set checkboxDetail(v: string) {
    this._checkboxDetail = v;
  }
  get checked(): boolean {
    return this._checked;
  }
  private _resolve: ((value: { confirmed: boolean; checked: boolean }) => void) | null = null;
  private _cleanup: (() => void) | null = null;
  private _renderDone = false;

  waitForResult(): Promise<boolean> {
    return this.waitForConfirm().then((r) => r.confirmed);
  }

  waitForConfirm(): Promise<{ confirmed: boolean; checked: boolean }> {
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
        .openp41ge-confirm-ok.openp41ge-confirm-danger { background: rgba(244,71,71,0.15); color: #f44747; transition: background .1s; }
        .openp41ge-confirm-ok.openp41ge-confirm-danger:hover { background: rgba(244,71,71,0.25); }
        .openp41ge-confirm-ok.openp41ge-confirm-danger:focus { outline: 2px solid #f44747 !important; }
        .openp41ge-confirm-checkbox-card input[type="checkbox"] { appearance: none; -webkit-appearance: none; width: 14px; height: 14px; border: 1px solid rgba(255,255,255,0.28); border-radius: 4px; background: rgba(255,255,255,0.06); cursor: pointer; position: relative; flex-shrink: 0; margin-top: 2px; outline: none; }
        .openp41ge-confirm-checkbox-card input[type="checkbox"]:hover { border-color: rgba(255,255,255,0.5); }
        .openp41ge-confirm-checkbox-card input[type="checkbox"]:focus-visible { outline: 2px solid #4a9eff; outline-offset: 2px; }
        .openp41ge-confirm-checkbox-card input[type="checkbox"]:checked { background: #007acc; border-color: #007acc; }
        .openp41ge-confirm-checkbox-card input[type="checkbox"]:checked::after { content: ""; position: absolute; left: 4px; top: 1px; width: 4px; height: 8px; border: solid #fff; border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); box-sizing: border-box; }
        .openp41ge-confirm-checkbox-card { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.16); transition: border-color .15s, background .15s; }
        .openp41ge-confirm-checkbox-card:hover { border-color: rgba(255,255,255,0.35); }
        .openp41ge-confirm-checkbox-card:has(input:checked) { border-color: #007acc; background: rgba(0,122,204,0.08); }
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
    this._resolve?.({ confirmed: result, checked: result ? this._checked : false });
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
          class="text-13 font-semibold text-primary mb-2"
        >
          ${this._title}
        </div>`
      : "";

    const detailPart = this._detail
      ? html`<div
          class="text-sm text-muted mb-4 leading-[1.4]"
        >
          ${this._detail}
        </div>`
      : "";

    const checkboxPart = this._checkboxLabel
      ? html`<label
          class="openp41ge-confirm-checkbox openp41ge-confirm-checkbox-card flex items-start gap-2.5 mb-4 cursor-pointer select-none rounded-lg border px-3 py-2.5"
        >
          <input
            type="checkbox"
            .checked=${this._checked}
            @change=${(e: Event) => {
              this._checked = (e.target as HTMLInputElement).checked;
            }}
          />
          <span class="flex-1 min-w-0">
            <span class="block text-xs font-medium text-primary leading-snug">${this._esc(this._checkboxLabel)}</span>
            ${this._checkboxDetail
              ? html`<span class="block text-[11px] text-secondary leading-snug mt-0.5">${this._esc(this._checkboxDetail)}</span>`
              : ""}
          </span>
        </label>`
      : "";

    return html`
      <div
        class="fixed inset-0 z-[10000] bg-[rgba(0,0,0,0.5)] flex items-center justify-center"
        @click=${(e: MouseEvent) => {
          if ((e.target as HTMLElement) === e.currentTarget) this._done(false);
        }}
      >
        <div
          class="bg-bg-primary border border-border-color rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] px-6 py-5 min-w-[320px] max-w-[420px]"
        >
          ${titlePart}
          <div
            class="text-13 text-secondary whitespace-pre-line mb-${detailPart ? "1" : "4"}"
          >
            ${this._message}
          </div>
          ${detailPart}
          ${checkboxPart}
          <div class="flex gap-2 justify-start">
            <button
              class="openp41ge-confirm-cancel ${DEFAULT_CANCEL_STYLE}"
              @click=${() => this._done(false)}
            >
              ${this._cancelLabel}
            </button>
            <button
              class="openp41ge-confirm-ok ${this._confirmStyle}"
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
          // Activate whichever button/checkbox is currently focused
          const cancelBtn = this.querySelector(".openp41ge-confirm-cancel") as HTMLElement | null;
          const checkbox = this.querySelector(".openp41ge-confirm-checkbox input") as HTMLInputElement | null;
          if (document.activeElement === cancelBtn) {
            this._done(false);
          } else if (checkbox && document.activeElement === checkbox) {
            // Toggle the checkbox without confirming
            checkbox.checked = !checkbox.checked;
            this._checked = checkbox.checked;
          } else {
            this._done(true);
          }
        } else if (e.key === "Tab") {
          e.preventDefault();
          // Cycle focus through [checkbox?, cancel, confirm]
          const cancelBtn = this.querySelector(".openp41ge-confirm-cancel") as HTMLElement | null;
          const okBtn = this.querySelector(".openp41ge-confirm-ok") as HTMLElement | null;
          const checkbox = this.querySelector(".openp41ge-confirm-checkbox input") as HTMLInputElement | null;
          const focusable: HTMLElement[] = [];
          if (checkbox) focusable.push(checkbox);
          if (cancelBtn) focusable.push(cancelBtn);
          if (okBtn) focusable.push(okBtn);
          const idx = focusable.indexOf(document.activeElement as HTMLElement);
          if (idx === -1) {
            focusable[0]?.focus();
          } else {
            const next = e.shiftKey
              ? (idx - 1 + focusable.length) % focusable.length
              : (idx + 1) % focusable.length;
            focusable[next]?.focus();
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

export type ShowConfirmOptions = {
  message: string;
  title?: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: string;
  checkboxLabel?: string;
  checkboxDetail?: string;
};

export type ShowConfirmResult = { confirmed: boolean; checked: boolean };

export function showConfirmModal(
  options: ShowConfirmOptions & { checkboxLabel?: undefined },
): Promise<boolean>;
export function showConfirmModal(
  options: ShowConfirmOptions & { checkboxLabel: string },
): Promise<ShowConfirmResult>;
export function showConfirmModal(options: ShowConfirmOptions): Promise<boolean | ShowConfirmResult> {
  const modal = document.createElement("openp41ge-confirm-modal") as Openp41geConfirmModal;
  modal.message = options.message;
  if (options.title) modal.title = options.title;
  if (options.detail) modal.detail = options.detail;
  modal.confirmLabel = options.confirmLabel ?? "Confirm";
  modal.cancelLabel = options.cancelLabel ?? "Cancel";
  if (options.confirmStyle) modal.confirmStyle = options.confirmStyle;
  if (options.checkboxLabel) modal.checkboxLabel = options.checkboxLabel;
  if (options.checkboxDetail) modal.checkboxDetail = options.checkboxDetail;
  document.body.appendChild(modal);
  return options.checkboxLabel
    ? modal.waitForConfirm()
    : modal.waitForResult();
}
