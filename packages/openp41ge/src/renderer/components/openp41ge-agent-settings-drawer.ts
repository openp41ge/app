/**
 * <openp41ge-agent-settings-drawer> — the Agent settings surface for the
 * "negative drawer" host.
 *
 * This is the base layer content for the Agents settings drawer. It owns the
 * `agent` config and drives the host's stacked drawers:
 *
 *   - Base:   the Providers list.
 *   - Layer 1: a provider editor (opens when a provider row is clicked).
 *   - Layer 2: a model editor (opens when a model row is clicked).
 *
 * Each sub-layer is pushed onto the host (`host.open(...)`) so it opens from the
 * sidebar edge and PUSHES the lower drawer out further over the grid, exactly
 * like the test wants for the Agent settings' nested drawers.
 *
 * Persistence mirrors <openp41ge-agent-settings>: the provider draft is written
 * through to `agent` config live; an auto-created empty provider is deleted on
 * close.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import type { Openp41geSettingsDrawerHost } from "./openp41ge-settings-drawer-host";
import type { ConfigService } from "../services/config-service";
import { workspaceFileService } from "../services/workspace-file-service";
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
  nextModelId,
  type AgentConfig,
  type ModelConfig,
  type ProviderConfig,
  type ProviderPreset,
} from "../models/agent-provider-presets";

/** A draft provider config (numeric fields held as text while editing). */
interface ProviderDraft {
  baseUrl: string;
  model: string;
  name?: string;
  apiKey?: string;
  temperature?: string;
  maxTokens?: string;
  models: ModelConfig[];
  presetId: string;
}

/** A draft model config. */
interface ModelDraft {
  id: string;
  maxTokens?: string;
  contextWindow?: string;
}

/** A model draft plus the provider layer it belongs to. */
interface ModelCtx {
  draft: ModelDraft;
  /** The provider layer id whose models we're editing. */
  providerLayerId: string;
  /** Index into the provider's models; null = adding a new model. */
  modelIndex: number | null;
}

/**
 * Shared styles for all of this surface's layers.
 *
 * The base view renders inside the surface's shadow root, so its styles are
 * scoped there. Sub-layer bodies (provider/model editors), however, are rendered
 * by the <openp41ge-settings-drawer-host> into the host's LIGHT DOM, where the
 * surface's shadow-scoped styles cannot reach them. So each layer passes this
 * CSS (via `layer.styles`) and the host injects it into the drawer's light-DOM
 * scope. (`:host` is a no-op for sub-layers but harmless.)
 */
