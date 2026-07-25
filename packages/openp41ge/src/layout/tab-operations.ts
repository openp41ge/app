/**
 * Tab operations — add, remove, reorder, move tabs within cells.
 *
 * All operations work at the window level — there are no worksets.
 * Each window has a single grid that holds all tab placements.
 */

import type { Workspace, Tab, TabId } from "./types.js";
import { createTab as makeTab, setActiveTabInCell } from "./types.js";
import {
  findEmptyCell,
  compactGrid,
  insertGridColumn,
  resizeGrid,
  equalizeColumns,
} from "./grid-operations.js";
import {
  mapGridInWindow,
  makeTabId,
  findTabLocation,
  getTabById,
  computeNewActiveId,
} from "./common.js";

export function registerTab(workspace: Workspace, tab: Tab): Workspace {
  return {
    ...workspace,
    tabs: { ...workspace.tabs, [tab.id]: tab },
  };
}

export function addTabToCell(
  workspace: Workspace,
  windowId: string,
  tab: Tab,
  row: number,
  col: number,
  insertAt?: number,
): Workspace {
  let result = workspace;
  if (!result.tabs[tab.id]) {
    result = registerTab(result, tab);
  }

  return mapGridInWindow(result, windowId, (grid) => {
    const existing = grid.placements.find((p) => p.position.row === row && p.position.col === col);
    if (existing) {
      const newTabIds =
        insertAt !== undefined && insertAt >= 0 && insertAt <= existing.tabIds.length
          ? ([
              ...existing.tabIds.slice(0, insertAt),
              tab.id as TabId,
              ...existing.tabIds.slice(insertAt),
            ] as TabId[])
          : ([...existing.tabIds, tab.id as TabId] as TabId[]);
      return {
        ...grid,
        placements: grid.placements.map((p) =>
          p.position.row === row && p.position.col === col
            ? {
                ...p,
                tabIds: newTabIds,
                activeTabId: tab.id as TabId,
              }
            : p,
        ),
      };
    }

    // Empty cell at requested position — create new placement there
    if (row < grid.rows && col < grid.cols) {
      return {
        ...grid,
        placements: [
          ...grid.placements,
          {
            tabIds: [tab.id as TabId],
            activeTabId: tab.id as TabId,
            position: { row, col },
            span: { rowSpan: 1, colSpan: 1 },
          },
        ],
      };
    }
    // Requested position out of bounds — find first empty cell
    const empty = findEmptyCell(grid);
    if (!empty) return grid;
    return {
      ...grid,
      placements: [
        ...grid.placements,
        {
          tabIds: [tab.id as TabId],
          activeTabId: tab.id as TabId,
          position: empty,
          span: { rowSpan: 1, colSpan: 1 },
        },
      ],
    };
  });
}

export function removeTabFromCell(
  workspace: Workspace,
  windowId: string,
  tabId: string,
  focusTabId?: string,
): Workspace {
  const grid = workspace.windows.find((w) => w.id === windowId)?.grid;
  if (!grid) return workspace;

  const placement = grid.placements.find((p) => p.tabIds.includes(tabId as TabId));
  if (!placement) return workspace;

  if (placement.tabIds.length > 1) {
    const filtered = placement.tabIds.filter((id) => id !== tabId);
    let newActiveId: TabId;
    if (focusTabId && (filtered as TabId[]).includes(focusTabId as TabId)) {
      newActiveId = focusTabId as TabId;
    } else {
      newActiveId = filtered[0] as TabId;
    }

    return mapGridInWindow(workspace, windowId, (grid) => ({
      ...grid,
      placements: grid.placements.map((p) => {
        if (!p.tabIds.includes(tabId as TabId)) return p;
        return {
          ...p,
          tabIds: filtered,
          activeTabId: newActiveId as TabId,
        };
      }),
    }));
  }

  return mapGridInWindow(workspace, windowId, (grid) =>
    compactGrid({
      ...grid,
      placements: grid.placements.filter((p) => !p.tabIds.includes(tabId as TabId)),
    }),
  );
}

