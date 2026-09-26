/**
 * Top-corner overdraw accents for bottom-bar action buttons.
 *
 * The shared <overdraw-line> component draws a 1px fade-out accent that
 * extends a box's border past its corners. Bottom-bar buttons sit at the
 * bottom edge of their panel/window, so only the TOP corners can carry the
 * accent — a line extending downward would run off the window. This helper
 * attaches exactly the four top-corner lines to a button host:
 *
 *   - top-left:  horizontal (dir=left, along the top edge, fading leftward)
 *                + vertical (dir=up, fading upward above the button)
 *   - top-right: horizontal (dir=right) + vertical (dir=up)
 *
 * Each host is made `position: relative` so the absolutely positioned lines
 * resolve against it, and the lines are positioned exactly over the button's
 * top border line (the -1px offsets align the 1px accents with the border).
 */

import "./overdraw-line";

/** [corner, dir, inline positioning] — solid end sits on the box's border. */
const TOP_CORNER_LINES: Array<[string, string, Record<string, string>]> = [
  ["tl", "left", { top: "-1px", right: "100%" }],
  ["tl", "up", { left: "-1px", bottom: "100%" }],
  ["tr", "right", { top: "-1px", left: "100%" }],
  ["tr", "up", { left: "100%", bottom: "100%" }],
];

/**
 * Attach the top-corner overdraw accents to a bottom-bar button. Idempotent:
 * if the host already carries them (marked by `data-overdraw="top"`), it
 * returns immediately so repeated calls (e.g. on re-render) never duplicate.
 */
export function attachTopCornerOverdraws(host: HTMLElement): void {
  if (host.dataset.overdraw === "top") return;
  host.dataset.overdraw = "top";

  // Make the host a containing block for the absolute lines. Guard on the
  // computed position, but also handle the detached case: getComputedStyle
  // returns "" for an element not in the document (a separator built before
  // it is appended), which would otherwise skip making it relative.
  if (getComputedStyle(host).position !== "relative") {
    host.style.position = "relative";
  }

  for (const [corner, dir, pos] of TOP_CORNER_LINES) {
    const line = document.createElement("overdraw-line");
    line.setAttribute("corner", corner);
    line.setAttribute("dir", dir);
    line.setAttribute("aria-hidden", "true");
    for (const [k, v] of Object.entries(pos)) line.style.setProperty(k, v);
    host.appendChild(line);
  }
}

/**
 * Attach a single vertical overdraw accent to the TOP of a vertical divider
 * (a 1px separator such as `bb-sep`), so the divider appears to continue
 * upward past the bar's top border. The line's solid (bottom) end sits on the
 * divider's top edge; its left edge aligns over the 1px divider itself.
 *
 * Idempotent — guarded by `data-overdraw="up-top"` so repeated calls (e.g.
 * on re-render) never duplicate the accent. The host is made `position:
 * relative` so the absolutely-positioned line resolves against it.
 */
export function attachTopOverdraw(host: HTMLElement): void {
  if (host.dataset.overdraw === "up-top") return;
  host.dataset.overdraw = "up-top";

  // Make the host a containing block for the absolute line. Guard on the
  // computed position, but also handle the detached case: getComputedStyle
  // returns "" for an element not in the document (a separator built before
  // it is appended), which would otherwise skip making it relative.
  if (getComputedStyle(host).position !== "relative") {
    host.style.position = "relative";
  }

  const line = document.createElement("overdraw-line");
  line.setAttribute("dir", "up");
  line.setAttribute("aria-hidden", "true");
  line.style.setProperty("bottom", "100%");
  line.style.setProperty("left", "0");
  host.appendChild(line);
}

/** [corner, dir, inline positioning] — the two horizontal top-corner lines. */
const TOP_HORIZONTAL_LINES: Array<[string, string]> = [
  ["tl", "left"],
  ["tr", "right"],
];

/**
 * Attach the two HORIZONTAL top-corner overdraw accents to a divider/box:
 * a 1px line that continues the host's top border past each end (leftward
 * past the top-left corner, rightward past the top-right corner) and fades
 * out, so the top separator line appears to bleed past its ends.
 *
 * Because these extensions grow OUTWARD past the host's bounds, they would be
 * clipped by any `overflow: hidden` ancestor (the Agents panel, the app's
 * `<tab-content>` panes, …) and hidden behind neighbouring grid tabs and
 * sidebars. So the lines are NOT children of the host: they are portalled into
 * a `position: fixed` viewport-wide layer appended to `document.body` with a
 * near-maximum `z-index`, so they always paint above the surrounding chrome.
 * Their position tracks the host's viewport rect on scroll / resize / layout
 * change, and the layer is removed when the host disconnects (e.g. a toggled
 * find bar is removed).
 *
 * Idempotent — guarded by `data-overdraw="top-h"` so repeated calls (e.g. on
 * re-render) never duplicate the accents.
 *
 * The lines are portalled into a viewport-wide, top-most layer, so they must
 * mirror the host's OWN visibility: a line may only extend a border the user
 * can actually see. Each line is therefore hidden independently while an
 * OPAQUE overlay covers its corner (e.g. a settings drawer sliding over the
 * grid), while the semi-transparent dim mask is ignored — so a partial-width
 * drawer hides only its spawn-side line, and a full-width drawer hides both.
 * `place()` hit-tests each corner with `elementFromPoint` (coalesced per
 * frame via a body-subtree observer, since the drawer mounts elsewhere in the
 * DOM and causes no host resize). `elementFromPoint` ignores `pointer-events:
 * none`, so the overdraw layer never shadows the result.
 */
