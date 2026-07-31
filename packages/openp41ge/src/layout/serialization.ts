/**
 * Serialization — convert workspace to/from JSON.
 */

import type { Workspace, SystemTabId } from "./types.js";
import { WorkspaceSchema } from "./types.js";
import { removeEmptyPlacements } from "./grid-operations.js";

/**
 * Migrate a workspace JSON object from old formats to the current format.
 *
 * Old format (pre-2025-07):
 *   window: { id, bounds, monitor, worksets: [{ id, name, grid, sidebar, repoRefs }] }
 *
 * Old field name (pre-2026-07):
 *   workspace.tabs → workspace.editorTabs
 */
function migrateWorkspace(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return obj;

  const migrated = { ...obj };

  // Backward compat: rename `tabs` to `editorTabs` if old format
  if ("tabs" in migrated && !("editorTabs" in migrated)) {
    migrated.editorTabs = migrated.tabs;
    delete migrated.tabs;
  }

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
 * Strip all preview, ephemeral tabs, and unpinned system tabs from the
 * workspace before serialization. Only pinned tabs (both editor and system)
 * should survive app restarts.
 *
 * Returns a new Workspace object (does not mutate the original).
 */
export function stripPreviewTabs(workspace: Workspace): Workspace {
  // Collect preview and ephemeral editor tab IDs to strip
  const idsToStrip = new Set<string>();
  const editorTabsRecord = workspace.editorTabs as Record<string, { isPreview?: boolean }>;
  for (const [tabId, tab] of Object.entries(editorTabsRecord)) {
    if (tab.isPreview) {
      idsToStrip.add(tabId);
    }
  }

  // Collect unpinned system tab IDs to strip
  const systemTabsToStrip = new Set<string>();
  const sysTabsRecord = workspace.systemTabs as Record<string, { pinned?: boolean }> | undefined;
  if (sysTabsRecord) {
    for (const [tabId, tab] of Object.entries(sysTabsRecord)) {
      if (!tab.pinned) {
        systemTabsToStrip.add(tabId);
      }
    }
  }

  // Clone the workspace structure
  let result: Workspace = { ...workspace };

  // Strip editor tabs and empty placements
  if (idsToStrip.size > 0) {
    result = {
      ...result,
      windows: result.windows.map((win) => {
        const grid = {
          ...win.grid,
          placements: win.grid.placements.map((pl) => {
            const remainingTabIds = pl.tabIds.filter((id) => !idsToStrip.has(id));

            if (remainingTabIds.length === 0) {
              return { ...pl, tabIds: [], activeTabId: undefined };
            }

            const newActiveTabId =
              pl.activeTabId && idsToStrip.has(pl.activeTabId)
                ? remainingTabIds[0]
                : pl.activeTabId;

            return { ...pl, tabIds: remainingTabIds, activeTabId: newActiveTabId };
          }),
        };
        return { ...win, grid: removeEmptyPlacements(grid) };
      }),
      editorTabs: Object.fromEntries(
        Object.entries(result.editorTabs).filter(([id]) => !idsToStrip.has(id)),
      ),
    };
  }

  // Strip unpinned system tabs
  if (systemTabsToStrip.size > 0) {
    // Rebuild the systemTabs record without unpinned tabs
    const remainingSysTabs: Record<string, unknown> = {};
    for (const id of Object.keys(result.systemTabs)) {
      if (!systemTabsToStrip.has(id)) {
        remainingSysTabs[id] = result.systemTabs[id as SystemTabId];
      }
    }

    // Also remove unpinned system tab IDs from window sidebar lists
    const cleanedWindows = result.windows.map((win) => ({
      ...win,
      sidebar: {
        ...(win.sidebar ?? {}),
        leftSidebarTabs: ((win.sidebar?.leftSidebarTabs ?? []) as string[]).filter(
          (id: string) => !systemTabsToStrip.has(id),
        ),
        rightSidebarTabs: ((win.sidebar?.rightSidebarTabs ?? []) as string[]).filter(
          (id: string) => !systemTabsToStrip.has(id),
        ),
        activeLeftTab:
          win.sidebar?.activeLeftTab && systemTabsToStrip.has(win.sidebar.activeLeftTab as string)
            ? null
            : win.sidebar?.activeLeftTab ?? null,
        activeRightTab:
          win.sidebar?.activeRightTab && systemTabsToStrip.has(win.sidebar.activeRightTab as string)
            ? null
            : win.sidebar?.activeRightTab ?? null,
      },
    }));

    result = {
      ...result,
      systemTabs: remainingSysTabs,
      windows: cleanedWindows,
    } as unknown as Workspace;
  }

  return result;
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
