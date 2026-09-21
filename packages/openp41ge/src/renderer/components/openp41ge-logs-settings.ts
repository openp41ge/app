/**
 * <openp41ge-logs-settings> — Lit settings surface for the Logs panel.
 *
 * Hosted by the Logs settings grid tab. The single "General" card toggles
 * whether DEBUG-level log entries are captured. Reads the current capture
 * level on connect and writes it back on toggle via setMinLevel() + the
 * main-process `log:set-debug` IPC (window.openp41ge.logs).
 */

import { LitElement, html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import "openp41ge-uikit";
import { getMinLevel, setMinLevel, LogLevel } from "openp41ge-logger";

export class Openp41geLogsSettings extends LitElement {
  @state() private _debugEnabled = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._debugEnabled = getMinLevel() === LogLevel.DEBUG;
  }

  private _onDebugToggle(e: Event): void {
    const on = (e as CustomEvent<{ checked: boolean }>).detail.checked;
    this._debugEnabled = on;
    setMinLevel(on ? LogLevel.DEBUG : LogLevel.INFO);
    window.openp41ge?.logs?.setDebug?.(on);
  }

  render(): TemplateResult {
    return html`
      <style>
        :host {
          display: block;
          box-sizing: border-box;
          height: 100%;
          overflow: auto;
          /* Use the drawer/sidebar background in the drawer; fall back to the
           * component's own bg-primary when used as a grid tab. */
          background: var(--settings-pane-bg, var(--bg-primary, #161616));
          color: var(--text-primary, #ccc);
          font-family: var(--font-ui);
          font-size: 13px;
        }
        /* Padding lives on an inner wrapper (not :host) because the app's
           global reset '* { padding: 0 }' overrides :host padding. */
        .ls-pane {
          box-sizing: border-box;
          min-height: 100%;
          /* 28px is the pane's own padding when used as a grid tab. In the
           * settings drawer, the host surface sets --settings-pane-padding to
           * the agent-matching 18px so all drawers read consistently. */
          padding: var(--settings-pane-padding, 28px 32px);
        }
        .ls-section-title {
          margin: 0 0 14px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary, #999);
        }
        .ls-card {
          box-sizing: border-box;
          max-width: 620px;
          padding: 12px 14px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
        }
        .ls-card-question {
          display: block;
          margin: 0 0 14px;
          font-weight: 500;
          color: var(--text-primary, #e0e0e0);
        }
        .ls-card-control {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ls-card-help {
          margin: 14px 0 0;
          color: var(--text-secondary, #999);
          line-height: 1.5;
        }
      </style>

      <div class="ls-pane">
        <p class="ls-section-title">General</p>

        <div class="ls-card">
          <label class="ls-card-question">Would you like to capture debug logs?</label>
          <div class="ls-card-control">
            <openp41ge-toggle
              .checked=${this._debugEnabled}
              label="Capture debug logs"
              .onLabel=${"Yes"}
              .offLabel=${"No"}
              @change=${this._onDebugToggle}
            ></openp41ge-toggle>
          </div>
          <p class="ls-card-help">
            When off, DEBUG-level entries are dropped before reaching any transport; when on they
            are recorded and appear in the Logs tab and log files.
          </p>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("openp41ge-logs-settings")) {
  customElements.define("openp41ge-logs-settings", Openp41geLogsSettings);
}

declare global {
  interface HTMLElementTagNameMap {
    "openp41ge-logs-settings": Openp41geLogsSettings;
  }
}