export function attachTopHorizontalOverdraws(host: HTMLElement): void {
  if (host.dataset.overdraw === "top-h") return;
  host.dataset.overdraw = "top-h";

  const layer = document.createElement("div");
  layer.className = "p41ge-overdraw-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = [
    "position: fixed",
    "left: 0",
    "top: 0",
    "right: 0",
    "bottom: 0",
    "pointer-events: none",
    // Above the page's own chrome (grid tabs, sidebars, window content) so the
    // bleed lines stay visible, but BELOW the settings-drawer host (z-index
    // 1001) so its full-window dim mask renders over them and dims them while
    // a drawer is open, instead of the lines painting bright above the mask.
    "z-index: 999",
  ].join(";");

  for (const [corner, dir] of TOP_HORIZONTAL_LINES) {
    const line = document.createElement("overdraw-line");
    line.setAttribute("corner", corner);
    line.setAttribute("dir", dir);
    line.setAttribute("aria-hidden", "true");
    layer.appendChild(line);
  }
  document.body.appendChild(layer);

  let sawConnected = false;
  let ro: ResizeObserver | null = null;
  let mo: MutationObserver | null = null;
  let vo: MutationObserver | null = null;
  let raf = 0;
  let placeTimer = 0;
  const onScroll = () => place();
  // A drawer slides in with a transform+opacity entrance animation, so its
  // coverage grows over ~0.18s (and it can cross onto a corner only once it
  // has reached its final position). Re-place whenever any element finishes
  // animating/transitioning so the settled state is captured (idempotent and
  // cheap on the rare animation events).
  const onVisualSettle = () => place();
  // Coalesce the visibility observer's frequent mutations into one check per
  // frame (the host's own scroll/resize/RO call `place()` directly). When the
  // tab/window is hidden `requestAnimationFrame` is throttled and never fires,
  // so also arm a macrotask fallback that runs `place()` if the frame didn't;
  // otherwise a drawer appearing while occluded would leave stale overdraws.
  const schedulePlace = () => {
    if ((raf || placeTimer) || !host.isConnected) return;
    if (typeof requestAnimationFrame !== "function") {
      place();
      return;
    }
    raf = requestAnimationFrame(() => {
      raf = 0;
      place();
    });
    placeTimer = window.setTimeout(() => {
      placeTimer = 0;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      place();
    }, 64);
  };

  function place(): void {
    if (!host.isConnected) {
      // The host was removed (e.g. a toggled find bar); drop the portal layer.
      if (sawConnected) teardown();
      return;
    }
    sawConnected = true;
    if (hostIsHidden(host)) {
      layer.style.display = "none";
      return;
    }
    layer.style.display = "";
    const rect = host.getBoundingClientRect();
    const [tl, tr] = layer.children;
    // Align the 1px strokes over the host's top border (the border occupies
    // rect.top..rect.top+1) and grow outward, solid end at the corner.
    const top = `${rect.top}px`;
    (tl as HTMLElement).style.top = top;
    (tl as HTMLElement).style.right = `${window.innerWidth - rect.left}px`;
    (tr as HTMLElement).style.top = top;
    (tr as HTMLElement).style.left = `${rect.right}px`;
    // Each line continues the host's top border past a corner, so hide a line
    // while an OPAQUE overlay covers that corner — the line may only draw where
    // the border it extends is actually visible. The semi-transparent dim mask
    // (which dims but does not hide the border) is deliberately ignored, which
    // is why a partial-width drawer hides only its spawn-side line, not the
    // far one; a full-width drawer covers both corners and hides both.
    (tl as HTMLElement).style.display = cornerOccluded(host, rect.left + 1, rect.top + 1) ? "none" : "";
    (tr as HTMLElement).style.display = cornerOccluded(host, rect.right - 1, rect.top + 1) ? "none" : "";
  }

  function teardown(): void {
    ro?.disconnect();
    mo?.disconnect();
    vo?.disconnect();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (placeTimer) clearTimeout(placeTimer);
    placeTimer = 0;
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onScroll);
    document.removeEventListener("animationend", onVisualSettle, true);
    document.removeEventListener("transitionend", onVisualSettle, true);
    layer.remove();
  }

  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => place());
    ro.observe(host);
  }
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("resize", onScroll);
  document.addEventListener("animationend", onVisualSettle, true);
  document.addEventListener("transitionend", onVisualSettle, true);
  // Observe the host's immediate parent so a removal (e.g. a toggled find
  // bar, which is a direct child of the shadow root) tears the portal down.
  // `parentNode` — not `parentElement` — because the composer/find bar are
  // direct children of the shadow root, whose `parentElement` is null.
  const parent = host.parentNode;
  if (parent && typeof MutationObserver !== "undefined") {
    mo = new MutationObserver(() => place());
    mo.observe(parent, { childList: true });
  }
  // A covering overlay (a settings drawer or its dim mask) is added and
  // removed elsewhere in the document, so no observer on the host fires when
  // it appears. Watch the document subtree for insertions/removals AND for any
  // attribute change, so the occlusion check re-runs once the cover exists,
  // whenever an existing cover is dragged (resizing a drawer applies its new
  // width directly with `transition: none`, so no transition event fires to
  // catch it), and when it is hidden again (closing a drawer hides its
  // surface via the host's `open` attribute rather than removing it, so no
  // childList mutation fires either). All attributes are observed because a
  // cover's visibility is not limited to `style`/`class`. The layer's own
  // style writes are idempotent, so they do not loop; schedules are coalesced
  // per frame.
  if (typeof MutationObserver !== "undefined" && document.body) {
    vo = new MutationObserver(schedulePlace);
    vo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  place();
}

