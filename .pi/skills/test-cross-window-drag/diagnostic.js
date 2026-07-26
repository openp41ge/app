/**
 * Cross-window drag diagnostic — run in the TARGET window's DevTools console.
 *
 * Tests whether _updateCrossWindowGhost responds correctly to cursor position
 * changes by calling it directly with varying coordinates and inspecting the
 * resulting ghost overlay.
 *
 * Usage: paste this entire file into DevTools console and call:
 *   testCrossWindowGhost()
 */

async function testCrossWindowGhost() {
  const H = window.__openp41geTestHooks;
  if (!H) {
    console.error("❌ Test hooks not found on window.__openp41geTestHooks");
    console.error("   Ensure init-drag-system.ts loaded and app is running");
    return;
  }

  const grid = H.gridEl();
  if (!grid) {
    console.error("❌ No <tab-grid> element found in DOM");
    return;
  }

  const rect = grid.getBoundingClientRect();
  const cols = grid.cols;
  const cellW = rect.width / Math.max(1, cols);
  const gridMidY = rect.top + rect.height / 2;

  console.log(`\n═══ Grid Diagnostic ═══`);
  console.log(`Grid cols:        ${cols}`);
  console.log(
    `Grid rect:        left=${Math.round(rect.left)} right=${Math.round(rect.right)} width=${Math.round(rect.width)}`,
  );
  console.log(`Cell width:       ${Math.round(cellW)}px`);
  console.log(`Grid element:     ${grid.tagName}`);
  console.log(`Drop target type: ${grid.dropTarget?.type || "none"}`);
  console.log(`\n═══════════════════════════════\n`);

  // ── Activate remote drag mode ─────────────────────────────────────────
  H.setRemoteDragActive(true);
  console.log(`_remoteDragActive = ${H.isRemoteDragActive()}`);

  // ── Test 1: elementFromPoint sanity check ─────────────────────────────
  console.log(`\n─── Test 1: elementFromPoint ───`);
  const points = [
    { label: "grid left edge", x: rect.left + 2, y: gridMidY },
    { label: "grid center", x: rect.left + rect.width / 2, y: gridMidY },
    { label: "grid right edge", x: rect.right - 2, y: gridMidY },
    { label: "tab-bar left", x: rect.left + 2, y: rect.top + 10 },
    { label: "tab-bar right", x: rect.right - 2, y: rect.top + 10 },
  ];
  for (const p of points) {
    const el = document.elementFromPoint(p.x, p.y);
    const tag = el?.tagName || "null";
    const tabGrid = el?.closest?.("tab-grid");
    const tabBar = el?.closest?.("tab-bar");
    console.log(`  ${p.label}: el=${tag} grid=${!!tabGrid} tab-bar=${!!tabBar}`);
  }

  // ── Test 2: Call _updateCrossWindowGhost at each position ─────────────
  console.log(`\n─── Test 2: Ghost at each position ───`);
  for (const p of points) {
    console.log(`\n  --- ${p.label} ---`);
    try {
      console.log(`  Calling _updateCrossWindowGhost(${Math.round(p.x)}, ${Math.round(p.y)})`);
      H.callUpdateCrossWindowGhost(p.x, p.y);
      console.log(`  OK — no throw`);
    } catch (e) {
      console.error(`  THREW:`, e);
      continue;
    }
    const ov = H.getGridGhostOverlay();
    if (!ov) {
      console.log(`  ❌ No ghost overlay in DOM`);
      continue;
    }
    console.log(`  Ghost children: ${ov.children.length}`);
    for (let i = 0; i < ov.children.length; i++) {
      const c = ov.children[i];
      const bg = c.style.background;
      const shadow = c.style.boxShadow;
      const flex = c.style.flex;
      // Classify ghost column type from its visual style
      let type = "default";
      if (shadow?.includes("2px")) type = "highlighted";
      else if (shadow?.includes("1px")) type = "active";
      else if (bg?.includes("0.06") && !shadow) type = "splitPair";
      console.log(`    Col ${i}: flex=${flex} bg=${bg} shadow=${shadow} → ${type}`);
    }
  }

  // ── Test 3: Sequential moves — does ghost update? ─────────────────────
  console.log(`\n─── Test 3: Sequential ghost updates ───`);
  const positions = [
    { label: "1) left edge      ", x: rect.left + 2 },
    { label: "2) center         ", x: rect.left + rect.width / 2 },
    { label: "3) right edge     ", x: rect.right - 2 },
    { label: "4) center again   ", x: rect.left + rect.width / 2 },
    { label: "5) left edge again", x: rect.left + 2 },
  ];
  for (const p of positions) {
    H.callUpdateCrossWindowGhost(p.x, gridMidY);
    const ov = H.getGridGhostOverlay();
    const n = ov?.children.length ?? 0;
    const flex0 = ov?.children[0]?.style.flex || "?";
    const shadow0 = ov?.children[0]?.style.boxShadow || "?";
    const flex1 = ov?.children[1]?.style.flex || "?";
    const shadow1 = ov?.children[1]?.style.boxShadow || "?";
    console.log(
      `  ${p.label}: ${n} cols, col0 flex=${flex0} shadow=${shadow0}, col1 flex=${flex1} shadow=${shadow1}`,
    );
    if (p.label.startsWith("2") || p.label.startsWith("4")) {
      // Center → should be 1 column (cell-center)
      if (n !== 1) console.log(`  ⚠ Expected 1 column at center, got ${n}`);
    }
    if (p.label.startsWith("1") || p.label.startsWith("5")) {
      // Left edge → should be 2 columns (split)
      if (n !== 2) console.log(`  ⚠ Expected 2 columns at left edge, got ${n}`);
    }
    if (p.label.startsWith("3")) {
      // Right edge → should be 2 columns (split)
      if (n !== 2) console.log(`  ⚠ Expected 2 columns at right edge, got ${n}`);
    }
  }

  // ── Test 4: computeDropTarget directly ─────────────────────────────────
  console.log(`\n─── Test 4: computeDropTarget function ───`);
  try {
    const module = await import("../openp41ge-tabs-adapter");
    const { computeDropTarget, INSERT_BOUNDARY_THRESHOLD } = module;
    console.log(`  computeDropTarget type: ${typeof computeDropTarget}`);
    console.log(`  INSERT_BOUNDARY_THRESHOLD: ${INSERT_BOUNDARY_THRESHOLD}`);

    for (const p of positions) {
      const relX = p.x - rect.left;
      const result = computeDropTarget(grid, relX, rect.width, cols);
      console.log(
        `  ${p.label}: col=${result.col} isBoundary=${result.isBoundary} boundaryIndex=${result.boundaryIndex}`,
      );
    }
  } catch (e) {
    console.log(`  computeDropTarget import failed: ${e.message}`);
    console.log(`  Computing manually instead:`);
    // Manual computation
    for (const p of positions) {
      const fraction = (p.x - rect.left) / rect.width;
      const edgeThreshold = Math.min(0.15, 1 / 3);
      let isBoundary = false;
      let boundaryIndex = 0;
      if (fraction <= edgeThreshold) {
        isBoundary = true;
        boundaryIndex = 0;
      } else if (fraction >= 1 - edgeThreshold) {
        isBoundary = true;
        boundaryIndex = 1;
      }
      console.log(
        `  ${p.label}: fraction=${fraction.toFixed(3)} isBoundary=${isBoundary} boundaryIndex=${boundaryIndex}`,
      );
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────
  H.setRemoteDragActive(false);
  console.log(`\n═══ Diagnostic Complete ═══`);
}

// Auto-run
testCrossWindowGhost().catch(console.error);
