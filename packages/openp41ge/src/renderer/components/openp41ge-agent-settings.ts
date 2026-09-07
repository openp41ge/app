/**
 * <openp41ge-agent-settings> — Lit settings surface for the AI agent provider.
 *
 * Hosted by the "Agent" system overlay tab. Reads/writes the `agent` config
 * via IPC, provides a Test Connection button, and dispatches
 * `openp41ge:config-changed` on save so chat panes can refresh their
 * connection status.
 */

import { LitElement, html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";

interface ProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

interface AgentConfig {
  providerId: string;
  providers: Record<string, ProviderConfig>;
}

export class Openp41geAgentSettings extends LitElement {
  @state() private _config: AgentConfig | null = null;
  @state() private _loading = true;
  @state() private _testing = false;
  @state() private _testResult: { ok: boolean; error?: string } | null = null;
  @state() private _saving = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this._load();
  }

  private async _load(): Promise<void> {
    try {
      const cfg = (await window.openp41ge.config.get("agent")) as AgentConfig | undefined;
      this._config = cfg ?? { providerId: "vllm", providers: { vllm: { baseUrl: "", model: "" } } };
    } catch {
      this._config = { providerId: "vllm", providers: { vllm: { baseUrl: "", model: "" } } };
    }
    this._loading = false;
  }

  private async _testConnection(): Promise<void> {
    if (!this._config) return;
    this._testing = true;
    this._testResult = null;
    try {
      this._testResult = await window.openp41ge.chat.pingProvider(this._config.providerId);
    } catch (err) {
      this._testResult = { ok: false, error: (err as Error).message };
    }
    this._testing = false;
  }

  private async _save(): Promise<void> {
    if (!this._config) return;
    this._saving = true;
    const value = JSON.parse(JSON.stringify(this._config));
    await window.openp41ge.config.set("agent", value);
    document.dispatchEvent(
      new CustomEvent("openp41ge:config-changed", {
        detail: { key: "agent", value },
        bubbles: true,
        composed: true,
      }),
    );
    this._saving = false;
  }

  private _provider(): ProviderConfig {
    const cfg = this._config;
    if (!cfg) return { baseUrl: "", model: "" };
    return cfg.providers[cfg.providerId] ?? { baseUrl: "", model: "" };
  }

  private _setProvider(patch: Partial<ProviderConfig>): void {
    const cfg = this._config;
    if (!cfg) return;
    const merged = { ...this._provider(), ...patch };
    this._config = {
      ...cfg,
      providers: { ...cfg.providers, [cfg.providerId]: merged },
    };
  }

  render(): TemplateResult {
    const provider = this._provider();
    return html`
      <style>
        :host {
          display: block;
          color: var(--text-primary, #ccc);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
        }
        /* Padding lives on an inner wrapper (not :host) because the app's
           global reset '* { padding: 0 }' overrides :host padding. */
        .as-pane {
          box-sizing: border-box;
          min-height: 100%;
          padding: 16px;
        }
        h2 {
          margin: 0 0 4px;
          font-size: 15px;
          font-weight: 600;
        }
        .hint {
          color: var(--text-muted, #777);
          margin: 0 0 16px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 12px;
        }
        label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary, #aaa);
        }
        input,
        select {
          height: 26px;
          padding: 0 8px;
          font-size: 12px;
          color: var(--text-primary, #ccc);
          background: var(--bg-secondary, #252526);
          border: 1px solid var(--divider, #333);
          border-radius: 4px;
          outline: none;
          box-sizing: border-box;
          width: 100%;
        }
        input:focus,
        select:focus {
          border-color: var(--accent, #4a9eff);
        }
        .buttons {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }
        button {
          height: 26px;
          padding: 0 12px;
          font-size: 12px;
          color: #fff;
          background: var(--accent, #2b5a9c);
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button.secondary {
          color: var(--text-primary, #ccc);
          background: var(--bg-tertiary, #2d2d2d);
          border: 1px solid var(--divider, #333);
        }
        button:disabled {
          opacity: 0.5;
          cursor: default;
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

      <div class="as-pane">
        <h2>Agent</h2>
        <p class="hint">Configure the AI agent provider. Chats stream from a local vLLM server.</p>

        ${
          this._loading
            ? html`<p class="hint">Loading…</p>`
            : html`
                <div class="field">
                  <label>Provider</label>
                  <select
                    .value=${this._config?.providerId ?? "vllm"}
                    @change=${(e: Event) => {
                      const v = (e.target as HTMLSelectElement).value;
                      this._config = this._config
                        ? { ...this._config, providerId: v }
                        : this._config;
                      this.requestUpdate();
                    }}
                  >
                    <option value="vllm">vLLM</option>
                  </select>
                </div>

                <div class="field">
                  <label>Base URL</label>
                  <input
                    type="text"
                    placeholder="http://localhost:8000/v1"
                    .value=${provider.baseUrl}
                    @input=${(e: Event) =>
                      this._setProvider({ baseUrl: (e.target as HTMLInputElement).value })}
                  />
                </div>

                <div class="field">
                  <label>Model</label>
                  <input
                    type="text"
                    placeholder="e.g. Qwen2.5-Coder-7B-Instruct"
                    .value=${provider.model}
                    @input=${(e: Event) =>
                      this._setProvider({ model: (e.target as HTMLInputElement).value })}
                  />
                </div>

                <div class="field">
                  <label>API Key (optional)</label>
                  <input
                    type="password"
                    placeholder="sk-…"
                    .value=${provider.apiKey ?? ""}
                    @input=${(e: Event) =>
                      this._setProvider({ apiKey: (e.target as HTMLInputElement).value })}
                  />
                </div>

                <div class="buttons">
                  <button
                    class="secondary"
                    ?disabled=${this._testing}
                    @click=${() => this._testConnection()}
                  >
                    ${this._testing ? "Testing…" : "Test Connection"}
                  </button>
                  <button ?disabled=${this._saving} @click=${() => this._save()}>
                    ${this._saving ? "Saving…" : "Save"}
                  </button>
                </div>

                ${
                  this._testResult
                    ? html`<div class=${this._testResult.ok ? "test-ok" : "test-err"}>
                        ${
                          this._testResult.ok
                            ? "✓ Connected"
                            : `✗ ${this._testResult.error ?? "Unreachable"}`
                        }
                      </div>`
                    : ""
                }
              `
        }
      </div>
    `;
  }
}

export function registerOpenp41geAgentSettings(): void {
  if (!customElements.get("openp41ge-agent-settings")) {
    customElements.define("openp41ge-agent-settings", Openp41geAgentSettings);
  }
}

registerOpenp41geAgentSettings();