const AGDS_CSS = `
  :host {
    display: block;
    height: 100%;
    box-sizing: border-box;
    color: var(--text-primary, #ccc);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
  }
  .agds-pane {
    box-sizing: border-box;
    min-height: 100%;
    padding: 18px 18px 28px;
  }
  .agds-section-title {
    margin: 0 0 14px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-secondary, #999);
  }
  .agds-card {
    box-sizing: border-box;
    padding: 12px 14px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
  }
  .agds-card-question {
    display: block;
    margin: 0 0 14px;
    font-weight: 500;
    color: var(--text-primary, #e0e0e0);
  }
  .agds-card-help {
    margin: 14px 0 0;
    color: var(--text-secondary, #999);
    line-height: 1.5;
  }
  .agds-card-help:first-child {
    margin-top: 0;
  }
  .agds-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .agds-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 6px;
    cursor: pointer;
    border-bottom: 1px solid var(--divider, #2f3031);
  }
  .agds-row:hover {
    background: var(--bg-active, #37373d);
  }
  .agds-row.agds-add {
    color: var(--accent, #569cd6);
    font-weight: 500;
    border-bottom: none;
  }
  .agds-add-plus {
    font-size: 15px;
  }
  .agds-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .agds-name {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agds-meta {
    font-size: 12px;
    color: var(--text-secondary, #999);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agds-chevron {
    flex-shrink: 0;
    color: var(--accent, #569cd6);
  }
  .agds-empty {
    padding: 10px;
    color: var(--text-secondary, #999);
  }
  .agds-input {
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
  .agds-input--mono {
    font-family: ui-monospace, "Cascadia Code", "Fira Code", Menlo, Consolas, monospace;
  }
  .agds-input-card:focus-within {
    outline: 2px solid var(--accent, #569cd6);
    outline-offset: 2px;
  }
  .agds-field {
    margin-bottom: 14px;
  }
  .agds-field label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: var(--text-secondary, #999);
  }
  .agds-select {
    width: 100%;
    height: 30px;
    box-sizing: border-box;
    padding: 0 8px;
    font-size: 13px;
    color: var(--text-primary, #ddd);
    background: var(--bg-tertiary, #1c1c1c);
    border: 1px solid var(--divider, #333);
    border-radius: 6px;
    outline: none;
    font-family: inherit;
  }
  .agds-delete {
    border: none;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, #ddd);
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
  }
  .agds-delete:hover {
    color: #e06c75;
    background: rgba(224, 108, 117, 0.15);
  }
  .agds-actions {
    margin-top: 18px;
    display: flex;
    justify-content: flex-end;
  }
  .agds-tools {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .agds-tool-card {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--divider, #2f3031);
    border-radius: 8px;
    background: var(--bg-secondary, #1e1e1e);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
  }
  .agds-tool-card:hover {
    border-color: var(--accent, #569cd6);
  }
  .agds-tool-card[aria-pressed="true"] {
    border-color: var(--accent, #569cd6);
    background: color-mix(in srgb, var(--accent, #569cd6) 12%, var(--bg-secondary, #1e1e1e));
    box-shadow: inset 0 0 0 1px var(--accent, #569cd6);
  }
  .agds-tool-check {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 1px solid var(--divider, #2f3031);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    background: var(--bg-secondary, #1e1e1e);
  }
  .agds-tool-card[aria-pressed="true"] .agds-tool-check {
    background: var(--accent, #569cd6);
    border-color: var(--accent, #569cd6);
  }
  .agds-tool-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .agds-tool-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #e0e0e0);
  }
  .agds-tool-desc {
    font-size: 12px;
    color: var(--text-secondary, #999);
    line-height: 1.4;
  }
`;

function providerDraftFromConfig(p: ProviderConfig): ProviderDraft {
  return {
    baseUrl: p.baseUrl,
    model: p.model,
    name: p.name,
    apiKey: p.apiKey,
    temperature: p.temperature !== undefined ? String(p.temperature) : undefined,
    maxTokens: p.maxTokens !== undefined ? String(p.maxTokens) : undefined,
    models: (p.models ?? []).map((m) => ({ ...m })),
    presetId: presetFor(p).id,
  };
}

function providerConfigFromDraft(d: ProviderDraft): ProviderConfig {
  const cfg: ProviderConfig = { baseUrl: d.baseUrl, model: d.model };
  if (d.name && d.name.trim()) cfg.name = d.name;
  if (d.apiKey) cfg.apiKey = d.apiKey;
  const temp = Number(d.temperature ?? "");
  if (d.temperature !== undefined && d.temperature.trim() !== "" && !Number.isNaN(temp)) {
    cfg.temperature = temp;
  }
  const max = Number(d.maxTokens ?? "");
  if (d.maxTokens !== undefined && d.maxTokens.trim() !== "" && !Number.isNaN(max)) {
    cfg.maxTokens = max;
  }
  if (d.models.length > 0) cfg.models = d.models.map((m) => ({ ...m }));
  return cfg;
}

export class Openp41geAgentSettingsDrawer extends LitElement {
  host: Openp41geSettingsDrawerHost | null = null;

  /** Stable identifier for this surface (the appType it serves). */
  appType?: string = "agent";

  /** Which side this surface was mounted on (set by the host on mount). */
  side?: "left" | "right";

  /** Injectable for tests. */
  configService: ConfigService | null = null;

  @state() private _config: AgentConfig | null = null;
  @state() private _loading = true;

