/**
 * openp41ge-manager-settings — the management window's global Settings tab.
 *
 * Renders ONLY the openp41ge platform-wide settings (app theme, and the
 * top-level line-height / font-size that sub-package editors align to). It is
 * deliberately NOT the whole config — sub-package settings such as the file
 * editor's font/max-size and the agent providers live in their own surfaces.
 *
 * Edits are staged in the JSON editor only — nothing is persisted until the
 * user presses Save (Reset discards the staged edits). Saving writes each
 * top-level platform key through the main process; sub-package sections are
 * left untouched.
 */
import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "openp41ge-json-editor/json-editor";
import { cloneDeep } from "openp41ge-json-editor";

/** The IPC config bridge exposed as `window.openp41ge.config`. */
export interface ManagerConfigBridge {
  getAll: () => Promise<Record<string, unknown>>;
  set: (key: string, value: unknown) => Promise<void>;
}

/** Platform-wide (global) settings shown here — sub-packages align to these. */
const GLOBAL_KEYS = ["appTheme", "lineHeight", "fontSize"] as const;

@customElement("openp41ge-manager-settings")
export class Openp41geManagerSettings extends LitElement {
  /** Config bridge — injectable for tests; defaults to `window.openp41ge.config`. */
  @property({ attribute: false })
  configBridge: ManagerConfigBridge | null = null;

  @state() private _config: Record<string, unknown> | null = null;
  @state() private _savedConfig: Record<string, unknown> | null = null;
  @state() private _loading = true;
  @state() private _saving = false;
  @state() private _error = "";

  private _bridge(): ManagerConfigBridge | null {
    if (this.configBridge) return this.configBridge;
    const g = window as unknown as { openp41ge?: { config?: ManagerConfigBridge } };
    return g.openp41ge?.config ?? null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this._loadConfig();
  }

  private async _loadConfig(): Promise<void> {
    const bridge = this._bridge();
    if (!bridge) {
      this._error = "Config is not available in this window.";
      this._loading = false;
      return;
    }
    try {
      const raw = await bridge.getAll();
      const current = this._pickGlobal(raw ?? {});
      this._config = current;
      this._savedConfig = cloneDeep(current);
      this._error = "";
    } catch {
      this._error = "Failed to load the global settings.";
    } finally {
      this._loading = false;
    }
  }

  /** Slice just the platform-wide keys out of the persisted config. */
  private _pickGlobal(raw: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of GLOBAL_KEYS) {
      if (key in raw) out[key] = raw[key];
    }
    return out;
  }

  /** The JSON editor staged a whole-object edit — keep it as the draft only. */
  private _onJsonEditorChange(e: CustomEvent): void {
    this._config = (e.detail as { value: Record<string, unknown> }).value;
  }

  /** True when the JSON draft differs from the persisted baseline. */
  private _isDirty(): boolean {
    if (!this._config || !this._savedConfig) return !!this._config;
    return JSON.stringify(this._config) !== JSON.stringify(this._savedConfig);
  }

  /** Persist the staged platform settings (Save) — writes each global key,
   *  leaving sub-package sections untouched. */
  private async _save(): Promise<void> {
    const bridge = this._bridge();
    if (!this._config || !bridge) return;
    this._saving = true;
    try {
      for (const [key, value] of Object.entries(this._config)) {
        await bridge.set(key, value);
      }
      this._savedConfig = cloneDeep(this._config);
    } catch {
      this._error = "Failed to save the global settings.";
    } finally {
      this._saving = false;
    }
  }

  /** Discard the JSON draft and restore the persisted config. */
  private _reset(): void {
    if (!this._savedConfig) return;
    this._config = cloneDeep(this._savedConfig);
  }

  /** Row height for the JSON editor — follows the global platform line-height. */
  private _jsonRowHeight(): number {
    const lh = (this._savedConfig as { lineHeight?: unknown } | null)?.lineHeight;
    return typeof lh === "number" && lh >= 14 && lh <= 100 ? lh + 4 : 24;
  }

  override render(): TemplateResult {
    return html`
      <div class="mms-root">
        <header class="mms-header">
          <div class="mms-title">Global settings</div>
          <div class="mms-hint">
            Platform-wide settings that the openp41ge sub-packages align to. Edits are staged
            and only applied when you press Save.
          </div>
        </header>

        ${
          this._loading
            ? html`<p class="mms-note">Loading…</p>`
            : this._error
              ? html`<p class="mms-note mms-note--error">${this._error}</p>`
              : html`
                  <div class="mms-editor">
                    <json-editor
                      .rowHeight=${this._jsonRowHeight()}
                      .value=${this._config}
                      @json-editor-change=${(e: CustomEvent) => void this._onJsonEditorChange(e)}
                    ></json-editor>
                  </div>
                  <footer class="mms-footer">
                    <span class="mms-status"
                      >${this._isDirty() ? "Unsaved changes." : "All changes saved."}</span
                    >
                    <div class="mms-actions">
                      <button
                        class="mms-btn"
                        type="button"
                        ?disabled=${!this._isDirty() || this._saving}
                        @click=${() => this._reset()}
                      >
                        Reset
                      </button>
                      <button
                        class="mms-btn mms-btn--primary"
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

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
    .mms-root {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      box-sizing: border-box;
    }
    .mms-header {
      padding: 14px 16px 10px;
      flex: none;
    }
    .mms-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary, #ddd);
    }
    .mms-hint {
      margin-top: 4px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-secondary, #999);
    }
    .mms-note {
      margin: 0;
      padding: 16px;
      font-size: 13px;
      color: var(--text-secondary, #999);
    }
    .mms-note--error {
      color: var(--danger, #f44336);
    }
    .mms-editor {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .mms-editor > json-editor {
      flex: 1;
      min-height: 0;
    }
    .mms-footer {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px;
      border-top: 1px solid var(--border, #2a2a2a);
      background: var(--bg-secondary, #161616);
    }
    .mms-status {
      font-size: 12px;
      color: var(--text-secondary, #999);
    }
    .mms-actions {
      display: flex;
      gap: 8px;
    }
    .mms-btn {
      font: inherit;
      font-size: 12px;
      padding: 6px 14px;
      border-radius: 4px;
      border: 1px solid var(--border, #333);
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary, #ddd);
      cursor: pointer;
    }
    .mms-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.14);
    }
    .mms-btn--primary {
      background: rgb(86, 156, 214);
      border-color: rgb(86, 156, 214);
      color: #fff;
    }
    .mms-btn--primary:hover:not(:disabled) {
      background: rgb(100, 168, 224);
    }
    .mms-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "openp41ge-manager-settings": Openp41geManagerSettings;
  }
}
