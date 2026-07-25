/**
 * <openp41ge-confirm-modal> — reusable confirmation dialog.
 *
 * Usage:
 *   const modal = document.createElement("openp41ge-confirm-modal");
 *   modal.message = `Close "${name}"?`;
 *   modal.confirmLabel = "Close";
 *   document.body.appendChild(modal);
 *   const confirmed = await modal.waitForResult();
 *   modal.remove();
 */

class Openp41geConfirmModal extends HTMLElement {
  _message: string = "";
  _detail: string = "";
  _confirmLabel: string = "Confirm";
  _cancelLabel: string = "Cancel";
  _resolve: ((value: boolean) => void) | null = null;

  constructor() {
    super();
  }

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

  connectedCallback(): void {
    this._render();
    // Focus the cancel button by default
    this.querySelector<HTMLElement>(".scm-cancel")?.focus();
  }

  disconnectedCallback(): void {
    // Resolve false if dismissed without clicking a button
    if (this._resolve) {
      this._resolve(false);
      this._resolve = null;
    }
  }

  waitForResult(): Promise<boolean> {
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  private _render(): void {
    this.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:99999",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "background:rgba(0,0,0,0.5)",
    ].join(";");

    const dialog = document.createElement("div");
    dialog.style.cssText = [
      "background:#1e1e1e",
      "border:1px solid #333",
      "border-radius:8px",
      "padding:20px",
      "min-width:300px",
      "max-width:420px",
      "box-shadow:0 8px 32px rgba(0,0,0,0.5)",
    ].join(";");

    const title = document.createElement("div");
    title.textContent = this._message;
    title.style.cssText = "color:#e0e0e0;font-size:13px;font-weight:600;margin-bottom:12px;";

    dialog.appendChild(title);

    if (this._detail) {
      const detailEl = document.createElement("div");
      detailEl.textContent = this._detail;
      detailEl.style.cssText = "color:#888;font-size:11px;margin-bottom:16px;line-height:1.4;";
      dialog.appendChild(detailEl);
    }

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "scm-cancel";
    cancelBtn.textContent = this._cancelLabel;
    cancelBtn.style.cssText =
      "background:#2a2a2a;border:none;border-radius:4px;color:#bbb;font-size:12px;padding:6px 16px;cursor:pointer;outline:none;";
    cancelBtn.addEventListener("click", () => this._close(false));
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.background = "#333";
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.background = "#2a2a2a";
    });
    btnRow.appendChild(cancelBtn);

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "scm-confirm";
    confirmBtn.textContent = this._confirmLabel;
    confirmBtn.style.cssText =
      "background:#2a6fd1;border:none;border-radius:4px;color:#fff;font-size:12px;padding:6px 16px;cursor:pointer;outline:none;";
    confirmBtn.addEventListener("click", () => this._close(true));
    confirmBtn.addEventListener("mouseenter", () => {
      confirmBtn.style.background = "#3580e8";
    });
    confirmBtn.addEventListener("mouseleave", () => {
      confirmBtn.style.background = "#2a6fd1";
    });
    btnRow.appendChild(confirmBtn);

    dialog.appendChild(btnRow);
    this.appendChild(dialog);

    // Keyboard: Enter to confirm, Escape to cancel
    this.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this._close(false);
      }
      if (e.key === "Enter" && e.target === confirmBtn) {
        this._close(true);
      }
    });
  }

  private _close(result: boolean): void {
    if (this._resolve) {
      this._resolve(result);
      this._resolve = null;
    }
    this.remove();
  }
}

customElements.define("openp41ge-confirm-modal", Openp41geConfirmModal);

export { Openp41geConfirmModal };

/** Convenience: create, show, and await the modal. */
export function showConfirmModal(opts: {
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<boolean> {
  const modal = document.createElement("openp41ge-confirm-modal");
  modal.message = opts.message;
  if (opts.detail) modal.detail = opts.detail;
  if (opts.confirmLabel) modal.confirmLabel = opts.confirmLabel;
  if (opts.cancelLabel) modal.cancelLabel = opts.cancelLabel;
  document.body.appendChild(modal);
  return modal.waitForResult();
}