  /** Available agent tools registered by the backend (plugin-style). */
  @state() private _availableTools: Array<{ name: string; description: string }> = [];
  /** Names of the agent tools enabled for this workspace. */
  @state() private _enabledTools = new Set<string>();
  @state() private _toolsLoading = true;
  /** Whether a workspace file is open (tools are per-workspace). */
  @state() private _hasWorkspace = false;

  /** Provider drafts keyed by provider layer id. */
  private _providerDrafts = new Map<string, ProviderDraft>();
  /** Provider layer id → config provider key being edited (null = adding). */
  private _providerEditId = new Map<string, string | null>();
  /** Provider layer id → auto-created on Add (delete if empty on close). */
  private _providerCreated = new Set<string>();
  /** Model drafts keyed by model layer id. */
  private _modelCtx = new Map<string, ModelCtx>();

  private _nextId = 0;
  /** Last observed workspace file path, so we only reload tools on file change. */
  private _lastWorkspacePath: string | null = null;
  private _workspaceUnsub: (() => void) | null = null;

  get title(): string {
    return "Agents";
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._workspaceUnsub = workspaceFileService.onChange(() => this._syncWorkspace());
    this._lastWorkspacePath = workspaceFileService.openFilePath;
    this._hasWorkspace = workspaceFileService.openFilePath != null;
    void this._load();
  }

  disconnectedCallback(): void {
    this._workspaceUnsub?.();
    this._workspaceUnsub = null;
    super.disconnectedCallback();
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
    await this._loadTools();
    this.host?.refresh();
    this.requestUpdate();
  }

  /** Load the registered tool set and the workspace's enabled subset. */
  private async _loadTools(): Promise<void> {
    let tools: Array<{ name: string; description: string }> = [];
    try {
      tools = (await window.openp41ge?.chat?.listTools?.()) ?? [];
    } catch {
      tools = [];
    }
    this._availableTools = tools;
    this._syncEnabledFromWorkspace();
    this._toolsLoading = false;
  }

  /**
   * Sync the enabled-tools set from the open workspace. Defaults to "all
   * registered tools" when the workspace has no explicit config. Only re-reads
   * when the workspace file path changes (other save events must not clobber
   * an in-progress toggle).
   */
  private _syncWorkspace(): void {
    const path = workspaceFileService.openFilePath;
    const changed = path !== this._lastWorkspacePath;
    this._lastWorkspacePath = path;
    this._hasWorkspace = path != null;
    if (changed) {
      this._syncEnabledFromWorkspace();
    }
    this.requestUpdate();
  }

  private _syncEnabledFromWorkspace(): void {
    const saved = workspaceFileService.openData?.agentTools?.enabled;
    const registered = new Set(this._availableTools.map((t) => t.name));
    if (saved?.length) {
      // Keep only tools that are still registered, so de-registered plugins
      // don't linger in the persisted set.
      this._enabledTools = new Set(saved.filter((n) => registered.has(n)));
    } else {
      this._enabledTools = registered;
    }
  }

