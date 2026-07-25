/**
 * Pure resize calculation functions for the openp41ge-file-tree component.
 *
 * These are extracted for testability — they contain no DOM or state side-effects.
 */

/** Minimum width for the preview panel. */
export const MIN_PREVIEW = 200;

/** Minimum width for the drawer/explorer panel. */
export const MIN_DRAWER = 200;

/** Minimum total wrapper width when no preview is open. */
export const MIN_WRAPPER = 280;

/** Fraction of window width used as the maximum combined (preview + drawer) width. */
export const MAX_COMBINED_RATIO = 1.0;

export interface WrapperResizeResult {
  previewWidth: number;
  drawerWidth: number;
}

/**
 * Calculate new widths when the wrapper's left edge notch is dragged.
 *
 * The notch is at the left edge of the wrapper (= left edge of the preview panel).
 * Dragging changes the total wrapper width; the drawer stays fixed.
 *
 * When there is no preview open, the notch resizes the drawer directly.
 *
 * @param winWidth  - `window.innerWidth`
 * @param clientX   - `e.clientX` from the mousemove event
 * @param drawerWidth - current drawer/explorer width
 * @param previewWidth - current preview width (0 when no preview)
 * @param previewOpen  - whether the preview panel is currently shown
 */
export function calcWrapperResize(
  winWidth: number,
  clientX: number,
  drawerWidth: number,
  previewOpen: boolean,
): WrapperResizeResult {
  const maxCombined = winWidth * MAX_COMBINED_RATIO;
  const desiredWrapper = winWidth - clientX;
  const clampedWrapper = Math.max(MIN_WRAPPER, Math.min(desiredWrapper, maxCombined));

  if (previewOpen) {
    // The toggle notch is the left edge of the preview — resize the preview.
    // Drawer stays fixed; total wrapper = preview + drawer.
    const newPreview = Math.max(
      MIN_PREVIEW,
      Math.min(clampedWrapper - drawerWidth, maxCombined - drawerWidth),
    );
    return { previewWidth: newPreview, drawerWidth };
  } else {
    // No preview — the notch is the left edge of the drawer.
    const newDrawer = Math.max(MIN_DRAWER, clampedWrapper);
    return { previewWidth: 0, drawerWidth: newDrawer };
  }
}

/**
 * Calculate new widths when the boundary notch between preview and drawer is dragged.
 *
 * Total wrapper width stays fixed; space is redistributed between preview and drawer.
 * Dragging LEFT shrinks preview and grows drawer; dragging RIGHT grows preview and shrinks drawer.
 *
 * @param clientX      - `e.clientX` from the mousemove event
 * @param wrapperLeft  - left edge of the wrapper in viewport coordinates (`window.innerWidth - wrapperWidth`)
 * @param wrapperWidth - total width of the wrapper (`previewWidth + drawerWidth`)
 */
export function calcBoundaryResize(
  clientX: number,
  wrapperLeft: number,
  wrapperWidth: number,
): WrapperResizeResult {
  // Where the cursor is relative to the wrapper's left edge
  const cursorInWrapper = clientX - wrapperLeft;

  const newPreview = Math.max(MIN_PREVIEW, Math.min(cursorInWrapper, wrapperWidth - MIN_DRAWER));
  const newDrawer = wrapperWidth - newPreview;

  return { previewWidth: newPreview, drawerWidth: newDrawer };
}
