/**
 * Vertical overdraw strokes for a tab-bar drop indicator.
 *
 * A tab-bar drop indicator is a full-height blue line. Its horizontal
 * cross-cap ticks (attachDropTipOverdraws) sit at the top and bottom tips
 * inside the bar. These vertical strokes instead continue the line PAST the
 * bar's top and bottom edges — a short fade-up stroke above the top tip and
 * a fade-down stroke below the bottom tip — so the line reads as the overdraw
 * family's border bleed (it keeps going a little beyond the seam it is
 * clipped at).
 *
 * The bar's scroll container clips `overflow-y: hidden`, so vertical strokes
 * that extend outside it must be `position: fixed` to escape the clip. The
 * strokes live INSIDE the indicator host, so they auto-hide with it (a child
 * of a `display:none` element is not painted), and they track the indicator's
 * viewport rect every animation frame while it is shown.
 *
 * The host must be a plain DOM element (not a shadow-DOM custom element) so
 * the fixed strokes render — the grid / sidebar / file-drop indicators are
 * all plain `<div>`s.
 *
 * Self-contained (this package has no uikit dependency): the strokes are plain
 * `<div>`s with inline gradients, mirroring the horizontal cross-cap ticks.
 */

/** How far the vertical strokes extend beyond the bar's top/bottom edges (px). */
export const DROP_TIP_OVERDRAW_LENGTH = 10;

/**
 * Append the two fixed vertical overdraw strokes (up + down) to a drop
 * indicator host. Idempotent — a second call on the same host is a no-op
 * (guarded by `data-tip-vertical-overdraw`).
 */
export function attachDropTipVerticalOverdraws(host: HTMLElement): void {
  if (host.dataset.tipVerticalOverdraw === "1") return;
  host.dataset.tipVerticalOverdraw = "1";

  const up = document.createElement("div");
  up.className = "drop-tip-vod-up";
  const down = document.createElement("div");
  down.className = "drop-tip-vod-down";
  const base =
    `position:fixed;left:0;top:0;width:3px;height:${DROP_TIP_OVERDRAW_LENGTH}px;` +
    "pointer-events:none;z-index:999;opacity:0;";
  // Opaque at the end that touches the line, fading away from it.
  up.style.cssText = base + "background:linear-gradient(to top, rgb(74, 158, 255) 40%, transparent);";
  down.style.cssText =
    base + "background:linear-gradient(to bottom, rgb(74, 158, 255) 40%, transparent);";
  host.appendChild(up);
  host.appendChild(down);

  let raf = 0;
  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const place = (): void => {
    const r = host.getBoundingClientRect();
    const shown = r.width > 0 && r.height > 0;
    up.style.opacity = shown ? "1" : "0";
    down.style.opacity = shown ? "1" : "0";
    if (!shown) return;
    up.style.left = `${r.left}px`;
    up.style.width = `${r.width}px`;
    up.style.top = `${r.top - DROP_TIP_OVERDRAW_LENGTH}px`;
    up.style.height = `${DROP_TIP_OVERDRAW_LENGTH}px`;
    down.style.left = `${r.left}px`;
    down.style.width = `${r.width}px`;
    down.style.top = `${r.bottom}px`;
    down.style.height = `${DROP_TIP_OVERDRAW_LENGTH}px`;
  };

  const start = (): void => {
    if (raf) return;
    place();
    if (typeof requestAnimationFrame !== "function") return;
    const loop = (): void => {
      const shown = host.getBoundingClientRect().width > 0;
      place();
      if (shown) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    raf = requestAnimationFrame(loop);
  };

  // Restart/stop the tracking loop when the host's display toggles. The
  // indicator is created hidden and shown/hidden per hover, so this keeps the
  // frame loop from running forever while the line is hidden.
  if (typeof MutationObserver !== "undefined") {
    const mo = new MutationObserver(() => {
      if (host.getBoundingClientRect().width > 0) start();
      else stop();
    });
    mo.observe(host, { attributes: true, attributeFilter: ["style", "class"] });
  }
  start();
}
