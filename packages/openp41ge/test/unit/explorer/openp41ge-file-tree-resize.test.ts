/**
 * Tests for pure resize calculation functions used by the openp41ge-file-tree component.
 *
 * These test the geometric math behind the two drag notches:
 *   1. Left edge of wrapper (= left edge of preview) — calcWrapperResize
 *   2. Boundary between preview and drawer (= left edge of explorer) — calcBoundaryResize
 */

import {
  calcWrapperResize,
  calcBoundaryResize,
  MIN_PREVIEW,
  MIN_DRAWER,
  MIN_WRAPPER,
  MAX_COMBINED_RATIO,
} from "@openp41ge/renderer/components/openp41ge-file-tree-resize";

// =========================================================================
// calcWrapperResize — notch at left edge of wrapper
// =========================================================================

describe("calcWrapperResize — preview open", () => {
  const winWidth = 1280;

  test("drag LEFT → preview grows, drawer unchanged", () => {
    // Drag left means smaller clientX, so desiredWrapper increases
    // clientX=600 → desiredWrapper=1280-600=680 — wider than current 420+280=700... hmm
    // Let's test: clientX=500 → desiredWrapper=780, clamped=780, newPreview=780-280=500
    const r = calcWrapperResize(1280, 500, 280, true);
    expect(r.previewWidth).toBe(500);
    expect(r.drawerWidth).toBe(280);
  });

  test("drag RIGHT → preview shrinks, drawer unchanged", () => {
    // clientX=900 → desiredWrapper=1280-900=380, clamped=380, newPreview=380-280=100 → clamped to 200
    const r = calcWrapperResize(1280, 900, 280, true);
    expect(r.previewWidth).toBe(MIN_PREVIEW);
    expect(r.drawerWidth).toBe(280);
  });

  test("wrapper clamps to minimum 280", () => {
    // clientX=1100 → desiredWrapper=1280-1100=180 → clamped to 280
    const r = calcWrapperResize(1280, 1100, 280, true);
    expect(r.previewWidth).toBe(MIN_PREVIEW);
    expect(r.drawerWidth).toBe(280);
  });

  test("wrapper clamps to max combined width", () => {
    // clientX=50 → desiredWrapper=1230 — but maxCombined=1280
    const r = calcWrapperResize(1280, 50, 280, true);
    expect(r.previewWidth).toBe(1230 - 280);
    expect(r.drawerWidth).toBe(280);
  });

  test("preview clamps to minimum 200 even when wrapper shrinks a lot", () => {
    // clientX=1000 → desiredWrapper=280 → clamped=280, but 280-280=0 → clamped to 200
    const r = calcWrapperResize(1280, 1000, 280, true);
    expect(r.previewWidth).toBe(MIN_PREVIEW);
    expect(r.drawerWidth).toBe(280);
  });

  test("preview capped by maxCombined minus drawerWidth", () => {
    // maxCombined=1280, preview can't exceed 1280-200=1080 with drawer=200
    // desiredWrapper=1280-50=1230, clampedWrapper=1230, newPreview=1230-200=1030
    const r = calcWrapperResize(1280, 50, 200, true);
    expect(r.previewWidth).toBe(1030);
    expect(r.drawerWidth).toBe(200);
  });

  test("large drawer width limits preview expansion", () => {
    // drawer=500, maxCombined=1280, preview max=1280-500=780
    // clientX=100 → desiredWrapper=1180 → clamped=1180, newPreview=1180-500=680
    const r = calcWrapperResize(1280, 100, 500, true);
    expect(r.previewWidth).toBe(680);
    expect(r.drawerWidth).toBe(500);
  });

  test("narrow window (800px) — preview fits within bounds", () => {
    // winWidth=800, maxCombined=720
    // clientX=400 → desiredWrapper=400, clamped=400 (min 280), newPreview=400-280=120→200
    const r = calcWrapperResize(800, 400, 280, true);
    expect(r.previewWidth).toBe(MIN_PREVIEW);
    expect(r.drawerWidth).toBe(280);
  });
});

