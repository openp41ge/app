/**
 * <openp41ge-sidebar-move-demo> - an animated mock of a workspace window
 * showing a system tab being dragged from one sidebar to the other.
 *
 * Both sidebars stay open at the edges. A tab handle is dragged from the
 * left sidebar's tab bar across to the right sidebar's tab bar; as it
 * travels the source tab bar empties and the other side gains the cells.
 * Only one sidebar holds content at a time, alternating on a loop.
 * Under `prefers-reduced-motion` the mock freezes with the left sidebar
 * full.
 */

import { html, LitElement, type TemplateResult } from "lit";

export class Openp41geSidebarMoveDemo extends LitElement {
  override render(): TemplateResult {
    return html`
      <style>
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
          opacity: 0.45;
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
          display: flex;
          gap: 6px;
          padding: 6px;
        }
        .side {
          width: 44px;
          flex-shrink: 0;
          overflow: hidden;
          border-radius: 5px;
          background: var(--bg-secondary, #161616);
          padding: 6px 5px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .fly {
          position: absolute;
          width: 26px;
          height: 15px;
          border-radius: 4px;
          background: var(--accent, #79c0ff);
          opacity: 0;
          animation: fly 5.6s ease-in-out infinite;
        }
        .side--right {
          width: 44px;
          flex-shrink: 0;
          margin-left: auto;
          overflow: hidden;
          border-radius: 5px;
          background: var(--bg-secondary, #161616);
          padding: 6px 5px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .side--right .side-head,
        .side--right .chip {
          animation: fillIn 5.6s ease-in-out infinite;
        }

        .side-head {
          width: 70%;
          height: 7px;
          border-radius: 3px;
          background: var(--bg-active, #37373d);
        }
        .chip {
          width: 32px;
          height: 14px;
          border-radius: 4px;
          background: rgba(86, 156, 214, 0.4);
          flex-shrink: 0;
        }
        .chip--dim {
          background: var(--bg-active, #37373d);
        }
        .chip--out {
          animation: emptyOut 5.6s ease-in-out infinite;
        }

@keyframes fly {
          0%,
          8% {
            left: 18px;
            top: 68px;
            opacity: 0.9;
          }
          55% {
            left: 116px;
            top: 60px;
            opacity: 0.9;
          }
          78% {
            left: 172px;
            top: 88px;
            opacity: 0.9;
          }
          82%,
          100% {
            left: 172px;
            top: 88px;
            opacity: 0;
          }
        }
        }
        @keyframes emptyOut {
          8% {
            opacity: 0.9;
          }
          55% {
            opacity: 0;
          }
          100% {
            opacity: 0;
          }
        }

        @keyframes fillIn {
          8% {
            opacity: 0;
          }
          55% {
            opacity: 0;
          }
          78% {
            opacity: 0.9;
          }
          100% {
            opacity: 0.9;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .fly,
          .side--right .side-head,
          .side--right .chip,
          .chip--out {
            animation: none;
          }
          .fly {
            display: none;
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
          <div class="side side--left">
            <div class="side-head"></div>
            <div class="chip"></div>
            <div class="chip chip--dim chip--out"></div>
            <div class="chip chip--dim chip--out"></div>
          </div>
          <div class="side side--right">
            <div class="side-head"></div>
            <div class="chip"></div>
            <div class="chip chip--dim"></div>
            <div class="chip chip--dim"></div>
          </div>
          <div class="fly"></div>
        </div>
      </div>
    `;
  }
}

customElements.define("openp41ge-sidebar-move-demo", Openp41geSidebarMoveDemo);
