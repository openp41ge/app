/**
 * <openp41ge-stack-demo> — an animated mock of the three-level model
 * (Workspace → Repository → Worktree). Three stacked cards pop in one after
 * another on a loop. Used on the "levels" Welcome slide.
 */

import { html, LitElement, type TemplateResult } from "lit";

export class Openp41geStackDemo extends LitElement {
  override render(): TemplateResult {
    return html`
      <style>
        :host { display: block; }
        .demo {
          height: 178px;
          background: var(--bg, #1e1e1e);
          border: 1px solid var(--divider, #444);
          border-radius: 9px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
          padding: 14px 18px;
          gap: 11px;
          justify-content: center;
        }
        .row {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 30px;
          opacity: 0;
          animation: rise 5.6s ease-out infinite;
        }
        .row--r { animation-delay: 0.7s; }
        .row--t { animation-delay: 1.4s; }
        .row-icon {
          width: 12px;
          height: 12px;
          border-radius: 3px;
          background: var(--accent, #79c0ff);
          opacity: 0.7;
          flex-shrink: 0;
        }
        .row-bar {
          height: 8px;
          border-radius: 3px;
          background: var(--bg-active, #3a3a42);
          flex: 1;
          max-width: 140px;
        }
        .row--r .row-icon { background: var(--text-secondary, #999); }
        .row--t .row-icon { background: var(--text-tertiary, #777); }
        .row--r .row-bar { max-width: 110px; }
        .row--t .row-bar { max-width: 82px; }
        @keyframes rise {
          0% { opacity: 0; transform: translateY(8px); }
          16%,
          100% { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .row { animation: none; opacity: 1; transform: none; }
        }
      </style>
      <div class="demo">
        <div class="row row--w"><span class="row-icon"></span><span class="row-bar"></span></div>
        <div class="row row--r"><span class="row-icon"></span><span class="row-bar"></span></div>
        <div class="row row--t"><span class="row-icon"></span><span class="row-bar"></span></div>
      </div>
    `;
  }
}

customElements.define("openp41ge-stack-demo", Openp41geStackDemo);