export function switchTabInCell(
  workspace: Workspace,
  windowId: string,
  tabId: string,
  row: number,
  col: number,
): Workspace {
  return mapGridInWindow(workspace, windowId, (grid) => ({
    ...grid,
    placements: grid.placements.map((pl) => {
      if (pl.position.row === row && pl.position.col === col) {
        return setActiveTabInCell(pl, tabId as TabId);
      }
      return pl;
    }),
  }));
}

export function reorderTabsInCell(
  workspace: Workspace,
  windowId: string,
  row: number,
  col: number,
  fromIdx: number,
  toIdx: number,
): Workspace {
  return mapGridInWindow(workspace, windowId, (grid) => ({
    ...grid,
    placements: grid.placements.map((p) => {
      if (p.position.row === row && p.position.col === col) {
        const tabs = [...p.tabIds];
        const [moved] = tabs.splice(fromIdx, 1);
        tabs.splice(toIdx, 0, moved);
        return { ...p, tabIds: tabs, activeTabId: moved };
      }
      return p;
    }),
  }));
}

export function renameTabOp(workspace: Workspace, tabId: string, newTitle: string): Workspace {
  const tab = getTabById(workspace, tabId);
  if (!tab) return workspace;
  return {
    ...workspace,
    tabs: {
      ...workspace.tabs,
      [tabId as TabId]: { ...tab, title: newTitle },
    },
  };
}

export function moveTabBetweenCells(
  workspace: Workspace,
  sourceWindowId: string,
  tabId: string,
  targetWindowId: string,
  targetRow: number,
  targetCol: number,
  insertAt?: number,
  focusTabId?: string,
): Workspace {
  let result = removeTabFromCell(workspace, sourceWindowId, tabId, focusTabId);
  const tab = result.tabs[tabId as TabId];
  if (!tab) return workspace;

  // If the source cell was the last tab in its column AND was removed,
  // compactGrid shifted all columns to the right of the source column
  // left by 1. Adjust targetCol if it was to the right of the source.
  const sourceGrid = workspace.windows.find((w) => w.id === sourceWindowId)?.grid;
  const sourcePlacement = sourceGrid?.placements.find((p) =>
    (p.tabIds as string[]).includes(tabId),
  );
  const sourceCol = sourcePlacement?.position.col;
  const resultGrid = result.windows.find((w) => w.id === targetWindowId)?.grid;
  if (
    sourceWindowId === targetWindowId &&
    sourceCol !== undefined &&
    resultGrid &&
    sourceGrid &&
    resultGrid.cols < sourceGrid.cols &&
    targetCol > sourceCol
  ) {
    targetCol -= 1;
  }

  return addTabToCell(result, targetWindowId, tab, targetRow, targetCol, insertAt);
}

