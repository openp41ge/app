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

// Compact inline glyphs for the find toggles — kept as text so they read
// clearly at 11px (same intent as the Git sidebar's regex/match-case icons).
const ICON_FIND =
  '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="5" cy="5" r="3.2"></circle><path d="M8 8l2.6 2.6"></path></svg>';
const ICON_REGEX =
  '<svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><text x="0.5" y="11" font-size="11" font-family="Consolas,monospace" font-weight="600">.*</text></svg>';
const ICON_CASE =
  '<svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><text x="0.5" y="10.5" font-size="10.5" font-family="sans-serif" font-weight="700">Aa</text></svg>';
const ICON_CONFIG =
  '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1.5 3.5h9M1.5 6.5h9M1.5 9.5h9"></path><circle cx="4" cy="3.5" r="1"></circle><circle cx="8" cy="6.5" r="1"></circle><circle cx="5.5" cy="9.5" r="1"></circle></svg>';

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

  // ═══ Find strip (in-editor search, Cmd/Ctrl+F) ─────────────────────────

  @state() private _findOpen = false;
  @state() private _findValue = "";
  @state() private _findCount = "";
  @state() private _findRegex = false;
  @state() private _findCase = false;
  @state() private _findWholeWord = false;
  @state() private _configOpen = false;

  /** User clicked the (closed-state) find entry icon. */
  onFindOpen: (() => void) | null = null;
  onFindInput: ((value: string) => void) | null = null;
  onFindNext: (() => void) | null = null;
  onFindPrev: (() => void) | null = null;
  onFindClose: (() => void) | null = null;
  onFindRegex: ((on: boolean) => void) | null = null;
  onFindCase: ((on: boolean) => void) | null = null;
  onFindWholeWord: ((on: boolean) => void) | null = null;

  openFind(): void {
    this._findOpen = true;
    this._configOpen = false;
  }

  closeFind(): void {
    this._findOpen = false;
    this._configOpen = false;
  }

  focusFind(): void {
    const input = this.querySelector<HTMLInputElement>("[data-testid=fe-find-input]");
    input?.focus();
    input?.select();
  }

  setFindCount(text: string): void {
    this._findCount = text;
  }

  private _onEntryClick = (): void => {
    // The bottom bar carries only the icon — it toggles the full-width find
    // bar that sits above the status bar.
    if (this._findOpen) {
      this.closeFind();
      this.onFindClose?.();
    } else {
      this.onFindOpen?.();
    }
  };

  private _onInput = (e: InputEvent): void => {
    const value = (e.target as HTMLInputElement).value;
    this._findValue = value;
    this.onFindInput?.(value);
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        this.onFindPrev?.();
      } else {
        this.onFindNext?.();
      }
    } else if (e.key === "Escape") {
      this.closeFind();
      this.onFindClose?.();
    }
  };

  private _toggleRegex = (): void => {
    this._findRegex = !this._findRegex;
    this.onFindRegex?.(this._findRegex);
  };

  private _toggleCase = (): void => {
    this._findCase = !this._findCase;
    this.onFindCase?.(this._findCase);
  };

  private _toggleWholeWord = (): void => {
    this._findWholeWord = !this._findWholeWord;
    this.onFindWholeWord?.(this._findWholeWord);
  };

  private _toggleConfig = (): void => {
    this._configOpen = !this._configOpen;
  };

  /** One icon toggle for the find strip (regex / case) — Git-sidebar style. */
  private _findToggle(
    icon: string,
    title: string,
    active: boolean,
    testId: string,
    onClick: () => void,
  ): TemplateResult {
    return html`
      <button
        type="button"
        data-testid=${testId}
        title=${title}
        style="flex-shrink:0;width:16px;height:16px;display:grid;place-items:center;padding:0;cursor:pointer;background:transparent;border:1px solid transparent;border-radius:3px;color:${active ? "#4a9eff" : "var(--fe-secondary-color,#888)"};"
        @click=${onClick}
      >
        ${unsafeHTML(icon)}
      </button>
    `;
  }

  private _isVisible(btn: BottomBarButton): boolean {
    return !btn.visible || btn.visible();
  }

  // ═══ Template ──────────────────────────────────────────────────────

  render(): TemplateResult {
    return html`
      <div
        class="sbb-stack"
        style="position:relative;display:flex;flex-direction:column;flex-shrink:0;"
      >
        ${
          this._findOpen
            ? html`
                <div
                  class="fe-find-bar"
                  style="position:relative;display:flex;flex-shrink:0;align-items:center;gap:8px;height:28px;padding:0 8px;background:var(--fe-gutter-bg,#1e1e1e);border-top:1px solid var(--fe-border-color,#2a2a2a);font-size:11px;color:var(--fe-secondary-color,#888);"
                >
                  <!-- The find field lives HERE — a second bar just above the
                       status bar — and spans the full editor width (flex:1). -->
                  <input
                    class="fe-find-input"
                    data-testid="fe-find-input"
                    type="text"
                    placeholder="Find in file"
                    spellcheck="false"
                    .value=${this._findValue}
                    style="flex:1 1 auto;min-width:0;height:18px;padding:0 6px;box-sizing:border-box;background:var(--fe-bg,#161616);border:1px solid var(--fe-border-color,#3a3a3a);border-radius:3px;color:var(--fe-primary-color,#ccc);font-size:12px;font-family:inherit;outline:none;"
                    @input=${this._onInput}
                    @keydown=${this._onKeyDown}
                  />
                  ${
                    this._findCount
                      ? html`<span
                          class="fe-find-count"
                          style="flex-shrink:0;color:var(--fe-secondary-color,#888);font-size:11px;"
                          >${this._findCount}</span
                        >`
                      : ""
                  }
                  ${this._findToggle(ICON_REGEX, "Regex search", this._findRegex, "fe-find-regex", this._toggleRegex)}
                  ${this._findToggle(ICON_CASE, "Match case", this._findCase, "fe-find-case", this._toggleCase)}
                  ${this._findToggle(ICON_CONFIG, "Search options", this._configOpen, "fe-find-config", this._toggleConfig)}
                  ${
                    this._configOpen
                      ? html`
                          <div
                            class="fe-find-config"
                            data-testid="fe-find-config"
                            style="position:absolute;top:calc(100% + 2px);left:8px;z-index:50;display:flex;flex-direction:column;gap:4px;min-width:172px;padding:6px;background:var(--fe-gutter-bg,#1e1e1e);border:1px solid var(--fe-border-color,#2a2a2a);border-radius:4px;font-size:11px;color:var(--fe-secondary-color,#888);box-shadow:0 6px 18px rgba(0,0,0,0.4);"
                          >
                            <div
                              data-testid="fe-find-scope-row"
                              style="display:flex;align-items:center;gap:6px;"
                            >
                              <span>Search in:</span>
                              <span style="color:var(--fe-primary-color,#ccc);">Current file</span>
                            </div>
                            <div
                              data-testid="fe-find-whole-word"
                              role="button"
                              title="Match whole words only"
                              style="display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--fe-primary-color,#ccc);user-select:none;"
                              @click=${this._toggleWholeWord}
                            >
                              <span
                                style="width:10px;height:10px;border:1px solid #666;border-radius:2px;display:inline-flex;align-items:center;justify-content:center;color:#4a9eff;"
                                >${this._findWholeWord ? "✓" : ""}</span
                              >
                              <span>Whole word</span>
                            </div>
                            <div
                              style="display:flex;align-items:center;gap:6px;opacity:0.45;"
                              title="Coming soon"
                            >
                              <span style="width:10px;height:10px;display:inline-block;"></span>
                              <span>Open tabs (soon)</span>
                            </div>
                            <div
                              style="display:flex;align-items:center;gap:6px;opacity:0.45;"
                              title="Coming soon"
                            >
                              <span style="width:10px;height:10px;display:inline-block;"></span>
                              <span>Folder (soon)</span>
                            </div>
                          </div>
                        `
                      : ""
                  }
                </div>
              `
            : ""
        }
        <div
          class="sbb-row"
          style="position:relative;display:flex;flex-shrink:0;align-items:center;height:24px;background:var(--fe-gutter-bg, #1e1e1e);border-top:1px solid var(--fe-border-color, #2a2a2a);padding:0 0 0 8px;gap:8px;font-size:11px;color:var(--fe-secondary-color, #888);"
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
                    <!-- Find entry icon — the bottom bar carries ONLY the icon;
                       the field lives in the full-width find bar above. -->
                    <button
                      type="button"
                      class="fe-find-entry"
                      data-testid="fe-find-entry"
                      title="Find (⌘F)"
                      @click=${this._onEntryClick}
                      style="flex-shrink:0;width:16px;height:16px;display:grid;place-items:center;padding:0;cursor:pointer;background:transparent;border:1px solid transparent;border-radius:3px;color:${this._findOpen ? "#4a9eff" : "var(--fe-secondary-color,#888)"};"
                    >
                      ${unsafeHTML(ICON_FIND)}
                    </button>
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
      </div>
    `;
  }
}

customElements.define("fe-status-bar", FeStatusBar);

export { FeStatusBar };
