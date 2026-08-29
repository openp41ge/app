/**
 * FileEditorSettingsSystemTab — system overlay tab hosting the file editor
 * settings surface (<openp41ge-file-editor-settings>).
 *
 * Registered in RegisterAppTypesStep as the "file-editor-settings" overlay
 * tab. The first (and currently only) setting is `editor.maxFileSize` — the
 * cap above which files open as a VSCode-style "too large" message.
 */

import { html, type TemplateResult } from "lit";
import type { EditorSystemTabController } from "../../controllers/types";
import "../../components/openp41ge-file-editor-settings";

export class FileEditorSettingsSystemTab implements EditorSystemTabController {
  readonly id: string;
  readonly appType = "file-editor-settings";
  readonly title = "File Editor Settings";

  constructor(tabId: string) {
    this.id = tabId;
  }

  render(): TemplateResult {
    return html`<openp41ge-file-editor-settings></openp41ge-file-editor-settings>`;
  }

  mount(): void {
    /* The settings component subscribes to the config service on its own. */
  }

  unmount(): void {
    /* The component disposes its subscription on disconnect. */
  }
}