/** Whether the host is actually rendered (non-zero size). A portalled overdraw
 *  may only draw when the host has a size; otherwise the whole layer hides. */
function hostIsHidden(host: HTMLElement): boolean {
  const rect = host.getBoundingClientRect();
  return rect.width <= 0 || rect.height <= 0;
}

/** Is `el` the host itself, one of its descendants, or one of its ancestors?
 *  Such elements paint at/behind the host and therefore never count as an
 *  overlay covering it. */
function isHostRelated(host: HTMLElement, el: Element): boolean {
  return isWithin(host, el) || isWithin(el, host);
}

/** Whether an OPAQUE overlay covers the point (x, y), so the overdraw line
 *  ending there must hide. A single `elementFromPoint` hit returns only the
 *  TOPMOST element, which is often transparent UI chrome that sits above the
 *  actual cover (e.g. a window-manager grid notch drawn over an opaque
 *  drawer), so it cannot see the opaque surface behind it. Instead inspect the
 *  full `elementsFromPoint` stacking stack and decide from the FIRST element
 *  that paints an opaque background: if it is unrelated to the host, that
 *  overlay covers the corner (hide); if it is the host or one of its ancestors
 *  (which paint at/behind it), nothing opaque covers it (show). Transparent
 *  layers never qualify, so the semi-transparent dim mask is ignored and a
 *  partial-width drawer hides only the corner it really reaches. Where
 *  hit-testing is unavailable (jsdom), the topmost hit is resolved by walking
 *  up its ancestry, attributing a transparent descendant (a drawer's
 *  `.sdw-body` inside the opaque `.sdw-drawer`) to its opaque ancestor. */
function cornerOccluded(host: HTMLElement, x: number, y: number): boolean {
  if (typeof document.elementsFromPoint === "function") {
    let stack: Element[] | null = null;
    try {
      stack = Array.from(document.elementsFromPoint(x, y));
    } catch {
      stack = null;
    }
    if (stack && stack.length > 0) {
      for (const el of stack) {
        if (isOpaqueBackground(el)) return !isHostRelated(host, el);
      }
      return false;
    }
  }
  // Fallback (jsdom / no stacking stack): walk up the topmost hit's ancestry.
  const hit = document.elementFromPoint(x, y) as Element | null;
  if (!hit) return false;
  let el: Element | null = hit;
  while (el && el !== document.documentElement && el !== document.body) {
    if (isHostRelated(host, el)) return false;
    if (isOpaqueBackground(el)) return true;
    el = el.parentElement;
  }
  return false;
}

/** Whether `el` paints an opaque background over the point (so it hides what
 *  is behind it), judged by its background-color alpha. Element `opacity` is
 *  deliberately NOT considered: a surface sliding in with an entrance
 *  animation fades `opacity` 0→1 (e.g. the drawer's 0.18s slide-in), so an
 *  `opacity` check would only ever be satisfied after the animation, by which
 *  point no re-place runs and the cover is missed. The semi-transparent dim
 *  mask is distinguished by its background alpha (0.55), which falls below the
 *  opaque threshold here. */
function isOpaqueBackground(el: Element): boolean {
  const m = /rgba?\(\s*([^)]+)\)/.exec(getComputedStyle(el).backgroundColor);
  if (!m) return false;
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  const alpha = parts.length >= 4 ? parts[3] : 1;
  return alpha >= 0.99;
}

/** Is `child` a shadow-including descendant (or self) of `ancestor`?
 *  `Node.contains` does not cross shadow boundaries, so walk up from `child`
 *  through `parentNode` links, hopping out of each shadow root at its host. */
function isWithin(ancestor: Element, child: Element): boolean {
  let cur: Element | Node | null = child;
  while (cur) {
    if (cur === ancestor) return true;
    const root = cur.getRootNode();
    cur = root instanceof ShadowRoot ? root.host : cur.parentNode;
  }
  return false;
}
