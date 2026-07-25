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
        style="display:flex;flex-direction:column;gap:4px;padding:6px 12px;"
        @keydown=${this._onKeyDown}
      >
        <div style="display:flex;align-items:center;gap:6px;">
          <input
            id="clone-url-input"
            type="text"
            placeholder="Git clone URL"
            .value=${this._url}
            ?disabled=${this._cloning}
            style="flex:1;min-width:0;height:24px;background:var(--bg-tertiary);border:1px solid #3a3a3a;border-radius:3px;color:#e0e0e0;font-size:11px;padding:0 6px;outline:none;font-family:inherit;"
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
            style="height:22px;padding:0 8px;background:var(--accent);border:none;border-radius:3px;color:#fff;font-size:11px;cursor:pointer;white-space:nowrap;${this._cloning ? "opacity:0.5;cursor:default;" : ""}"
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
                    style="height:22px;padding:0 6px;background:transparent;border:none;color:var(--text-secondary);font-size:14px;cursor:pointer;"
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
                <div style="display:flex;align-items:center;gap:6px;">
                  <div
                    class="wt-spinner"
                    style="width:12px;height:12px;flex-shrink:0;border:2px solid #444;border-top-color:var(--accent-hover);border-radius:50%;animation:wt-spin 0.8s linear infinite;"
                  ></div>
                  <span style="color:var(--text-secondary);font-size:10px;">${this._progress}</span>
                </div>
              `
            : ""
        }
        ${
          this._error
            ? html`
                <div style="color:#e06c75;font-size:10px;padding:2px 0;">
                  ${this._error}
                  <button
                    style="margin-left:4px;background:transparent;border:none;color:var(--accent-hover);cursor:pointer;font-size:10px;text-decoration:underline;"
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
