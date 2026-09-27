/**
 * <openp41ge-explorer-settings> — Explorer settings surface for the settings
 * drawer (opened from the Explorer's gear).
 *
 * Edits are staged in a JSON editor (with key-hover tooltips from
 * EXPLORER_SETTINGS_SCHEMA) — nothing is persisted until the user presses
 * Save (Reset discards the staged edits). Saving writes each setting through
 * the config service, so the Explorer re-flows on Save.
 *
 * Settings:
 *  - `explorer.indentSize` — the indentation unit (px, default 16) used as
 *    the base multiple for every Explorer row. Indentation is always a
 *    multiple of this fixed value, so the whole sidebar re-flows when it
 *    changes.
 *  - `explorer.prefetchDepth` — how many levels of directory contents the
 *    Explorer prefetches per expand.
 */

import { customElement, state } from "lit/decorators.js";
import { LitElement, html, nothing, type TemplateResult } from "lit";
import "openp41ge-json-editor/json-editor";
import { cloneDeep } from "openp41ge-json-editor";
import { EXPLORER_SETTINGS_SCHEMA } from "../models/explorer-settings-schema";
import type { ConfigService } from "../services/config-service";
import { appServices } from "../app";

/** Config key for the Explorer indentation unit (px per tree level). */
const INDENT_KEY = "explorer.indentSize";
/** Default indent unit (px). */
const DEFAULT_INDENT = 16;
/** Smallest sensible indent unit (px). */
const MIN_INDENT = 4;
/** Largest acceptable indent unit (px). */
const MAX_INDENT = 48;

/** Config key for how many levels of directory contents the Explorer prefetches. */
const PREFETCH_KEY = "explorer.prefetchDepth";
/** Default prefetch depth (levels of subdirectory listings per expand). */
const DEFAULT_PREFETCH = 2;
/** Minimum prefetch depth (0 disables prefetching). */
const MIN_PREFETCH = 0;
/** Maximum prefetch depth, capped to bound IPC payload size. */
const MAX_PREFETCH = 4;

/** The editable Explorer settings shape. */
interface ExplorerSettings {
  indentSize: number;
  prefetchDepth: number;
}

@customElement("openp41ge-explorer-settings")
export class Openp41geExplorerSettings extends LitElement {
  /** Injectable for tests (defaults to the platform ConfigService). */
  configService: ConfigService = appServices.configService;

  @state()
  private _config: ExplorerSettings | null = null;

  @state()
  private _savedConfig: ExplorerSettings | null = null;

  @state()
  private _loading = true;

  @state()
  private _saving = false;

  @state()
  private _error = "";

  connectedCallback(): void {
    super.connectedCallback();
    this._loadConfig();
  }

  /** Read the persisted Explorer settings and seed the staged draft. */
  private _loadConfig(): void {
    const current: ExplorerSettings = {
      indentSize: this._readCurrentIndent(),
      prefetchDepth: this._readCurrentPrefetch(),
    };
    this._config = current;
    this._savedConfig = cloneDeep(current);
    this._loading = false;
  }

  /** The JSON editor committed an edit — stage it into the draft only. */
  private _onJsonEditorChange(e: CustomEvent): void {
    this._config = (e.detail as { value: ExplorerSettings }).value;
  }

  /** True when the staged draft differs from the persisted baseline. */
  private _isDirty(): boolean {
    if (!this._config || !this._savedConfig) return !!this._config;
    return JSON.stringify(this._config) !== JSON.stringify(this._savedConfig);
  }

  /** Persist the staged Explorer settings (Save) — writes both keys. */
  private async _save(): Promise<void> {
    if (!this._config) return;
    this._saving = true;
    try {
      await this.configService.set(INDENT_KEY, this._config.indentSize);
      await this.configService.set(PREFETCH_KEY, this._config.prefetchDepth);
      this._savedConfig = cloneDeep(this._config);
      this._error = "";
    } catch {
      this._error = "Failed to save the Explorer settings.";
    } finally {
      this._saving = false;
    }
  }

  /** Discard the staged edits and restore the last persisted settings. */
  private _reset(): void {
    if (!this._savedConfig) return;
    this._config = cloneDeep(this._savedConfig);
  }

