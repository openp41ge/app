/**
 * <openp41ge-project-picker> — modal overlay for selecting or creating a project.
 *
 * On startup (when no --project CLI arg is provided), this modal is shown.
 * The user can:
 *   - Click an existing project to load it
 *   - Type a name and press Enter (or click "Create") to create a new one
 *   - Press Escape to close (with no project selected — app does nothing)
 *   - Navigate the project list with arrow keys + Enter
 *
 * Dispatches:
 *   CustomEvent('project:selected', { detail: { name: string } }) — bubbles
 *   CustomEvent('project:dismissed') — when Escape is pressed
 *
 * The host app (openp41ge-windowview or bootstrap) listens for these events.
 */

import { LitElement, html, css } from "lit";
import { state } from "lit/decorators.js";
import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge-project-picker");

export class Openp41geProjectPicker extends LitElement {
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
      min-width: 400px;
      max-width: 500px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    h2 {
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--openp41ge-text-color, #e0e0e0);
    }

    .search-row {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .search-row input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--openp41ge-border-color, #444);
      border-radius: 4px;
      background: var(--openp41ge-input-bg, #2a2a2a);
      color: var(--openp41ge-text-color, #e0e0e0);
      font-size: 14px;
      outline: none;
    }

    .search-row input:focus {
      border-color: var(--openp41ge-accent-color, #4a9eff);
    }

    .search-row button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: var(--openp41ge-accent-color, #4a9eff);
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      white-space: nowrap;
    }

    .search-row button:hover {
      opacity: 0.9;
    }

    .project-list {
      flex: 1;
      overflow-y: auto;
      margin: 0 -24px;
      padding: 0 24px;
    }

    .project-item {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.1s;
      user-select: none;
    }

    .project-item:hover,
    .project-item.selected {
      background: var(--openp41ge-hover-bg, #333);
    }

    .project-item .name {
      flex: 1;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .project-item .icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      color: var(--openp41ge-muted-text, #888);
    }

    .project-item .icon.folder {
      color: var(--openp41ge-accent-color, #4a9eff);
    }

    .project-item .icon.create {
      color: #e5c07b;
    }

    .project-item .arrow {
      color: var(--openp41ge-muted-text, #888);
      font-size: 12px;
      margin-left: 8px;
    }

    .project-item .delete-btn {
      display: none;
      background: none;
      border: none;
      color: var(--openp41ge-muted-text, #888);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      padding: 0 4px;
      margin-left: 4px;
      border-radius: 3px;
      transition:
        color 0.1s,
        background 0.1s;
      user-select: none;
    }

    .project-item:hover .delete-btn {
      display: inline-block;
    }

    .project-item .delete-btn:hover {
      color: #e06c75;
      background: rgba(224, 108, 117, 0.15);
    }

    .empty-state {
      text-align: center;
      color: var(--openp41ge-muted-text, #888);
      padding: 24px;
      font-size: 13px;
    }
  `;

  @state() private _projects: string[] = [];
  @state() private _selectedIndex = 0;
  @state() private _newProjectName = "";
  @state() private _loading = true;
  private _disconnected = false;

  private _inputEl!: HTMLInputElement;

  connectedCallback(): void {
    super.connectedCallback();
    this._loadProjects();
    // Capture keyboard for list navigation
    this.addEventListener("keydown", this._onKeyDown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._disconnected = true;
    this.removeEventListener("keydown", this._onKeyDown);
  }

  private async _loadProjects(): Promise<void> {
    try {
      const projects = await window.openp41ge.project.list();
      if (this._disconnected) return;
      this._projects = projects.sort();
      this._selectedIndex = 0;
    } catch (err) {
      log.error("Failed to load projects:", err);
    }
    if (this._disconnected) return;
    this._loading = false;
  }

  private _onKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this._selectedIndex = Math.min(this._selectedIndex + 1, this._listLength - 1);
        this._scrollToSelected();
        break;
      case "ArrowUp":
        e.preventDefault();
        this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
        this._scrollToSelected();
        break;
      case "Enter":
        e.preventDefault();
        if (this._newProjectName.trim()) {
          this._createAndSelect(this._newProjectName.trim());
        } else if (this._projects.length > 0) {
          this._selectProject(this._projects[this._selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        this._dismiss();
        break;
    }
  }

  private get _listLength(): number {
    return this._newProjectName.trim() ? this._projects.length + 1 : this._projects.length;
  }

  private _scrollToSelected(): void {
    // Wait for render, then scroll the selected item into view
    requestAnimationFrame(() => {
      const items = this.shadowRoot?.querySelectorAll(".project-item");
      if (items && items[this._selectedIndex]) {
        items[this._selectedIndex].scrollIntoView({ block: "nearest" });
      }
    });
  }

  private _onInputKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (this._newProjectName.trim()) {
        this._createAndSelect(this._newProjectName.trim());
      }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // Let the host handle navigation
      this._onKeyDown(e);
    } else if (e.key === "Escape") {
      this._onKeyDown(e);
    }
  }

  private async _createAndSelect(name: string): Promise<void> {
    const exists = await window.openp41ge.project.exists(name);
    if (exists) {
      // Just select the existing project
      this._selectProject(name);
      return;
    }
    const created = await window.openp41ge.project.create(name);
    if (created) {
      this._selectProject(name);
    } else {
      log.error(`Failed to create project "${name}"`);
    }
  }

  private _selectProject(name: string): void {
    log.info(`Project selected: ${name}`);
    this.dispatchEvent(
      new CustomEvent("project:selected", {
        bubbles: true,
        composed: true,
        detail: { name },
      }),
    );
  }

  private async _deleteProject(e: Event, name: string): Promise<void> {
    e.stopPropagation();
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) {
      return;
    }
    const deleted = await window.openp41ge.project.delete(name);
    if (this._disconnected) return;
    if (deleted) {
      this._projects = this._projects.filter((p) => p !== name);
      if (this._selectedIndex >= this._projects.length) {
        this._selectedIndex = Math.max(0, this._projects.length - 1);
      }
    } else {
      log.error(`Failed to delete project "${name}"`);
    }
  }

  private _dismiss(): void {
    this.dispatchEvent(
      new CustomEvent("project:dismissed", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    this._newProjectName = input.value;
    this._selectedIndex = 0; // Reset selection when typing
  }

  render() {
    const showCreateOption = this._newProjectName.trim().length > 0;
    const createLabel = showCreateOption ? `Create "${this._newProjectName.trim()}"` : "";

    return html`
      <div class="overlay" @click=${(e: Event) => e.stopPropagation()}>
        <h2>Open Project</h2>
        <div class="search-row">
          <input
            type="text"
            placeholder="Search or create project..."
            .value=${this._newProjectName}
            @input=${this._onInput}
            @keydown=${this._onInputKeyDown}
            autofocus
          />
          ${
            showCreateOption
              ? html`<button @click=${() => this._createAndSelect(this._newProjectName.trim())}>
                  Create
                </button>`
              : ""
          }
        </div>

        <div class="project-list">
          ${
            this._loading
              ? html`<div class="empty-state">Loading...</div>`
              : this._projects.length === 0 && !showCreateOption
                ? html`<div class="empty-state">
                    No projects yet. Type a name above to create one.
                  </div>`
                : html`
                    ${
                      showCreateOption
                        ? html`
                            <div
                              class="project-item ${this._selectedIndex === 0 ? "selected" : ""}"
                              @click=${() => this._createAndSelect(this._newProjectName.trim())}
                            >
                              <span class="name">
                                <svg
                                  class="icon create"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="1.5"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                >
                                  <line x1="8" y1="2" x2="8" y2="14" />
                                  <line x1="2" y1="8" x2="14" y2="8" />
                                </svg>
                                ${createLabel}
                              </span>
                              <span class="arrow">→</span>
                            </div>
                          `
                        : ""
                    }
                    ${this._projects.map(
                      (name, i) => html`
                        <div
                          class="project-item ${this._selectedIndex === (showCreateOption ? i + 1 : i) ? "selected" : ""}"
                          @click=${() => this._selectProject(name)}
                        >
                          <span class="name">
                            <svg
                              class="icon folder"
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="1.5"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <path
                                d="M2 4.5C2 3.67 2.67 3 3.5 3h2.59c.4 0 .78.16 1.06.44l.91.91c.28.28.67.44 1.06.44H14a1 1 0 011 1v5.7a1 1 0 01-1 1H3.5A1.5 1.5 0 012 11V4.5z"
                              />
                            </svg>
                            ${name}
                          </span>
                          <button
                            class="delete-btn"
                            title="Delete project"
                            @click=${(e: Event) => this._deleteProject(e, name)}
                          >
                            ×
                          </button>
                          <span class="arrow">→</span>
                        </div>
                      `,
                    )}
                  `
          }
        </div>
      </div>
    `;
  }
}

customElements.define("openp41ge-project-picker", Openp41geProjectPicker);
