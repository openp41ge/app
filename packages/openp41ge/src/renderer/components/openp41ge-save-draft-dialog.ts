/**
 * <openp41ge-save-draft-dialog> — modal dialog for saving a draft project.
 *
 * Shown when the user clicks "Save Project" in the titlebar or triggers
 * "Save Project As..." from the File menu.
 *
 * Dispatches:
 *   CustomEvent('draft:saved', { detail: { draftName: string, newName: string } }) — bubbles
 *   CustomEvent('draft:save-cancelled') — when the user dismisses without saving
 */

import { LitElement, html, css } from "lit";
import { state } from "lit/decorators.js";
import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge-save-draft-dialog");

export class Openp41geSaveDraftDialog extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
      font-family: var(
        --openp41ge-font-family,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        sans-serif
      );
      color: var(--openp41ge-text-color, #e0e0e0);
    }

    .overlay {
      background: var(--openp41ge-bg-color, #1e1e1e);
      border: 1px solid var(--openp41ge-border-color, #444);
      border-radius: 8px;
      padding: 24px;
      min-width: 350px;
      max-width: 450px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    h2 {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--openp41ge-text-color, #e0e0e0);
    }

    p {
      margin: 0 0 16px 0;
      font-size: 13px;
      color: var(--openp41ge-muted-text, #888);
      line-height: 1.4;
    }

    .input-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 16px;
    }

    .input-row label {
      font-size: 12px;
      color: var(--openp41ge-muted-text, #888);
    }

    .input-row input {
      padding: 8px 12px;
      border: 1px solid var(--openp41ge-border-color, #444);
      border-radius: 4px;
      background: var(--openp41ge-input-bg, #2a2a2a);
      color: var(--openp41ge-text-color, #e0e0e0);
      font-size: 14px;
      outline: none;
    }

    .input-row input:focus {
      border-color: var(--openp41ge-accent-color, #4a9eff);
    }

    .input-row input.error {
      border-color: #e06c75;
    }

    .error-text {
      font-size: 12px;
      color: #e06c75;
      min-height: 16px;
    }

    .button-row {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .button-row button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      transition: opacity 0.1s;
    }

    .button-row button:hover {
      opacity: 0.9;
    }

    .button-row .cancel {
      background: var(--openp41ge-hover-bg, #333);
      color: var(--openp41ge-text-color, #e0e0e0);
    }

    .button-row .save {
      background: var(--openp41ge-accent-color, #4a9eff);
      color: #fff;
    }

    .button-row .save:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  @state() private _name = "";
  @state() private _error = "";
  @state() private _saving = false;
  private _draftName = "";
  private _disconnected = false;

  connectedCallback(): void {
    super.connectedCallback();
    // Capture the draft name from the event that opened this dialog
    // Falls back to fetching the current project name
    this._loadDraftName();
    this.addEventListener("keydown", this._onKeyDown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._disconnected = true;
    this.removeEventListener("keydown", this._onKeyDown);
  }

  private async _loadDraftName(): Promise<void> {
    try {
      const name = await window.openp41ge.project.current();
      if (name) {
        this._draftName = name;
      }
    } catch {
      // ignore
    }
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this._cancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      this._save();
    }
  }

  private _onInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    this._name = input.value;
    this._error = "";
  }

  private async _save(): Promise<void> {
    const trimmed = this._name.trim();
    if (!trimmed) {
      this._error = "Project name cannot be empty";
      return;
    }

    this._saving = true;
    this._error = "";

    try {
      const result = await window.openp41ge.project.saveDraftAs(this._draftName, trimmed);
      if (this._disconnected) return;

      if (result) {
        log.info(`Draft saved as project "${trimmed}"`);
        this.dispatchEvent(
          new CustomEvent("draft:saved", {
            bubbles: true,
            composed: true,
            detail: { draftName: this._draftName, newName: trimmed },
          }),
        );
        this.remove();
      } else {
        // Check if the name conflicts with an existing project
        const exists = await window.openp41ge.project.exists(trimmed);
        this._error = exists
          ? `A project named "${trimmed}" already exists`
          : "Failed to save draft. Check console for details.";
        this._saving = false;
      }
    } catch (err) {
      log.error("Failed to save draft:", err);
      if (!this._disconnected) {
        this._error = "An error occurred while saving. Please try again.";
        this._saving = false;
      }
    }
  }

  private _cancel(): void {
    this.dispatchEvent(
      new CustomEvent("draft:save-cancelled", {
        bubbles: true,
        composed: true,
      }),
    );
    this.remove();
  }

  render() {
    return html`
      <div class="overlay" @click=${(e: Event) => e.stopPropagation()}>
        <h2>Save Project</h2>
        <p>This is a draft project. Give it a name to save it permanently.</p>

        <div class="input-row">
          <label for="project-name">Project name</label>
          <input
            id="project-name"
            type="text"
            placeholder="my-project"
            .value=${this._name}
            @input=${this._onInput}
            class=${this._error ? "error" : ""}
            ?disabled=${this._saving}
            autofocus
          />
          <div class="error-text">${this._error}</div>
        </div>

        <div class="button-row">
          <button class="cancel" @click=${this._cancel} ?disabled=${this._saving}>
            Cancel
          </button>
          <button class="save" @click=${this._save} ?disabled=${this._saving || !this._name.trim()}>
            ${this._saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define("openp41ge-save-draft-dialog", Openp41geSaveDraftDialog);
