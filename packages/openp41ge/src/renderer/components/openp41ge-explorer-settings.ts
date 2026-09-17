/**
 * <openp41ge-explorer-settings> — Explorer settings tab content.
 *
 * Hosted by the settings drawer when the Explorer's gear is opened. Settings:
 *  - `explorer.indentSize` — the indentation unit (px, default 16) used as
 *    the base multiple for every Explorer row. Indentation is always a
 *    multiple of this fixed value, so the whole sidebar re-flows when it
 *    changes.
 * Persisted in the config service and stays live when changed elsewhere.
 */

import { customElement, state } from "lit/decorators.js";
import { LitElement, html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { createRef, ref } from "lit/directives/ref.js";
import "openp41ge-uikit";
import { lockClosedIcon, lockOpenIcon } from "../icons";
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

/** How far a locked pill may travel from its value (rubber-band cap), in indent px. */
const RUBBER_TRAVEL = 8;

@customElement("openp41ge-explorer-settings")
export class Openp41geExplorerSettings extends LitElement {
  /** Injectable for tests (defaults to the platform ConfigService). */
  configService: ConfigService = appServices.configService;

  @state()
  private _indent = this._readCurrentIndent();

  @state()
  private _prefetch = this._readCurrentPrefetch();

  @state()
  private _locked = true;

  /** Transient pill position while dragging a *locked* slider (rubber band). */
  @state()
  private _dragValue: number | null = null;

  /** Disables the spring transition while the pill is being dragged. */
  @state()
  private _dragging = false;

  private _rangeRef = createRef<HTMLInputElement>();

  private _unsubKey: (() => void) | null = null;
  private _unsubPrefetch: (() => void) | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._indent = this._readCurrentIndent();
    // Stay live if the indent changes elsewhere (e.g. another window).
    this._unsubKey = this.configService.onKeyChange(INDENT_KEY, () => {
      this._indent = this._readCurrentIndent();
      this._dragValue = null;
      this._dragging = false;
      this._syncRangeValue();
      this.requestUpdate();
    });
    this._prefetch = this._readCurrentPrefetch();
    this._unsubPrefetch = this.configService.onKeyChange(PREFETCH_KEY, () => {
      this._prefetch = this._readCurrentPrefetch();
      this.requestUpdate();
    });
    document.addEventListener("pointerdown", this._onDocPointerDown);
  }

  firstUpdated(): void {
    this._syncRangeValue();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubKey?.();
    this._unsubKey = null;
    this._unsubPrefetch?.();
    this._unsubPrefetch = null;
    document.removeEventListener("pointerdown", this._onDocPointerDown);
  }

  render(): TemplateResult {
    return html`
      <style>
        .exs-pane {
          box-sizing: border-box;
          height: 100%;
          overflow: auto;
          /* Match the other drawer surfaces (agent-matching 18px). */
          padding: var(--settings-pane-padding, 28px 32px);
          background: var(--settings-pane-bg, var(--bg-primary, #161616));
          color: var(--text-primary, #ccc);
          font-size: 13px;
        }
        .exs-section-title {
          margin: 0 0 14px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary, #999);
        }
        .exs-card {
          box-sizing: border-box;
          max-width: 620px;
          padding: 12px 14px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
        }
        .exs-card-question {
          display: block;
          margin: 0 0 12px;
          font-weight: 500;
          color: var(--text-primary, #e0e0e0);
        }
        /* Slider — no border on the range, its track, or its thumb. The
           selected value rides on the thumb, which is drawn as a pill by the
           absolutely-positioned .exs-thumb-label (the real thumb is invisible
           but still provides the full drag hit-area). */
        .exs-slider-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .exs-range-wrap {
          position: relative;
          display: flex;
          align-items: center;
          height: 30px;
          flex: 1;
          min-width: 0;
        }
        .exs-range:disabled {
          cursor: default;
        }
        .exs-lock-btn {
          flex-shrink: 0;
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border: none;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.07);
          color: var(--text-secondary, #999);
          cursor: pointer;
        }
        .exs-lock-btn:hover {
          background: rgba(255, 255, 255, 0.16);
          color: var(--text-primary, #ccc);
        }
        .exs-lock-btn:focus-visible {
          outline: 2px solid var(--accent, #4f9cf9);
          outline-offset: 1px;
        }
        /* Register --exs-fill so the track fill can spring with the pill. */
        @property --exs-fill {
          syntax: "<length-percentage>";
          inherits: true;
          initial-value: 0px;
        }
        .exs-range {
          -webkit-appearance: none;
          appearance: none;
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          border: none;
          outline: none;
          background: transparent;
          cursor: pointer;
          transition: --exs-fill 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .exs-range--dragging {
          transition: none;
        }
        .exs-range::-webkit-slider-runnable-track {
          height: 6px;
          border: none;
          border-radius: 9999px;
          /* The portion of the track left of the pill thumb is filled blue; the
             boundary lines up with the pill's centre via --exs-fill. */
          background: linear-gradient(
            to right,
            rgba(86, 156, 214, 0.16) var(--exs-fill),
            rgba(255, 255, 255, 0.12) var(--exs-fill)
          );
        }

        .exs-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 44px;
          height: 24px;
          margin-top: -9px; /* centers the thumb on the track */
          border: none;
          border-radius: 9999px;
          background: transparent;
        }
        .exs-range::-moz-range-track {
          height: 6px;
          border: none;
          border-radius: 9999px;
          background: linear-gradient(
            to right,
            rgba(86, 156, 214, 0.16) var(--exs-fill),
            rgba(255, 255, 255, 0.12) var(--exs-fill)
          );
        }

        .exs-range::-moz-range-thumb {
          width: 44px;
          height: 24px;
          border: none;
          border-radius: 9999px;
          background: transparent;
        }
        .exs-range:focus-visible,
        .exs-range:focus {
          outline: none;
        }
        .exs-thumb-label {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          min-width: 44px;
          height: 24px;
          padding: 0 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          /* Same combination as the log viewer's filter pills: the darker
             filter-input-box background (var(--bg-primary)) under the
             transparent-blue fill, clipped to the pill's rounded shape. */
          border-radius: 999px;
          background: var(--bg-primary, #1e1e1e);
          color: #569cd6;
          overflow: hidden;
          font-size: 11px;
          font-weight: 600;
          line-height: 20px;
          white-space: nowrap;
          pointer-events: none;
          transition: left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .exs-thumb-label--dragging {
          transition: none;
        }
        .exs-thumb-fill {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: rgba(86, 156, 214, 0.16);
        }
        .exs-thumb-text {
          position: relative;
        }

        .exs-card-help {
          margin: 12px 0 0;
          color: var(--text-secondary, #999);
          line-height: 1.5;
        }

        /* Prefetch depth numeric input. */
        .exs-prefetch-input {
          width: 84px;
          padding: 6px 8px;
          border: none;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.07);
          color: var(--text-primary, #e0e0e0);
          font-size: 13px;
        }
        .exs-prefetch-input:focus-visible,
        .exs-prefetch-input:focus {
          outline: 2px solid var(--accent, #4f9cf9);
          outline-offset: 1px;
        }
      </style>
      <div class="exs-pane">
        <div class="exs-section-title">Explorer</div>

        <div class="exs-card">
          <label class="exs-card-question" for="expl-indent-range">
            How many pixels should each indentation level be?
          </label>
          <div class="exs-slider-row">
            <div class="exs-range-wrap">
              <input
                id="expl-indent-range"
                class="exs-range ${this._dragging ? "exs-range--dragging" : ""}"
                ${ref(this._rangeRef)}
                type="range"
                min=${MIN_INDENT}
                max=${MAX_INDENT}
                step="1"
                @input=${this._onRangeInput}
                @change=${this._onRangeChange}
                style="--exs-fill: calc(${this._displayPercent} * (100% - 44px) + 22px)"
              />
              <span
                class="exs-thumb-label ${this._dragging ? "exs-thumb-label--dragging" : ""}"
                aria-hidden="true"
                style="left: calc(${this._displayPercent} * (100% - 44px) + 22px)"
                ><span class="exs-thumb-fill"></span
                ><span class="exs-thumb-text">${this._displayValue}px</span></span
              >
            </div>
            <button
              class="exs-lock-btn"
              data-testid="expl-indent-lock"
              title=${this._locked ? "Unlock indentation" : "Lock indentation"}
              aria-pressed=${String(!this._locked)}
              @click=${this._onToggleLock}
            >
              ${this._locked ? unsafeHTML(lockClosedIcon(20)) : unsafeHTML(lockOpenIcon(20))}
            </button>
          </div>

          <p class="exs-card-help">
            Every Explorer row is indented by a multiple of this fixed value, so the repo, worktree,
            and file rows all stay aligned. The sidebar re-lays-out as you change it.
          </p>
        </div>

        <div class="exs-card" style="margin-top:14px;">
          <label class="exs-card-question" for="expl-prefetch-input">
            How many levels of files should the Explorer load ahead?
          </label>
          <div class="exs-slider-row">
            <input
              id="expl-prefetch-input"
              class="exs-prefetch-input"
              type="number"
              min=${MIN_PREFETCH}
              max=${MAX_PREFETCH}
              step="1"
              .value=${String(this._prefetch)}
              @change=${this._onPrefetchChange}
            />
          </div>
          <p class="exs-card-help">
            When you expand a folder, this many levels of subfolder contents are fetched in advance,
            so opening the next level is instant instead of another round trip. Higher values use
            more memory and I/O for large repositories; 0 loads each level only when you open it.
          </p>
        </div>
      </div>
    `;
  }

  /** Toggle the lock that guards the indent slider from accidental changes. */
  private _onToggleLock(): void {
    this._locked = !this._locked;
  }

  /** Auto-relock when the user interacts anywhere outside the slider row. */
  private _onDocPointerDown = (e: PointerEvent): void => {
    if (this._locked) return;
    // e.target is retargeted to the shadow host when the drawer sits inside a
    // shadow root, so match against the composed path (crosses shadow DOM).
    const row = this.querySelector(".exs-slider-row");
    if (row && e.composedPath().includes(row)) return;
    this._locked = true;
  };

  /** Persist a valid prefetch depth. */
  private _onPrefetchChange(e: Event): void {
    const raw = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    const v = Math.min(MAX_PREFETCH, Math.max(MIN_PREFETCH, Math.round(raw)));
    this._prefetch = v;
    void this.configService.set(PREFETCH_KEY, v);
  }

  /** Config stores the depth; missing or invalid falls back to the default. */
  private _readCurrentPrefetch(): number {
    const raw = this.configService.get(PREFETCH_KEY);
    const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_PREFETCH;
    return Math.min(MAX_PREFETCH, Math.max(MIN_PREFETCH, n));
  }

  /** Persist a valid indent unit. */
  private _persist(indent: number): void {
    this._indent = indent;
    void this.configService.set(INDENT_KEY, indent);
  }

  /**
   * While locked, the pill rubber-bands: it follows the drag but springs
   * back to the persisted value on release. When unlocked, drags persist.
   */
  private _onRangeInput(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v)) return;
    if (this._locked) {
      this._dragValue = this._rubberBand(Math.round(v));
      this._dragging = true;
    } else {
      this._persist(Math.round(v));
    }
  }

  /**
   * Rubber-band a locked drag: the further you drag from the locked value,
   * the stronger the resistance, and the pill's travel hard-saturates at
   * RUBBER_TRAVEL so it can never be dragged far (it returns to the exact
   * locked value on release).
   */
  private _rubberBand(raw: number): number {
    const anchor = Math.round(this._indent);
    const d = raw - anchor;
    const sign = d >= 0 ? 1 : -1;
    const a = Math.abs(d);
    const moved = RUBBER_TRAVEL * (a / (a + RUBBER_TRAVEL));
    const v = Math.round(anchor + sign * moved);
    return Math.min(MAX_INDENT, Math.max(MIN_INDENT, v));
  }

  /** Release while locked: snap the pill (and fill) back to the locked value. */
  private _onRangeChange(): void {
    if (!this._locked) return;
    this._dragValue = null;
    this._dragging = false;
    this._syncRangeValue();
  }

  /** The value shown by the pill: the drag position, or the set value. */
  private get _displayValue(): number {
    return this._dragValue ?? this._indent;
  }

  /** Slider position as a 0..1 fraction (drives the pill + fill). */
  private get _displayPercent(): number {
    return (this._displayValue - MIN_INDENT) / (MAX_INDENT - MIN_INDENT);
  }

  /** Keep the native range element's value in sync with the set value. */
  private _syncRangeValue(): void {
    const el = this._rangeRef.value;
    if (el) el.value = String(this._indent);
  }

  /** Config stores px; missing or invalid falls back to the default. */
  private _readCurrentIndent(): number {
    const raw = this.configService.get(INDENT_KEY);
    const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_INDENT;
    return Math.min(MAX_INDENT, Math.max(MIN_INDENT, n));
  }

  createRenderRoot(): HTMLElement {
    return this; // Light DOM, consistent with the editor + overlay shell
  }
}
