/**
 * <worktree-row> — indented worktree sub-row under a repo.
 *
 * Matches the explorer sidebar's worktree row style:
 *   - Indented 16px from the triangle column edge
 *   - Branch name (11px, #aaa)
 *   - No icon
 */

import { LitElement, html, unsafeCSS } from "lit";
import { property } from "lit/decorators.js";
import { tailwindCSS } from "../generated/tailwind";

export class WorktreeRow extends LitElement {
  createRenderRoot() {
    return this.attachShadow({ mode: "open" });
  }

  static styles = unsafeCSS(tailwindCSS);

  @property({ type: String })
  branch: string = "";

  @property({ type: Boolean })
  active: boolean = false;

  /** Called when the worktree row is clicked. */
  @property({ attribute: false })
  onClick?: () => void;

  render() {
    return html`
      <div
        class="flex items-center px-2 text-xs text-secondary select-none"
        @click=${() => this.onClick?.()}
      >
        <!-- Indent spacer (matches the triangle column width) -->
        <span class="w-4 shrink-0"></span>

        <!-- Branch name -->
        <span class="overflow-hidden text-ellipsis whitespace-nowrap flex-1">
          ${this.branch}
        </span>
      </div>
    `;
  }
}

customElements.define("worktree-row", WorktreeRow);
