/**
 * Shared drag-and-drop utility functions extracted from tab-drag-handler.ts
 * and grid-drag-handler.ts to eliminate duplication.
 */

import type { Workspace } from "../../layout/types";

/**
 * Check if the dragged tab's file path matches any tab already in the target cell.
 * If so, the dragged tab is a duplicate (same file, different tab ID) and should
 * be removed instead of moved, to prevent having two tabs for the same file in
 * the same cell.
 */
export function isSameFilePathInCell(
  ws: Workspace,
  draggedTabId: string,
  cellTabIds: string[],
): boolean {
  const draggedTab = ws.tabs[draggedTabId as keyof typeof ws.tabs];
  if (!draggedTab?.config?.filePath) return false;
  const filePath = draggedTab.config.filePath;
  for (const targetTabId of cellTabIds) {
    const targetTab = ws.tabs[targetTabId as keyof typeof ws.tabs];
    if (targetTab?.config?.filePath === filePath) return true;
  }
  return false;
}