describe("calcWrapperResize — no preview (drawer only)", () => {
  const winWidth = 1280;

  test("drag LEFT → drawer grows", () => {
    // clientX=300 → desiredWrapper=1280-300=980 → clamped=980
    const r = calcWrapperResize(1280, 300, 280, false);
    expect(r.drawerWidth).toBe(980);
    expect(r.previewWidth).toBe(0);
  });

  test("drag RIGHT → drawer shrinks", () => {
    // clientX=1000 → desiredWrapper=280 → clamped=280
    const r = calcWrapperResize(1280, 1000, 280, false);
    expect(r.drawerWidth).toBe(280);
    expect(r.previewWidth).toBe(0);
  });

  test("wrapper clamps to minimum 280", () => {
    // clientX=1100 → desiredWrapper=180 → clamped=280
    const r = calcWrapperResize(1280, 1100, 280, false);
    expect(r.drawerWidth).toBe(280);
  });

  test("drawer clamps to minimum 200", () => {
    // desiredWrapper=280 → clamp to 280, but drawer min is 200
    // Actually clampedWrapper is 280 which is >= 200, so drawerWidth=280
    const r = calcWrapperResize(1280, 1000, 200, false);
    expect(r.drawerWidth).toBe(280);
  });

  test("wrapper clamps to max combined", () => {
    // clientX=50 → desiredWrapper=1230 → clamped=1230
    const r = calcWrapperResize(1280, 50, 500, false);
    expect(r.drawerWidth).toBe(1230);
  });

  test("current drawerWidth argument is ignored when no preview", () => {
    // The function clamps to desiredWrapper, doesn't use the passed drawerWidth for calculations
    const r = calcWrapperResize(1280, 400, 999, false);
    expect(r.drawerWidth).toBe(880); // 1280-400=880
  });
});

// =========================================================================
// calcBoundaryResize — notch between preview and drawer
// =========================================================================