  /** Row height for the JSON editor — follows the global platform
   *  line-height setting, a little larger to give the inline edit/insert
   *  affordances room. */
  private _rowHeight(): number {
    const lh = this.configService.get("lineHeight") as number | undefined;
    return typeof lh === "number" && lh >= 14 && lh <= 40 ? lh : 20;
  }

  /** Config stores px; missing or invalid falls back to the default. */
  private _readCurrentIndent(): number {
    const raw = this.configService.get(INDENT_KEY);
    const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_INDENT;
    return Math.min(MAX_INDENT, Math.max(MIN_INDENT, n));
  }

  /** Config stores the depth; missing or invalid falls back to the default. */
  private _readCurrentPrefetch(): number {
    const raw = this.configService.get(PREFETCH_KEY);
    const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_PREFETCH;
    return Math.min(MAX_PREFETCH, Math.max(MIN_PREFETCH, n));
  }

  render(): TemplateResult {
    return html`
      <style>
        .exs-pane {
          box-sizing: border-box;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          /* Match the other drawer surfaces (agent-matching 18px). */
          padding: var(--settings-pane-padding, 28px 32px);
          background: var(--settings-pane-bg, var(--bg-primary, #161616));
          color: var(--text-primary, #ccc);
          font-size: 13px;
        }
        .exs-section-title {
          margin: 0 0 6px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary, #999);
        }
        .exs-hint {
          margin: 0 0 12px;
          font-size: 12px;
          line-height: 1.5;
          color: var(--text-secondary, #999);
        }
        .exs-editor {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .exs-editor > json-editor {
          flex: 1;
          min-height: 0;
        }
        .exs-note {
          margin: 6px 0 0;
          font-size: 12px;
          color: var(--text-secondary, #999);
        }
        .exs-note--error {
          color: var(--danger, #f44336);
        }
        .exs-footer {
          flex: none;
          margin-top: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--border, #2a2a2a);
        }
        .exs-status {
          font-size: 12px;
          color: var(--text-secondary, #999);
        }
        .exs-actions {
          display: flex;
          gap: 8px;
        }
        .exs-btn {
          font: inherit;
          font-size: 12px;
          padding: 6px 14px;
          border-radius: 4px;
          border: 1px solid var(--border, #333);
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-primary, #ddd);
          cursor: pointer;
        }
        .exs-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.14);
        }
        .exs-btn--primary {
          background: rgb(86, 156, 214);
          border-color: rgb(86, 156, 214);
          color: #fff;
        }
        .exs-btn--primary:hover:not(:disabled) {
          background: rgb(100, 168, 224);
        }
        .exs-btn:disabled {
          opacity: 0.4;
          cursor: default;
        }
      </style>
      <div class="exs-pane">
        <div class="exs-section-title">Explorer</div>
        <p class="exs-hint">
          Explorer preferences. Edits are staged and only applied when you press Save.
        </p>

        ${
          this._loading
            ? html`<p class="exs-note">Loading…</p>`
            : html`
                <div class="exs-editor">
                  <json-editor
                    .rowHeight=${this._rowHeight()}
                    .value=${this._config}
                    .schema=${EXPLORER_SETTINGS_SCHEMA}
                    @json-editor-change=${(e: CustomEvent) => void this._onJsonEditorChange(e)}
                  ></json-editor>
                </div>
                ${
                  this._error
                    ? html`<p class="exs-note exs-note--error">${this._error}</p>`
                    : nothing
                }
                <footer class="exs-footer">
                  <span class="exs-status"
                    >${this._isDirty() ? "Unsaved changes." : "All changes saved."}</span
                  >
                  <div class="exs-actions">
                    <button
                      class="exs-btn"
                      type="button"
                      ?disabled=${!this._isDirty() || this._saving}
                      @click=${() => this._reset()}
                    >
                      Reset
                    </button>
                    <button
                      class="exs-btn exs-btn--primary"
                      type="button"
                      ?disabled=${!this._isDirty() || this._saving}
                      @click=${() => void this._save()}
                    >
                      Save
                    </button>
                  </div>
                </footer>
              `
        }
      </div>
    `;
  }

  createRenderRoot(): HTMLElement {
    return this; // Light DOM, consistent with the editor + overlay shell
  }
}
