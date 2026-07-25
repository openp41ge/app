/**
 * Serialization — convert workspace to/from JSON.
 */

import type { Workspace } from "./types.js";
import { WorkspaceSchema } from "./types.js";
import { removeEmptyPlacements } from "./grid-operations.js";

/**
 * Migrate a workspace JSON object from the old format (with worksets on windows)
 * to the new format (grid/sidebar directly on window).
 *
 * Old format (pre-2025-07):
 *   window: { id, bounds, monitor, worksets: [{ id, name, grid, sidebar, repoRefs }] }
 *
 * New format:
 *   window: { id, bounds, monitor, grid, sidebar, repoRefs }
 */
function migrateWorkspace(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return obj;

  const migrated = { ...obj };

  if (Array.isArray(migrated.windows)) {
    migrated.windows = migrated.windows.map((win: Record<string, unknown>) => {
      // Already in new format — has grid directly
      if (win.grid) return win;

      // Old format — migrate from worksets
      const worksets = win.worksets as Array<Record<string, unknown>> | undefined;
      if (worksets && worksets.length > 0) {
        const first = worksets[0];
        const { worksets: _ws, ...rest } = win;
        return {
          ...rest,
          grid: first.grid ?? {
            id: `grid-${win.id}`,
            rows: 1,
            cols: 1,
            placements: [],
            dividers: { columns: [], rows: [] },
          },
          sidebar: first.sidebar ?? { activeViewId: null, width: 280 },
          repoRefs: first.repoRefs ?? [],
        };
      }

      // No worksets and no grid — create empty grid
      const { worksets: _ws, ...rest } = win;
      return {
        ...rest,
        grid: {
          id: `grid-${win.id}`,
          rows: 1,
          cols: 1,
          placements: [],
          dividers: { columns: [], rows: [] },
        },
        sidebar: { activeViewId: null, width: 280 },
        repoRefs: [],
      };
    });
  }

  return migrated;
}

/**
 * Strip all preview tabs from the workspace before serialization.
 * Preview tabs (isPreview: true) are ephemeral — they should not survive
 * app restarts. Only pinned tabs should persist.
 *
 * Returns a new Workspace object (does not mutate the original).
 * If a placement loses all its tabs, it becomes an empty cell.
 */
export function stripPreviewTabs(workspace: Workspace): Workspace {
  // Collect preview tab IDs
  const previewTabIds = new Set<string>();
  const tabsRecord = workspace.tabs as Record<string, { isPreview?: boolean }>;
  for (const [tabId, tab] of Object.entries(tabsRecord)) {
    if (tab.isPreview) {
      previewTabIds.add(tabId);
    }
  }

  if (previewTabIds.size === 0) {
    return workspace;
  }

  // Clone the workspace structure, stripping empty placements
  const cleaned: Workspace = {
    ...workspace,
    windows: workspace.windows.map((win) => {
      const grid = {
        ...win.grid,
        placements: win.grid.placements.map((pl) => {
          const remainingTabIds = pl.tabIds.filter((id) => !previewTabIds.has(id));

          // If all tabs were preview tabs, the placement becomes empty
          if (remainingTabIds.length === 0) {
            return {
              ...pl,
              tabIds: [],
              activeTabId: undefined,
            };
          }

          // If the active tab was a preview, activate the first remaining tab
          const newActiveTabId =
            pl.activeTabId && previewTabIds.has(pl.activeTabId)
              ? remainingTabIds[0]
              : pl.activeTabId;

          return {
            ...pl,
            tabIds: remainingTabIds,
            activeTabId: newActiveTabId,
          };
        }),
      };
      return { ...win, grid: removeEmptyPlacements(grid) };
    }),
    tabs: Object.fromEntries(
      Object.entries(workspace.tabs).filter(([id]) => !previewTabIds.has(id)),
    ),
  };

  return cleaned;
}

export function serialize(workspace: Workspace): string {
  const cleaned = stripPreviewTabs(workspace);
  return JSON.stringify(cleaned);
}

export function deserialize(json: string): Workspace {
  const parsed = JSON.parse(json);
  const migrated = migrateWorkspace(parsed);
  return WorkspaceSchema.parse(migrated);
}
