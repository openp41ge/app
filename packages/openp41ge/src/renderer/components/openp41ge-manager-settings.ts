/**
 * openp41ge-manager-settings — the management window's global Settings tab.
 *
 * Renders ONLY the openp41ge platform-wide settings (app theme, and the
 * top-level line-height / font-size that sub-package editors align to). It is
 * deliberately NOT the whole config — sub-package settings such as the file
 * editor's font/max-size and the agent providers live in their own surfaces.
 *
 * The JSON editor shows ONLY the values the user has overridden (the config
 * stores just the overrides — defaults are implied by the platform). A
 * "show defaults" toggle in the window's bottom bar renders the full effective
 * document with the default-valued parts faded, so the user can see what is
 * available and what they've already set.
 *
 * The document being edited is the raw *overrides* (not the merged effective
 * doc): each row in the editor maps 1:1 to a persisted value, so deleting a row
 * removes it from the file. In show-defaults mode the editor gets the merged
 * effective doc plus the set of pinned leaf paths, so a value the user wrote
 * that happens to equal a default still renders as an explicit override (not
 * faded) and offers the overwrite affordance.
 *
 * Reset/Save (and the show-defaults toggle) live in the window-manager's
 * custom settings bottom bar, not in this component. This component exposes a
 * public `save()` / `reset()` / `toggleShowDefaults()` and an `isDirty` state,
 * and emits a `manager-settings-state` CustomEvent so the parent footer can
 * stay in sync.
 */
import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "openp41ge-json-editor/json-editor";
import {
  cloneDeep,
  getAt,
  leafPaths,
  mergeDefaults,
  pathFromKey,
  pinnedPaths,
  setAt,
  sortJsonKeys,
  stripDefaults,
  type JsonPath,
} from "openp41ge-json-editor";
import { GLOBAL_SETTINGS_SCHEMA } from "../models/global-settings-schema";

/** The IPC config bridge exposed as `window.openp41ge.config`. */
export interface ManagerConfigBridge {
  getAll: () => Promise<Record<string, unknown>>;
  set: (key: string, value: unknown) => Promise<void>;
  getDefaults: () => Promise<Record<string, unknown>>;
  getOverrides: () => Promise<Record<string, unknown>>;
}

/** Platform-wide (global) settings shown here — sub-packages align to these. */
const GLOBAL_KEYS = ["appTheme", "updateChannel", "lineHeight", "fontSize"] as const;

/** Emitted whenever dirty/saving/show-defaults state changes, so the parent
 *  window's settings bottom bar can re-render. */
export const MANAGER_SETTINGS_STATE_EVENT = "manager-settings-state";

@customElement("openp41ge-manager-settings")
export class Openp41geManagerSettings extends LitElement {
  /** Config bridge — injectable for tests; defaults to `window.openp41ge.config`. */
  @property({ attribute: false })
  configBridge: ManagerConfigBridge | null = null;

