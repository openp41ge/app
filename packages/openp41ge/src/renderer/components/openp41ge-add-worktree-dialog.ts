/**
 * <openp41ge-add-worktree-dialog> — branch picker for adding a worktree (Lit).
 *
 * Shows available branches for a repo. User picks one and confirms.
 *
 * Events (bubbling):
 *   add-worktree  — { repoName: string, branch: string }
 *   add-wt-close  — {}
 */

import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";

export class Openp41geAddWorktreeDialog extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property()
  repoName = "";

  @state() private _branches: string[] = [];
  @state() private _loading = false;
  @state() private _error = "";

  private _customBranch = "";
  private _selectedBranch = "";

  connectedCallback(): void {
    super.connectedCallback();
    this._loadBranches();
  }

  private async _loadBranches(): Promise<void> {
    if (!this.repoName) return;
    this._loading = true;
    this._error = "";
    this.requestUpdate();
    try {
      const list = await window.openp41ge.workspaceController.listBranches(this.repoName);
      // Filter out branches that already have worktrees
      const existingWts = await window.openp41ge.workspaceController.listWorktrees(this.repoName);
      const existingBranches = new Set(existingWts.map((wt: { branch: string }) => wt.branch));
      this._branches = list.filter((b: string) => !existingBranches.has(b));
      if (this._branches.length > 0) this._selectedBranch = this._branches[0];
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : String(err);
    }
    this._loading = false;
    this.requestUpdate();
  }

  private _confirm(): void {
    const branch = this._selectedBranch || this._customBranch;
    if (!branch) return;
    this.dispatchEvent(
      new CustomEvent("add-worktree", {
        bubbles: true,
        detail: { repoName: this.repoName, branch },
      }),
    );
  }

  render() {
    return html`
      <div id="wt-addwt-row" class="flex flex-col gap-1 px-3 py-1.5">
        <div class="text-2xs text-secondary mb-0.5">
          Add worktree to ${this.repoName}
        </div>
        ${this._loading ? html`<div class="text-secondary text-xs">Loading branches...</div>` : ""}
        ${this._error ? html`<div class="text-[#e06c75] text-xs">${this._error}</div>` : ""}
        ${
          !this._loading && this._branches.length > 0
            ? html`
                <select
                  class="w-full h-6 bg-bg-tertiary border border-[#3a3a3a] rounded text-[#e0e0e0] text-xs px-1 outline-none font-inherit"
                  @change=${(e: Event) => {
                    this._selectedBranch = (e.target as HTMLSelectElement).value;
                    this._customBranch = "";
                    this.requestUpdate();
                  }}
                >
                  ${this._branches.map((b) => html`<option value=${b}>${b}</option>`)}
                </select>
              `
            : ""
        }
        <div class="flex items-center gap-1.5 mt-0.5">
          <input
            id="wt-addwt-input"
            type="text"
            placeholder="Or type a branch name"
            class="flex-1 min-w-0 h-6 bg-bg-tertiary border border-[#3a3a3a] rounded text-[#e0e0e0] text-xs px-1.5 outline-none font-inherit"
            @input=${(e: InputEvent) => {
              this._customBranch = (e.target as HTMLInputElement).value;
              this._selectedBranch = "";
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") this._confirm();
              if (e.key === "Escape")
                this.dispatchEvent(new CustomEvent("add-wt-close", { bubbles: true }));
            }}
          />
          <button
            class="h-[22px] px-2 bg-accent border-none rounded text-white text-xs cursor-pointer whitespace-nowrap"
            @click=${this._confirm}
          >
            Add
          </button>
          <button
            class="h-[22px] px-1.5 bg-transparent border-none text-secondary text-sm cursor-pointer"
            @click=${() => this.dispatchEvent(new CustomEvent("add-wt-close", { bubbles: true }))}
          >
            ×
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define("openp41ge-add-worktree-dialog", Openp41geAddWorktreeDialog);