export function splitTabFromCell(
  workspace: Workspace,
  windowId: string,
  tabId: string,
  sourceCol: number,
  splitLeft: boolean,
  focusTabId?: string,
): Workspace {
  const grid = workspace.windows.find((w) => w.id === windowId)?.grid;
  if (!grid) return workspace;

  let actualSourceCol = sourceCol;
  let sourcePl = grid.placements.find((p) => p.position.row === 0 && p.position.col === sourceCol);
  if (!sourcePl || !(sourcePl.tabIds as string[]).includes(tabId)) {
    sourcePl = grid.placements.find((p) => (p.tabIds as string[]).includes(tabId));
    if (!sourcePl) return workspace;
    actualSourceCol = sourcePl.position.col;
  }

  const tab = workspace.tabs[tabId as TabId];
  if (!tab) return workspace;

  const remainingTabIds = (sourcePl.tabIds as TabId[]).filter((id) => id !== tabId);
  if (remainingTabIds.length === 0) {
    const newCol = splitLeft ? sourceCol : sourceCol + 1;
    return mapGridInWindow(workspace, windowId, (grid) => {
      const compacted: typeof grid.placements = [];
      for (const p of grid.placements) {
        if (p.position.row !== 0) {
          compacted.push(p);
          continue;
        }
        if (p.position.col === actualSourceCol) continue;
        if (p.position.col > actualSourceCol) {
          compacted.push({ ...p, position: { ...p.position, col: p.position.col - 1 } });
        } else {
          compacted.push(p);
        }
      }
      const adjustedNewCol = newCol > actualSourceCol ? newCol - 1 : newCol;
      const shifted = compacted.map((p) => {
        if (p.position.row !== 0) return p;
        if (p.position.col >= adjustedNewCol) {
          return { ...p, position: { ...p.position, col: p.position.col + 1 } };
        }
        return p;
      });
      shifted.push({
        tabIds: [tabId as TabId],
        activeTabId: tabId as TabId,
        position: { row: 0, col: adjustedNewCol },
        span: { rowSpan: 1, colSpan: 1 },
      });
      const oldColDividers = grid.dividers.columns;
      const leftBound = oldColDividers[sourceCol - 1] ?? 0;
      const rightBound = oldColDividers[sourceCol] ?? 1;
      const midDivider = (leftBound + rightBound) / 2;
      const newColDividers = [...oldColDividers];
      newColDividers.splice(sourceCol, 0, midDivider);
      let removeAt = actualSourceCol + (actualSourceCol >= sourceCol ? 1 : 0);
      if (removeAt >= newColDividers.length) removeAt = newColDividers.length - 1;
      newColDividers.splice(removeAt, 1);
      return equalizeColumns({
        ...grid,
        // One column was removed (source cell emptied) and one column was
        // added — net change is 0, so cols stays the same
        cols: grid.cols,
        placements: shifted,
        dividers: {
          ...grid.dividers,
          columns: newColDividers,
        },
      });
    });
  }

  const newCol = splitLeft ? sourceCol : sourceCol + 1;

  return mapGridInWindow(workspace, windowId, (grid) => {
    const newPlacements: typeof grid.placements = [];
    for (const p of grid.placements) {
      if (p.position.row !== 0) {
        newPlacements.push(p);
        continue;
      }
      if (p.position.col === actualSourceCol) {
        let newActiveId: TabId;
        if (
          focusTabId &&
          (p.activeTabId as TabId) === (tabId as TabId) &&
          (remainingTabIds as TabId[]).includes(focusTabId as TabId)
        ) {
          newActiveId = focusTabId as TabId;
        } else {
          newActiveId = computeNewActiveId(
            p.activeTabId as TabId,
            tabId as TabId,
            remainingTabIds as TabId[],
          );
        }
        let shifted = { ...p, tabIds: remainingTabIds as TabId[], activeTabId: newActiveId };
        if (actualSourceCol >= newCol) {
          shifted.position = { ...shifted.position, col: shifted.position.col + 1 };
        }
        newPlacements.push(shifted);
      } else if (p.position.col >= newCol) {
        newPlacements.push({ ...p, position: { ...p.position, col: p.position.col + 1 } });
      } else {
        newPlacements.push(p);
      }
    }
    newPlacements.push({
      tabIds: [tabId as TabId],
      activeTabId: tabId as TabId,
      position: { row: 0, col: newCol },
      span: { rowSpan: 1, colSpan: 1 },
    });
    const oldColDividers = grid.dividers.columns;
    const leftBound = oldColDividers[sourceCol - 1] ?? 0;
    const rightBound = oldColDividers[sourceCol] ?? 1;
    const midDivider = (leftBound + rightBound) / 2;
    const newColDividers = [...oldColDividers];
    newColDividers.splice(sourceCol, 0, midDivider);
    return equalizeColumns({
      ...grid,
      cols: grid.cols + 1,
      placements: newPlacements,
      dividers: {
        ...grid.dividers,
        columns: newColDividers,
      },
    });
  });
}