  /** The staged override document — what the user has written (also what will
   *  be persisted). Pins (values equal to their default) live here too. */
  @state() private _overrides: Record<string, unknown> | null = null;
  /** The last persisted override document (the dirty baseline). */
  @state() private _savedOverrides: Record<string, unknown> | null = null;
  /** The platform defaults for the shown global keys. */
  @state() private _defaults: Record<string, unknown> | null = null;
  /** The effective (defaults-merged) document — derived from `_overrides`. */
  @state() private _effective: Record<string, unknown> | null = null;
  /** Dot-joined leaf paths the user has explicitly set (pins + overrides). */
  @state() private _pinned = new Set<string>();
  /** Whether the editor shows the full effective document with faded defaults. */
  @state() private _showDefaults = false;
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
    // The override document is the minimum needed to render; defaults (and the
    // overrides source) are only needed for the faded-defaults overlay, so a
    // missing/failing defaults call (e.g. an app that hasn't been restarted to
    // load the new IPC handler) degrades to showing the config without the
    // defaults overlay.
    if (!bridge || typeof bridge.getDefaults !== "function") {
      this._error = "Config is not available in this window.";
      this._loading = false;
      this._emitState();
      return;
    }
    try {
      let defaults: Record<string, unknown> | null = null;
      try {
        defaults = await bridge.getDefaults();
      } catch {
        defaults = null;
      }
      const baseDefaults = this._pickGlobal(defaults ?? {});
      // Prefer the persisted overrides (the exact user-written shape, including
      // pins); if the bridge can't provide it (old build), fall back to
      // diffing the effective config against defaults. Keys are re-sorted
      // alphabetically so the editor shows them in a stable, predictable order.
      let overrides: Record<string, unknown>;
      try {
        if (typeof bridge.getOverrides === "function") {
          overrides = sortJsonKeys(
            this._pickGlobal((await bridge.getOverrides()) ?? {}),
          ) as Record<string, unknown>;
        } else {
          const raw = this._pickGlobal((await bridge.getAll()) ?? {});
          overrides = (stripDefaults(raw, baseDefaults) ?? {}) as Record<string, unknown>;
        }
      } catch {
        const raw = this._pickGlobal((await bridge.getAll()) ?? {});
        overrides = (stripDefaults(raw, baseDefaults) ?? {}) as Record<string, unknown>;
      }
      this._defaults = sortJsonKeys(baseDefaults) as Record<string, unknown>;
      this._savedOverrides = cloneDeep(overrides);
      this._sync(overrides);
      this._error = "";
    } catch {
      this._error = "Failed to load the global settings.";
    } finally {
      this._loading = false;
      this._emitState();
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

  /** Recompute the derived state (overrides → effective + pinned set). */
  private _sync(overrides: Record<string, unknown>): void {
    this._overrides = overrides;
    this._effective = mergeDefaults(overrides, this._defaults ?? {}) as Record<string, unknown>;
    this._pinned = pinnedPaths(overrides, this._defaults ?? {});
  }

  /** The document passed to the editor: the overrides only, or the full
   *  effective document when showing defaults. */
  private _editorValue(): Record<string, unknown> {
    if (!this._overrides) return {};
    if (this._showDefaults) return this._effective ?? {};
    return this._overrides;
  }

  /** The JSON editor staged a whole-object edit — reconcile it back to the
   *  override document (differently depending on which view is active). */
  private _onJsonEditorChange(e: CustomEvent): void {
    const value = (e.detail as { value: Record<string, unknown> }).value;
    if (this._showDefaults) {
      const next = (stripDefaults(value, this._defaults ?? {}, this._pinned) ??
        {}) as Record<string, unknown>;
      this._sync(next);
    } else {
      this._sync(value);
    }
    this._emitState();
  }

  /** The user clicked "overwrite" on a faded default row — pin that value into
   *  the override document so it's persisted and becomes deletable/editable. */
  private _onOverwrite(e: CustomEvent): void {
    const detail = e.detail as { path: JsonPath; value: unknown };
    if (!this._overrides || !detail?.path?.length) return;
    const next = cloneDeep(this._overrides);
    setAt(next, detail.path, detail.value);
    this._sync(next);
    this._emitState();
  }

  /** True when the staged overrides differ from the persisted baseline. */
  private _isDirty(): boolean {
    if (!this._overrides || !this._savedOverrides) return !!this._overrides;
    return JSON.stringify(this._overrides) !== JSON.stringify(this._savedOverrides);
  }

  /** Public save — persists the staged override document through the bridge. */
  async save(): Promise<void> {
    const bridge = this._bridge();
    if (!this._overrides || !bridge) return;
    this._saving = true;
    try {
      // Persist the override document with its keys sorted alphabetically so
      // the config file reads in a stable, predictable order.
      const doc = sortJsonKeys(this._overrides) as Record<string, unknown>;
      // Persist by leaf path so pinned values (a leaf equal to its default)
      // are written as explicit keys and survive on disk.
      for (const key of leafPaths(doc)) {
        await bridge.set(key, getAt(doc, pathFromKey(key)));
      }
      this._savedOverrides = cloneDeep(doc);
      this._sync(doc);
      this._error = "";
    } catch {
      this._error = "Failed to save the global settings.";
    } finally {
      this._saving = false;
      this._emitState();
    }
  }

  /** Public reset — discards staged edits and restores the persisted settings. */
  reset(): void {
    if (!this._savedOverrides) return;
    this._sync(cloneDeep(this._savedOverrides));
    this._emitState();
  }

  /** Public toggle — show/hide the faded defaults overlay in the editor. */
  toggleShowDefaults(): void {
    this._showDefaults = !this._showDefaults;
    this._emitState();
  }

  /** Whether there are unsaved edits (read by the parent footer). */
  get isDirty(): boolean {
    return this._isDirty();
  }

  /** Notify the parent window's custom settings bottom bar of our state. */
  private _emitState(): void {
    this.dispatchEvent(
      new CustomEvent(MANAGER_SETTINGS_STATE_EVENT, {
        detail: { dirty: this._isDirty(), saving: this._saving, showDefaults: this._showDefaults },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Row height for the JSON editor — the global platform line-height. */
  private _jsonRowHeight(): number {
    const lh = (this._effective as { lineHeight?: unknown } | null)?.lineHeight;
    return typeof lh === "number" && lh >= 14 && lh <= 100 ? lh : 20;
  }

  override render(): TemplateResult {
    return html`<div class="mms-root">
      ${
        this._loading
          ? html`<p class="mms-note">Loading…</p>`
          : html`<div class="mms-editor">
              <json-editor
                .rowHeight=${this._jsonRowHeight()}
                .value=${this._editorValue()}
                .defaults=${this._defaults}
                .showDefaults=${this._showDefaults}
                .explicitPaths=${[...this._pinned]}
                .schema=${GLOBAL_SETTINGS_SCHEMA}
                @json-editor-change=${(e: CustomEvent) => void this._onJsonEditorChange(e)}
                @json-editor-overwrite=${(e: CustomEvent) => this._onOverwrite(e)}
              ></json-editor>
            </div>`
      }
      ${this._error ? html`<p class="mms-note mms-note--error">${this._error}</p>` : ""}
    </div>`;
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "openp41ge-manager-settings": Openp41geManagerSettings;
  }
}
