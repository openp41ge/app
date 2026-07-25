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
      <div id="wt-addwt-row" style="display:flex;flex-direction:column;gap:4px;padding:6px 12px;">
        <div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;">
          Add worktree to ${this.repoName}
        </div>
        ${this._loading ? html`<div style="color:var(--text-secondary);font-size:11px;">Loading branches...</div>` : ""}
        ${this._error ? html`<div style="color:#e06c75;font-size:11px;">${this._error}</div>` : ""}
        ${
          !this._loading && this._branches.length > 0
            ? html`
                <select
                  style="width:100%;height:24px;background:var(--bg-tertiary);border:1px solid #3a3a3a;border-radius:3px;color:#e0e0e0;font-size:11px;padding:0 4px;outline:none;font-family:inherit;"
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
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
          <input
            id="wt-addwt-input"
            type="text"
            placeholder="Or type a branch name"
            style="flex:1;min-width:0;height:24px;background:var(--bg-tertiary);border:1px solid #3a3a3a;border-radius:3px;color:#e0e0e0;font-size:11px;padding:0 6px;outline:none;font-family:inherit;"
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
            style="height:22px;padding:0 8px;background:var(--accent);border:none;border-radius:3px;color:#fff;font-size:11px;cursor:pointer;white-space:nowrap;"
            @click=${this._confirm}
          >
            Add
          </button>
          <button
            style="height:22px;padding:0 6px;background:transparent;border:none;color:var(--text-secondary);font-size:14px;cursor:pointer;"
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
