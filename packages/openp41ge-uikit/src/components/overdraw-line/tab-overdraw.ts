/**
 * Per-corner overdraw accents for tab buttons / line-number gutter cells.
 *
 * A tab (or a hovered line-number cell) reads as a bordered box only from its
 * separators; its border lines stop at each corner. This helper continues each
 * flagged border edge past its two corners with short <overdraw-line> fade
 * accents, so the outline reads as connecting/bleeding at every visible corner
 * (the overdraw aesthetic used across the app's bottom bars and dividers).
 *
 * The strokes are portalled into a `position: fixed` viewport layer (z-index
 * 999, `pointer-events: none`) and track the host's rect on a per-frame rAF.
 * Portalling matters because tabs live in `overflow-x: auto` / `overflow-y:
 * hidden` strips: an in-place child would be clipped at the strip's edges and
 * by the vertical clipping, so the accents must escape to the viewport layer.
 *
 * Per-corner visibility is the caller's job: pass exactly the edges to
 * continue (e.g. the first tab in a bar omits `left` because the cell's left
 * border already covers that corner). The caller re-calls with a changed
 * `edges` set and the strokes are reconciled.
 */

import "./overdraw-line";
import type { OverdrawDirection } from "./overdraw-line";

export type TabEdge = "top" | "bottom" | "left" | "right";

export interface TabEdgeOverdrawOptions {
  /** Border edges to continue past their two corners. */
  edges: TabEdge[];
  /** Stroke colour (CSS color). Defaults to the divider grey. */
  color?: string;
  /** Optional per-edge colour override (wins over `color`). */
  edgeColors?: Partial<Record<TabEdge, string>>;
  /** Stroke length in px. */
  length?: number;
  /** Stroke thickness (px), for the border being continued. */
  thickness?: number;
  /** Optional scroll/clip container. Strokes whose anchor point lies outside
   *  this container's rect (e.g. tabs scrolled out of a tab bar) are hidden,
   *  so clipped tabs don't leave floating overdraw lines. */
  clipContainer?: HTMLElement;
}

/** [corner, dir, anchor-on-x, anchor-on-y] — per edge, the two corners at
 *  which the border line is continued outward past the box. */
const EDGE_CORNERS: Record<
  TabEdge,
  Array<[string, OverdrawDirection, "left" | "right", "top" | "bottom"]>
> = {
  top: [
    ["tl", "left", "left", "top"],
    ["tr", "right", "right", "top"],
  ],
  bottom: [
    ["bl", "left", "left", "bottom"],
    ["br", "right", "right", "bottom"],
  ],
  left: [
    ["tl", "up", "left", "top"],
    ["bl", "down", "left", "bottom"],
  ],
  right: [
    ["tr", "up", "right", "top"],
    ["br", "down", "right", "bottom"],
  ],
};

interface AttachedEdgeOverdraw {
  edges: string;
  clip: HTMLElement | null;
  lines: Array<{ edge: TabEdge; corner: string; dir: OverdrawDirection; el: HTMLElement }>;
  layer: HTMLElement;
  raf: number;
  ro: ResizeObserver | null;
}

const state = new WeakMap<HTMLElement, AttachedEdgeOverdraw>();

/** Normalise the edges signature (sorted, unique) for the idempotency guard. */
function edgeKey(edges: TabEdge[]): string {
  return edges.slice().sort().join("|");
}

/**
 * Attach per-corner overdraw accents for the given border edges to `host`.
 * Idempotent per edge-set: calling again with the same edges is a no-op, and
 * calling with a different set reconciles (adds/removes strokes). The accents
 * are portalled (fixed viewport layer) and track the host rect each frame,
 * hiding while the host is hidden, and removed when the host disconnects.
 */
