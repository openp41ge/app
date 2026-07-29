/**
 * <openp41ge-clone-dialog> — Git clone dialog with progress (Lit).
 *
 * Events (bubbling):
 *   clone-start   — { url: string }
 *   clone-close   — {}
 */

import { LitElement, html } from "lit";
import { state, query } from "lit/decorators.js";

export class Openp41geCloneDialog extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @state() private _url = "";
  @state() private _progress = "";
  @state() private _cloning = false;
  @state() private _error = "";
  @query("#clone-url-input") private _input!: HTMLInputElement | null;

  connectedCallback(): void {
    super.connectedCallback();
    requestAnimationFrame(() => this._input?.focus());
  }

  get isCloning(): boolean {
    return this._cloning;
  }

  startClone(url: string): void {
    this._url = url;
    this._cloning = true;
    this._progress = "Cloning repository...";
    this._error = "";
    this.requestUpdate();
  }

  updateProgress(msg: string): void {
    this._progress = msg;
    this.requestUpdate();
  }

  setError(msg: string): void {
    this._error = msg;
    this._cloning = false;
    this.requestUpdate();
  }

  reset(): void {
    this._url = "";
    this._progress = "";
    this._cloning = false;
    this._error = "";
    this.requestUpdate();
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      if (!this._cloning) {
        this.dispatchEvent(new CustomEvent("clone-close", { bubbles: true }));
      }
    }
  }

  render() {
    return html`
      <div
        id="wt-addrepo-row"
        class="flex flex-col gap-1 px-3 py-1.5"
        @keydown=${this._onKeyDown}
      >
        <div class="flex items-center gap-1.5">
          <input
            id="clone-url-input"
            type="text"
            placeholder="Git clone URL"
            .value=${this._url}
            ?disabled=${this._cloning}
            class="flex-1 min-w-0 h-6 bg-bg-tertiary border border-[#3a3a3a] rounded text-[#e0e0e0] text-xs px-1.5 outline-none font-inherit"
            @input=${(e: InputEvent) => {
              this._url = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" && this._url.trim()) {
                this.dispatchEvent(
                  new CustomEvent("clone-start", {
                    bubbles: true,
                    detail: { url: this._url.trim() },
                  }),
                );
              }
            }}
          />
          <button
            class="h-[22px] px-2 bg-accent border-none rounded text-white text-xs cursor-pointer whitespace-nowrap ${this._cloning ? "opacity-50 cursor-default" : ""}"
            ?disabled=${this._cloning}
            @click=${() => {
              if (this._url.trim()) {
                this.dispatchEvent(
                  new CustomEvent("clone-start", {
                    bubbles: true,
                    detail: { url: this._url.trim() },
                  }),
                );
              }
            }}
          >
            ${this._cloning ? "Cloning..." : "Clone"}
          </button>
          ${
            !this._cloning
              ? html`
                  <button
                    class="h-[22px] px-1.5 bg-transparent border-none text-secondary text-13 cursor-pointer"
                    @click=${() => this.dispatchEvent(new CustomEvent("clone-close", { bubbles: true }))}
                  >
                    ×
                  </button>
                `
              : ""
          }
        </div>
        ${
          this._cloning
            ? html`
                <div class="flex items-center gap-1.5">
                  <div
                    class="w-3 h-3 shrink-0 border-2 border-[#444] border-t-accent rounded-full animate-[wt-spin_0.8s_linear_infinite]"
                  ></div>
                  <span class="text-secondary text-2xs">${this._progress}</span>
                </div>
              `
            : ""
        }
        ${
          this._error
            ? html`
                <div class="text-error text-2xs py-0.5">
                  ${this._error}
                  <button
                    class="ml-1 bg-transparent border-none text-accent cursor-pointer text-2xs underline"
                    @click=${() => {
                      this._error = "";
                      this.requestUpdate();
                    }}
                  >
                    Retry
                  </button>
                </div>
              `
            : ""
        }
      </div>
    `;
  }
}

customElements.define("openp41ge-clone-dialog", Openp41geCloneDialog);
