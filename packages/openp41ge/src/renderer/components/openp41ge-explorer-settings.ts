/**
 * <openp41ge-explorer-settings> — Explorer settings surface for the settings
 * drawer (opened from the Explorer's gear).
 *
 * Edits are staged in a JSON editor (with key-hover tooltips from
 * EXPLORER_SETTINGS_SCHEMA) — nothing is persisted until the user presses
 * Save (Reset discards the staged edits). Saving writes each setting through
 * the config service, so the Explorer re-flows on Save.
 *
 * The editor shows ONLY the Explorer values the user has overridden (the
 * config stores just the overrides — the Explorer's own defaults of 16px /
 * depth 2 are implied). A "show defaults" toggle in the bottom bar renders the
 * full effective document with the default-valued parts faded, so the user can
 * see what is available and what they've already set; each faded row offers an
 * "overwrite" affordance that pins the value into the user config (after which
 * it becomes a normal, editable, deletable override).
 *
 * The document being edited is the raw *overrides* (not the merged effective
 * doc): each row maps 1:1 to a persisted value, so deleting a row removes it.
 * In show-defaults mode the editor gets the merged effective doc plus the set
 * of pinned leaf paths, so a value that equals a default still renders as an
 * explicit override (not faded) and offers the overwrite affordance.
 *
 * The Reset/Save actions live in the drawer head (exported via
 * `renderHeadAction`, mounted by the settings drawer host next to ✕) rather
 * than in the surface body, so the JSON editor fills the drawer's height
 * above the bottom bar. The bottom bar (`.exs-footer`, pinned flush under
 * the editor) holds a show-defaults toggle on the left and the right-aligned
 * Sort keys action — matching the Agent settings drawer's footer style.
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
import { EXPLORER_SETTINGS_SCHEMA } from "../models/explorer-settings-schema";
import type { ConfigService } from "../services/config-service";
import type { Openp41geSettingsDrawerHost } from "./openp41ge-settings-drawer-host";
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

  /**
   * The drawer host that mounted this surface, bridged by
   * <openp41ge-settings-surface>. Used to force the host to re-render the
   * drawer-head Reset/Save actions when this content's dirty/saving state
   * changes. Null when used standalone (e.g. as a grid tab).
   */
  host: Openp41geSettingsDrawerHost | null = null;

  /** The staged override document — what the user has written (also what will
   *  be persisted). Pins (values equal to their default) live here too. */
  @state() private _overrides: ExplorerSettings | null = null;
  /** The last persisted override document (the dirty baseline). */
  @state() private _savedOverrides: ExplorerSettings | null = null;
  /** The Explorer's own defaults (16px indent, depth 2) for these settings. */
  @state() private _defaults: ExplorerSettings = {
    indentSize: DEFAULT_INDENT,
    prefetchDepth: DEFAULT_PREFETCH,
  };
  /** The effective (defaults-merged) document — derived from `_overrides`. */
  @state() private _effective: ExplorerSettings | null = null;
  /** Dot-joined leaf paths the user has explicitly set (pins + overrides). */
  @state() private _pinned = new Set<string>();
  /** Whether the editor shows the full effective document with faded defaults. */
  @state() private _showDefaults = false;

  @state() private _loading = true;
  @state() private _saving = false;
  @state() private _error = "";

  override connectedCallback(): void {
    super.connectedCallback();
    void this._loadConfig();
  }

  /** Read the persisted Explorer overrides and seed the staged draft. */
  private async _loadConfig(): Promise<void> {
    const localDefaults: ExplorerSettings = {
      indentSize: DEFAULT_INDENT,
      prefetchDepth: DEFAULT_PREFETCH,
    };
    // The override document is the minimum needed to render; defaults are only
    // needed for the faded-defaults overlay, so a missing/failing overrides
    // source (e.g. a bridge that hasn't been upgraded to expose the raw
    // overrides) degrades to diffing the effective config against the local
    // Explorer defaults.
    let overrides: ExplorerSettings | null = null;
    try {
      if (
        this.configService &&
        typeof (this.configService as unknown as { getOverrides?: unknown }).getOverrides ===
          "function" &&
        typeof (this.configService as unknown as { getDefaults?: unknown }).getDefaults ===
          "function"
      ) {
        const defaults = await (
          this.configService as unknown as {
            getDefaults: () => Promise<Record<string, unknown> | null>;
          }
        ).getDefaults();
        const raw = await (
          this.configService as unknown as {
            getOverrides: () => Promise<Record<string, unknown> | null>;
          }
        ).getOverrides();
        const platDefaults = this._pickExplorer(defaults ?? {});
        this._defaults = {
          indentSize: platDefaults.indentSize ?? DEFAULT_INDENT,
          prefetchDepth: platDefaults.prefetchDepth ?? DEFAULT_PREFETCH,
        };
        overrides = this._pickExplorer(raw ?? {});
      }
    } catch {
      overrides = null;
    }
    if (!overrides) {
      // Fallback: read the effective values and strip the defaults out.
      const effective: ExplorerSettings = {
        indentSize: this._readCurrentIndent(),
        prefetchDepth: this._readCurrentPrefetch(),
      };
      overrides = (stripDefaults(effective, localDefaults) ?? {}) as ExplorerSettings;
    }
    this._savedOverrides = cloneDeep(overrides);
    this._sync(overrides);
    this._loading = false;
  }

  /** Slice just the Explorer keys out of a raw config/overrides document. */
  private _pickExplorer(raw: Record<string, unknown>): ExplorerSettings {
    const ex = raw.explorer as Record<string, unknown> | undefined;
    const out: ExplorerSettings = {} as ExplorerSettings;
    if (ex && typeof ex === "object") {
      if (typeof ex.indentSize === "number" && Number.isFinite(ex.indentSize)) {
        out.indentSize = Math.min(MAX_INDENT, Math.max(MIN_INDENT, Math.round(ex.indentSize)));
      }
      if (typeof ex.prefetchDepth === "number" && Number.isFinite(ex.prefetchDepth)) {
        out.prefetchDepth = Math.min(
          MAX_PREFETCH,
          Math.max(MIN_PREFETCH, Math.round(ex.prefetchDepth)),
        );
      }
    }
    return out;
  }

  /** Recompute the derived state (overrides → effective + pinned set). */
  private _sync(overrides: ExplorerSettings): void {
    this._overrides = overrides;
    this._effective = mergeDefaults(overrides, this._defaults) as ExplorerSettings;
    this._pinned = pinnedPaths(overrides, this._defaults);
  }

  /** The document passed to the editor: the overrides only, or the full
   *  effective document when showing defaults. */
  private _editorValue(): ExplorerSettings {
    if (!this._overrides) return {} as ExplorerSettings;
    if (this._showDefaults) return this._effective ?? ({} as ExplorerSettings);
    return this._overrides;
  }

  /** The JSON editor committed an edit — stage it into the draft only. */
  private _onJsonEditorChange(e: CustomEvent): void {
    const value = (e.detail as { value: ExplorerSettings }).value;
    if (this._showDefaults) {
      // Reconcile the effective edit back to the override document (a value
      // the user left at its default is not an override unless pinned).
      const next = (stripDefaults(value, this._defaults, this._pinned) ??
        {}) as ExplorerSettings;
      this._sync(next);
    } else {
      this._sync(value);
    }
    this.host?.refresh();
  }

  /** The user clicked "overwrite" on a faded default row — pin that value into
   *  the override document so it's persisted and becomes deletable/editable. */
  private _onOverwrite(e: CustomEvent): void {
    const detail = e.detail as { path: JsonPath; value: unknown };
    if (!this._overrides || !detail?.path?.length) return;
    const next = cloneDeep(this._overrides);
    setAt(next, detail.path, detail.value);
    this._sync(next);
    this.host?.refresh();
  }

  /** True when the staged draft differs from the persisted baseline. */
  private _isDirty(): boolean {
    if (!this._overrides || !this._savedOverrides) return !!this._overrides;
    return JSON.stringify(this._overrides) !== JSON.stringify(this._savedOverrides);
  }

  /** Persist the staged Explorer settings (Save) — writes every override leaf. */
  private async _save(): Promise<void> {
    if (!this._overrides) return;
    this._saving = true;
    try {
      // Persist the overrides with their keys sorted alphabetically so the
      // config file reads in a stable order. Persist by leaf path so pinned
      // values (a leaf equal to its default) are written as explicit keys.
      const doc = sortJsonKeys(this._overrides) as ExplorerSettings;
      for (const key of leafPaths(doc)) {
        await this.configService.set(
          `explorer.${key}`,
          getAt(doc, pathFromKey(key)),
        );
      }
      this._savedOverrides = cloneDeep(doc);
      this._sync(doc);
      this._error = "";
    } catch {
      this._error = "Failed to save the Explorer settings.";
    } finally {
      this._saving = false;
      this.host?.refresh();
    }
  }

  /** Discard the staged edits and restore the last persisted settings. */
  private _reset(): void {
    if (!this._savedOverrides) return;
    this._sync(cloneDeep(this._savedOverrides));
    this.host?.refresh();
  }

  /** Toggle the faded-defaults overlay in the JSON editor. */
  private _toggleShowDefaults(): void {
    this._showDefaults = !this._showDefaults;
    this.host?.refresh();
  }

  /** Sort every object key (recursively) in the staged draft so the JSON
   *  reads in a stable order — matching the Agent settings drawer's Sort keys
   *  bottom-bar action. Nothing is persisted until Save. */
  private _sortConfig(): void {
    if (!this._overrides) return;
    this._sync(sortJsonKeys(this._overrides) as ExplorerSettings);
    this.host?.refresh();
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

  /**
   * Head actions for the drawer: a square Reset button (disabled until there
   * are unsaved changes) followed by a square Save button, both shown next to
   * ✕ (right-aligned, Reset immediately before Save). Save is highlighted blue
   * while there are unsaved changes — matching the Agent settings drawer.
   * Bound `this` so the host can call it as `surface.renderHeadAction()`.
   */
  readonly renderHeadAction = (): TemplateResult => {
    const dirty = this._isDirty();
    return html`
      <button
        class="sdw-reset"
        type="button"
        aria-label="Reset"
        title="Reset"
        ?disabled=${!dirty}
        @click=${() => this._reset()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
          <path
            d="M520-330v-60h160v60H520Zm60 210v-50h-60v-60h60v-50h60v160h-60Zm100-50v-60h160v60H680Zm40-110v-160h60v50h60v60h-60v50h-60Zm111-280h-83q-26-88-99-144t-169-56q-117 0-198.5 81.5T200-480q0 72 32.5 132t87.5 98v-110h80v240H160v-80h94q-62-50-98-122.5T120-480q0-75 28.5-140.5t77-114q48.5-48.5 114-77T480-840q129 0 226.5 79.5T831-560Z"
          />
        </svg>
      </button>
      <button
        class="sdw-save ${dirty ? "sdw-save--dirty" : ""}"
        type="button"
        aria-label="Save"
        title="Save"
        @click=${() => void this._save()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
          <path
            d="M840-680v480q0 33-23.5 56.5T760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h480l160 160Zm-80 34L646-760H200v560h560v-446ZM565-275q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35ZM240-560h360v-160H240v160Zm-40-86v446-560 114Z"
          />
        </svg>
      </button>
    `;
  };

  render(): TemplateResult {
    return html`
      <style>
        .exs-pane {
          box-sizing: border-box;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--settings-pane-bg, var(--bg-primary, #161616));
          color: var(--text-primary, #ccc);
          font-size: 13px;
        }
        /* The JSON editor fills the surface height above the bottom bar,
         * flush with the drawer edges (no content padding) — like the Agent
         * settings drawer's json pane. */
        .exs-editor {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          padding: 0;
        }
        .exs-editor > json-editor {
          flex: 1;
          min-height: 0;
        }
        /* Bottom bar pinned under the JSON editor — full-width, flush with
         * the drawer edges, matching the Agent settings drawer's footer. */
        .exs-footer {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          height: 34px;
          box-sizing: border-box;
          border-top: 1px solid var(--divider, #333);
          background: var(--bg-surface, #161616);
        }
        .exs-footer-spacer {
          flex: 1 1 auto;
        }
        /* Square icon-only action in the bottom bar: full height with a
         * left-side separator — like the drawer head buttons. */
        .exs-footer-btn {
          height: 100%;
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: none;
          border-left: 1px solid var(--border-divider, #2d2d2d);
          border-radius: 0;
          background: transparent;
          color: var(--text-secondary, #999);
          cursor: pointer;
        }
        .exs-footer-btn:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .exs-footer-btn[disabled]:hover {
          background: transparent;
          color: var(--text-secondary, #999);
        }
        .exs-footer-btn svg {
          width: 14px;
          height: 14px;
          fill: currentColor;
        }
        .exs-toggle--on {
          color: var(--accent, #58a6ff);
        }
        .exs-note {
          margin: 6px 0 0;
          font-size: 12px;
          color: var(--text-secondary, #999);
        }
        .exs-note--error {
          color: var(--danger, #f44336);
        }
      </style>
      <div class="exs-pane">
        ${
          this._loading
            ? html`<p class="exs-note">Loading…</p>`
            : html`<div class="exs-editor">
                <json-editor
                  .rowHeight=${this._rowHeight()}
                  .value=${this._editorValue()}
                  .defaults=${this._defaults}
                  .showDefaults=${this._showDefaults}
                  .explicitPaths=${[...this._pinned]}
                  .schema=${EXPLORER_SETTINGS_SCHEMA}
                  @json-editor-change=${(e: CustomEvent) => void this._onJsonEditorChange(e)}
                  @json-editor-overwrite=${(e: CustomEvent) => this._onOverwrite(e)}
                ></json-editor>
              </div>`
        }
        ${this._error ? html`<p class="exs-note exs-note--error">${this._error}</p>` : nothing}
        <div class="exs-footer">
          <span class="exs-footer-spacer"></span>
          <button
            class="exs-footer-btn exs-toggle ${this._showDefaults ? "exs-toggle--on" : ""}"
            type="button"
            title="Show default values"
            aria-label="Show default values"
            aria-pressed="${this._showDefaults}"
            @click=${() => this._toggleShowDefaults()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
              <path
                d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-60q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35Zm0 180q-146 0-246-70T60-500q74-160 174-230t246-70q146 0 246 70t174 230q-74 160-174 230t-246 70Zm0-60q105 0 188-55t132-145q-49-90-132-145t-188-55q-105 0-188 55T120-500q49 90 132 145t188 55Z"
              />
            </svg>
          </button>
          <button
            class="exs-footer-btn"
            type="button"
            title="Sort keys"
            aria-label="Sort keys"
            ?disabled=${!this._overrides}
            @click=${() => this._sortConfig()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M120-240v-80h240v80H120Zm0-200v-80h480v80H120Zm0-200v-80h720v80H120Z" />
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  createRenderRoot(): HTMLElement {
    return this; // Light DOM, consistent with the editor + overlay shell
  }
}
