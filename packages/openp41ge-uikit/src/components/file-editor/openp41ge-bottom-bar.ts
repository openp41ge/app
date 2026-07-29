/**
 * <fe-status-bar> — unified bottom bar for file editor tabs (Lit).
 *
 * Left section: dirty state / file size.
 * Right section: format button, custom buttons, word wrap toggle.
 *
 * Dirty state: when the file has unsaved changes, the file size shows
 * "Modified" in yellow. After save it reverts to showing the file size.
 * The dirty indicator circle (●) is shown on the tab handle instead.
 *
 * This is a LitElement with light DOM for backward compatibility.
 * Public API methods (setSize, setDirty, etc.) are facades that
 * update internal @state properties, triggering targeted re-renders.
 */

import { LitElement, html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

export interface BottomBarButton {
  id: string;
  icon: string;
  title?: string;
  onClick: () => void;
  visible?: () => boolean;
}

class FeStatusBar extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  /**
   * Skip rendering when the element is disconnected from the DOM.
   * Prevents "ChildPart has no parentNode" errors when pending
   * @state updates fire after the element has been removed during
   * grid re-renders (e.g., tab switching).
   */
  protected update(changedProperties: Map<string | number | symbol, unknown>): void {
    if (!this.isConnected) return;
    super.update(changedProperties);
  }

  // Reactive internal state — updated by public API methods
  @state() private _sizeText = "";
  @state() private _isDirty = false;
  @state() private _hasFormatter = false;
  @state() private _wordWrapOn = false;
  @state() private _emptyMessage: string | null = null;
  @state() private _buttons: BottomBarButton[] = [];
  private _formatterHandler: (() => void) | null = null;
  private _wordWrapHandler: ((enabled: boolean) => void) | null = null;

  // ═══ Public API ─────────────────────────────────────────────────────

  setSize(text: string): void {
    this._sizeText = text;
  }

  setDirty(isDirty: boolean): void {
    this._isDirty = isDirty;
  }

  setWordWrap(enabled: boolean, handler: (enabled: boolean) => void): void {
    this._wordWrapOn = enabled;
    this._wordWrapHandler = handler;
  }

  updateWordWrapState(enabled: boolean): void {
    this._wordWrapOn = enabled;
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
    // Append at the end (before the size element, which is always last)
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

  // ═══ Template ──────────────────────────────────────────────────────

  render(): TemplateResult {
    return html`
      <div
        style="display:flex;flex-shrink:0;align-items:center;height:24px;background:var(--fe-gutter-bg, #1e1e1e);border-top:1px solid var(--fe-border-color, #2a2a2a);padding:0 0 0 8px;gap:8px;font-size:11px;color:var(--fe-secondary-color, #888);"
      >
        ${
          this._emptyMessage !== null
            ? html`<span style="color:#666;font-size:11px;">${this._emptyMessage}</span>`
            : html`
                <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                  <span
                    class="sbb-size"
                    style="color:${this._isDirty ? "#e2b714" : "#777"};font-size:11px;display:flex;align-items:center;font-style:normal;"
                    >${this._sizeText}${this._isDirty ? html`<span style="color:#e2b714;margin-left:4px;">Modified</span>` : ""}</span
                  >
                </div>
                <div style="display:flex;align-items:stretch;height:24px;">
                  ${
                    this._hasFormatter
                      ? html`
                          <div
                            class="sbb-format-btn"
                            style="flex-shrink:0;min-width:28px;height:24px;display:grid;place-items:center;padding:0 8px;background:transparent;color:#666;cursor:pointer;opacity:0.5;border:none;box-sizing:border-box;user-select:none;-webkit-app-region:no-drag;"
                            title="Format document"
                            @click=${() => this._formatterHandler?.()}
                            @mouseenter=${(e: MouseEvent) => {
                              const el = e.currentTarget as HTMLElement;
                              el.style.color = "#4a9eff";
                              el.style.opacity = "1";
                            }}
                            @mouseleave=${(e: MouseEvent) => {
                              const el = e.currentTarget as HTMLElement;
                              el.style.color = "#666";
                              el.style.opacity = "0.5";
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 -960 960 960"
                              fill="currentColor"
                              style="display:block;width:16px;height:16px;"
                            >
                              <path
                                d="M240-280 40-480l200-200 56 56-143 144 143 144-56 56Zm178 132-76-24 200-640 76 24-200 640Zm302-132-56-56 143-144-143-144 56-56 200 200-200 200Z"
                              ></path>
                            </svg>
                          </div>
                        `
                      : ""
                  }
                  ${this._buttons.map(
                    (btn) => html`
                      <div
                        class="sbb-custom-btn"
                        data-btn-id=${btn.id}
                        style="flex-shrink:0;min-width:28px;height:24px;display:${this._isVisible(btn) ? "grid" : "none"};place-items:center;padding:0 8px;background:transparent;color:#666;cursor:pointer;opacity:0.5;border:none;box-sizing:border-box;user-select:none;-webkit-app-region:no-drag;"
                        title=${btn.title ?? ""}
                        @click=${() => btn.onClick()}
                        @mouseenter=${(e: MouseEvent) => {
                          const el = e.currentTarget as HTMLElement;
                          el.style.color = "#4a9eff";
                          el.style.opacity = "1";
                        }}
                        @mouseleave=${(e: MouseEvent) => {
                          const el = e.currentTarget as HTMLElement;
                          el.style.color = "#666";
                          el.style.opacity = "0.5";
                        }}
                      >
                        ${unsafeHTML(btn.icon)}
                      </div>
                    `,
                  )}
                  <!-- Word wrap toggle -->
                  <div
                    class="sbb-wrap-btn"
                    style="flex-shrink:0;min-width:28px;height:24px;display:grid;place-items:center;padding:0 8px;background:transparent;color:${this._wordWrapOn ? "#4a9eff" : "#666"};cursor:pointer;opacity:${this._wordWrapOn ? "1" : "0.5"};border:none;box-sizing:border-box;user-select:none;-webkit-app-region:no-drag;"
                    title="Toggle word wrap"
                    @click=${() => {
                      const newState = !this._wordWrapOn;
                      this._wordWrapOn = newState;
                      this._wordWrapHandler?.(newState);
                    }}
                    @mouseenter=${(e: MouseEvent) => {
                      const el = e.currentTarget as HTMLElement;
                      // Always show blue on hover
                      el.style.color = "#4a9eff";
                      el.style.opacity = "1";
                    }}
                    @mouseleave=${(e: MouseEvent) => {
                      const el = e.currentTarget as HTMLElement;
                      // Revert to state-appropriate styling — handled by reactive render
                      // but also set directly for immediate feedback
                      el.style.color = "";
                      el.style.opacity = "";
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
                      <path d="M2 4h12" />
                      <path d="M2 8h8" />
                      <path d="M2 12h6" />
                      <path d="M13 10l2 2-2 2" />
                      <path d="M15 12h-5" />
                    </svg>
                  </div>
                </div>
              `
        }
      </div>
    `;
  }
}

customElements.define("fe-status-bar", FeStatusBar);

export { FeStatusBar };
