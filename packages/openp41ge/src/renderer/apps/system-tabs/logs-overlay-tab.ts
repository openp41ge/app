/**
 * LogsSystemTab — system overlay tab hosting the app-log panel.
 *
 * Renders <debug-log-panel> (queryable virtual log list + session Debug
 * toggle + live Events sub-view). Registered as the "logs" tab of the system
 * overlay; opened via Cmd+Shift+D or the overlay top bar.
 */

import { html, type TemplateResult } from "lit";
import type { EditorSystemTabController } from "../../controllers/types";
import "../../components/debug-log-panel";

export class LogsSystemTab implements EditorSystemTabController {
  readonly id: string;
  readonly appType = "logs";
  readonly title = "Logs";

  constructor(tabId: string) {
    this.id = tabId;
  }

  render(): TemplateResult {
    return html`<debug-log-panel></debug-log-panel>`;
  }

  mount(): void {
    /* Panel subscribes to the log bus on its own. */
  }

  unmount(): void {
    /* Panel cleans itself up on disconnect. */
  }
}