export function moveTabToWindow(
  workspace: Workspace,
  tabId: string,
  targetWindowId: string,
  row: number,
  col: number,
  focusTabId?: string,
): Workspace {
  const source = findTabLocation(workspace, tabId);
  if (!source) return workspace;
  return moveTabBetweenCells(
    workspace,
    source.windowId,
    tabId,
    targetWindowId,
    row,
    col,
    undefined,
    focusTabId,
  );
}

export function activateTabInCell(
  workspace: Workspace,
  windowId: string,
  tabId: string,
): Workspace {
  return mapGridInWindow(workspace, windowId, (grid) => ({
    ...grid,
    placements: grid.placements.map((pl) => {
      if ((pl.tabIds as string[]).includes(tabId)) {
        return { ...pl, activeTabId: tabId as TabId };
      }
      return pl;
    }),
  }));
}

export function updateTabTitle(workspace: Workspace, tabId: string, title: string): Workspace {
  const tid = tabId as TabId;
  if (!workspace.tabs[tid]) return workspace;
  return {
    ...workspace,
    tabs: {
      ...workspace.tabs,
      [tid]: { ...workspace.tabs[tid], title },
    },
  };
}

export function updateTabConfig(
  workspace: Workspace,
  tabId: string,
  key: string,
  value: unknown,
): Workspace {
  const tid = tabId as TabId;
  const tab = workspace.tabs[tid];
  if (!tab) return workspace;
  return {
    ...workspace,
    tabs: {
      ...workspace.tabs,
      [tid]: { ...tab, config: { ...(tab.config || {}), [key]: value } },
    },
  };
}

export function addColumnTab(
  workspace: Workspace,
  windowId: string,
  appType?: string,
  title?: string,
  filePath?: string,
): Workspace {
  const win = workspace.windows.find((w) => w.id === windowId);
  if (!win) return workspace;

  const grid = win.grid;
  const occupiedCount = grid.placements.length;
  const totalCells = grid.rows * grid.cols;

  let result: Workspace = workspace;

  if (occupiedCount >= totalCells) {
    const splitCol = grid.cols - 1;
    result = insertGridColumn(result, windowId, splitCol);
  }

  const updatedGrid = result.windows.find((w) => w.id === windowId)!.grid;

  for (let col = 0; col < updatedGrid.cols; col++) {
    const occupied = updatedGrid.placements.some(
      (p) => p.position.row === 0 && p.position.col === col,
    );
    if (!occupied) {
      const tabId = makeTabId();
      const config: Record<string, unknown> = {};
      if (filePath) config.filePath = filePath;
      const tab = makeTab(
        tabId,
        appType ?? "terminal",
        title || (appType?.replace("-", " ") ?? "Terminal"),
        config,
      );
      result = registerTab(result, tab);
      return addTabToCell(result, windowId, tab, 0, col);
    }
  }

  return result;
}

export function addColumnTabAt(
  workspace: Workspace,
  windowId: string,
  appType?: string,
  title?: string,
  filePath?: string,
  targetCol?: number,
): Workspace {
  if (targetCol === undefined || targetCol < 0) {
    return addColumnTab(workspace, windowId, appType, title, filePath);
  }

  let result = workspace;
  const win = result.windows.find((w) => w.id === windowId);
  if (!win) return result;

  if (targetCol >= win.grid.cols) {
    result = resizeGrid(result, windowId, 1, targetCol + 1);
  }

  const tabId = makeTabId();
  const config: Record<string, unknown> = {};
  if (filePath) config.filePath = filePath;
  const tab = makeTab(
    tabId,
    appType ?? "terminal",
    title || (appType?.replace("-", " ") ?? "Terminal"),
    config,
  );
  result = registerTab(result, tab);
  return addTabToCell(result, windowId, tab, 0, targetCol);
}

export function removeColumnTab(workspace: Workspace, windowId: string, tabId: string): Workspace {
  return removeTabFromCell(workspace, windowId, tabId);
}
