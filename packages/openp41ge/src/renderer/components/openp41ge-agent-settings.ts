/**
 * <openp41ge-agent-settings> — Agent settings grid tab content.
 *
 * A settings-card surface that manages **multiple** AI provider connections.
 * The base view is a "Providers" card listing every configured provider and an
 * add row. Clicking a provider row (or the add row) slides a **right-side
 * drawer** in from the right — replicating the Window Manager's multi-tiered
 * stacked-drawer mechanics (breadcrumb-style head, slide animation, masked
 * sliver of the level beneath, width tiers) — to edit that provider on the
 * standard cards, with radio-style **preset pickers** at the top (OpenAI,
 * Anthropic, local servers, etc.) so endpoints aren't typed by hand.
 *
 * Persists the `agent` config via an injectable ConfigService (so tests can
 * substitute a fake). Settings UI only — the chat runtime is untouched.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import type { ConfigService } from "../services/config-service";
import { showConfirmModal } from "../components/openp41ge-confirm-modal";
import {
  PROVIDER_PRESETS,
  CUSTOM_PRESET_ID,
  customPreset,
  providerPreset,
  presetFor,
  applyPreset,
  nextProviderId,
  providerDisplayName,
  endpointHost,
  type AgentConfig,
  type ProviderConfig,
  type ProviderPreset,
} from "../models/agent-provider-presets";

/** A draft provider config. Numeric fields are held as their raw sanitized
 * text while editing and coerced to numbers on save, so decimal input like
 * "0.7" or "12." is not mangled by a controlled-number round-trip. */
type ProviderDraft = Omit<ProviderConfig, "temperature" | "maxTokens"> & {
  temperature?: number | string;
  maxTokens?: number | string;
};

interface DrawerState {
  id: string;
  kind: "provider";
  /** The provider key being edited; null = adding a new provider. */
  editId: string | null;
  title: string;
  presetId: string;
  draft: ProviderDraft;
}

/** A drawer that is animating out; keeps its last width so it exits in place. */
interface ClosingDrawer extends DrawerState {
  width: number;
}

interface TestResult {
  ok: boolean;
  error?: string;
}

export class Openp41geAgentSettings extends LitElement {
  /**
   * Injectable for tests. When null, the component reads/writes the `agent`
   * config directly through `window.openp41ge.config` (the IPC bridge).
   */
  configService: ConfigService | null = null;

  @state() private _config: AgentConfig | null = null;
  @state() private _loading = true;
  @state() private _drawers: DrawerState[] = [];
  @state() private _closingDrawers: ClosingDrawer[] = [];
  @state() private _saving = false;
  @state() private _testing = false;
  @state() private _testResult: TestResult | null = null;
  @state() private _defaultOpen = false;

