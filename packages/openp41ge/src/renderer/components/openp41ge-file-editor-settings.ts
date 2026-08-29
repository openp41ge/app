/**
 * <openp41ge-file-editor-settings> — File Editor Settings tab content.
 *
 * Hosted by the system overlay's "File Editor Settings" tab (registered in
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
        .fes-setting {
          max-width: 560px;
          padding: 14px 0;
          border-top: 1px solid var(--divider, #333);
        }
        .fes-setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .fes-setting-label {
          font-weight: 500;
        }
        .fes-setting-control {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .fes-input {
          width: 110px;
          padding: 6px 8px;
          border: 1px solid var(--divider, #333);
          border-radius: 4px;
          background: var(--bg-secondary, #252526);
          color: var(--text-primary, #e0e0e0);
          font-size: 13px;
        }
        .fes-input:focus {
          outline: none;
          border-color: var(--accent, #4f9cf9);
        }
        .fes-setting-unit {
          color: var(--text-secondary, #999);
        }
        .fes-setting-help {
          margin: 8px 0 0;
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
          <h1 class="fes-title">File Editor Settings</h1>
          <p class="fes-subtitle">Configure the built-in file editor.</p>
        </div>

        <div class="fes-setting">
          <div class="fes-setting-row">
            <label class="fes-setting-label" for="fes-maxsize"> Max file size to open </label>
            <div class="fes-setting-control">
              <input
                id="fes-maxsize"
                class="fes-input"
                type="number"
                min="${MIN_LIMIT_MB}"
                max="${MAX_LIMIT_MB}"
                step="1"
                .value=${String(this._valueMb)}
                @change=${this._onLimitChanged}
              />
              <span class="fes-setting-unit">MB</span>
            </div>
          </div>
          <p class="fes-setting-help">
            Files larger than this limit open as a "file is too large to open" message in the editor
            instead of loading their content. Applies to newly opened files.
          </p>
          ${this._hint ? html`<p class="fes-setting-hint">${this._hint}</p>` : nothing}
        </div>
      </div>
    `;
  }

  private _onLimitChanged(e: Event): void {
    const input = e.target as HTMLInputElement;
    const raw = Number(input.value);
    if (!Number.isFinite(raw) || raw < MIN_LIMIT_MB) {
      // Don't clobber the saved value with garbage — redraw and warn. Lit skips
      // re-writing `.value` when the bound value is unchanged (it won't clobber
      // user input), so set the element back explicitly.
      this._valueMb = this._readCurrentMb();
      input.value = String(this._valueMb);
      this._hint = `Enter a value of at least ${MIN_LIMIT_MB} MB.`;
      return;
    }
    const mb = Math.min(Math.floor(raw), MAX_LIMIT_MB);
    const bytes = mb * 1024 * 1024;
    this._valueMb = mb;
    void this.configService.set(MAX_FILE_SIZE_KEY, bytes);
    this._hint = `Saved — files larger than ${mb} MB now open with the "too large" message.`;
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
