/**
 * <openp41ge-sidebar-move-demo> — an animated mock of a workspace window
 * showing a sidebar being moved from one side of the grid to the other.
 *
 * A single sidebar panel (holding the system-tab content) starts at the left
 * edge, slides across to the right edge, holds there, then slides back — on a
 * loop. The window width never changes; only the sidebar's position animates.
 * Under `prefers-reduced-motion` it freezes on the left side.
 */

import { html, LitElement, type TemplateResult } from "lit";

export class Openp41geSidebarMoveDemo extends LitElement {
  override render(): TemplateResult {
    return html`
      <style>
        :host {
          display: block;
        }
        .demo {
          position: relative;
          width: 100%;
          height: 178px;
          background: var(--bg, #1e1e1e);
          border: 1px solid var(--divider, #444);
          border-radius: 9px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
        }
        .chrome {
          height: 26px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 10px;
          background: var(--bg-secondary, #161616);
          border-bottom: 1px solid var(--divider, #333);
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-secondary, #999);
          opacity: 0.5;
        }
        .cbtn {
          width: 11px;
          height: 11px;
          border-radius: 3px;
          background: var(--bg-active, #37373d);
          flex-shrink: 0;
        }
        .cbtn--label {
          width: 22px;
        }
        .spacer {
          flex: 1;
        }
        .body {
          position: relative;
          flex: 1;
          min-height: 0;
        }
        /* The sidebar panel slides from the left edge to the right edge. */
        .side {
          position: absolute;
          top: 10px;
          bottom: 10px;
          left: 8px;
          width: 30%;
          background: var(--bg-secondary, #161616);
          border-radius: 6px;
          padding: 9px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 8px;
          animation: move 9s ease-in-out infinite;
        }
        .head {
          width: 60%;
          max-width: 70px;
          height: 7px;
          border-radius: 3px;
          background: var(--bg-active, #37373d);
          margin-bottom: 2px;
        }
        .row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .row-icon {
          width: 7px;
          height: 7px;
          border-radius: 2px;
          background: var(--accent, #79c0ff);
          opacity: 0.5;
          flex-shrink: 0;
        }
        .row-bar {
          flex: 1;
          max-width: 90px;
          height: 5px;
          border-radius: 2px;
          background: var(--bg-active, #37373d);
        }
        @keyframes move {
          0%,
          18% {
            left: 8px;
          }
          50%,
          68% {
            left: calc(70% - 8px);
          }
          100% {
            left: 8px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .side {
            animation: none;
            left: 8px;
          }
        }
      </style>
      <div class="demo">
        <div class="chrome">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          <span class="cbtn"></span><span class="cbtn"></span><span class="cbtn"></span>
          <span class="spacer"></span>
          <span class="cbtn cbtn--label"></span><span class="cbtn"></span>
        </div>
        <div class="body">
          <div class="side">
            <div class="head"></div>
            <div class="row">
              <span class="row-icon"></span>
              <span class="row-bar"></span>
            </div>
            <div class="row">
              <span class="row-icon"></span>
              <span class="row-bar"></span>
            </div>
            <div class="row">
              <span class="row-icon"></span>
              <span class="row-bar"></span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("openp41ge-sidebar-move-demo", Openp41geSidebarMoveDemo);