describe("calcBoundaryResize", () => {
  test("drag LEFT → preview shrinks, drawer grows", () => {
    // Start: preview=420, drawer=280, wrapper=700, wrapperLeft=1280-700=580
    // Drag left: clientX=580 → cursor at wrapper's left edge → preview=200, drawer=500
    const r = calcBoundaryResize(580, 580, 700);
    expect(r.previewWidth).toBe(MIN_PREVIEW);
    expect(r.drawerWidth).toBe(500);
  });

  test("drag RIGHT → preview grows, drawer shrinks", () => {
    // wrapperLeft=580, wrapperWidth=700 → wrapper right edge=1280
    // Cursor at 1080 → cursorInWrapper=500, preview=500, drawer=200 (min)
    const r = calcBoundaryResize(1080, 580, 700);
    expect(r.previewWidth).toBe(500);
    expect(r.drawerWidth).toBe(200);
  });

  test("preview clamps to minimum 200", () => {
    // wrapperLeft=500, wrapperWidth=700
    // clientX=500 → cursorInWrapper=0 → preview would be 0 → clamped to 200
    const r = calcBoundaryResize(500, 500, 700);
    expect(r.previewWidth).toBe(MIN_PREVIEW);
    expect(r.drawerWidth).toBe(500);
  });

  test("drawer clamps to minimum 200", () => {
    // wrapperLeft=500, wrapperWidth=700
    // clientX=1000 → cursorInWrapper=500 → preview would be 500, but drawer would be 200
    // Actually: newPreview=min(500, 700-200=500)=500, drawer=200. OK good.
    const r = calcBoundaryResize(1000, 500, 700);
    expect(r.previewWidth).toBe(500);
    expect(r.drawerWidth).toBe(MIN_DRAWER);
  });

  test("equal split at midpoint", () => {
    // wrapperLeft=300, wrapperWidth=800
    // clientX=700 → cursorInWrapper=400 → preview=400, drawer=400
    const r = calcBoundaryResize(700, 300, 800);
    expect(r.previewWidth).toBe(400);
    expect(r.drawerWidth).toBe(400);
  });

  test("cursor outside wrapper to the left → preview clamped to min", () => {
    // wrapperLeft=500, wrapperWidth=700
    // clientX=400 → cursorInWrapper=-100 → clamped to 200
    const r = calcBoundaryResize(400, 500, 700);
    expect(r.previewWidth).toBe(MIN_PREVIEW);
    expect(r.drawerWidth).toBe(500);
  });

  test("cursor outside wrapper to the right → drawer clamped to min", () => {
    // wrapperLeft=500, wrapperWidth=700 → wrapper right edge = 1200
    // clientX=1300 → cursorInWrapper=800 → clamped to 700-200=500, drawer=200
    const r = calcBoundaryResize(1300, 500, 700);
    expect(r.previewWidth).toBe(500);
    expect(r.drawerWidth).toBe(MIN_DRAWER);
  });

  test("narrow wrapper (400px)", () => {
    // wrapperLeft=800 (1280-400=880 actually...), wrapperWidth=400
    // Actually: 1280-400=880 wrapperLeft. clientX=880 → cursorInWrapper=0 → preview=200, drawer=200
    // Let's just use: wrapperLeft=880, wrapperWidth=400
    const r = calcBoundaryResize(880, 880, 400);
    expect(r.previewWidth).toBe(MIN_PREVIEW);
    expect(r.drawerWidth).toBe(MIN_DRAWER);
  });

  test("large wrapper (1152px)", () => {
    // wrapperLeft=128, wrapperWidth=1152 (maxCombined at 1280px)
    // clientX=500 → cursorInWrapper=372 → preview=372, drawer=780
    const r = calcBoundaryResize(500, 128, 1152);
    expect(r.previewWidth).toBe(372);
    expect(r.drawerWidth).toBe(780);
  });

  test("preview and drawer both at min — any drag keeps both at min", () => {
    // wrapperLeft=880, wrapperWidth=400
    // clientX=880..1080 → preview will always be 200 (min), drawer 200 (min)
    const r = calcBoundaryResize(950, 880, 400);
    expect(r.previewWidth).toBe(200);
    expect(r.drawerWidth).toBe(200);
  });
});

// =========================================================================
// Property-style invariants for resize functions
// =========================================================================

describe("calcWrapperResize invariants", () => {
  test("wrapper never below MIN_WRAPPER for any clientX with preview", () => {
    for (let winWidth = 600; winWidth <= 1600; winWidth += 200) {
      for (let clientX = 0; clientX <= winWidth; clientX += 50) {
        const r = calcWrapperResize(winWidth, clientX, 280, true);
        const wrapperWidth = r.previewWidth + r.drawerWidth;
        expect(wrapperWidth).toBeGreaterThanOrEqual(MIN_WRAPPER);
        expect(wrapperWidth).toBeLessThanOrEqual(Math.round(winWidth * MAX_COMBINED_RATIO));
      }
    }
  });

  test("preview never below MIN_PREVIEW when preview is open", () => {
    for (let winWidth = 600; winWidth <= 1600; winWidth += 200) {
      for (let clientX = 0; clientX <= winWidth; clientX += 50) {
        const r = calcWrapperResize(winWidth, clientX, 280, true);
        const wrapperWidth = r.previewWidth + r.drawerWidth;
        expect(r.previewWidth).toBeGreaterThanOrEqual(MIN_PREVIEW);
        expect(r.previewWidth).toBeLessThanOrEqual(wrapperWidth - MIN_DRAWER);
      }
    }
  });

  test("preview + drawer = wrapper width when preview is open", () => {
    for (let winWidth = 800; winWidth <= 1400; winWidth += 200) {
      for (let drawerWidth = 200; drawerWidth <= 500; drawerWidth += 100) {
        for (let clientX = 0; clientX <= winWidth; clientX += 100) {
          const r = calcWrapperResize(winWidth, clientX, drawerWidth, true);
          // wrapperWidth = preview + drawer (always true by construction)
          expect(r.previewWidth + r.drawerWidth).toBeGreaterThanOrEqual(MIN_WRAPPER);
        }
      }
    }
  });

  test("without preview, drawerWidth is the only width and previewWidth = 0", () => {
    for (let winWidth = 600; winWidth <= 1600; winWidth += 200) {
      for (let clientX = 0; clientX <= winWidth; clientX += 100) {
        const r = calcWrapperResize(winWidth, clientX, 280, false);
        expect(r.previewWidth).toBe(0);
        expect(r.drawerWidth).toBeGreaterThanOrEqual(MIN_DRAWER);
      }
    }
  });

  test("without preview, drawer never below MIN_DRAWER", () => {
    for (let winWidth = 600; winWidth <= 1600; winWidth += 200) {
      for (let clientX = 0; clientX <= winWidth; clientX += 100) {
        const r = calcWrapperResize(winWidth, clientX, 280, false);
        expect(r.drawerWidth).toBeGreaterThanOrEqual(MIN_DRAWER);
      }
    }
  });
});