  /** DI seam — production shows the confirm modal; tests stub this. */
  _confirm: (opts: {
    message: string;
    detail?: string;
    confirmLabel: string;
    confirmStyle: string;
  }) => Promise<boolean> = (opts) => showConfirmModal(opts);

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener("keydown", this._onKeydown);
    document.addEventListener("pointerdown", this._onDocPointerDown);
    void this._load();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this._onKeydown);
    document.removeEventListener("pointerdown", this._onDocPointerDown);
  }

  private async _load(): Promise<void> {
    try {
      const cfg = this.configService
        ? (this.configService.get("agent") as AgentConfig | undefined)
        : ((await window.openp41ge?.config?.get?.("agent")) as AgentConfig | undefined);
      this._config = cfg ?? this._defaultConfig();
    } catch {
      this._config = this._defaultConfig();
    }
    this._loading = false;
  }

  private _defaultConfig(): AgentConfig {
    return {
      providerId: "vllm",
      providers: { vllm: { baseUrl: "http://localhost:8000/v1", model: "" } },
    };
  }

  /** Escape closes the default-provider dropdown first, then the top drawer. */
  private _onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    if (this._defaultOpen) {
      this._defaultOpen = false;
      return;
    }
    if (this._drawers.length === 0) return;
    e.preventDefault();
    this._closeTopDrawer();
  };

  private _onDocPointerDown = (e: PointerEvent): void => {
    if (!this._defaultOpen) return;
    // Events from inside the shadow root retarget to the host, so a target of
    // `this` means the click was inside the component.
    if (e.target === this) return;
    this._defaultOpen = false;
  };

  /** The display name of the currently-selected default provider. */
  private _activeProviderName(): string {
    const config = this._config;
    const id = config?.providerId;
    const entry = Object.entries(config?.providers ?? {}).find(([key]) => key === id);
    if (!entry) return "Select a provider";
    return providerDisplayName(presetFor(entry[1]), entry[1]);
  }

  private _toggleDefault(): void {
    this._defaultOpen = !this._defaultOpen;
  }

  private async _selectDefault(id: string): Promise<void> {
    this._defaultOpen = false;
    await this._setActive(id);
  }

  private _chevronSvg(): TemplateResult {
    return html`
      <svg
        class="ags-default-chevron"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    `;
  }

  // ── Drawer stack mechanics (mirrors the Window Manager) ─────────────────

  private _nextId(): string {
    return `ags-d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  /**
   * Drawer width tiers: the deepest drawer is 75%, its direct parent 80%, and
   * every ancestor above that caps at 85%.
   */
  private _widthFor(index: number): number {
    const L = this._drawers.length;
    if (index === L - 1) return 75;
    if (index === L - 2) return 80;
    return 85;
  }

  /** Width of the single shared shadow, matching the widest (outermost) drawer. */
  private _stackWidth(): number {
    return this._drawers.length ? this._widthFor(0) : 0;
  }

  private _openEdit(id: string): void {
    const config = this._config;
    if (!config) return;
    const draft = config.providers[id];
    if (!draft) return;
    const preset = presetFor(draft);
    this._testResult = null;
    this._drawers = [
      ...this._drawers,
      {
        id: this._nextId(),
        kind: "provider",
        editId: id,
        title: providerDisplayName(preset, draft),
        presetId: preset.id,
        draft: { ...draft },
      },
    ];
    void this.updateComplete.then(() => this._focusBaseUrl());
  }

  private _openAdd(): void {
    const draft = applyPreset(customPreset());
    this._testResult = null;
    this._drawers = [
      ...this._drawers,
      {
        id: this._nextId(),
        kind: "provider",
        editId: null,
        title: "New provider",
        presetId: CUSTOM_PRESET_ID,
        draft,
      },
    ];
    void this.updateComplete.then(() => this._focusBaseUrl());
  }

  private _focusBaseUrl(): void {
    this.renderRoot.querySelector<HTMLInputElement>(".ags-baseurl-input")?.focus();
  }

  private _updateDrawer(id: string, patch: Partial<DrawerState>): void {
    this._drawers = this._drawers.map((d) => (d.id === id ? { ...d, ...patch } : d));
  }

  private _selectPreset(d: DrawerState, presetId: string): void {
    const preset = providerPreset(presetId) ?? customPreset();
    const draft = applyPreset(preset);
    this._updateDrawer(d.id, {
      presetId,
      draft,
      title: draft.name || d.title,
    });
  }

  private _setDraftField(d: DrawerState, patch: Partial<ProviderDraft>): void {
    const cur = this._drawers.find((x) => x.id === d.id);
    if (!cur) return;
    const draft = { ...cur.draft, ...patch };
    const title = patch.name !== undefined && patch.name.trim() ? patch.name.trim() : cur.title;
    this._updateDrawer(d.id, { draft, title });
  }

  private _numberValue(v: string): number | undefined {
    if (v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  /** Strip everything but digits and a single decimal point (temperature). */
  private _sanitizeDecimal(v: string): string {
    const cleaned = v.replace(/[^0-9.]/g, "");
    const firstDot = cleaned.indexOf(".");
    if (firstDot === -1) return cleaned;
    return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }

  /** Strip everything but digits (max output tokens). */
  private _sanitizeInt(v: string): string {
    return v.replace(/[^0-9]/g, "");
  }

  /** The text to render in a numeric field (keeps the raw padded string). */
  private _numDisplay(v: number | string | undefined): string {
    if (v === undefined || v === "") return "";
    return String(v);
  }

  /** Coerce a ProviderDraft into a clean ProviderConfig (numbers on save). */
  private _providerFromDraft(draft: ProviderDraft): ProviderConfig {
    const config: ProviderConfig = { baseUrl: draft.baseUrl, model: draft.model };
    if (draft.name !== undefined) config.name = draft.name;
    if (draft.apiKey !== undefined) config.apiKey = draft.apiKey;
    const temperature = this._numberValue(String(draft.temperature ?? ""));
    if (temperature !== undefined) config.temperature = temperature;
    const maxTokens = this._numberValue(String(draft.maxTokens ?? ""));
    if (maxTokens !== undefined) config.maxTokens = maxTokens;
    return config;
  }

  /** Clicking anywhere on a field card focuses its input. */
  private _focusCardInput(e: Event): void {
    (e.currentTarget as HTMLElement).querySelector<HTMLInputElement>("input")?.focus();
  }

  private _closeDrawer(id: string): void {
    const idx = this._drawers.findIndex((d) => d.id === id);
    if (idx === -1) return;
    const width = this._widthFor(idx);
    const closing = this._drawers[idx];
    this._drawers = this._drawers.filter((d) => d.id !== id);
    this._finalizeClose([{ ...closing, width }]);
  }

  private _closeTopDrawer(): void {
    const top = this._drawers[this._drawers.length - 1];
    if (top) this._closeDrawer(top.id);
  }

  private _closeDeeper(index: number): void {
    const closing = this._drawers
      .slice(index + 1)
      .map((d, i) => ({ ...d, width: this._widthFor(index + 1 + i) }));
    this._drawers = this._drawers.slice(0, index + 1);
    this._finalizeClose(closing);
  }

  private _closeAllDrawers(): void {
    if (this._drawers.length === 0) return;
    const closing = this._drawers.map((d, i) => ({ ...d, width: this._widthFor(i) }));
    this._drawers = [];
    this._finalizeClose(closing);
  }

  private _finalizeClose(closing: ClosingDrawer[]): void {
    if (closing.length === 0) return;
    this._closingDrawers = [...this._closingDrawers, ...closing];
    const ids = new Set(closing.map((c) => c.id));
    window.setTimeout(() => {
      this._closingDrawers = this._closingDrawers.filter((c) => !ids.has(c.id));
    }, 220);
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  private async _persist(config: AgentConfig): Promise<void> {
    const value = JSON.parse(JSON.stringify(config));
    if (this.configService) {
      await this.configService.set("agent", value);
      return;
    }
    await window.openp41ge?.config?.set?.("agent", value);
    document.dispatchEvent(
      new CustomEvent("openp41ge:config-changed", {
        detail: { key: "agent", value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async _setActive(id: string): Promise<void> {
    const config = this._config;
    if (!config) return;
    const next = { ...config, providerId: id };
    this._config = next;
    await this._persist(next);
  }

  private async _saveProvider(d: DrawerState): Promise<void> {
    const config = this._config;
    if (!config) return;
    this._saving = true;
    const draft = this._providerFromDraft(d.draft);
    const existingIds = Object.keys(config.providers);
    const hadProviders = existingIds.length > 0;
    const base = d.presetId === CUSTOM_PRESET_ID ? CUSTOM_PRESET_ID : d.presetId;
    const id = d.editId ?? nextProviderId(existingIds, base);
    const providers = { ...config.providers, [id]: draft };
    let providerId = config.providerId;
    if (!hadProviders) providerId = id;
    else if (!providers[providerId]) providerId = Object.keys(providers)[0] ?? id;
    const next = { ...config, providerId, providers };
    this._config = next;
    await this._persist(next);
    this._saving = false;
    this._closeDrawer(d.id);
  }

  private async _deleteProvider(d: DrawerState): Promise<void> {
    const config = this._config;
    if (!config) return;
    const id = d.editId;
    if (!id) return;
    const name = d.title || "this provider";
    const confirmed = await this._confirm({
      message: `Delete “${name}”?`,
      detail: "This removes the provider from your configuration.",
      confirmLabel: "Delete",
      confirmStyle: "danger",
    });
    if (!confirmed) return;
    const providers = { ...config.providers };
    delete providers[id];
    let providerId = config.providerId;
    if (providerId === id) providerId = Object.keys(providers)[0] ?? "";
    const next = { ...config, providerId, providers };
    this._config = next;
    await this._persist(next);
    this._closeDrawer(d.id);
  }

  private async _testConnection(): Promise<void> {
    const d = this._drawers[this._drawers.length - 1];
    if (!d) return;
    const providerId = d.editId ?? this._config?.providerId;
    if (!providerId) return;
    this._testing = true;
    this._testResult = null;
    try {
      const res = await window.openp41ge?.chat?.pingProvider?.(providerId);
      this._testResult = res ?? { ok: false, error: "No test connection available" };
    } catch (err) {
      this._testResult = { ok: false, error: (err as Error).message };
    }
    this._testing = false;
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  render(): TemplateResult {
    const config = this._config;
    const providers = config?.providers ?? {};
    const entries = Object.entries(providers);
    return html`
      <style>
        :host {
          display: block;
          box-sizing: border-box;
          height: 100%;
          color: var(--text-primary, #ccc);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
        }
        .ags-root {
          position: relative;
          height: 100%;
          overflow: hidden;
          background: var(--bg-primary, #1e1e1e);
        }
        /* The drawer layer hosts the base card and any slide-in drawers. */
        .ags-drawer-layer {
          position: relative;
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }
        .ags-base {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          overflow-y: auto;
        }
        .ags-pane {
          box-sizing: border-box;
          min-height: 100%;
          padding: 28px 32px;
        }
        .ags-section-title {
          margin: 0 0 14px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary, #999);
        }
        .ags-card {
          box-sizing: border-box;
          max-width: 620px;
          padding: 12px 14px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
        }
        .ags-card-question {
          display: block;
          margin: 0 0 14px;
          font-weight: 500;
          color: var(--text-primary, #e0e0e0);
        }
        .ags-card-help {
          margin: 14px 0 0;
          color: var(--text-secondary, #999);
          line-height: 1.5;
        }
        .ags-card-gap {
          margin-top: 16px;
        }

        /* Provider rows in the base card. */
        .ags-provider-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .ags-provider-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          border-radius: 6px;
          cursor: pointer;
          border-bottom: 1px solid var(--divider, #2f3031);
        }
        .ags-provider-row:hover {
          background: var(--bg-active, #37373d);
        }
        .ags-provider-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ags-provider-name {
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ags-provider-meta {
          font-size: 12px;
          color: var(--text-secondary, #999);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ags-chevron {
          flex-shrink: 0;
          color: var(--accent, #569cd6);
        }
        .ags-add-row {
          color: var(--accent, #569cd6);
          font-weight: 500;
        }
        .ags-add-plus {
          font-size: 15px;
        }
        .ags-empty {
          padding: 10px;
          color: var(--text-secondary, #999);
        }
        .ags-default-wrap {
          position: relative;
        }
        .ags-default-trigger {
          width: 100%;
          height: 32px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 10px;
          font-size: 13px;
          color: var(--text-primary, #ddd);
          background: var(--bg-primary, #1e1e1e);
          border: 1px solid var(--divider, #333);
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
        }
        .ags-default-trigger:hover {
          border-color: var(--accent, #569cd6);
        }
        .ags-default-value {
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ags-default-chevron {
          flex-shrink: 0;
          color: var(--text-secondary, #999);
        }
        .ags-default-menu {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          z-index: 30;
          list-style: none;
          margin: 0;
          padding: 4px;
          background: var(--bg-primary, #1e1e1e);
          border: 1px solid var(--divider, #333);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          max-height: 220px;
          overflow-y: auto;
        }
        .ags-default-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 6px;
          cursor: pointer;
          color: var(--text-primary, #ddd);
        }
        .ags-default-option:hover {
          background: var(--bg-active, #37373d);
        }
        .ags-default-option.is-active {
          color: var(--accent, #569cd6);
        }
        .ags-default-option-label {
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ags-default-check {
          flex-shrink: 0;
          color: var(--accent, #569cd6);
        }

        /* Mask over the base while a drawer is open. */
        .ags-base-mask {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: transparent;
          cursor: pointer;
        }

        /* Drawer stack (mirrors the Window Manager drawings). */
        .drawer-shadow {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          z-index: 1;
          pointer-events: none;
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);
          transition: width 0.2s ease;
          animation: ags-dw-slide 0.18s ease;
        }
        .drawer {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: var(--bg-secondary, #252526);
          border-left: 1px solid var(--divider, #444);
          transition: width 0.2s ease;
          animation: ags-dw-slide 0.18s ease;
        }
        .drawer-mask {
          position: absolute;
          inset: 0;
          z-index: 2;
          background: transparent;
          cursor: pointer;
        }
        @keyframes ags-dw-slide {
          from {
            transform: translateX(24px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes ags-dw-slide-out {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(24px);
            opacity: 0;
          }
        }
        .drawer--closing {
          animation: ags-dw-slide-out 0.18s ease forwards;
          pointer-events: none;
          z-index: 1000;
        }
        .drawer-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-shrink: 0;
          height: 44px;
          padding: 0 14px;
          border-bottom: 1px solid var(--divider, #333);
        }
        .drawer-title {
          font-size: 13px;
          font-weight: 600;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .drawer-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .dw-close {
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          font-size: 16px;
          width: 26px;
          height: 26px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .dw-close:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .drawer-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 18px 18px 28px;
        }
        .drawer-footer {
          display: flex;
          align-items: center;
          gap: 6px;
          justify-content: flex-end;
          flex-shrink: 0;
          height: 44px;
          padding: 0 14px;
          border-top: 1px solid var(--divider, #333);
        }
        .dw-delete-label {
          border: none;
          background: transparent;
          color: #e06c75;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          cursor: pointer;
          border-radius: 6px;
          margin-right: auto;
        }
        .dw-delete-label:hover {
          background: rgba(224, 108, 117, 0.15);
        }
        .dw-cancel {
          border: none;
          background: transparent;
          color: var(--text-secondary, #999);
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          cursor: pointer;
          border-radius: 6px;
        }
        .dw-cancel:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .dw-save {
          border: none;
          border-radius: 6px;
          padding: 4px 14px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          color: var(--accent, #6fb3f2);
          background: rgba(86, 156, 214, 0.18);
        }
        .dw-save:hover {
          background: rgba(86, 156, 214, 0.3);
        }
        .dw-save:disabled {
          opacity: 0.5;
          cursor: default;
        }

        /* Preset picker grid. */
        .ags-preset-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 8px;
          margin-bottom: 20px;
          max-width: 620px;
        }
        .ags-preset-option {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid var(--divider, #333);
          background: rgba(255, 255, 255, 0.04);
          cursor: pointer;
        }
        .ags-preset-option:hover {
          background: var(--bg-active, #37373d);
        }
        .ags-preset-option--active {
          border-color: var(--accent, #569cd6);
          background: rgba(86, 156, 214, 0.12);
        }
        .ags-preset-top {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ags-preset-radio {
          accent-color: var(--accent, #569cd6);
          width: 14px;
          height: 14px;
          flex-shrink: 0;
          cursor: pointer;
        }
        .ags-preset-label {
          font-weight: 600;
          font-size: 13px;
          color: var(--text-primary, #e0e0e0);
        }
        .ags-preset-desc {
          color: var(--text-secondary, #999);
          font-size: 11px;
          line-height: 1.4;
        }

        /* Field cards inside the drawer. */
        .ags-input {
          width: 100%;
          height: 28px;
          padding: 0 8px;
          box-sizing: border-box;
          font-size: 13px;
          color: var(--text-primary, #ddd);
          background: transparent;
          border: none;
          outline: none;
          font-family: inherit;
        }
        .ags-input:focus,
        .ags-input:focus-visible {
          outline: none;
        }
        /* Focus ring belongs on the containing card, not the input element. */
        .ags-input-card:focus-within {
          outline: 2px solid var(--accent, #569cd6);
          outline-offset: 2px;
        }
        .ags-input--mono {
          font-family: ui-monospace, "Cascadia Code", "Fira Code", Menlo, Consolas, monospace;
        }
        .ags-test-row {
          margin-top: 18px;
          max-width: 620px;
        }
        .test-ok {
          color: #4caf50;
          margin-top: 6px;
        }
        .test-err {
          color: #f44336;
          margin-top: 6px;
        }
      </style>

      <div class="ags-root">
        <div class="ags-drawer-layer">
          <div class="ags-base">
            <div class="ags-pane">
              <p class="ags-section-title">Providers</p>
              <div class="ags-card">
                <label class="ags-card-question">
                  Which providers should be available for chats?
                </label>
                ${
                  this._loading
                    ? html`<p class="ags-card-help">Loading…</p>`
                    : html`
                        <ul class="ags-provider-list">
                          ${
                            entries.length === 0
                              ? html`<li class="ags-empty">No providers yet.</li>`
                              : nothing
                          }
                          ${entries.map(([id, p]) => this._providerRow(id, p))}
                          <li class="ags-provider-row ags-add-row" @click=${() => this._openAdd()}>
                            <span class="ags-add-plus">＋</span>
                            <span>Add another provider</span>
                          </li>
                        </ul>
                        <p class="ags-card-help">
                          Define the providers your chats can use — including local
                          OpenAI-compatible servers. Click a provider to edit how it connects.
                        </p>
                      `
                }
              </div>

              <div class="ags-card ags-card-gap">
                <label class="ags-card-question">Which provider is the default?</label>
                ${
                  this._loading || entries.length === 0
                    ? html`<p class="ags-card-help">Add a provider above to set a default.</p>`
                    : html`
                        <div class="ags-default-wrap">
                          <button
                            class="ags-default-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded=${this._defaultOpen ? "true" : "false"}
                            @click=${() => this._toggleDefault()}
                          >
                            <span class="ags-default-value">${this._activeProviderName()}</span>
                            ${this._chevronSvg()}
                          </button>
                          ${
                            this._defaultOpen
                              ? html`
                                  <ul class="ags-default-menu" role="listbox">
                                    ${entries.map(
                                      ([id, p]) => html`
                                        <li
                                          class="ags-default-option ${
                                            this._config?.providerId === id ? "is-active" : ""
                                          }"
                                          role="option"
                                          aria-selected=${
                                            this._config?.providerId === id ? "true" : "false"
                                          }
                                          @click=${() => this._selectDefault(id)}
                                        >
                                          <span class="ags-default-option-label">
                                            ${providerDisplayName(presetFor(p), p)}
                                          </span>
                                          ${
                                            this._config?.providerId === id
                                              ? html`<span class="ags-default-check">✓</span>`
                                              : nothing
                                          }
                                        </li>
                                      `,
                                    )}
                                  </ul>
                                `
                              : nothing
                          }
                        </div>
                        <p class="ags-card-help">
                          Chats use the default provider whenever you don't pick another.
                        </p>
                      `
                }
              </div>
            </div>
          </div>

          ${
            this._drawers.length > 0
              ? html`<div class="ags-base-mask" @click=${() => this._closeAllDrawers()}></div>`
              : nothing
          }
          ${
            this._drawers.length > 0
              ? html`<div class="drawer-shadow" style="width:${this._stackWidth()}%"></div>`
              : nothing
          }
          ${this._drawers.map((d, i) => this._renderDrawer(d, i))}
          ${this._closingDrawers.map((c) => this._renderClosingDrawer(c))}
        </div>
      </div>
    `;
  }

  private _providerRow(id: string, p: ProviderConfig): TemplateResult {
    const preset = presetFor(p);
    const name = providerDisplayName(preset, p);
    const metaParts: string[] = [];
    if (p.model) metaParts.push(p.model);
    const host = endpointHost(p.baseUrl);
    if (host) metaParts.push(host);
    return html`
      <li class="ags-provider-row" @click=${() => this._openEdit(id)}>
        <div class="ags-provider-info">
          <span class="ags-provider-name">${name}</span>
          <span class="ags-provider-meta">
            ${metaParts.length ? metaParts.join(" · ") : "No endpoint configured"}
          </span>
        </div>
        <svg
          class="ags-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </li>
    `;
  }

  private _renderDrawer(d: DrawerState, i: number): TemplateResult {
    const isTop = i === this._drawers.length - 1;
    return html`
      <div class="drawer" style="width:${this._widthFor(i)}%; z-index:${i + 2}">
        ${
          !isTop
            ? html`<div
                class="drawer-mask"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this._closeDeeper(i);
                }}
              ></div>`
            : nothing
        }
        <div class="drawer-head">
          <div class="drawer-title">${d.title}</div>
          <div class="drawer-actions">
            <button
              class="dw-close"
              @click=${(e: Event) => {
                e.stopPropagation();
                this._closeDrawer(d.id);
              }}
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>
        <div class="drawer-body">${this._providerDetail(d)}</div>
        ${this._drawerFooter(d)}
      </div>
    `;
  }

  private _renderClosingDrawer(c: ClosingDrawer): TemplateResult {
    return html`
      <div class="drawer drawer--closing" style="width:${c.width}%">
        <div class="drawer-head">
          <div class="drawer-title">${c.title}</div>
        </div>
        <div class="drawer-body">${this._providerDetail(c)}</div>
      </div>
    `;
  }

  private _drawerFooter(d: DrawerState): TemplateResult {
    return html`
      <div class="drawer-footer">
        ${
          d.editId !== null
            ? html`<button
                class="dw-delete-label"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  void this._deleteProvider(d);
                }}
                title="Delete provider"
              >
                Delete
              </button>`
            : nothing
        }
        <button
          class="dw-cancel"
          @click=${(e: Event) => {
            e.stopPropagation();
            this._closeDrawer(d.id);
          }}
        >
          Cancel
        </button>
        <button
          class="dw-save"
          ?disabled=${this._saving}
          @click=${(e: Event) => {
            e.stopPropagation();
            void this._saveProvider(d);
          }}
        >
          ${this._saving ? "Saving…" : "Save"}
        </button>
      </div>
    `;
  }

  private _presetOption(d: DrawerState, p: ProviderPreset): TemplateResult {
    const active = d.presetId === p.id;
    return html`
      <label class="ags-preset-option ${active ? "ags-preset-option--active" : ""}">
        <span class="ags-preset-top">
          <input
            type="radio"
            name="ags-preset-${d.id}"
            class="ags-preset-radio"
            .checked=${active}
            @change=${() => this._selectPreset(d, p.id)}
          />
          <span class="ags-preset-label">${p.label}</span>
        </span>
        ${p.description ? html`<span class="ags-preset-desc">${p.description}</span>` : nothing}
      </label>
    `;
  }

  private _providerDetail(d: DrawerState): TemplateResult {
    const draft = d.draft;
    return html`
      <div class="ags-section-title">Provider</div>
      <div class="ags-preset-grid">${PROVIDER_PRESETS.map((p) => this._presetOption(d, p))}</div>

      <div
        class="ags-card ags-input-card ags-card-gap"
        style="max-width:620px;"
        @click=${this._focusCardInput}
      >
        <label class="ags-card-question">What is the display name?</label>
        <input
          class="ags-input"
          type="text"
          placeholder="e.g. My GPU server"
          .value=${draft.name ?? ""}
          @input=${(e: Event) =>
            this._setDraftField(d, { name: (e.target as HTMLInputElement).value })}
        />
        <p class="ags-card-help">
          A friendly name for this provider. Leave blank to derive one from the preset or endpoint.
        </p>
      </div>

      <div
        class="ags-card ags-input-card ags-card-gap"
        style="max-width:620px;"
        @click=${this._focusCardInput}
      >
        <label class="ags-card-question">What base URL should be used?</label>
        <input
          class="ags-input ags-input--mono ags-baseurl-input"
          type="text"
          placeholder="https://api.example.com/v1"
          .value=${draft.baseUrl}
          @input=${(e: Event) =>
            this._setDraftField(d, { baseUrl: (e.target as HTMLInputElement).value })}
        />
        <p class="ags-card-help">
          The OpenAI-compatible endpoint. Picking a preset above fills this in for you.
        </p>
      </div>

      <div
        class="ags-card ags-input-card ags-card-gap"
        style="max-width:620px;"
        @click=${this._focusCardInput}
      >
        <label class="ags-card-question">Which model should be used?</label>
        <input
          class="ags-input ags-input--mono"
          type="text"
          placeholder="e.g. gpt-4o"
          .value=${draft.model}
          @input=${(e: Event) =>
            this._setDraftField(d, { model: (e.target as HTMLInputElement).value })}
        />
        <p class="ags-card-help">The model id that chat requests will use.</p>
      </div>

      <div
        class="ags-card ags-input-card ags-card-gap"
        style="max-width:620px;"
        @click=${this._focusCardInput}
      >
        <label class="ags-card-question">What API key should be used?</label>
        <input
          class="ags-input ags-input--mono"
          type="password"
          placeholder="sk-…"
          autocomplete="off"
          .value=${draft.apiKey ?? ""}
          @input=${(e: Event) =>
            this._setDraftField(d, { apiKey: (e.target as HTMLInputElement).value })}
        />
        <p class="ags-card-help">Only hosted services need one; local servers usually don't.</p>
      </div>

      <div
        class="ags-card ags-input-card ags-card-gap"
        style="max-width:620px;"
        @click=${this._focusCardInput}
      >
        <label class="ags-card-question">What temperature should be used?</label>
        <input
          class="ags-input"
          type="text"
          inputmode="decimal"
          placeholder="0.7"
          .value=${this._numDisplay(draft.temperature)}
          @input=${(e: Event) =>
            this._setDraftField(d, {
              temperature: this._sanitizeDecimal((e.target as HTMLInputElement).value),
            })}
        />
        <p class="ags-card-help">Optional. Controls randomness in responses.</p>
      </div>

      <div
        class="ags-card ags-input-card ags-card-gap"
        style="max-width:620px;"
        @click=${this._focusCardInput}
      >
        <label class="ags-card-question">What is the max output tokens?</label>
        <input
          class="ags-input"
          type="text"
          inputmode="numeric"
          placeholder="e.g. 2048"
          .value=${this._numDisplay(draft.maxTokens)}
          @input=${(e: Event) =>
            this._setDraftField(d, {
              maxTokens: this._sanitizeInt((e.target as HTMLInputElement).value),
            })}
        />
        <p class="ags-card-help">Optional. Caps the response length.</p>
      </div>

      ${
        this._testResult
          ? html`<div
              class=${this._testResult.ok ? "test-ok" : "test-err"}
              style="max-width:620px;"
            >
              ${
                this._testResult.ok ? "✓ Connected" : `✗ ${this._testResult.error ?? "Unreachable"}`
              }
            </div>`
          : nothing
      }
      <div class="ags-test-row">
        <button class="dw-cancel" ?disabled=${this._testing} @click=${() => this._testConnection()}>
          ${this._testing ? "Testing…" : "Test Connection"}
        </button>
      </div>
    `;
  }
}

if (!customElements.get("openp41ge-agent-settings")) {
  customElements.define("openp41ge-agent-settings", Openp41geAgentSettings);
}

declare global {
  interface HTMLElementTagNameMap {
    "openp41ge-agent-settings": Openp41geAgentSettings;
  }
}
