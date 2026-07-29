/**
 * <openp41ge-scope-expand-modal> — confirmation dialog for worktree scope expansion.
 *
 * Shown when a file-scoped tab (file-viewer, agent-chat, git-repository) is
 * dragged to a different openp41ge whose worktree explorer doesn't show the tab's
 * referenced files. The user can confirm to expand visibility and proceed with
 * the move, or cancel to abort.
 *
 * Usage:
 *   const modal = document.createElement("openp41ge-scope-expand-modal");
 *   modal.proposedAdditions = ["/Users/me/repos/project-a"];
 *   modal.tabType = "File Editor";
 *   document.body.appendChild(modal);
 *   const result = await modal.waitForResult();
 *   modal.remove();
 *
 * Result: boolean — true = "Expand & Move", false = "Cancel"
 *
 * Styling is consistent with <openp41ge-confirm-modal> — same CSS variables,
 * overlay, button proportions, and keyboard handling.
 */

import { LitElement, html, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import { appServices } from "../app";

const DEFAULT_EXPAND_STYLE =
  "bg-accent border-none rounded text-white text-sm px-4 py-1.5 cursor-pointer";
const DEFAULT_CANCEL_STYLE =
  "bg-bg-tertiary border-none rounded text-secondary text-sm px-4 py-1.5 cursor-pointer outline-none";

export class Openp41geScopeExpandModal extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  /**
   * Directories or file paths that will be added to the destination openp41ge's
   * worktree visibility if the user confirms.
   */
  @property() _proposedAdditions: string[] = [];

  /** Human-readable tab type label (e.g., "File Editor", "Agent Chat", "Git Repository"). */
  @property() _tabType = "Tab";

  get proposedAdditions(): string[] {
    return this._proposedAdditions;
  }
  set proposedAdditions(v: string[]) {
    this._proposedAdditions = v;
  }

  get tabType(): string {
    return this._tabType;
  }
  set tabType(v: string) {
    this._tabType = v;
  }

  private _resolve: ((value: boolean) => void) | null = null;
  private _cleanup: (() => void) | null = null;
  private _renderDone = false;

  waitForResult(): Promise<boolean> {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._renderDone = false;
      this.performUpdate();
    });
  }

  connectedCallback(): void {
    super.connectedCallback();
    appServices.keyboardManager.pushModal();
    if (!document.getElementById("openp41ge-scope-expand-style")) {
      const s = document.createElement("style");
      s.id = "openp41ge-scope-expand-style";
      s.textContent = `
        .openp41ge-scope-ok:focus { outline: 2px solid #4a9eff !important; outline-offset: 2px; }
        .openp41ge-scope-cancel:focus { outline: 2px solid #4a9eff !important; outline-offset: 2px; }
      `;
      document.head.appendChild(s);
    }
    this.addEventListener("click", (e: MouseEvent) => {
      if (e.target === this) this._done(false);
    });
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

  render(): TemplateResult {
    if (this._renderDone) return html``;
    this._renderDone = true;

    const pathsHtml = this._proposedAdditions
      .map(
        (p) =>
          `<div class="py-0.5 font-mono text-xs text-secondary">${this._esc(p)}</div>`,
      )
      .join("");

    return html`
      <div
        class="fixed inset-0 z-[10000] bg-[rgba(0,0,0,0.5)] flex items-center justify-center"
      >
        <div
          class="bg-bg-primary border border-border-color rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] px-6 py-5 min-w-[360px] max-w-[480px]"
        >
          <div
            class="text-13 font-semibold text-primary mb-2 flex items-center gap-2"
          >
            <span>🔍</span>
            <span>Expand Worktree Visibility?</span>
          </div>
          <div class="text-sm text-muted mb-3 leading-[1.5]">
            This ${this._esc(this._tabType)} tab references files from:
          </div>
          <div
            class="bg-bg-tertiary rounded p-2 mb-3 max-h-[120px] overflow-y-auto"
          >
            ${
              this._proposedAdditions.length > 0
                ? html`${this._unsafeHtml(pathsHtml)}`
                : html`<div class="text-xs text-muted">(no paths)</div>`
            }
          </div>
          <div
            class="text-sm text-secondary mb-4 leading-[1.4]"
          >
            Moving it to this openp41ge will also show these directories in the worktree explorer.
            You can manage worktree visibility anytime from the explorer.
          </div>
          <div class="flex gap-2 justify-start">
            <button
              class="openp41ge-scope-cancel ${DEFAULT_CANCEL_STYLE}"
              @click=${() => this._done(false)}
            >
              Cancel
            </button>
            <button
              class="openp41ge-scope-ok ${DEFAULT_EXPAND_STYLE}"
              @click=${() => this._done(true)}
            >
              Expand &amp; Move
            </button>
          </div>
        </div>
      </div>
    `;
  }

  updated(): void {
    if (this._renderDone) {
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          this._done(false);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const cancelBtn = this.querySelector(".openp41ge-scope-cancel") as HTMLElement | null;
          if (document.activeElement === cancelBtn) {
            this._done(false);
          } else {
            this._done(true);
          }
        } else if (e.key === "Tab") {
          e.preventDefault();
          const cancelBtn = this.querySelector(".openp41ge-scope-cancel") as HTMLElement | null;
          const okBtn = this.querySelector(".openp41ge-scope-ok") as HTMLElement | null;
          if (e.shiftKey) {
            if (document.activeElement === okBtn && cancelBtn) {
              cancelBtn.focus();
            } else if (cancelBtn && okBtn) {
              okBtn.focus();
            }
          } else {
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

      requestAnimationFrame(() => {
        const okBtn = this.querySelector(".openp41ge-scope-ok") as HTMLElement | null;
        if (okBtn && document.activeElement !== okBtn) {
          okBtn.focus();
        }
      });
    }
  }

  private _esc(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  private _unsafeHtml(htmlStr: string): TemplateResult {
    // We use a div and innerHTML to inject pre-escaped HTML for the path listing.
    // The paths are already escaped via _esc() before being inserted.
    return html`<div>${htmlStr}</div>` as unknown as TemplateResult;
  }
}

customElements.define("openp41ge-scope-expand-modal", Openp41geScopeExpandModal);

/**
 * Show the scope expansion modal and return a promise that resolves to
 * true (Expand & Move) or false (Cancel).
 */
export function showScopeExpandModal(options: {
  proposedAdditions: string[];
  tabType?: string;
}): Promise<boolean> {
  const modal = document.createElement("openp41ge-scope-expand-modal") as Openp41geScopeExpandModal;
  modal.proposedAdditions = options.proposedAdditions;
  if (options.tabType) modal.tabType = options.tabType;
  document.body.appendChild(modal);
  return modal.waitForResult();
}