  private _defaultConfig(): AgentConfig {
    return {
      providerId: "vllm",
      providers: { vllm: { baseUrl: "http://localhost:8000/v1", model: "" } },
    };
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

  private _genId(): string {
    this._nextId += 1;
    return `agdsd-${Date.now()}-${this._nextId}`;
  }

  private async _persist(config: AgentConfig): Promise<void> {
    const value = JSON.parse(JSON.stringify(config));
    // config.set dispatches the openp41ge:config-changed DOM event itself.
    if (this.configService) {
      await this.configService.set("agent", value);
      return;
    }
    await window.openp41ge?.config?.set?.("agent", value);
  }

  /** Write a provider draft through to config (live). */
  private async _syncProvider(layerId: string): Promise<void> {
    const config = this._config;
    const editId = this._providerEditId.get(layerId);
    const draft = this._providerDrafts.get(layerId);
    if (!config || !editId || !draft) return;
    const providers = { ...config.providers, [editId]: providerConfigFromDraft(draft) };
    const next = { ...config, providers };
    this._config = next;
    this.requestUpdate();
    this.host?.refresh();
    await this._persist(next);
  }

  /** Open a provider editor layer for an existing provider. */
  private _openProvider(providerId: string): void {
    const config = this._config;
    const p = config?.providers[providerId];
    if (!config || !p) return;
    const layerId = this._genId();
    this._providerDrafts.set(layerId, providerDraftFromConfig(p));
    this._providerEditId.set(layerId, providerId);
    this._providerCreated.delete(layerId);
    // The drawer head is a fixed category label, not the provider's name.
    this._pushProviderLayer(layerId, "Provider", providerId);
  }

  /** Open a provider editor layer for a brand-new (Add) provider. */
  private _openAddProvider(): void {
    const config = this._config;
    if (!config) return;
    const id = nextProviderId(Object.keys(config.providers), CUSTOM_PRESET_ID);
    const provider: ProviderConfig = { baseUrl: "", model: "" };
    const providers = { ...config.providers, [id]: provider };
    const next = { ...config, providerId: config.providerId || id, providers };
    // Keep the blank provider in-memory only — it is NOT persisted until the
    // user enters a real endpoint/model (via _syncProvider). Closing it empty
    // discards it, so we never write fake empty providers to config.
    this._config = next;

    const layerId = this._genId();
    this._providerDrafts.set(layerId, providerDraftFromConfig(provider));
    this._providerEditId.set(layerId, id);
    this._providerCreated.add(layerId);
    this._pushProviderLayer(layerId, "Provider", id);
  }

  private _pushProviderLayer(layerId: string, title: string, providerId: string): void {
    this.host?.open({
      id: layerId,
      title,
      closable: true,
      styles: AGDS_CSS,
      render: () => this._renderProviderEditor(layerId),
    }, this.side);
  }

  /** Open a model editor layer. */
  private _openModel(providerLayerId: string, modelIndex: number | null): void {
    const draft = this._providerDrafts.get(providerLayerId);
    if (!draft) return;
    let modelDraft: ModelDraft;
    let title: string;
    if (modelIndex === null) {
      const baseId = nextModelId(draft.models, "model");
      modelDraft = { id: baseId };
      title = "Model";
    } else {
      const m = draft.models[modelIndex];
      if (!m) return;
      modelDraft = {
        id: m.id,
        maxTokens: m.maxTokens !== undefined ? String(m.maxTokens) : undefined,
        contextWindow: m.contextWindow !== undefined ? String(m.contextWindow) : undefined,
      };
      // The drawer head is a fixed category label, not the model's id.
      title = "Model";
    }
    const layerId = this._genId();
    this._modelCtx.set(layerId, { draft: modelDraft, providerLayerId, modelIndex });
    this.host?.open({
      id: layerId,
      title,
      closable: true,
      styles: AGDS_CSS,
      render: () => this._renderModelEditor(layerId),
    }, this.side);
  }

  /** Commit a model draft into its provider draft (live), then refresh. */
  private _setModelDraft(layerId: string, patch: Partial<ModelDraft>): void {
    const ctx = this._modelCtx.get(layerId);
    const provider = ctx ? this._providerDrafts.get(ctx.providerLayerId) : undefined;
    if (!ctx || !provider) return;
    const draft = { ...ctx.draft, ...patch };
    ctx.draft = draft;
    this._modelCtx.set(layerId, ctx);

    // Reflect into the provider's models list live.
    const id = draft.id.trim() || "model";
    const models = [...provider.models];
    if (ctx.modelIndex === null) {
      // Only add if a real id is present.
      if (id !== "model") {
        models.push({ id });
      }
    } else if (models[ctx.modelIndex]) {
      models[ctx.modelIndex] = { id };
    }
    provider.models = models;
    this.requestUpdate();
    this.host?.refresh();
    void this._syncProvider(ctx.providerLayerId);
  }

  private _deleteModel(layerId: string, providerLayerId: string, modelIndex: number): void {
    const provider = this._providerDrafts.get(providerLayerId);
    if (!provider || modelIndex === null) return;
    const models = provider.models.filter((_, i) => i !== modelIndex);
    provider.models = models;
    // If the deleted model was the default, fall back.
    if (provider.model === provider.models[modelIndex]?.id || provider.models.length === 0) {
      if (provider.models.length > 0) provider.model = provider.models[0].id;
      else provider.model = "";
    }
    this._modelCtx.delete(layerId);
    this._closeLayer(layerId);
    void this._syncProvider(providerLayerId);
  }

  private _deleteProvider(layerId: string): void {
    const editId = this._providerEditId.get(layerId);
    const config = this._config;
    if (!editId || !config) return;
    const providers = { ...config.providers };
    delete providers[editId];
    if (config.providerId === editId) {
      config.providerId = Object.keys(providers)[0] ?? "";
    }
    const next = { ...config, providers };
    this._config = next;
    void this._persist(next);
    this._providerDrafts.delete(layerId);
    this._providerEditId.delete(layerId);
    this._providerCreated.delete(layerId);
    this._closeLayer(layerId);
  }

  /** Close a layer after commit (no re-commit). */
  private _closeLayer(layerId: string): void {
    // Close the host layer and drop its draft context.
    this.host?.close(layerId, this.side);
  }

  /** Close a provider layer: commit draft + maybe delete empty new provider. */
  private _closeProviderLayer(layerId: string): void {
    const editId = this._providerEditId.get(layerId);
    const draft = this._providerDrafts.get(layerId);
    const created = this._providerCreated.has(layerId);
    if (created && editId) {
      const p = this._config?.providers[editId];
      if (p && this._isEmptyProvider(p)) {
        const config = this._config;
        if (config) {
          const providers = { ...config.providers };
          delete providers[editId];
          const next = { ...config, providers };
          this._config = next;
          void this._persist(next);
        }
      }
    }
    this._providerDrafts.delete(layerId);
    this._providerEditId.delete(layerId);
    this._providerCreated.delete(layerId);
    this._closeLayer(layerId);
  }

  private _isEmptyProvider(p: ProviderConfig): boolean {
    return (
      !p.baseUrl.trim() &&
      !p.model.trim() &&
      !(p.apiKey ?? "").trim() &&
      !p.name?.trim() &&
      (p.models ?? []).length === 0 &&
      p.temperature === undefined &&
      p.maxTokens === undefined
    );
  }

  private _setProviderDraft(layerId: string, patch: Partial<ProviderDraft>): void {
    const draft = this._providerDrafts.get(layerId);
    if (!draft) return;
    Object.assign(draft, patch);
    this.requestUpdate();
    this.host?.refresh();
    void this._syncProvider(layerId);
  }

  /** Toggle a tool in the workspace's enabled set and persist it. */
  private async _toggleAgentTool(name: string): Promise<void> {
    const next = new Set(this._enabledTools);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    this._enabledTools = next;
    this.requestUpdate();
    this.host?.refresh();
    await workspaceFileService.setEnabledAgentTools([...next]);
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  render(): TemplateResult {
    const entries = this._providerEntries();
    return html`
      <style>${AGDS_CSS}</style>

      <div class="agds-pane">
        <p class="agds-section-title">Providers</p>
        <div class="agds-card">
          <label class="agds-card-question">
            Which providers should be available for agents?
          </label>
          ${
            this._loading
              ? html`<p class="agds-card-help">Loading…</p>`
              : html`
                  <ul class="agds-list">
                    ${
                      entries.length === 0
                        ? html`<li class="agds-empty">No providers yet.</li>`
                        : nothing
                    }
                    ${entries.map(([id, p]) => {
                      const preset = presetFor(p);
                      const name = providerDisplayName(preset, p);
                      const metaParts: string[] = [];
                      if (p.model) metaParts.push(p.model);
                      const host = endpointHost(p.baseUrl);
                      if (host) metaParts.push(host);
                      return html`
                        <li class="agds-row" @click=${() => this._openProvider(id)}>
                          <div class="agds-info">
                            <span class="agds-name">${name}</span>
                            <span class="agds-meta">
                              ${metaParts.length ? metaParts.join(" · ") : "No endpoint configured"}
                            </span>
                          </div>
                          <svg
                            class="agds-chevron"
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
                    })}
                    <li class="agds-row agds-add" @click=${() => this._openAddProvider()}>
                      <span class="agds-add-plus">＋</span>
                      <span>Add another provider</span>
                    </li>
                  </ul>
                  <p class="agds-card-help">
                    Define the providers your chats can use — including local OpenAI-compatible
                    servers. Click a provider to edit how it connects.
                  </p>
                `
          }
        </div>

        ${this._renderTools()}
      </div>
    `;
  }

  /** Render the per-workspace agent Tools section. */
  private _renderTools(): TemplateResult {
    if (this._toolsLoading) {
      return html`
        <p class="agds-section-title" style="margin-top:18px;">Tools</p>
        <div class="agds-card">
          <label class="agds-card-question">Which tools should agents be able to use in this workspace?</label>
          <p class="agds-card-help">Loading…</p>
        </div>
      `;
    }

    const tools = this._availableTools;
    let body: TemplateResult;
    if (!this._hasWorkspace) {
      body = html`
        <p class="agds-card-help">
          Agent tools are enabled per workspace. Open a workspace first to choose
          which tools its agents may use.
        </p>
      `;
    } else if (tools.length === 0) {
      body = html`<p class="agds-card-help">No agent tools are registered.</p>`;
    } else {
      body = html`
        <div class="agds-tools" role="group" aria-label="Available agent tools">
          ${tools.map(
            (tool) => html`
              <button
                type="button"
                class="agds-tool-card"
                aria-pressed=${this._enabledTools.has(tool.name)}
                @click=${() => void this._toggleAgentTool(tool.name)}
              >
                <span class="agds-tool-check" aria-hidden="true">${
                  this._enabledTools.has(tool.name) ? "✓" : nothing
                }</span>
                <span class="agds-tool-body">
                  <span class="agds-tool-name">${tool.name}</span>
                  ${tool.description
                    ? html`<span class="agds-tool-desc">${tool.description}</span>`
                    : nothing}
                </span>
              </button>
            `,
          )}
        </div>
        <p class="agds-card-help">
          Enabled tools are passed to agents when they run in this workspace. Tools
          you disable here are withheld, even if a chat's composer still lists them.
        </p>
      `;
    }

    return html`
      <p class="agds-section-title" style="margin-top:18px;">Tools</p>
      <div class="agds-card">
        <label class="agds-card-question">Which tools should agents be able to use in this workspace?</label>
        ${body}
      </div>
    `;
  }

  // ── Provider editor ────────────────────────────────────────────────────

  private _renderProviderEditor(layerId: string): TemplateResult {
    const draft = this._providerDrafts.get(layerId);
    if (!draft) return html`<div class="agds-pane"><p class="agds-empty">Loading…</p></div>`;
    const preset = providerPreset(draft.presetId) ?? customPreset();
    return html`
      <div class="agds-pane">
        <p class="agds-section-title">General</p>
        <div class="agds-card agds-input-card">
          <label class="agds-card-question">Which provider preset is this?</label>
          <select
            class="agds-select"
            .value=${draft.presetId}
            @change=${(e: Event) => {
              const presetId = (e.target as HTMLSelectElement).value;
              const p = providerPreset(presetId) ?? customPreset();
              const applied = applyPreset(p);
              this._setProviderDraft(layerId, {
                presetId,
                baseUrl: applied.baseUrl,
                model: applied.model,
                name: presetId === CUSTOM_PRESET_ID ? draft.name : applied.name,
              });
            }}
          >
            ${PROVIDER_PRESETS.map((p) => html`<option value=${p.id}>${p.label}</option>`)}
          </select>
          <p class="agds-card-help">
            Picking a preset pre-fills the endpoint and default model.
          </p>
        </div>

        <div class="agds-card agds-input-card" style="margin-top:14px;">
          <label class="agds-card-question">What is the display name?</label>
          <input
            class="agds-input"
            type="text"
            placeholder="e.g. My GPU server"
            .value=${draft.name ?? ""}
            @input=${(e: Event) =>
              this._setProviderDraft(layerId, { name: (e.target as HTMLInputElement).value })}
          />
        </div>

        <div class="agds-card agds-input-card" style="margin-top:14px;">
          <label class="agds-card-question">What base URL should be used?</label>
          <input
            class="agds-input agds-input--mono"
            type="text"
            placeholder="https://api.example.com/v1"
            .value=${draft.baseUrl}
            @input=${(e: Event) =>
              this._setProviderDraft(layerId, { baseUrl: (e.target as HTMLInputElement).value })}
          />
        </div>

        <p class="agds-section-title" style="margin-top:18px;">Models</p>
        <div class="agds-card">
          <label class="agds-card-question">Which models are available?</label>
          <ul class="agds-list">
            ${draft.models.length === 0 ? html`<li class="agds-empty">No models yet.</li>` : nothing}
            ${draft.models.map(
              (m, i) => html`
                <li class="agds-row" @click=${() => this._openModel(layerId, i)}>
                  <div class="agds-info">
                    <span class="agds-name">${m.id}</span>
                  </div>
                  <span class="agds-chevron">›</span>
                </li>
              `,
            )}
            <li class="agds-row agds-add" @click=${() => this._openModel(layerId, null)}>
              <span class="agds-add-plus">＋</span>
              <span>Add model</span>
            </li>
          </ul>
        </div>

        <div class="agds-actions">
          <button
            class="agds-delete"
            @click=${() => {
              if (window.confirm(`Delete “${preset.label}”?`)) this._deleteProvider(layerId);
            }}
          >
            Delete provider
          </button>
        </div>
      </div>
    `;
  }

  // ── Model editor ───────────────────────────────────────────────────────

  private _renderModelEditor(layerId: string): TemplateResult {
    const ctx = this._modelCtx.get(layerId);
    if (!ctx) return html`<div class="agds-pane"><p class="agds-empty">Loading…</p></div>`;
    const d = ctx.draft;
    return html`
      <div class="agds-pane">
        <p class="agds-section-title">Model</p>
        <div class="agds-card agds-input-card">
          <label class="agds-card-question">What is the model id?</label>
          <input
            class="agds-input agds-input--mono"
            type="text"
            placeholder="e.g. gpt-4o"
            .value=${d.id}
            @input=${(e: Event) =>
              this._setModelDraft(layerId, { id: (e.target as HTMLInputElement).value })}
          />
          <p class="agds-card-help">
            The exact model id used when requesting chat completions.
          </p>
        </div>

        <div class="agds-card agds-input-card" style="margin-top:14px;">
          <label class="agds-card-question">What is the max tokens?</label>
          <input
            class="agds-input"
            type="text"
            inputmode="numeric"
            placeholder="e.g. 8192"
            .value=${d.maxTokens ?? ""}
            @input=${(e: Event) =>
              this._setModelDraft(layerId, {
                maxTokens: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, ""),
              })}
          />
        </div>

        <div class="agds-card agds-input-card" style="margin-top:14px;">
          <label class="agds-card-question">What is the context window?</label>
          <input
            class="agds-input"
            type="text"
            inputmode="numeric"
            placeholder="e.g. 128000"
            .value=${d.contextWindow ?? ""}
            @input=${(e: Event) =>
              this._setModelDraft(layerId, {
                contextWindow: (e.target as HTMLInputElement).value.replace(/[^0-9]/g, ""),
              })}
          />
        </div>

        <div class="agds-actions">
          ${
            ctx.modelIndex !== null
              ? html`
                  <button class="agds-delete" @click=${() => this._deleteModel(layerId, ctx.providerLayerId, ctx.modelIndex!)}>
                    Delete model
                  </button>
                `
              : nothing
          }
        </div>
      </div>
    `;
  }
}

if (!customElements.get("openp41ge-agent-settings-drawer")) {
  customElements.define("openp41ge-agent-settings-drawer", Openp41geAgentSettingsDrawer);
}

declare global {
  interface HTMLElementTagNameMap {
    "openp41ge-agent-settings-drawer": Openp41geAgentSettingsDrawer;
  }
}
