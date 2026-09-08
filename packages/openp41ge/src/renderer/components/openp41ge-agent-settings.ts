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
import { ref, createRef } from "lit/directives/ref.js";
import type { ConfigService } from "../services/config-service";
import type { PropertyValues } from "lit";
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
  providerCompatible,
  modelsFromIds,
  type AgentConfig,
  type ModelConfig,
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

/** A draft model config in the second-layer model drawer. */
type ModelDraft = { id: string };

/** A provider drawer: edits one provider connection. */
interface ProviderDrawerState {
  id: string;
  kind: "provider";
  /** The provider key being edited; null = adding a new provider. */
  editId: string | null;
  title: string;
  presetId: string;
  draft: ProviderDraft;
  /** Whether the preset selection card's list is open. */
  presetOpen?: boolean;
  /** Whether the default-model selection card's list is open. */
  defaultModelOpen?: boolean;
}

/** A model drawer: edits one model of a provider (second layer). */
interface ModelDrawerState {
  id: string;
  kind: "model";
  /** The provider drawer (in the stack) whose models are being edited. */
  providerDrawerId: string;
  /** Index into the provider's `models`; null = adding a new model. */
  modelIndex: number | null;
  title: string;
  draft: ModelDraft;
}

type DrawerState = ProviderDrawerState | ModelDrawerState;

