import { css } from "lit";

export const treeStyles = css`
  :host {
    display: block;
    font-family: inherit;
    font-size: 13px;
    color: var(--tree-fg, #cccccc);
    background: var(--tree-bg, transparent);
    user-select: none;
  }

  .tree-root {
    display: flex;
    flex-direction: column;
  }

  .tree-empty {
    padding: 8px 12px;
    color: var(--tree-muted, #888);
    font-style: italic;
    font-size: 12px;
  }

  /* ─── Node Row ──────────────────────────────────────────── */

  .tree-node {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    cursor: pointer;
    white-space: nowrap;
    border-radius: 0;
    transition: background 0.05s ease;
    min-height: 22px;
  }

  .tree-node:hover {
    background: var(--tree-hover-bg, rgba(255, 255, 255, 0.06));
  }

  .tree-node.selected {
    background: var(--tree-selected-bg, rgba(74, 158, 255, 0.15));
    color: var(--tree-selected-fg, #ffffff);
  }

  .tree-node.draggable {
    cursor: grab;
  }

  .tree-node.draggable:active {
    cursor: grabbing;
  }

  /* ─── Chevron ───────────────────────────────────────────── */

  .tree-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    font-size: 8px;
    color: var(--tree-chevron, #888);
    transition: transform 0.1s ease;
    flex-shrink: 0;
    cursor: pointer;
  }

  .tree-chevron.expanded {
    transform: rotate(90deg);
  }

  .tree-chevron.invisible {
    visibility: hidden;
    pointer-events: none;
  }

  /* ─── Icon ──────────────────────────────────────────────── */

  .tree-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .tree-icon-placeholder {
    width: 18px;
  }

  /* ─── Label ─────────────────────────────────────────────── */

  .tree-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 4px;
    line-height: 20px;
  }

  /* ─── Actions (hover) ───────────────────────────────────── */

  .tree-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .tree-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    cursor: pointer;
    color: var(--tree-action-fg, #888);
    transition: color 0.1s ease, background 0.1s ease;
  }

  .tree-action-btn:hover {
    color: var(--tree-action-hover-fg, #ffffff);
    background: var(--tree-action-hover-bg, rgba(255, 255, 255, 0.1));
  }
`;