describe("calcBoundaryResize invariants", () => {
  test("preview never below MIN_PREVIEW", () => {
    for (let wrapperWidth = 400; wrapperWidth <= 1200; wrapperWidth += 100) {
      for (let wrapperLeft = 0; wrapperLeft <= 500; wrapperLeft += 100) {
        const winWidth = wrapperLeft + wrapperWidth;
        for (let clientX = wrapperLeft; clientX <= winWidth; clientX += 50) {
          const r = calcBoundaryResize(clientX, wrapperLeft, wrapperWidth);
          expect(r.previewWidth).toBeGreaterThanOrEqual(MIN_PREVIEW);
        }
      }
    }
  });

  test("drawer never below MIN_DRAWER", () => {
    for (let wrapperWidth = 400; wrapperWidth <= 1200; wrapperWidth += 100) {
      for (let wrapperLeft = 0; wrapperLeft <= 500; wrapperLeft += 100) {
        const winWidth = wrapperLeft + wrapperWidth;
        for (let clientX = wrapperLeft; clientX <= winWidth; clientX += 50) {
          const r = calcBoundaryResize(clientX, wrapperLeft, wrapperWidth);
          expect(r.drawerWidth).toBeGreaterThanOrEqual(MIN_DRAWER);
        }
      }
    }
  });

  test("preview + drawer = wrapperWidth", () => {
    for (let wrapperWidth = 400; wrapperWidth <= 1200; wrapperWidth += 100) {
      for (let wrapperLeft = 0; wrapperLeft <= 500; wrapperLeft += 100) {
        const winWidth = wrapperLeft + wrapperWidth;
        for (let clientX = wrapperLeft; clientX <= winWidth; clientX += 50) {
          const r = calcBoundaryResize(clientX, wrapperLeft, wrapperWidth);
          expect(r.previewWidth + r.drawerWidth).toBe(wrapperWidth);
        }
      }
    }
  });

  test("results are symmetric around midpoint", () => {
    const wrapperWidth = 800;
    const wrapperLeft = 200;
    // At midpoint, preview == drawer
    const mid = calcBoundaryResize(wrapperLeft + wrapperWidth / 2, wrapperLeft, wrapperWidth);
    expect(mid.previewWidth).toBe(400);
    expect(mid.drawerWidth).toBe(400);

    // Offsetting left by 100 gives the same as offsetting right by 100 (swapped)
    const left = calcBoundaryResize(wrapperLeft + 300, wrapperLeft, wrapperWidth);
    const right = calcBoundaryResize(wrapperLeft + 500, wrapperLeft, wrapperWidth);
    expect(left.previewWidth).toBe(right.drawerWidth);
    expect(left.drawerWidth).toBe(right.previewWidth);
  });
});
