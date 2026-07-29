import { css } from "lit";

/**
 * Tree CSS — uses CSS custom properties that map to the app's theme
 * variables (defined in packages/openp41ge/src/styles/themes.css).
 *
 * Consumers can override --tree-* vars or rely on the global theme.
 */

export const treeStyles = css`
  :host {
    display: block;
    font-family: var(--tree-font, "SF Mono", Monaco, Menlo, Consolas, monospace);
    font-size: var(--tree-font-size, 13px);
    color: var(--tree-fg, var(--text-primary, #d4d4d4));
    background: var(--tree-bg, transparent);
    user-select: none;
    outline: none;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .tree-root {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .tree-empty {
    padding: 8px 12px;
    color: var(--tree-muted, var(--text-muted, #666));
    font-style: italic;
    font-size: 11px;
  }

  /* ─── Node Row ──────────────────────────────────────────── */

  .tree-node {
    display: flex;
    align-items: center;
    gap: 2px;
    height: var(--tree-row-height, 26px);
    cursor: pointer;
    white-space: nowrap;
    border-radius: 0;
    transition: background 0.05s ease;
    outline: none;
    box-sizing: border-box;
  }

  .tree-node:hover {
    background: var(--tree-hover-bg, var(--bg-hover, rgba(255, 255, 255, 0.06)));
  }

  .tree-node.selected {
    background: var(--tree-selected-bg, rgba(74, 158, 255, 0.12));
    color: var(--tree-selected-fg, var(--text-primary, #d4d4d4));
  }

  .tree-node.is-section {
    height: var(--tree-section-height, 30px);
    font-weight: 600;
    border-bottom: 1px solid var(--tree-divider, var(--border-divider, #2d2d2d));
  }

  .tree-node.is-section:hover {
    background: var(--tree-hover-bg, var(--bg-hover, rgba(255, 255, 255, 0.06)));
  }

  .tree-node:focus-visible {
    box-shadow: inset 0 0 0 1px var(--tree-focus, var(--border-focus, #4a9eff));
  }

  .tree-node.draggable {
    cursor: grab;
  }

  .tree-node.draggable:active {
    cursor: grabbing;
  }

  /* ─── Chevron Cell ──────────────────────────────────────── */

  .tree-chevron-cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--chevron-width, 16px);
    height: 100%;
    flex-shrink: 0;
    cursor: pointer;
  }

  .tree-chevron-cell.hidden {
    visibility: hidden;
    pointer-events: none;
  }

  .tree-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    color: var(--tree-chevron, var(--text-muted, #666));
    transition: transform 0.1s ease;
    line-height: 1;
  }

  .tree-chevron.expanded {
    transform: rotate(90deg);
  }

  /* ─── Icon Cell ─────────────────────────────────────────── */

  .tree-icon-cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--icon-width, 16px);
    height: 100%;
    flex-shrink: 0;
    color: var(--tree-icon-fg, var(--text-secondary, #999));
  }

  .tree-icon-spacer {
    display: inline-block;
    width: var(--icon-width, 16px);
    flex-shrink: 0;
  }

  /* ─── Label ─────────────────────────────────────────────── */

  .tree-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 4px;
    line-height: inherit;
    color: var(--tree-label-fg, var(--text-primary, #d4d4d4));
    font-size: inherit;
  }

  .tree-node.is-section .tree-label {
    color: var(--tree-section-fg, var(--text-primary, #d4d4d4));
    font-weight: 600;
    font-size: var(--tree-section-font-size, 13px);
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
    color: var(--tree-action-fg, var(--text-muted, #666));
    transition: color 0.1s ease, background 0.1s ease;
  }

  .tree-action-btn:hover {
    color: var(--tree-action-hover-fg, var(--text-secondary, #999));
    background: var(--tree-action-hover-bg, var(--bg-hover, rgba(255, 255, 255, 0.1)));
  }
`;
