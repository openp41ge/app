/**
 * <openp41ge-bottom-bar> — unified bottom bar for file viewer tabs (Lit).
 *
 * Left section: position ("Line 1"), mode ("Preview" / "Edit").
 * Right section: action buttons (format, custom), file size.
 *
 * Lit conversion of the vanilla HTMLElement version.
 */

import { LitElement, html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";

export interface BottomBarButton {
  id: string;
  icon: string;
  title?: string;
  onClick: () => void;
  visible?: () => boolean;
}

class Openp41geBottomBar extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @state() private _positionText = "Line 1";
  @state() private _modeText = "";
  @state() private _modeColor = "#888";
  @state() private _sizeText = "";
  @state() private _hasFormatter = false;
  @state() private _emptyMessage: string | null = null;
  @state() private _buttons: BottomBarButton[] = [];
  private _formatterHandler: (() => void) | null = null;

  // ═══ Public API ──────────────────────────────────────────────────────

  setPosition(text: string): void {
    this._positionText = text;
  }

  setMode(text: string, color?: string): void {
    this._modeText = text;
    this._modeColor = color ?? "#888";
  }

  setSize(text: string): void {
    this._sizeText = text;
  }

  setFormatter(handler: () => void): void {
    this._formatterHandler = handler;
    this._hasFormatter = handler !== null;
  }

  clearFormatter(): void {
    this._formatterHandler = null;
    this._hasFormatter = false;
  }

  showEmpty(message: string): void {
    this._emptyMessage = message;
  }

  restore(): void {
    this._emptyMessage = null;
  }

  addButton(btn: BottomBarButton): void {
    if (this._buttons.some((b) => b.id === btn.id)) return;
    this._buttons = [...this._buttons, btn];
  }

  removeButton(id: string): void {
    this._buttons = this._buttons.filter((b) => b.id !== id);
  }

  destroy(): void {
    this._buttons = [];
    this._formatterHandler = null;
    this._hasFormatter = false;
  }

  private _isVisible(btn: BottomBarButton): boolean {
    return !btn.visible || btn.visible();
  }

  // ═══ Template ────────────────────────────────────────────────────────

  render(): TemplateResult {
    return html`
      <div
        style="display:flex;flex-shrink:0;align-items:center;height:24px;background:var(--bg-primary);border-top:1px solid var(--border-divider);padding:0 8px;gap:8px;font-size:11px;color:var(--text-secondary);"
      >
        ${
          this._emptyMessage !== null
            ? html`<span style="color:var(--text-muted);font-size:11px;"
                >${this._emptyMessage}</span
              >`
            : html`
                <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                  <span
                    class="sbb-position"
                    style="color:var(--text-secondary);font-size:11px;font-style:normal;"
                    >${this._positionText}</span
                  >
                  <span
                    class="sbb-mode"
                    style="color:${this._modeColor};font-size:11px;font-style:normal;"
                    >${this._modeText}</span
                  >
                </div>
                <div style="display:flex;align-items:stretch;gap:8px;height:24px;">
                  ${
                    this._hasFormatter
                      ? html`
                          <div
                            class="sbb-format-btn"
                            style="flex-shrink:0;min-width:28px;height:24px;display:grid;place-items:center;padding:0 8px;background:transparent;color:var(--text-muted);cursor:pointer;opacity:0.5;border:none;box-sizing:border-box;user-select:none;-webkit-app-region:no-drag;"
                            title="Format document"
                            @click=${() => this._formatterHandler?.()}
                            @mouseenter=${(e: MouseEvent) => {
                              const el = e.currentTarget as HTMLElement;
                              el.style.background = "rgba(255,255,255,0.1)";
                              el.style.color = "#e0e0e0";
                              el.style.opacity = "1";
                            }}
                            @mouseleave=${(e: MouseEvent) => {
                              const el = e.currentTarget as HTMLElement;
                              el.style.background = "transparent";
                              el.style.color = "#666";
                              el.style.opacity = "0.5";
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="1.3"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              style="display:block;width:16px;height:16px;"
                            >
                              <path d="M5 4L3 8l2 4"></path>
                              <path d="M11 4l2 4-2 4"></path>
                              <path d="M9 3l-2 10"></path>
                            </svg>
                          </div>
                        `
                      : ""
                  }
                  ${this._buttons.map(
                    (btn) => html`
                      <div
                        class="sbb-custom-btn"
                        style="flex-shrink:0;min-width:28px;height:24px;display:${this._isVisible(btn) ? "grid" : "none"};place-items:center;padding:0 8px;background:transparent;color:var(--text-muted);cursor:pointer;opacity:0.5;border:none;box-sizing:border-box;user-select:none;-webkit-app-region:no-drag;"
                        title=${btn.title ?? ""}
                        @click=${() => btn.onClick()}
                        @mouseenter=${(e: MouseEvent) => {
                          const el = e.currentTarget as HTMLElement;
                          el.style.background = "rgba(255,255,255,0.1)";
                          el.style.color = "#e0e0e0";
                          el.style.opacity = "1";
                        }}
                        @mouseleave=${(e: MouseEvent) => {
                          const el = e.currentTarget as HTMLElement;
                          el.style.background = "transparent";
                          el.style.color = "#666";
                          el.style.opacity = "0.5";
                        }}
                      >
                        ${btn.icon}
                      </div>
                    `,
                  )}
                  <span
                    class="sbb-size"
                    style="color:var(--text-muted);font-size:11px;display:flex;align-items:center;height:100%;font-style:normal;"
                    >${this._sizeText}</span
                  >
                </div>
              `
        }
      </div>
    `;
  }
}

if (!customElements.get("openp41ge-bottom-bar")) {
  customElements.define("openp41ge-bottom-bar", Openp41geBottomBar);
}

export { Openp41geBottomBar };
