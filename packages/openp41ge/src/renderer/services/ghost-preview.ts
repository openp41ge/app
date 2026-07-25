/**
 * Ghost preview — compute what the grid will look like after the drop.
 */

import type { Tab } from "../../layout/types";

export interface GhostPreview {
  cols: number;
  placements: Array<{ col: number; tabId: string | null; tab: Tab | undefined }>;
  highlightedCol: number;
}

/**
 * Compute the ghost preview — what the grid will look like after the drop.
 */
export function computeGhostPreview(
  grid: {
    cols: number;
    placements: Array<{
      position: { row: number; col: number };
      activeTabId?: string;
      tabIds: string[];
    }>;
  },
  draggedTabId: string,
  tabMap: Record<string, Tab | undefined>,
  targetCol: number,
  _insertCol?: number,
  crossTab?: boolean,
): GhostPreview {
  const getTabId = (pl: { activeTabId?: string; tabIds: string[] } | undefined): string | null =>
    pl?.activeTabId ?? pl?.tabIds[0] ?? null;

  if (crossTab) {
    const previewCols = grid.cols + 1;
    const occupantAtTarget = grid.placements.find(
      (p) => p.position.row === 0 && p.position.col === targetCol,
    );
    const highlightedCol = targetCol < grid.cols ? targetCol : grid.cols;
    const placements: Array<{ col: number; tabId: string | null; tab: Tab | undefined }> = [];
    for (let c = 0; c < previewCols; c++) {
      if (c === targetCol) {
        placements.push({ col: c, tabId: draggedTabId, tab: tabMap[draggedTabId] });
      } else if (c === grid.cols && occupantAtTarget && targetCol < grid.cols) {
        const occupantTabId = getTabId(occupantAtTarget);
        placements.push({
          col: c,
          tabId: occupantTabId,
          tab: occupantTabId ? tabMap[occupantTabId] : undefined,
        });
      } else {
        const existing = grid.placements.find(
          (p) => p.position.row === 0 && p.position.col === c && !p.tabIds.includes(draggedTabId),
        );
        const existingTabId = getTabId(existing);
        placements.push({
          col: c,
          tabId: existingTabId,
          tab: existingTabId ? tabMap[existingTabId] : undefined,
        });
      }
    }
    return { cols: previewCols, placements, highlightedCol };
  }

  const isNewColumn = targetCol >= grid.cols;
  const previewCols = isNewColumn ? grid.cols + 1 : grid.cols;
  const sourcePlacement = grid.placements.find((p) => p.tabIds.indexOf(draggedTabId) !== -1);
  const sourceCol = sourcePlacement?.position.col ?? -1;

  const placements: Array<{ col: number; tabId: string | null; tab: Tab | undefined }> = [];
  for (let c = 0; c < previewCols; c++) {
    if (isNewColumn && c === grid.cols) {
      placements.push({ col: c, tabId: draggedTabId, tab: tabMap[draggedTabId] });
    } else if (c === targetCol && sourceCol !== targetCol) {
      placements.push({ col: c, tabId: draggedTabId, tab: tabMap[draggedTabId] });
    } else {
      const includeAll = sourceCol === targetCol;
      const existing = grid.placements.find(
        (p) =>
          p.position.row === 0 &&
          p.position.col === c &&
          (includeAll || !p.tabIds.includes(draggedTabId)),
      );
      const existingTabId = getTabId(existing);
      placements.push({
        col: c,
        tabId: existingTabId,
        tab: existingTabId ? tabMap[existingTabId] : undefined,
      });
    }
  }

  const highlightedCol = targetCol >= grid.cols ? grid.cols : targetCol;
  return { cols: previewCols, placements, highlightedCol };
}