export function attachTabEdgeOverdraws(host: HTMLElement, opts: TabEdgeOverdrawOptions): void {
  const key = edgeKey(opts.edges);
  const clip = opts.clipContainer ?? null;
  const existing = state.get(host);
  if (existing && existing.edges === key && existing.clip === clip) return;
  if (existing) detachTabEdgeOverdraws(host);
  if (opts.edges.length === 0 || !host.isConnected) return;

  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = [
    "position: fixed",
    "left: 0",
    "top: 0",
    "right: 0",
    "bottom: 0",
    "pointer-events: none",
    "z-index: 999",
  ].join(";");
  document.body.appendChild(layer);

  const color = opts.color ?? "var(--divider, #333)";
  const length = opts.length ?? 8;
  const thickness = opts.thickness ?? 1;
  const lines: AttachedEdgeOverdraw["lines"] = [];
  for (const edge of opts.edges) {
    for (const [corner, dir, ,] of EDGE_CORNERS[edge]) {
      const line = document.createElement("overdraw-line");
      line.setAttribute("dir", dir);
      line.setAttribute("corner", `${corner}-${edge}`);
      line.setAttribute("aria-hidden", "true");
      line.style.setProperty("--overdraw-color", opts.edgeColors?.[edge] ?? color);
      line.style.setProperty("--overdraw-thickness", `${thickness}px`);
      line.style.setProperty("--overdraw-length", `${length}px`);
      layer.appendChild(line);
      lines.push({ edge, corner, dir, el: line });
    }
  }

  let raf = 0;
  let ro: ResizeObserver | null = null;

  const place = (): void => {
    if (!host.isConnected) {
      detachTabEdgeOverdraws(host);
      return;
    }
    const r = host.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      layer.style.display = "none";
      return;
    }
    layer.style.display = "";
    const nudge = thickness / 2 - 0.5;
    // If the clip container is disconnected (e.g. the bar was re-rendered),
    // fall back to no clipping so the strokes aren't all masked off.
    const cr = clip && clip.isConnected ? clip.getBoundingClientRect() : null;
    for (const { edge, corner, dir, el } of lines) {
      const entry = EDGE_CORNERS[edge].find(([c]) => c === corner)!;
      const [, , ax, ay] = entry;
      if (cr) {
        // Hide strokes whose anchor point (the border point they continue)
        // falls outside the clip container — e.g. a tab scrolled/overflowing
        // out of the bar. The strokes bleed OUTWARD from the anchor, so only
        // the anchor must be inside the clip.
        const anchorX = ax === "left" ? r.left : r.right;
        const anchorY = ay === "top" ? r.top : r.bottom;
        const visible =
          anchorX >= cr.left - 0.5 &&
          anchorX <= cr.right + 0.5 &&
          anchorY >= cr.top - 0.5 &&
          anchorY <= cr.bottom + 0.5;
        el.style.display = visible ? "" : "none";
      } else {
        el.style.display = "";
      }
      if (dir === "left" || dir === "right") {
        // Horizontal stroke: continues a top/bottom border past the corner.
        // The bottom border usually lives on the tab BAR (1px below the tab's
        // own rect bottom), not on the tab itself, so align the stroke with
        // that border (r.bottom) unless the host really has its own bottom
        // border (e.g. the `+` add button, whose border-bottom is the strip's
        // bottom line when the bar has no border of its own).
        const ownBottom =
          ay === "bottom" &&
          parseFloat(getComputedStyle(host).borderBottomWidth) > 0;
        const y =
          ay === "top" ? r.top : ownBottom ? r.bottom - thickness : r.bottom;
        const x = ax === "left" ? r.left : r.right;
        const left = dir === "left" ? x - length + nudge : x - nudge;
        el.style.left = `${left}px`;
        el.style.top = `${y}px`;
      } else {
        // Vertical stroke: continues a left/right border past the corner.
        const x = ax === "left" ? r.left : r.right - thickness;
        const y = ay === "top" ? r.top : r.bottom;
        const top = dir === "up" ? y - length + nudge : y - nudge;
        el.style.left = `${x}px`;
        el.style.top = `${top}px`;
      }
    }
  };

  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => place());
    ro.observe(host);
  }
  const loop = (): void => {
    place();
    raf = requestAnimationFrame(loop);
  };
  if (typeof requestAnimationFrame === "function") {
    raf = requestAnimationFrame(loop);
  } else {
    place();
  }

  state.set(host, { edges: key, clip, lines, layer, raf, ro });
}

/** Remove the portalled overdraw accents attached to `host`. */
export function detachTabEdgeOverdraws(host: HTMLElement): void {
  const s = state.get(host);
  if (!s) return;
  if (s.raf) cancelAnimationFrame(s.raf);
  s.ro?.disconnect();
  s.layer.remove();
  state.delete(host);
}
