/**
 * PaneHeaderButton — reusable button for pane header bars.
 *
 * Fills the full height of the header (28px default).
 * Minimum width equals the height (square).
 * Width extends for longer content but never shrinks below the height.
 *
 * Usage:
 *   const btn = paneHeaderButton({ content: "\u00D7" });
 *   btn.onclick = () => closePane();
 *   header.appendChild(btn);
 */

export interface PaneHeaderButtonOptions {
  /** Inner content — plain text or HTML markup. */
  content: string;
  /** CSS class name (optional, e.g. "pane-close" for openp41ge-pane.ts lookup). */
  className?: string;
  /** Tooltip text (optional). */
  title?: string;
  /** Custom click handler (optional). */
  onClick?: () => void;
}

export function paneHeaderButton(options: PaneHeaderButtonOptions): HTMLElement {
  const { content, className, title, onClick } = options;

  const btn = document.createElement("div");
  if (className) btn.className = className;
  if (title) btn.title = title;

  btn.textContent = content;
  btn.style.cssText = [
    "flex-shrink:0",
    "min-width:28px",
    "align-self:stretch",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:0 8px",
    "background:transparent",
    "color:var(--text-muted)",
    "cursor:pointer",
    "font-size:12px",
    "line-height:1",
    "opacity:0.5",
    "border:none",
    "box-sizing:border-box",
    "transition:background 0.1s,color 0.1s,opacity 0.1s",
    "user-select:none",
    "-webkit-app-region:no-drag",
  ].join(";");

  // Consistent hover / leave
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "rgba(255,255,255,0.1)";
    btn.style.color = "#e0e0e0";
    btn.style.opacity = "1";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "transparent";
    btn.style.color = "#666";
    btn.style.opacity = "0.5";
  });

  if (onClick) {
    btn.addEventListener("click", onClick);
  }

  return btn;
}
