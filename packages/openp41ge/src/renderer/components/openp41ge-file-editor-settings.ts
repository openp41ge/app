/**
 * <openp41ge-file-editor-settings> — Editor settings tab content.
 *
 * Hosted by the system overlay's "Editor" tab (registered in
 * register-app-types.step.ts). The first (and currently only) setting is
 * `editor.maxFileSize` — the byte cap above which files open as a "too large"
 * message instead of loading content. Shows the value in MB, persists bytes,
 * and stays live when the config changes elsewhere.
 */

import { customElement, state } from "lit/decorators.js";
import { LitElement, html, nothing, type TemplateResult } from "lit";
import type { ConfigService } from "../services/config-service";
import { appServices } from "../app";
import { DEFAULT_EDITOR_MAX_FILE_SIZE } from "../models/file-size-gate";

const MAX_FILE_SIZE_KEY = "editor.maxFileSize";
/** Minimum sensible limit (1 MB) — keeps the guard meaningful. */
const MIN_LIMIT_MB = 1;
/** Maximum the input accepts, purely as a sanity cap. */
const MAX_LIMIT_MB = 4096;

@customElement("openp41ge-file-editor-settings")
export class Openp41geFileEditorSettings extends LitElement {
  /** Injectable for tests (defaults to the platform ConfigService). */
  configService: ConfigService = appServices.configService;

  @state()
  private _valueMb = this._readCurrentMb();

  @state()
  private _hint: string = "";

  private _unsubKey: (() => void) | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._valueMb = this._readCurrentMb();
    // Stay live if the limit changes elsewhere (e.g. another window).
    this._unsubKey = this.configService.onKeyChange(MAX_FILE_SIZE_KEY, () => {
      this._valueMb = this._readCurrentMb();
      this._hint = "";
      this.requestUpdate();
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubKey?.();
    this._unsubKey = null;
  }

  render(): TemplateResult {
    return html`
      <style>
        .fes-pane {
          box-sizing: border-box;
          height: 100%;
          overflow: auto;
          padding: 28px 32px;
          background: var(--bg-primary, #1e1e1e);
          color: var(--text-primary, #ccc);
          font-size: 13px;
        }
        .fes-title {
          margin: 0 0 4px;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary, #e0e0e0);
        }
        .fes-subtitle {
          margin: 0 0 24px;
          color: var(--text-secondary, #999);
        }
        /* Plain card hosting the max-file-size question — mirrors the cards
           on the Workspaces detail pane: a light translucent surface on the
           --bg-primary page (lighter, not darker, than the background) with a
           blue :focus-within outline. */
        .fes-card {
          box-sizing: border-box;
          max-width: 620px;
          padding: 12px 14px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
          outline: none;
          cursor: text;
        }
        .fes-card:focus-within {
          outline: 2px solid var(--accent, #007acc);
          outline-offset: -2px;
        }
        .fes-card-question {
          display: block;
          margin: 0 0 14px;
          font-weight: 500;
          color: var(--text-primary, #e0e0e0);
        }
        .fes-card-control {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .fes-input {
          width: 110px;
          padding: 6px 8px;
          border: none;
          background: transparent;
          color: var(--text-primary, #e0e0e0);
          font-size: 13px;
          caret-color: var(--accent, #4f9cf9);
        }
        .fes-input:focus {
          outline: none;
        }
        .fes-setting-unit {
          color: var(--text-secondary, #999);
        }
        .fes-card-help {
          margin: 14px 0 0;
          color: var(--text-secondary, #999);
          line-height: 1.5;
        }
        .fes-setting-hint {
          margin: 8px 0 0;
          color: var(--accent, #4f9cf9);
        }
      </style>
      <div class="fes-pane">
        <div class="fes-heading">
          <h1 class="fes-title">Editor</h1>
          <p class="fes-subtitle">Configure the built-in file editor.</p>
        </div>

        <div class="fes-card" @click=${this._onCardClick}>
          <label class="fes-card-question" for="fes-maxsize">
            What is the max allowed file size?
          </label>
          <div class="fes-card-control">
            <input
              id="fes-maxsize"
              class="fes-input"
              type="text"
              autocomplete="off"
              inputmode="numeric"
              .value=${String(this._valueMb)}
              @change=${this._onLimitChanged}
            />
            <span class="fes-setting-unit">MB</span>
          </div>
          <p class="fes-card-help">
            Files larger than this limit open as a "file is too large to open" message in the editor
            instead of loading their content. Applies to newly opened files.
          </p>
          ${this._hint ? html`<p class="fes-setting-hint">${this._hint}</p>` : nothing}
        </div>
      </div>
    `;
  }

  /**
   * Clicking anywhere in the card focuses the limit input.
   */
  private _onCardClick(_e: Event): void {
    this.renderRoot.querySelector<HTMLInputElement>("#fes-maxsize")?.focus();
  }

  /**
   * Validate + persist the typed limit. The input is a free-text field (so no
   * native number spinners), so anything that isn't a number — optionally with
   * thousands separators (comma/space) and a decimal fraction — is rejected
   * and the field reverts to the saved value.
   */
  private _onLimitChanged(e: Event): void {
    const input = e.target as HTMLInputElement;
    const parsed = this._parseMb(input.value);
    if (parsed === null) {
      // Invalid (not a number / bad separators / out of range) — revert & warn.
      this._valueMb = this._readCurrentMb();
      input.value = String(this._valueMb);
      this._hint = `Enter a number between ${MIN_LIMIT_MB} and ${MAX_LIMIT_MB} MB (e.g. 50 or 1,024).`;
      return;
    }
    const mb = Math.floor(parsed);
    const bytes = mb * 1024 * 1024;
    this._valueMb = mb;
    input.value = String(mb);
    void this.configService.set(MAX_FILE_SIZE_KEY, bytes);
    this._hint = `Saved — files larger than ${mb} MB now open with the "too large" message.`;
  }

  /**
   * Parse a user-typed max-file-size. Accepts whole/decimal numbers with
   * thousands separators (comma or space), e.g. "50", "1,024", "1 024",
   * "1.5". Returns the numeric value (in MB) or null when invalid.
   */
  private _parseMb(raw: string): number | null {
    const s = raw.trim();
    if (!s) return null;
    // Digits in thousands-groupings (e.g. 1,024 / 1 024), or a plain integer
    // of any length, optionally followed by a decimal fraction.
    if (!/^(?:\d{1,3}(?:[,\s\u00A0]\d{3})*|\d+)(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s.replace(/[,\s\u00A0]/g, ""));
    if (!Number.isFinite(n)) return null;
    if (n < MIN_LIMIT_MB || n > MAX_LIMIT_MB) return null;
    return n;
  }

  /** Config stores bytes; the UI works in whole MB. */
  private _readCurrentMb(): number {
    const bytes =
      (this.configService.get(MAX_FILE_SIZE_KEY) as number | undefined) ??
      DEFAULT_EDITOR_MAX_FILE_SIZE;
    const mb = Math.floor(bytes / 1024 / 1024);
    return Math.max(MIN_LIMIT_MB, mb);
  }

  createRenderRoot(): HTMLElement {
    return this; // Light DOM, consistent with the editor + overlay shell
  }
}
