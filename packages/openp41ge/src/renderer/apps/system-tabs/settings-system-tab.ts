/**
 * SettingsSystemTab — editor-area system tab placeholder for settings.
 *
 * Will hold app settings (theme, keybindings, etc.) in future iterations.
 */

import { html, type TemplateResult } from "lit";
import type { EditorSystemTabController } from "../../controllers/types";

export class SettingsSystemTab implements EditorSystemTabController {
  readonly id: string;
  readonly appType = "settings";
  readonly title = "Settings";

  constructor(tabId: string) {
    this.id = tabId;
  }

  render(): TemplateResult {
    return html`
      <div style="padding: 20px; font-size: 13px; color: var(--text-secondary, #999);">
        <h2 style="font-size: 16px; font-weight: 600; color: var(--text-primary, #ccc); margin: 0 0 16px 0;">Settings</h2>
        <p>Settings UI coming soon.</p>
      </div>
    `;
  }
}
