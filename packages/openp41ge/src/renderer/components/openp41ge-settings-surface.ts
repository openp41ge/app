/**
 * <openp41ge-settings-surface> — generic single-pane settings surface for the
 * "negative drawer" host.
 *
 * Hosts an existing settings component (e.g. <openp41ge-file-editor-settings>,
 * <openp41ge-logs-settings>) as the base drawer layer. The same content a
 * grid-tab settings shell would render is shown over the grid instead. There
 * are no sub-drawers; the host still provides the head (+ close button) and the
 * shared resize handle.
 *
 * The content element is created by the caller and passed in, so the host does
 * not need to know how to build each settings pane.
 */

import { LitElement, html, type TemplateResult } from "lit";
import type { Openp41geSettingsDrawerHost } from "./openp41ge-settings-drawer-host";

export class Openp41geSettingsSurface extends LitElement {
  host: Openp41geSettingsDrawerHost | null = null;

  /** Stable identifier for this surface (the appType it serves). */
  appType?: string;

  private _label: string;
  private _content: HTMLElement;

  constructor(label: string, content: HTMLElement) {
    super();
    this._label = label;
    this._content = content;
  }

  get title(): string {
    return this._label;
  }

  render(): TemplateResult {
    return html`
      <style>
        :host {
          display: block;
          box-sizing: border-box;
          height: 100%;
          color: var(--text-primary, #ccc);
          font-family: var(--font-ui);
          font-size: 13px;
        }
        .ss-surface {
          box-sizing: border-box;
          height: 100%;
          /* Normalize the content pane padding to match the agent drawer's
           * smaller (18px) spacing so all drawers read consistently. The
           * custom property inherits across shadow boundaries into hosted
           * components that opt in (see .fes-pane / .ls-pane). The fallback
           * keeps the components' own (28px) padding when used as a grid tab. */
          --settings-pane-padding: 18px 18px 28px;
          /* Match the drawer frame / sidebar background so the hosted settings
           * content does not render as a lighter (bg-primary) card inside the
           * drawer. Falls back to the component's own bg-primary when used as a
           * grid tab. */
          --settings-pane-bg: var(--bg-surface, #161616);
        }
        /* Force the hosted settings component to fill the surface. The editor
         * settings element renders in light DOM and needs an explicit block
         * box; the logs settings sets its own :host but this is harmless.
         * No padding is applied to the host here — the content component owns
         * its pane padding (via --settings-pane-padding), so we avoid doubling
         * it. */
        .ss-surface > * {
          display: block;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
        }
      </style>
      <div class="ss-surface">${this._content}</div>
    `;
  }
}

customElements.define("openp41ge-settings-surface", Openp41geSettingsSurface);

declare global {
  interface HTMLElementTagNameMap {
    "openp41ge-settings-surface": Openp41geSettingsSurface;
  }
}
