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
import type {
  Openp41geSettingsDrawerHost,
  SettingsDrawerLayer,
} from "./openp41ge-settings-drawer-host";
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
} from "../models/agent-provider-presets";
import "openp41ge-json-editor/json-editor";
import { cloneDeep, getAt, setAt, schemaAtPath, sortJsonKeys } from "openp41ge-json-editor";
import type { JsonPath } from "openp41ge-json-editor";
import { AGENT_SETTINGS_SCHEMA } from "../models/agent-settings-schema";
import { resolveAgentDescription } from "../models/agent-settings-descriptions";

/**
 * In-memory draft store for the agent settings surface. The drawer keeps
 * unsaved edits as a draft that survives closing/re-opening the drawer within
 * a session, but is NEVER written through to persisted config (only the explicit
 * Save does that) and vanishes on a workspace/app restart (it lives on the
 * global only).
 */
const agentDraftStore = new Map<string, AgentConfig>();
const AGENT_DRAFT_KEY = "agent";

/** @internal Test hook: drop any in-session agent draft (memory only). */
export function __resetAgentSettingsDraft(): void {
  agentDraftStore.clear();
}

/** A draft provider config (numeric fields held as text while editing). */
interface ProviderDraft {
  baseUrl: string;
  defaultModel: string;
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
  /** For a brand-new model, the index it currently occupies in the provider's
   *  `models` list once it has been reflected there — so later edits update the
   *  same entry instead of appending duplicates. undefined = not yet added. */
  pendingIndex?: number;
  /** Deep copy of the provider's `models` when this editor opened — the
   *  restore target if the layer closes WITHOUT saving (discard). */
  modelsSnapshot: ModelConfig[];
  /** True once the user has made an edit (drives the "unsaved changes" state). */
  dirty?: boolean;
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
    font-family: var(--font-ui);
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
  /* The base surface is entirely the JSON editor, with a pinned footer. */
  .agds-root {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .agds-json-pane {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 0;
  }
  .agds-json-pane > json-editor {
    flex: 1;
    min-height: 0;
  }
  /* Bottom bar pinned under the JSON editor. */
  .agds-footer {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    height: 34px;
    padding: 0;
    box-sizing: border-box;
    border-top: 1px solid var(--divider, #333);
    background: var(--bg-surface, #161616);
  }
  .agds-footer--action {
    justify-content: flex-end;
  }
  .agds-footer-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 26px;
    padding: 0 12px;
    border: none;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, #ddd);
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
  }
  .agds-footer-btn:hover {
    background: rgba(255, 255, 255, 0.14);
  }
  .agds-footer-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .agds-footer-btn--primary {
    background: var(--accent, #569cd6);
    color: #fff;
  }
  .agds-footer-btn--primary:hover {
    background: var(--accent, #569cd6);
    opacity: 0.9;
  }
  .agds-footer-btn[disabled] {
    opacity: 0.4;
    cursor: default;
  }
  /* Square icon-only button (e.g. Sort keys) in the base footer: full height,
   * right-aligned with a left-side separator — like the drawer head buttons. */
  .agds-footer-btn--icon {
    height: 100%;
    aspect-ratio: 1 / 1;
    padding: 0;
    justify-content: center;
    gap: 0;
    border: none;
    border-left: 1px solid var(--border-divider, #2d2d2d);
    border-radius: 0;
    background: transparent;
    color: var(--text-secondary, #999);
  }
  .agds-footer-btn--icon:hover {
    background: var(--bg-active, #37373d);
    color: var(--text-primary, #ddd);
  }
  .agds-footer-btn--icon[disabled]:hover {
    background: transparent;
    color: var(--text-secondary, #999);
  }
  .agds-footer-btn--icon svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
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
  /* The app injects a global input:focus-visible outline (focus-section),
   * which otherwise draws a second focus ring around the field on top of the
   * card's own :focus-within outline. Kill it on the field — the card is the
   * focus indicator. */
  .agds-input:focus,
  .agds-input:focus-visible {
    outline: none;
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
  /* Model editor: a full-height flex column with a scrollable body and a
   * fixed bottom bar. The bar hosts the (icon) delete action. */
  .agds-model {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 0;
  }
  .agds-model-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 18px 28px;
  }
  .agds-model-bar {
    position: relative;
    flex: 0 0 auto;
    display: flex;
    align-items: stretch;
    justify-content: flex-end;
    height: 34px;
    box-sizing: border-box;
    border-top: 1px solid var(--divider, #333);
    background: var(--bg-surface, #161616);
  }
  .agds-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    aspect-ratio: 1 / 1;
    padding: 0;
    border: none;
    border-left: 1px solid var(--divider, #333);
    background: transparent;
    color: var(--text-secondary, #999);
    cursor: pointer;
    font-family: inherit;
  }
  .agds-icon-btn svg {
    width: 16px;
    height: 16px;
  }
  .agds-icon-btn:not(:disabled):hover {
    color: #e06c75;
    background: rgba(224, 108, 117, 0.15);
  }
  .agds-icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .agds-save-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 100%;
    aspect-ratio: 1 / 1;
    padding: 0;
    border: none;
    border-left: 1px solid var(--divider, #333);
    background: transparent;
    /* Same neutral icon tone as the other bottom-bar action buttons. */
    color: var(--text-secondary, #999);
    cursor: pointer;
    font-family: inherit;
  }
  .agds-save-btn svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .agds-save-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, #ddd);
  }
  /* Dirty state: the button widens to the left and shows its label, all in the
   * accent blue. */
  /* Dirty state: the save icon turns accent blue and stays blue on hover. */
  .agds-save-btn--dirty {
    color: var(--accent, #569cd6);
  }
  .agds-save-btn--dirty:hover {
    background: rgba(86, 156, 214, 0.15);
    color: var(--accent, #569cd6);
  }

  /* Bottom-bar action buttons show a custom tooltip (via data-tooltip) instead
   * of the native title, matching the rest of the app's footer buttons. */
  .agds-icon-btn,
  .agds-save-btn {
    position: relative;
  }
  .agds-icon-btn::after,
  .agds-save-btn::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    padding: 4px 8px;
    border-radius: 4px;
    background: #1e1e1e;
    color: var(--text-primary, #ddd);
    border: 1px solid var(--divider, #3a3a3a);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
    font-size: 11px;
    line-height: 1.3;
    white-space: nowrap;
    opacity: 0;
    transform: translateY(3px);
    pointer-events: none;
    transition: opacity 0.12s ease, transform 0.12s ease;
    z-index: 40;
  }
  .agds-icon-btn:hover::after,
  .agds-save-btn:hover::after {
    opacity: 1;
    transform: translateY(0);
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
    defaultModel: p.defaultModel,
    name: p.name,
    apiKey: p.apiKey,
    temperature: p.temperature !== undefined ? String(p.temperature) : undefined,
    maxTokens: p.maxTokens !== undefined ? String(p.maxTokens) : undefined,
    models: (p.models ?? []).map((m) => ({ ...m })),
    presetId: presetFor(p).id,
  };
}

function providerConfigFromDraft(d: ProviderDraft): ProviderConfig {
  const cfg: ProviderConfig = { baseUrl: d.baseUrl, defaultModel: d.defaultModel };
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

/** Coerce a model drawer draft into a clean ModelConfig (numbers on save). */
function modelConfigFromDraft(d: ModelDraft): ModelConfig {
  const m: ModelConfig = { id: d.id.trim() };
  const max = Number(d.maxTokens ?? "");
  if (d.maxTokens !== undefined && d.maxTokens.trim() !== "" && !Number.isNaN(max)) {
    m.maxTokens = max;
  }
  const ctx = Number(d.contextWindow ?? "");
  if (d.contextWindow !== undefined && d.contextWindow.trim() !== "" && !Number.isNaN(ctx)) {
    m.contextWindow = ctx;
  }
  return m;
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
  /** Last persisted baseline; used to detect unsaved edits. */
  private _savedConfig: AgentConfig | null = null;
  @state() private _loading = true;
  /** Resolves schema description file references to bundled Markdown. */
  private _resolveResource = (ref: string): string | null => resolveAgentDescription(ref);

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

  /** Provider layer ids whose Save was pressed (skip discard on close). */
  private _providerCommitted = new Set<string>();
  /** Model layer ids whose Save was pressed (skip discard on close). */
  private _modelCommitted = new Set<string>();
  /** Provider layer ids holding uncommitted edits (drives "unsaved changes"). */
  private _providerDirty = new Set<string>();
  /** Sub-layer objects we pushed, by layer id — lets us update their head status live. */
  private _layerObjs = new Map<string, SettingsDrawerLayer>();

  private _nextId = 0;
  /** Last observed workspace file path, so we only reload tools on file change. */
  private _lastWorkspacePath: string | null = null;
  private _workspaceUnsub: (() => void) | null = null;

  get title(): string {
    return "Agent Settings";
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
    // Read the persisted config as the SAVE baseline, independent of any draft.
    let persisted: AgentConfig | undefined;
    try {
      persisted = this.configService
        ? (this.configService.get("agent") as AgentConfig | undefined)
        : ((await window.openp41ge?.config?.get?.("agent")) as AgentConfig | undefined);
    } catch {
      persisted = undefined;
    }
    const base = persisted ?? this._defaultConfig();
    // Restore a prior in-session draft (unsaved edits from a previous open), so
    // closing the drawer keeps the changes visible the next time it opens — but
    // they are still NOT persisted until Save.
    const draft = agentDraftStore.get(AGENT_DRAFT_KEY);
    this._config = draft ? cloneDeep(draft) : cloneDeep(base);
    this._savedConfig = cloneDeep(base);
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
      providers: { vllm: { baseUrl: "http://localhost:8000/v1", defaultModel: "" } },
    };
  }

  private _providerEntries(): Array<[string, ProviderConfig]> {
    return Object.entries(this._config?.providers ?? {});
  }

  private _providerMeta(p: ProviderConfig): string {
    const parts: string[] = [];
    if (p.defaultModel) parts.push(p.defaultModel);
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

  /** Record the current working config as the in-session draft (memory only). */
  private _cacheDraft(): void {
    if (!this._config) return;
    agentDraftStore.set(AGENT_DRAFT_KEY, cloneDeep(this._config));
  }

  /** Discard any in-session draft (after Save or Reset). */
  private _clearDraft(): void {
    agentDraftStore.delete(AGENT_DRAFT_KEY);
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
    this._cacheDraft();
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
    const provider: ProviderConfig = { baseUrl: "", defaultModel: "" };
    const providers = { ...config.providers, [id]: provider };
    const next = { ...config, providerId: config.providerId || id, providers };
    // Keep the blank provider in-memory only — it is NOT persisted until the
    // user enters a real endpoint/model (via _syncProvider). Closing it empty
    // discards it, so we never write fake empty providers to config.
    this._config = next;
    this._cacheDraft();

    const layerId = this._genId();
    this._providerDrafts.set(layerId, providerDraftFromConfig(provider));
    this._providerEditId.set(layerId, id);
    this._providerCreated.add(layerId);
    this._pushProviderLayer(layerId, "Provider", id);
  }

  private _pushProviderLayer(layerId: string, title: string, _providerId: string): void {
    const layer: SettingsDrawerLayer = {
      id: layerId,
      title,
      closable: true,
      styles: AGDS_CSS,
      render: () => this._renderProviderEditor(layerId),
      onClose: () => this._discardProvider(layerId),
    };
    this._layerObjs.set(layerId, layer);
    this.host?.open(layer, this.side);
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
    this._modelCtx.set(layerId, {
      draft: modelDraft,
      providerLayerId,
      modelIndex,
      // Snapshot the provider's models so closing without Save can restore them.
      modelsSnapshot: draft.models.map((m) => ({ ...m })),
    });
    const layer: SettingsDrawerLayer = {
      id: layerId,
      title,
      closable: true,
      styles: AGDS_CSS,
      render: () => this._renderModelEditor(layerId),
      onClose: () => this._discardModel(layerId),
    };
    this._layerObjs.set(layerId, layer);
    this.host?.open(layer, this.side);
  }

  /** Commit a model draft into its provider draft (staging, NOT persisted
   *  until the provider/model Save is pressed), then refresh. */
  private _setModelDraft(layerId: string, patch: Partial<ModelDraft>): void {
    const ctx = this._modelCtx.get(layerId);
    const provider = ctx ? this._providerDrafts.get(ctx.providerLayerId) : undefined;
    if (!ctx || !provider) return;
    const draft = { ...ctx.draft, ...patch };
    ctx.draft = draft;
    ctx.dirty = true;
    this._setLayerStatus(layerId, "unsaved changes");
    this._modelCtx.set(layerId, ctx);

    // Reflect into the provider's models list (the in-memory working copy).
    // Carry the full draft (id, maxTokens, contextWindow) so numeric fields
    // aren't dropped on save.
    const id = draft.id.trim() || "model";
    const model = modelConfigFromDraft(draft);
    const models = [...provider.models];
    if (ctx.modelIndex === null) {
      // Adding a brand-new model. Only add once a real id is present, and keep
      // editing the SAME entry afterwards (tracked by `pendingIndex`) —
      // otherwise every keystroke would append a duplicate model.
      if (id === "model") {
        // Placeholder id; not yet reflected into the provider's list.
      } else if (ctx.pendingIndex === undefined) {
        models.push(model);
        ctx.pendingIndex = models.length - 1;
        this._modelCtx.set(layerId, ctx);
      } else if (models[ctx.pendingIndex]) {
        models[ctx.pendingIndex] = model;
      }
    } else if (models[ctx.modelIndex]) {
      models[ctx.modelIndex] = model;
    }
    provider.models = models;
    this.requestUpdate();
    this.host?.refresh();
  }

  /** Persist the model into its provider and close the model layer. */
  private _saveModel(layerId: string): void {
    const ctx = this._modelCtx.get(layerId);
    if (!ctx) return;
    // The draft is already reflected staged on each input; a final sync brings
    // the current state into the provider draft, then persist the provider
    // (which owns the models) and mark this layer committed so the close does
    // not discard it.
    this._setModelDraft(layerId, {});
    this._modelCommitted.add(layerId);
    // Saving the model persists the provider draft too, so the provider editor
    // no longer carries unsaved edits from the model.
    this._providerDirty.delete(ctx.providerLayerId);
    this._setLayerStatus(ctx.providerLayerId, undefined);
    void this._syncProvider(ctx.providerLayerId);
    this._closeLayer(layerId);
  }

  /** Discard a model layer's uncommitted edits (called on close without Save). */
  private _discardModel(layerId: string): void {
    const ctx = this._modelCtx.get(layerId);
    if (ctx && !this._modelCommitted.has(layerId)) {
      const provider = this._providerDrafts.get(ctx.providerLayerId);
      if (provider) {
        provider.models = ctx.modelsSnapshot.map((m) => ({ ...m }));
      }
    }
    this._modelCtx.delete(layerId);
    this._modelCommitted.delete(layerId);
    this._layerObjs.delete(layerId);
    this.requestUpdate();
  }

  private _deleteModel(layerId: string, providerLayerId: string, modelIndex: number): void {
    const provider = this._providerDrafts.get(providerLayerId);
    if (!provider || modelIndex === null) return;
    const models = provider.models.filter((_, i) => i !== modelIndex);
    provider.models = models;
    // If the deleted model was the default, fall back.
    if (provider.defaultModel === provider.models[modelIndex]?.id || provider.models.length === 0) {
      if (provider.models.length > 0) provider.defaultModel = provider.models[0].id;
      else provider.defaultModel = "";
    }
    this._modelCtx.delete(layerId);
    this._closeLayer(layerId);
    // Deleting persists the provider, so the provider no longer has unsaved
    // edits from this model.
    this._providerDirty.delete(providerLayerId);
    this._setLayerStatus(providerLayerId, undefined);
    void this._syncProvider(providerLayerId);
  }

  private _deleteProvider(layerId: string): void {
    const editId = this._providerEditId.get(layerId);
    const config = this._config;
    if (!editId || !config) return;
    const created = this._providerCreated.has(layerId);
    // Deleting a persisted provider is destructive; confirm. A just-added
    // (unsaved) provider has no persisted entry, so its removal needs no prompt.
    if (!created) {
      const p = config.providers[editId];
      const label = p ? providerDisplayName(presetFor(p), p) : editId;
      if (!window.confirm(`Delete “${label}”?`)) return;
    }
    const providers = { ...config.providers };
    delete providers[editId];
    let providerId = config.providerId;
    if (providerId === editId) providerId = Object.keys(providers)[0] ?? "";
    const next = { ...config, providerId, providers };
    this._config = next;
    this._cacheDraft();
    // Only persist if this provider was already persisted; a created-but-unsaved
    // provider lives in-memory only, so removing it needs no write.
    if (!created) void this._persist(next);
    // Clean up this layer's state first so its onClose sees nothing to restore.
    this._providerDrafts.delete(layerId);
    this._providerEditId.delete(layerId);
    this._providerCreated.delete(layerId);
    this._providerDirty.delete(layerId);
    this._providerCommitted.add(layerId);
    this._closeLayer(layerId);
  }

  /** Persist the provider draft into config (on Save), then close the layer. */
  private _saveProvider(layerId: string): void {
    const draft = this._providerDrafts.get(layerId);
    const editId = this._providerEditId.get(layerId);
    if (!draft || !editId) return;
    const created = this._providerCreated.has(layerId);
    // Saving a brand-new provider that still carries no data does nothing useful;
    // drop it instead of persisting an empty provider.
    if (created && this._isEmptyProvider(providerConfigFromDraft(draft))) {
      this._discardProvider(layerId);
      return;
    }
    this._providerCommitted.add(layerId);
    this._providerCreated.delete(layerId);
    void this._syncProvider(layerId);
    this._closeLayer(layerId);
  }

  /** Discard a provider layer's uncommitted edits on close WITHOUT Save. */
  private _discardProvider(layerId: string): void {
    const editId = this._providerEditId.get(layerId);
    const committed = this._providerCommitted.has(layerId);
    const created = this._providerCreated.has(layerId);
    const config = this._config;
    // An auto-created ("Add") provider lives in-memory only until saved; if we
    // close it without saving, drop it so it never leaks into the list.
    if (!committed && created && editId && config?.providers[editId]) {
      const providers = { ...config.providers };
      delete providers[editId];
      let providerId = config.providerId;
      if (providerId === editId) providerId = Object.keys(providers)[0] ?? "";
      this._config = { ...config, providerId, providers };
      this._cacheDraft();
    }
    this._providerDrafts.delete(layerId);
    this._providerEditId.delete(layerId);
    this._providerCreated.delete(layerId);
    this._providerCommitted.delete(layerId);
    this._providerDirty.delete(layerId);
    this._layerObjs.delete(layerId);
    this.requestUpdate();
  }

  /** Close a layer after commit (no re-commit). */
  private _closeLayer(layerId: string): void {
    // Close the host layer and drop its draft context.
    this._layerObjs.delete(layerId);
    this.host?.close(layerId, this.side);
  }

  /** Set a sub-layer's drawer-head status text (shown italic after its title). */
  private _setLayerStatus(layerId: string, status: string | undefined): void {
    const layer = this._layerObjs.get(layerId);
    if (layer) layer.status = status;
  }

  private _isEmptyProvider(p: ProviderConfig): boolean {
    return (
      !p.baseUrl.trim() &&
      !p.defaultModel.trim() &&
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
    this._providerDirty.add(layerId);
    this._setLayerStatus(layerId, "unsaved changes");
    this.requestUpdate();
    this.host?.refresh();
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

  /**
   * Head actions for the base drawer: a square Reset button (disabled until
   * there are unsaved changes) followed by a square Save button, both shown
   * next to ✕ (right-aligned, Reset immediately before Save). Save is
   * highlighted blue while there are unsaved changes. Bound `this` so the host
   * can call it as `surface.renderHeadAction()`.
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
        @click=${() => this._resetConfig()}
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
        @click=${() => void this._saveConfig()}
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
        ${AGDS_CSS}
      </style>

      <div class="agds-root">
        <div class="agds-json-pane">
          ${
            this._loading
              ? html`<p class="agds-card-help">Loading…</p>`
              : html`
                  <json-editor
                    .value=${this._config}
                    .rowHeight=${this._jsonRowHeight()}
                    .schema=${AGENT_SETTINGS_SCHEMA}
                    .resolveResource=${this._resolveResource}
                    @json-editor-change=${(e: CustomEvent) => void this._onConfigJsonChange(e)}
                    @json-editor-open=${(e: CustomEvent) => this._onConfigJsonOpen(e)}
                    @keydown=${(e: KeyboardEvent) => this._onEditorKeyDown(e)}
                  ></json-editor>
                `
          }
        </div>
        <div class="agds-footer">
          <button
            class="agds-footer-btn agds-footer-btn--icon"
            type="button"
            title="Sort keys"
            aria-label="Sort keys"
            ?disabled=${!this._config}
            @click=${() => this._sortConfig()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="24px"
              viewBox="0 -960 960 960"
              width="24px"
              fill="currentColor"
            >
              <path d="M120-240v-80h240v80H120Zm0-200v-80h480v80H120Zm0-200v-80h720v80H120Z" />
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  // ── Smart JSON editing ────────────────────────────────────────────────

  /** The whole-config editor committed an edit — stage it into the draft. */
  private _onConfigJsonChange(e: CustomEvent): void {
    const value = (e.detail as { value: AgentConfig }).value;
    // Stage into the working draft only — nothing is persisted until Save.
    this._config = value;
    this._cacheDraft();
    this.requestUpdate();
    this.host?.refresh();
  }

  /** The base editor's open-in-drawer button — push a layer locked to that
   *  sub-object (a provider, model, or any nested object). */
  private _onConfigJsonOpen(e: CustomEvent): void {
    this._pushJsonLayer((e.detail as { path: JsonPath }).path);
  }

  /** Row height for the JSON editors — follows the global platform
   *  line-height setting, a little larger to give the inline edit/insert
   *  affordances room. */
  private _jsonRowHeight(): number {
    const lh = this.configService?.get("lineHeight") as number | undefined;
    return typeof lh === "number" && lh >= 14 && lh <= 40 ? lh : 20;
  }

  /** Push a JSON editor layer locked to a config path. */
  private _pushJsonLayer(path: JsonPath): void {
    if (!path.length) return;
    const layerId = this._genId();
    const layer: SettingsDrawerLayer = {
      id: layerId,
      title: this._jsonLayerTitle(path),
      closable: true,
      styles: AGDS_CSS,
      render: () => this._renderJsonLayer(path),
      onClose: () => {
        this._layerObjs.delete(layerId);
        this.requestUpdate();
      },
    };
    this._layerObjs.set(layerId, layer);
    this.host?.open(layer, this.side);
  }

  /** A provider/model layer's header label (Provider / Model / object key). */
  private _jsonLayerTitle(path: JsonPath): string {
    if (path.length === 2 && path[0] === "providers") return "Provider";
    if (path.length >= 3 && path[path.length - 2] === "models") return "Model";
    return String(path[path.length - 1]);
  }

  /** Render a JSON editor locked to a sub-object of the config. Edits are
   *  committed to the config live (no draft/save), so close is a no-op commit. */
  private _renderJsonLayer(path: JsonPath): TemplateResult {
    const value = getAt(this._config, path);
    return html`
      <div class="agds-pane agds-model">
        <div class="agds-model-scroll">
          <json-editor
            .value=${value}
            .rowHeight=${this._jsonRowHeight()}
            .schema=${schemaAtPath(AGENT_SETTINGS_SCHEMA, path) ?? null}
            .resolveResource=${this._resolveResource}
            @json-editor-change=${(e: CustomEvent) => void this._onJsonLayerChange(path, e)}
            @json-editor-open=${(e: CustomEvent) => this._onJsonLayerOpen(path, e)}
            @keydown=${(e: KeyboardEvent) => this._onEditorKeyDown(e)}
          ></json-editor>
        </div>
        <div class="agds-footer agds-footer--action">
          <div class="agds-footer-actions">
            <button
              class="agds-footer-btn"
              type="button"
              ?disabled=${!this._isDirty()}
              @click=${() => this._resetConfig()}
            >
              Reset
            </button>
            <button
              class="agds-footer-btn agds-footer-btn--primary"
              type="button"
              ?disabled=${!this._isDirty()}
              @click=${() => void this._saveConfig()}
            >
              Save
            </button>
            <button
              class="agds-footer-btn"
              type="button"
              @click=${() => this.host?.closeTop(this.side)}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /** A sub-layer JSON editor committed a change to its locked sub-object. */
  private _onJsonLayerChange(path: JsonPath, e: CustomEvent): void {
    if (!this._config) return;
    const value = (e.detail as { value: unknown }).value;
    const next = cloneDeep(this._config);
    setAt(next, path, value);
    // Stage into the working draft only — nothing is persisted until Save.
    this._config = next;
    this._cacheDraft();
    this.requestUpdate();
    this.host?.refresh();
  }

  /** A sub-layer's editor opened a deeper sub-object — stack another layer. */
  private _onJsonLayerOpen(path: JsonPath, e: CustomEvent): void {
    this._pushJsonLayer([...path, ...(e.detail as { path: JsonPath }).path]);
  }

  /** Render the per-workspace agent Tools section. */
  /** True when the working draft differs from the last persisted baseline. */
  private _isDirty(): boolean {
    if (!this._config || !this._savedConfig) return !!this._config;
    return JSON.stringify(this._config) !== JSON.stringify(this._savedConfig);
  }

  /** Persist the working draft (Save). */
  private async _saveConfig(): Promise<void> {
    if (!this._config) return;
    await this._persist(this._config);
    this._savedConfig = cloneDeep(this._config);
    this._clearDraft();
    this.requestUpdate();
    this.host?.refresh();
  }

  /** Discard unsaved edits and restore the last persisted config. */
  private _resetConfig(): void {
    if (!this._savedConfig) return;
    this._config = cloneDeep(this._savedConfig);
    this._clearDraft();
    this.requestUpdate();
    this.host?.refresh();
  }

  /** Sort every object key (recursively) in the working draft so the JSON
   *  reads in a stable order. Arrays keep their order, so the JSON stays
   *  valid (explicit Save still persists). */
  private _sortConfig(): void {
    if (!this._config) return;
    this._config = sortJsonKeys(this._config);
    this._cacheDraft();
    this.requestUpdate();
    this.host?.refresh();
  }

  /** Cmd/Ctrl+S while the JSON editor is focused saves the staged draft. */
  private _onEditorKeyDown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      e.stopPropagation();
      void this._saveConfig();
    }
  }

  private _renderTools(): TemplateResult {
    if (this._toolsLoading) {
      return html`
        <p class="agds-section-title" style="margin-top:18px;">Tools</p>
        <div class="agds-card">
          <label class="agds-card-question"
            >Which tools should agents be able to use in this workspace?</label
          >
          <p class="agds-card-help">Loading…</p>
        </div>
      `;
    }

    const tools = this._availableTools;
    let body: TemplateResult;
    if (!this._hasWorkspace) {
      body = html`
        <p class="agds-card-help">
          Agent tools are enabled per workspace. Open a workspace first to choose which tools its
          agents may use.
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
                <span class="agds-tool-check" aria-hidden="true"
                  >${this._enabledTools.has(tool.name) ? "✓" : nothing}</span
                >
                <span class="agds-tool-body">
                  <span class="agds-tool-name">${tool.name}</span>
                  ${
                    tool.description
                      ? html`<span class="agds-tool-desc">${tool.description}</span>`
                      : nothing
                  }
                </span>
              </button>
            `,
          )}
        </div>
        <p class="agds-card-help">
          Enabled tools are passed to agents when they run in this workspace. Tools you disable here
          are withheld, even if a chat's composer still lists them.
        </p>
      `;
    }

    return html`
      <p class="agds-section-title" style="margin-top:18px;">Tools</p>
      <div class="agds-card">
        <label class="agds-card-question"
          >Which tools should agents be able to use in this workspace?</label
        >
        ${body}
      </div>
    `;
  }

  // ── Provider editor ────────────────────────────────────────────────────

  private _renderProviderEditor(layerId: string): TemplateResult {
    const draft = this._providerDrafts.get(layerId);
    if (!draft) return html`<div class="agds-pane"><p class="agds-empty">Loading…</p></div>`;
    const dirty = this._providerDirty.has(layerId);
    return html`
      <div class="agds-pane agds-model">
        <div class="agds-model-scroll">
          <p class="agds-section-title">General</p>
          <div class="agds-card agds-input-card">
            <label class="agds-card-question">Which provider preset is this?</label>
            <select
              class="agds-select"
              @change=${(e: Event) => {
                const presetId = (e.target as HTMLSelectElement).value;
                const p = providerPreset(presetId) ?? customPreset();
                const applied = applyPreset(p);
                this._setProviderDraft(layerId, {
                  presetId,
                  baseUrl: applied.baseUrl,
                  defaultModel: applied.defaultModel,
                  name: presetId === CUSTOM_PRESET_ID ? draft.name : applied.name,
                });
              }}
            >
              ${PROVIDER_PRESETS.map((p) => html`<option value=${p.id} ?selected=${draft.presetId === p.id}>${p.label}</option>`)}
            </select>
            <p class="agds-card-help">Picking a preset pre-fills the endpoint and default model.</p>
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
        </div>

        <div class="agds-model-bar">
          <button
            class="agds-icon-btn"
            data-tooltip="Delete provider"
            aria-label="Delete provider"
            @click=${() => this._deleteProvider(layerId)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
              <path
                d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"
              />
            </svg>
          </button>
          <button
            class="agds-save-btn ${dirty ? "agds-save-btn--dirty" : ""}"
            data-tooltip="Save provider"
            aria-label="Save provider"
            @click=${() => this._saveProvider(layerId)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
              <path
                d="M840-680v480q0 33-23.5 56.5T760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h480l160 160Zm-80 34L646-760H200v560h560v-446ZM565-275q35-35 35-85t-35-85q-35-34-35-34t-85 34q-35 35-35 85t35 85q35 35 85 35t85-35ZM240-560h360v-160H240v160Zm-40-86v446-560 114Z"
              />
            </svg>
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
    const dirty = ctx.dirty === true;
    return html`
      <div class="agds-pane agds-model">
        <div class="agds-model-scroll">
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
            <p class="agds-card-help">The exact model id used when requesting chat completions.</p>
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
        </div>

        <div class="agds-model-bar">
          <button
            class="agds-icon-btn"
            data-tooltip="Delete model"
            aria-label="Delete model"
            ?disabled=${ctx.modelIndex === null && ctx.pendingIndex === undefined}
            @click=${() => {
              const idx = ctx.modelIndex ?? ctx.pendingIndex;
              if (idx !== undefined) this._deleteModel(layerId, ctx.providerLayerId, idx);
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
              <path
                d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"
              />
            </svg>
          </button>
          <button
            class="agds-save-btn ${dirty ? "agds-save-btn--dirty" : ""}"
            data-tooltip="Save model"
            aria-label="Save model"
            @click=${() => this._saveModel(layerId)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
              <path
                d="M840-680v480q0 33-23.5 56.5T760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h480l160 160Zm-80 34L646-760H200v560h560v-446ZM565-275q35-35 35-85t-35-85q-35-34-35-34t-85 34q-35 36-35 85t35 85q35 35 85 35t85-35ZM240-560h360v-160H240v160Zm-40-86v446-560 114Z"
              />
            </svg>
          </button>
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
