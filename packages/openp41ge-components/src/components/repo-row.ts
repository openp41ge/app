/**
 * <repo-row> — clickable repository header row with expand/collapse chevron.
 *
 * Matches the explorer sidebar's repo row style:
 *   - Chevron (▸/▾) in a 16px-wide container
 *   - Repo name (12px, #ccc)
 *   - Worktree count badge (10px, #666)
 *   - Hover highlight
 */

import { LitElement, html, unsafeCSS } from "lit";
import { property } from "lit/decorators.js";
import { tailwindCSS } from "../generated/tailwind";

export class RepoRow extends LitElement {
  createRenderRoot() {
    return this.attachShadow({ mode: "open" });
  }

  static styles = unsafeCSS(tailwindCSS);

  @property({ type: String })
  name: string = "";

  @property({ type: Boolean })
  expanded: boolean = false;

  @property({ type: Number })
  worktreeCount: number = 0;

  /** Called when the row is clicked to toggle expand/collapse. */
  @property({ attribute: false })
  onToggle?: () => void;

  render() {
    return html`
      <div
        class="flex items-center px-2 py-[3px] cursor-pointer select-none hover:bg-hover"
        @click=${() => this.onToggle?.()}
      >
        <!-- Triangle indicator -->
        <span class="w-4 text-center shrink-0 text-muted text-sm leading-none select-none">
          ${this.expanded ? "\u25BE" : "\u25B8"}
        </span>

        <!-- Repo name -->
        <span class="ml-1 text-sm text-primary overflow-hidden text-ellipsis whitespace-nowrap flex-1 font-medium">
          ${this.name}
        </span>

        <!-- Worktree count -->
        <span class="text-2xs text-muted ml-1 shrink-0">
          ${this.worktreeCount}
        </span>
      </div>
    `;
  }
}

customElements.define("repo-row", RepoRow);