/** A drawer that is animating out; keeps its last width so it exits in place. */
type ClosingDrawer = DrawerState & { width: number };

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
  @state() private _showTestResponse = false;
  @state() private _detectedMessage: string | null = null;
  @state() private _detectedError: string | null = null;
  @state() private _defaultOpen = false;
  @state() private _listScrollTop = 0;

  /** Fixed row height of the default-provider virtual list. */
  private static readonly ROW_H = 44;
  /** Scrollable viewport height of the default-provider list. */
  private static readonly LIST_H = 240;
  /** Rows rendered above and below the visible window. */
  private static readonly OVERSCAN = 8;

  private _listEl = createRef<HTMLDivElement>();
  private _pendingScrollTop: number | null = null;

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

  protected updated(_changedProperties: PropertyValues): void {
    super.updated(_changedProperties);
    if (!this._defaultOpen || !this._listEl.value) return;
    if (this._pendingScrollTop != null) {
      this._listEl.value.scrollTop = this._pendingScrollTop;
      this._pendingScrollTop = null;
    }
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

  /** The sub-title of the currently-selected default provider (model · host). */
  private _activeProviderMeta(): string {
    const config = this._config;
    const id = config?.providerId;
    const entry = Object.entries(config?.providers ?? {}).find(([key]) => key === id);
    if (!entry) return "";
    return this._providerMeta(entry[1]);
  }

  private _providerEntries(): Array<[string, ProviderConfig]> {
    return Object.entries(this._config?.providers ?? {});
  }

  private _providerMeta(p: ProviderConfig): string {
    const parts: string[] = [];
    if (p.model) parts.push(p.model);
    const host = endpointHost(p.baseUrl);
    if (host) parts.push(host);
    return parts.length ? parts.join(" · ") : "No endpoint configured";
  }

  private _openDefaultList(): void {
    const entries = this._providerEntries();
    const selected = entries.findIndex(([id]) => id === this._config?.providerId);
    const scrollTop = selected >= 0 ? selected * Openp41geAgentSettings.ROW_H : 0;
    this._listScrollTop = scrollTop;
    this._pendingScrollTop = scrollTop;
    this._defaultOpen = true;
  }

  private _closeDefaultList(): void {
    this._defaultOpen = false;
  }

  private _onListScroll = (e: Event): void => {
    this._listScrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
  };

  private _listHeight(count: number): number {
    return Math.min(count * Openp41geAgentSettings.ROW_H, Openp41geAgentSettings.LIST_H);
  }

  private _defaultWindow(): { start: number; end: number; topPad: number; bottomPad: number } {
    const count = this._providerEntries().length;
    const start = Math.max(
      0,
      Math.floor(this._listScrollTop / Openp41geAgentSettings.ROW_H) -
        Openp41geAgentSettings.OVERSCAN,
    );
    const end = Math.min(
      count,
      Math.ceil(
        (this._listScrollTop + Openp41geAgentSettings.LIST_H) / Openp41geAgentSettings.ROW_H,
      ) + Openp41geAgentSettings.OVERSCAN,
    );
    return {
      start,
      end,
      topPad: start * Openp41geAgentSettings.ROW_H,
      bottomPad: (count - end) * Openp41geAgentSettings.ROW_H,
    };
  }

  private async _selectDefault(id: string): Promise<void> {
    this._defaultOpen = false;
    await this._setActive(id);
  }

  private _defaultListRow(id: string, p: ProviderConfig, isLast = false): TemplateResult {
    const isActive = this._config?.providerId === id;
    return html`
      <div
        class="ags-default-row ${isActive ? "is-active" : ""} ${isLast ? "is-last" : ""}"
        role="option"
        aria-selected=${isActive ? "true" : "false"}
        @click=${() => this._selectDefault(id)}
      >
        <div class="ags-default-row-info">
          <span class="ags-default-row-name">${providerDisplayName(presetFor(p), p)}</span>
          <span class="ags-default-row-meta">${this._providerMeta(p)}</span>
        </div>
        ${isActive ? html`<span class="ags-default-check">✓</span>` : nothing}
      </div>
    `;
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

  /** One action in a card: a short description on the left, the control on the right. */
  private _actionRow(description: string, action: TemplateResult): TemplateResult {
    return html`
      <div class="ags-action-row">
        <span class="ags-action-label">${description}</span>
        <span class="ags-action-control">${action}</span>
      </div>
    `;
  }

  private _closeSvg(): TemplateResult {
    return html`
      <svg
        class="ags-default-x"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M6 6l12 12M18 6L6 18" />
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
    this._showTestResponse = false;
    this._drawers = [
      ...this._drawers,
      {
        id: this._nextId(),
        kind: "provider",
        editId: id,
        title: providerDisplayName(preset, draft),
        presetId: preset.id,
        draft: { ...draft },
        presetOpen: false,
        defaultModelOpen: false,
      },
    ];
    void this.updateComplete.then(() => this._focusBaseUrl());
  }

  private _openAdd(): void {
    const draft = applyPreset(customPreset());
    this._testResult = null;
    this._showTestResponse = false;
    this._drawers = [
      ...this._drawers,
      {
        id: this._nextId(),
        kind: "provider",
        editId: null,
        title: "New provider",
        presetId: CUSTOM_PRESET_ID,
        draft,
        presetOpen: false,
        defaultModelOpen: false,
      },
    ];
    void this.updateComplete.then(() => this._focusBaseUrl());
  }

  private _focusBaseUrl(): void {
    this.renderRoot.querySelector<HTMLInputElement>(".ags-baseurl-input")?.focus();
  }

  private _updateDrawer(id: string, patch: Partial<DrawerState>): void {
    this._drawers = this._drawers.map((d) =>
      d.id === id ? ({ ...d, ...patch } as DrawerState) : d,
    );
  }

  private _selectPreset(d: ProviderDrawerState, presetId: string): void {
    const preset = providerPreset(presetId) ?? customPreset();
    const draft = applyPreset(preset);
    this._updateDrawer(d.id, {
      presetId,
      draft,
      title: draft.name || d.title,
      presetOpen: false,
    });
  }

  private _setDraftField(d: ProviderDrawerState, patch: Partial<ProviderDraft>): void {
    const cur = this._drawers.find((x) => x.id === d.id);
    if (!cur || cur.kind !== "provider") return;
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
    if (draft.models !== undefined) {
      config.models = draft.models.map((m) => ({ id: m.id }));
    }
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

  private async _saveProvider(d: ProviderDrawerState): Promise<void> {
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
    // Keep the drawer open so the user can keep editing. Rebind it to the
    // (possibly newly created) provider id so a second Save updates rather
    // than re-creating, and normalise the on-screen draft to what was saved.
    this._updateDrawer(d.id, {
      editId: id,
      title: draft.name?.trim() || d.title,
      draft,
    });
  }

  private async _deleteProvider(d: ProviderDrawerState): Promise<void> {
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

  private async _saveModel(d: ModelDrawerState): Promise<void> {
    const providerDrawer = this._drawers.find((x) => x.id === d.providerDrawerId);
    if (!providerDrawer || providerDrawer.kind !== "provider") return;
    const id = d.draft.id.trim();
    if (!id) return;
    const models = (providerDrawer.draft.models ?? []).map((m) => ({ id: m.id }));
    const oldId = d.modelIndex === null ? null : (models[d.modelIndex]?.id ?? null);
    if (d.modelIndex === null) {
      models.push({ id });
    } else {
      models[d.modelIndex] = { id };
    }
    let draft = { ...providerDrawer.draft, models };
    // When editing, keep the default in sync if it pointed at the renamed model.
    if (d.modelIndex !== null && draft.model === oldId) {
      draft = { ...draft, model: id };
    }
    this._updateDrawer(providerDrawer.id, { draft });
    this._closeDrawer(d.id);
  }

  private async _deleteModel(d: ModelDrawerState): Promise<void> {
    const providerDrawer = this._drawers.find((x) => x.id === d.providerDrawerId);
    if (!providerDrawer || providerDrawer.kind !== "provider") return;
    if (d.modelIndex === null) return;
    const confirmed = await this._confirm({
      message: "Delete this model?",
      detail: "This removes the model from the provider.",
      confirmLabel: "Delete",
      confirmStyle: "danger",
    });
    if (!confirmed) return;
    const cur = providerDrawer.draft.models ?? [];
    const models = cur.filter((_, i) => i !== d.modelIndex);
    let draft = { ...providerDrawer.draft, models };
    // If the deleted model was the default, fall back to another model.
    if (draft.model === cur[d.modelIndex]?.id) {
      draft = { ...draft, model: models[0]?.id ?? "" };
    }
    this._updateDrawer(providerDrawer.id, { draft });
    this._closeDrawer(d.id);
  }

  private async _detectModels(d: ProviderDrawerState): Promise<void> {
    const baseUrl = d.draft.baseUrl.trim();
    if (!baseUrl) return;
    this._testing = true;
    this._detectedError = null;
    this._detectedMessage = null;
    try {
      const compatible = this._providerCompatible(d);
      const res = (await window.openp41ge?.chat?.listModels?.({
        baseUrl,
        apiKey: d.draft.apiKey,
        compatible,
      })) ?? { ok: false, error: "Model detection unavailable" };
      if (!res.ok) {
        this._detectedError = res.error ?? "Model detection failed.";
        return;
      }
      const ids = res.models ?? [];
      if (ids.length === 0) {
        this._detectedError = "No models were returned by the endpoint.";
        return;
      }
      const models = modelsFromIds(ids);
      const draft = { ...d.draft, models };
      const model = models.some((m) => m.id === draft.model) ? draft.model : models[0].id;
      this._updateDrawer(d.id, { draft: { ...draft, model }, defaultModelOpen: false });
      this._detectedMessage = `Detected ${ids.length} models.`;
    } catch (err) {
      this._detectedError = (err as Error).message;
    }
    this._testing = false;
  }

  private _providerCompatible(d: ProviderDrawerState): "openai" | "anthropic" {
    return providerCompatible({ baseUrl: d.draft.baseUrl, model: d.draft.model });
  }

  private _focusModelId(): void {
    const el = this.renderRoot?.querySelector<HTMLInputElement>(".ags-model-id-input");
    el?.focus();
  }

  private async _testConnection(d: ProviderDrawerState): Promise<void> {
    const providerId = d.editId ?? this._config?.providerId;
    if (!providerId) return;
    this._testing = true;
    this._testResult = null;
    this._showTestResponse = false;
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
          margin: 18px 0 14px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary, #999);
        }
        .drawer-body > .ags-section-title:first-child {
          margin-top: 0;
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
        /* When a help paragraph is the first thing in a card (e.g. an action
         or empty-state card with no question), drop its top margin so it is
         not doubled against the card's own padding. */
        .ags-card > .ags-card-help:first-child {
          margin-top: 0;
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
        .ags-default-badge {
          align-self: flex-start;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--accent, #569cd6);
          background: rgba(86, 156, 214, 0.14);
          border-radius: 4px;
          padding: 1px 6px;
        }
        .ags-detect-note {
          margin: 8px 0 0;
          font-size: 12px;
          color: var(--accent, #569cd6);
        }
        .ags-detect-note--err {
          color: #f44336;
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
          border-bottom: none;
        }
        .ags-add-plus {
          font-size: 15px;
        }
        .ags-empty {
          padding: 10px;
          color: var(--text-secondary, #999);
        }
        .ags-default-card {
          position: relative;
        }
        .ags-default-close {
          position: absolute;
          top: 8px;
          right: 8px;
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          color: var(--text-secondary, #999);
          background: transparent;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
        }
        .ags-default-close:hover {
          background: var(--bg-active, #37373d);
          color: var(--text-primary, #ddd);
        }
        .ags-default-close:focus,
        .ags-default-close:focus-visible {
          outline: none;
        }
        .ags-default-trigger {
          width: 100%;
          height: 44px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 10px;
          font-size: 13px;
          color: var(--text-primary, #ddd);
          background: transparent;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
        }
        .ags-default-trigger:hover {
          background: var(--bg-active, #37373d);
        }
        .ags-default-trigger:focus,
        .ags-default-trigger:focus-visible {
          outline: none;
        }
        .ags-default-chevron {
          flex-shrink: 0;
          color: var(--accent, #569cd6);
        }
        .ags-default-list {
          position: relative;
          overflow-y: auto;
          overscroll-behavior: contain;
        }
        .ags-default-spacer {
          pointer-events: none;
        }
        .ags-default-row {
          display: flex;
          align-items: center;
          gap: 8px;
          box-sizing: border-box;
          height: 44px;
          padding: 0 10px;
          cursor: pointer;
          border-bottom: 1px solid var(--divider, #2f3031);
          border-radius: 6px;
          color: var(--text-primary, #ddd);
        }
        .ags-default-row:hover {
          background: var(--bg-active, #37373d);
        }
        .ags-default-row.is-active {
          color: var(--accent, #569cd6);
        }
        .ags-default-row.is-last {
          border-bottom: none;
        }
        .ags-default-row-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2px;
        }
        .ags-default-row-name {
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ags-default-row-meta {
          font-size: 12px;
          color: var(--text-secondary, #999);
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
        /* One action in a card: description on the left, control on the right. */
        .ags-action-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--divider, #2f3031);
        }
        .ags-action-label {
          font-size: 12px;
          color: var(--text-secondary, #999);
          line-height: 1.4;
        }
        .ags-action-control {
          flex-shrink: 0;
        }
        .ags-response {
          margin: 12px 0 0;
          padding: 10px;
          max-height: 180px;
          overflow: auto;
          font-family: ui-monospace, "Cascadia Code", "Fira Code", Menlo, Consolas, monospace;
          font-size: 12px;
          color: var(--text-secondary, #999);
          background: rgba(0, 0, 0, 0.25);
          border-radius: 6px;
          white-space: pre-wrap;
        }
      </style>

      <div class="ags-root">
        <div class="ags-drawer-layer">
          <div class="ags-base">
            <div class="ags-pane">
              <p class="ags-section-title">Providers</p>
              <div class="ags-card">
                <label class="ags-card-question">
                  Which providers should be available for agents?
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

              <div class="ags-card ags-input-card ags-card-gap ags-default-card">
                ${
                  this._loading || entries.length === 0
                    ? html`<p class="ags-card-help">Add a provider above to set a default.</p>`
                    : html`
                        ${
                          this._defaultOpen
                            ? html`
                                <label class="ags-card-question"
                                  >Which provider is the default?</label
                                >
                                <button
                                  class="ags-default-close"
                                  type="button"
                                  aria-label="Close selection"
                                  @click=${() => this._closeDefaultList()}
                                >
                                  ${this._closeSvg()}
                                </button>
                                <div
                                  class="ags-default-list"
                                  ${ref(this._listEl)}
                                  style="height:${this._listHeight(entries.length)}px"
                                  role="listbox"
                                  @scroll=${this._onListScroll}
                                >
                                  <div
                                    class="ags-default-spacer"
                                    style="height:${this._defaultWindow().topPad}px"
                                  ></div>
                                  ${entries
                                    .slice(this._defaultWindow().start, this._defaultWindow().end)
                                    .map(([id, p], i) =>
                                      this._defaultListRow(
                                        id,
                                        p,
                                        this._defaultWindow().start + i === entries.length - 1,
                                      ),
                                    )}
                                  <div
                                    class="ags-default-spacer"
                                    style="height:${this._defaultWindow().bottomPad}px"
                                  ></div>
                                </div>
                              `
                            : html`
                                <label class="ags-card-question"
                                  >Which provider is the default?</label
                                >
                                <button
                                  class="ags-default-trigger"
                                  type="button"
                                  aria-haspopup="listbox"
                                  aria-expanded="false"
                                  @click=${() => this._openDefaultList()}
                                >
                                  <div class="ags-default-row-info">
                                    <span class="ags-default-row-name"
                                      >${this._activeProviderName()}</span
                                    >
                                    <span class="ags-default-row-meta"
                                      >${this._activeProviderMeta()}</span
                                    >
                                  </div>
                                  ${this._chevronSvg()}
                                </button>
                                <p class="ags-card-help">
                                  Agents use the default provider whenever you don't pick another.
                                </p>
                              `
                        }
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
        <div class="drawer-body">
          ${d.kind === "model" ? this._modelDetail(d) : this._providerDetail(d)}
        </div>
        ${this._drawerFooter(d)}
      </div>
    `;
  }

  private _renderClosingDrawer(c: ClosingDrawer): TemplateResult {
    return html`
      <div class="drawer drawer--closing" style="width:${c.width}%">
        <div class="drawer-body">
          ${c.kind === "model" ? this._modelDetail(c) : this._providerDetail(c)}
        </div>
      </div>
    `;
  }

  private _drawerFooter(d: DrawerState): TemplateResult {
    if (d.kind === "model") {
      return html`
        <div class="drawer-footer">
          ${
            d.modelIndex !== null
              ? html`<button
                  class="dw-delete-label"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    void this._deleteModel(d);
                  }}
                  title="Delete model"
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
            @click=${(e: Event) => {
              e.stopPropagation();
              void this._saveModel(d);
            }}
          >
            Save
          </button>
        </div>
      `;
    }
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

  private _presetCard(d: ProviderDrawerState, preset: ProviderPreset): TemplateResult {
    return html`
      <div class="ags-card ags-input-card ags-card-gap ags-preset-card" style="max-width:620px;">
        <label class="ags-card-question">Which provider preset is this?</label>
        ${
          d.presetOpen
            ? html`
                <button
                  class="ags-default-close"
                  type="button"
                  aria-label="Close preset list"
                  @click=${() => this._closePresetList(d)}
                >
                  ${this._closeSvg()}
                </button>
                <div class="ags-default-list" style="max-height:220px; overflow-y:auto;">
                  ${PROVIDER_PRESETS.map((p, i) => this._presetRow(d, p, i === PROVIDER_PRESETS.length - 1))}
                </div>
              `
            : html`
                <button
                  class="ags-default-trigger"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded="false"
                  @click=${() => this._openPresetList(d)}
                >
                  <div class="ags-default-row-info">
                    <span class="ags-default-row-name">${preset.label}</span>
                  </div>
                  ${this._chevronSvg()}
                </button>
                <p class="ags-card-help">
                  Picking a preset pre-fills the endpoint and default model.
                </p>
              `
        }
      </div>
    `;
  }

  private _presetRow(d: ProviderDrawerState, p: ProviderPreset, isLast: boolean): TemplateResult {
    const active = d.presetId === p.id;
    return html`
      <div
        class="ags-default-row ${active ? "is-active" : ""} ${isLast ? "is-last" : ""}"
        role="option"
        aria-selected=${active}
        @click=${() => this._selectPreset(d, p.id)}
      >
        <div class="ags-default-row-info">
          <span class="ags-default-row-name">${p.label}</span>
        </div>
        ${active ? html`<span class="ags-default-check">✓</span>` : nothing}
      </div>
    `;
  }

  private _nameCard(d: ProviderDrawerState, draft: ProviderDraft): TemplateResult {
    return html`
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
    `;
  }

  private _baseUrlCard(d: ProviderDrawerState, draft: ProviderDraft): TemplateResult {
    return html`
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
    `;
  }

  private _modelsCard(
    d: ProviderDrawerState,
    draft: ProviderDraft,
    models: ModelConfig[],
  ): TemplateResult {
    return html`
      <div class="ags-card ags-card-gap" style="max-width:620px;">
        <label class="ags-card-question">Which models are available?</label>
        <ul class="ags-provider-list">
          ${models.length === 0 ? html`<li class="ags-empty">No models yet.</li>` : nothing}
          ${models.map((m, i) => this._modelRow(d, m, i))}
          <li
            class="ags-provider-row ags-add-row"
            @click=${(e: Event) => {
              e.stopPropagation();
              this._openAddModel(d.id);
            }}
          >
            <span class="ags-add-plus">＋</span>
            <span>Add model</span>
          </li>
        </ul>
        ${this._detectedMessage ? html`<p class="ags-detect-note">${this._detectedMessage}</p>` : nothing}
        ${this._detectedError ? html`<p class="ags-detect-note ags-detect-note--err">${this._detectedError}</p>` : nothing}
        <p class="ags-card-help">Add models by hand or detect them from the endpoint.</p>
        ${this._actionRow(
          "Detect the models available from this endpoint.",
          html`
            <button
              class="dw-cancel"
              ?disabled=${this._testing}
              @click=${() => void this._detectModels(d)}
            >
              ${this._testing ? "Detecting…" : "Detect models"}
            </button>
          `,
        )}
      </div>
    `;
  }

  private _modelRow(d: ProviderDrawerState, m: ModelConfig, i: number): TemplateResult {
    const isDefault = d.draft.model === m.id;
    return html`
      <li
        class="ags-provider-row"
        @click=${(e: Event) => {
          e.stopPropagation();
          this._openEditModel(d.id, i);
        }}
      >
        <div class="ags-provider-info">
          <span class="ags-provider-name">${m.id}</span>
          ${isDefault ? html`<span class="ags-default-badge">Default</span>` : nothing}
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

  private _defaultModelCard(
    d: ProviderDrawerState,
    draft: ProviderDraft,
    models: ModelConfig[],
  ): TemplateResult {
    const current = models.find((m) => m.id === draft.model);
    return html`
      <div
        class="ags-card ags-input-card ags-card-gap ags-default-model-card"
        style="max-width:620px;"
      >
        <label class="ags-card-question">Which model should be the default?</label>
        ${
          d.defaultModelOpen
            ? html`
                <button
                  class="ags-default-close"
                  type="button"
                  aria-label="Close model list"
                  @click=${() => this._closeDefaultModelList(d)}
                >
                  ${this._closeSvg()}
                </button>
                <div class="ags-default-list" style="max-height:220px; overflow-y:auto;">
                  ${
                    models.length === 0
                      ? html`<p class="ags-empty">Add a model above first.</p>`
                      : models.map((m, i) => this._defaultModelRow(d, m, i === models.length - 1))
                  }
                </div>
              `
            : html`
                <button
                  class="ags-default-trigger"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded="false"
                  @click=${() => this._openDefaultModelList(d)}
                >
                  <div class="ags-default-row-info">
                    <span class="ags-default-row-name"
                      >${current?.id ?? (draft.model.trim() ? draft.model : "Select a model")}</span
                    >
                  </div>
                  ${this._chevronSvg()}
                </button>
                <p class="ags-card-help">
                  Chat requests start with this model unless another is chosen.
                </p>
              `
        }
      </div>
    `;
  }

  private _defaultModelRow(
    d: ProviderDrawerState,
    m: ModelConfig,
    isLast: boolean,
  ): TemplateResult {
    const active = d.draft.model === m.id;
    return html`
      <div
        class="ags-default-row ${active ? "is-active" : ""} ${isLast ? "is-last" : ""}"
        role="option"
        aria-selected=${active}
        @click=${() => this._setDefaultModel(d, m.id)}
      >
        <div class="ags-default-row-info">
          <span class="ags-default-row-name">${m.id}</span>
        </div>
        ${active ? html`<span class="ags-default-check">✓</span>` : nothing}
      </div>
    `;
  }

  private _apiKeyCard(d: ProviderDrawerState, draft: ProviderDraft): TemplateResult {
    return html`
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
    `;
  }

  private _temperatureCard(d: ProviderDrawerState, draft: ProviderDraft): TemplateResult {
    return html`
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
    `;
  }

  private _maxTokensCard(d: ProviderDrawerState, draft: ProviderDraft): TemplateResult {
    return html`
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
    `;
  }

  private _providerDetail(d: ProviderDrawerState): TemplateResult {
    const draft = d.draft;
    const preset = providerPreset(d.presetId) ?? customPreset();
    const models = draft.models ?? [];
    return html`
      <div class="ags-section-title">Provider</div>
      ${this._presetCard(d, preset)} ${this._nameCard(d, draft)} ${this._baseUrlCard(d, draft)}
      ${this._modelsCard(d, draft, models)} ${this._defaultModelCard(d, draft, models)}
      ${this._apiKeyCard(d, draft)} ${this._temperatureCard(d, draft)}
      ${this._maxTokensCard(d, draft)}
      <div class="ags-section-title">Actions</div>
      <div class="ags-card ags-card-gap" style="max-width:620px;">
        <p class="ags-card-help">
          Run a connection check or inspect the raw response to troubleshoot a provider that is not
          responding.
        </p>
        ${
          this._testResult
            ? html`<p class=${this._testResult.ok ? "test-ok" : "test-err"} style="margin:0 0 2px;">
                ${
                  this._testResult.ok
                    ? "✓ Connected"
                    : `✗ ${this._testResult.error ?? "Unreachable"}`
                }
              </p>`
            : nothing
        }
        ${this._actionRow(
          "Test the connection to this provider.",
          html`
            <button
              class="dw-cancel"
              ?disabled=${this._testing}
              @click=${() => void this._testConnection(d)}
            >
              ${this._testing ? "Testing…" : "Test Connection"}
            </button>
          `,
        )}
        ${
          this._testResult
            ? this._actionRow(
                "View the response data.",
                html`
                  <button
                    class="dw-cancel"
                    @click=${() => {
                      this._showTestResponse = !this._showTestResponse;
                    }}
                  >
                    ${this._showTestResponse ? "Hide response" : "View response"}
                  </button>
                `,
              )
            : nothing
        }
        ${
          this._showTestResponse && this._testResult
            ? html`<pre class="ags-response">${JSON.stringify(this._testResult, null, 2)}</pre>`
            : nothing
        }
      </div>
    `;
  }

  private _modelDetail(d: ModelDrawerState): TemplateResult {
    const providerDrawer = this._drawers.find((x) => x.id === d.providerDrawerId);
    const providerName =
      providerDrawer && providerDrawer.kind === "provider" ? providerDrawer.title : "";
    return html`
      <div class="ags-section-title">Model</div>
      <div
        class="ags-card ags-input-card ags-card-gap"
        style="max-width:620px;"
        @click=${this._focusCardInput}
      >
        <label class="ags-card-question">What is the model id?</label>
        <input
          class="ags-input ags-input--mono ags-model-id-input"
          type="text"
          placeholder="e.g. gpt-4o"
          .value=${d.draft.id}
          @input=${(e: Event) =>
            this._setModelDraft(d, { id: (e.target as HTMLInputElement).value })}
        />
        <p class="ags-card-help">
          The exact model id used when requesting ${providerName ? `${providerName} ` : ""}chat
          completions.
        </p>
      </div>
    `;
  }

  private _setModelDraft(d: ModelDrawerState, patch: Partial<ModelDraft>): void {
    const cur = this._drawers.find((x) => x.id === d.id);
    if (!cur || cur.kind !== "model") return;
    const draft = { ...cur.draft, ...patch };
    const title = draft.id.trim() ? draft.id.trim() : cur.title;
    this._updateDrawer(d.id, { draft, title });
  }

  private _openAddModel(providerDrawerId: string): void {
    this._detectedMessage = null;
    this._detectedError = null;
    this._drawers = [
      ...this._drawers,
      {
        id: this._nextId(),
        kind: "model",
        providerDrawerId,
        modelIndex: null,
        title: "New model",
        draft: { id: "" },
      },
    ];
    void this.updateComplete.then(() => this._focusModelId());
  }

  private _openEditModel(providerDrawerId: string, modelIndex: number): void {
    const providerDrawer = this._drawers.find((x) => x.id === providerDrawerId);
    if (!providerDrawer || providerDrawer.kind !== "provider") return;
    const model = (providerDrawer.draft.models ?? [])[modelIndex];
    if (!model) return;
    this._detectedMessage = null;
    this._detectedError = null;
    this._drawers = [
      ...this._drawers,
      {
        id: this._nextId(),
        kind: "model",
        providerDrawerId,
        modelIndex,
        title: model.id,
        draft: { id: model.id },
      },
    ];
    void this.updateComplete.then(() => this._focusModelId());
  }

  private _openPresetList(d: ProviderDrawerState): void {
    this._updateDrawer(d.id, { presetOpen: true, defaultModelOpen: false });
  }

  private _closePresetList(d: ProviderDrawerState): void {
    this._updateDrawer(d.id, { presetOpen: false });
  }

  private _openDefaultModelList(d: ProviderDrawerState): void {
    this._updateDrawer(d.id, { defaultModelOpen: true, presetOpen: false });
  }

  private _closeDefaultModelList(d: ProviderDrawerState): void {
    this._updateDrawer(d.id, { defaultModelOpen: false });
  }

  private _setDefaultModel(d: ProviderDrawerState, id: string): void {
    this._setDraftField(d, { model: id });
    this._closeDefaultModelList(d);
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
