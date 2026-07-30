import { z } from "zod";

// ─── IDs ───────────────────────────────────────────────────────────────────

export const WorkspaceId = z.string().brand("WorkspaceId");
export type WorkspaceId = z.infer<typeof WorkspaceId>;

export const WindowId = z.string().brand("WindowId");
export type WindowId = z.infer<typeof WindowId>;

export const TabId = z.string().brand("TabId");
export type TabId = z.infer<typeof TabId>;

export const OverlayId = z.string().brand("OverlayId");
export type OverlayId = z.infer<typeof OverlayId>;

// ─── Rect / Bounds ─────────────────────────────────────────────────────────

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type Rect = z.infer<typeof RectSchema>;

export const BoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type Bounds = z.infer<typeof BoundsSchema>;

// ─── Tab (replaces old Pane) ───────────────────────────────────────────────

/** App type identifier — maps to a registered app type package. */
const AppTypeId = z.string();

const TabConfigSchema = z.record(z.unknown());

export const TabSchema = z.object({
  id: TabId,
  appType: AppTypeId,
  title: z.string(),
  config: TabConfigSchema.optional().default({}),
  isPreview: z.boolean().default(false),
  isEphemeral: z.boolean().default(false),
  ephemeralPinned: z.boolean().default(false),
});
export type Tab = z.infer<typeof TabSchema>;

export function createTab(
  id: string,
  appType: string,
  title: string,
  config?: Record<string, unknown>,
  isPreview: boolean = false,
  isEphemeral: boolean = false,
  ephemeralPinned: boolean = false,
): Tab {
  return TabSchema.parse({ id, appType, title, config: config ?? {}, isPreview, isEphemeral, ephemeralPinned });
}

// ─── Grid ──────────────────────────────────────────────────────────────────

/**
 * Grid is a regular matrix of cells arranged in rows and columns.
 * Each cell can hold multiple tabs (stored as tabIds[]), but only one
 * tab is active (visible) at a time — index 0 is active.
 */
const CellPositionSchema = z.object({
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
});

const CellSpanSchema = z.object({
  rowSpan: z.number().int().min(1).default(1),
  colSpan: z.number().int().min(1).default(1),
});

export const TabPlacementSchema = z.object({
  tabIds: z.array(TabId).min(1),
  activeTabId: TabId.optional(),
  position: CellPositionSchema,
  span: CellSpanSchema.default({ rowSpan: 1, colSpan: 1 }),
});
export type TabPlacement = z.infer<typeof TabPlacementSchema>;

/** Column/row divider ratios (0..1), stored per boundary between cells. */
const DividerRatiosSchema = z.object({
  columns: z.array(z.number().min(0).max(1)),
  rows: z.array(z.number().min(0).max(1)),
});

export const GridSchema = z.object({
  id: z.string(),
  rows: z.number().int().min(1),
  cols: z.number().int().min(1),
  placements: z.array(TabPlacementSchema),
  dividers: DividerRatiosSchema,
});
export type Grid = z.infer<typeof GridSchema>;

export function createGrid(id: string, rows = 1, cols = 1): Grid {
  return GridSchema.parse({
    id,
    rows,
    cols,
    placements: [],
    dividers: {
      columns: Array.from({ length: cols - 1 }, () => 0.5),
      rows: Array.from({ length: rows - 1 }, () => 0.5),
    },
  });
}

/** Helper: get the active tab ID for a cell. */
export function activeTabInCell(placement: TabPlacement): TabId {
  return placement.tabIds[0];
}

/** Helper: set the active tab ID (moves it to index 0). */
export function setActiveTabInCell(placement: TabPlacement, tabId: TabId): TabPlacement {
  const others = placement.tabIds.filter((id) => id !== tabId);
  return { ...placement, tabIds: [tabId, ...others] };
}

// ─── Overlay ───────────────────────────────────────────────────────────────

export const OverlayPositionSchema = z.union([
  z.literal("top-left"),
  z.literal("top-right"),
  z.literal("bottom-left"),
  z.literal("bottom-right"),
  z.literal("center"),
  z.object({ x: z.number(), y: z.number() }),
]);
export type OverlayPosition = z.infer<typeof OverlayPositionSchema>;

export const OverlaySchema = z.object({
  id: OverlayId,
  tab: TabSchema,
  position: OverlayPositionSchema.default("bottom-right"),
  width: z.number().positive().default(400),
  height: z.number().positive().default(300),
  opacity: z.number().min(0).max(1).default(0.95),
  zIndex: z.number().int().default(100),
});
export type Overlay = z.infer<typeof OverlaySchema>;

/** @internal Create an Overlay data object. */
export function createOverlayData(
  id: string,
  tab: Tab,
  position: OverlayPosition = "bottom-right",
): Overlay {
  return OverlaySchema.parse({ id, tab, position });
}

// ─── SidebarState ───────────────────────────────────────────────────────────────

export const SidebarStateSchema = z.object({
  activeViewId: z.string().nullable().default(null),
  width: z.number().positive().default(280),
});
export type SidebarState = z.infer<typeof SidebarStateSchema>;

// ─── RepoRef ────────────────────────────────────────────────────────────────────

export const RepoRefSchema = z.object({
  name: z.string(),
  url: z.string(),
  worktrees: z.array(z.string()).default([]),
});
export type RepoRef = z.infer<typeof RepoRefSchema>;

// ─── Window ────────────────────────────────────────────────────────────────

export const WindowSchema = z.object({
  id: WindowId,
  bounds: BoundsSchema,
  monitor: z.number().int().nonnegative().default(0),
  grid: GridSchema,
  repoRefs: z.array(RepoRefSchema).default([]),
  sidebar: SidebarStateSchema.optional().default({ activeViewId: null, width: 280 }),
  overlays: z.array(OverlaySchema).default([]),
});
export type Window = z.infer<typeof WindowSchema>;

export function createWindow(id: string, bounds?: Bounds, monitor?: number): Window {
  const grid = createGrid(id, 1, 1);
  return WindowSchema.parse({
    id,
    bounds: bounds ?? { x: 0, y: 0, width: 1280, height: 800 },
    monitor: monitor ?? 0,
    grid,
    repoRefs: [],
    sidebar: { activeViewId: null, width: 280 },
    overlays: [],
  });
}

// ─── Workspace ─────────────────────────────────────────────────────────────

export const WorkspaceSchema = z.object({
  id: WorkspaceId,
  windows: z.array(WindowSchema),
  tabs: z.record(TabId, TabSchema).default({}),
  scopedFolders: z.array(z.string()).default([]),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export function createWorkspace(id: string): Workspace {
  const window0 = createWindow(`win-${id}-0`);
  return WorkspaceSchema.parse({
    id,
    windows: [window0],
    tabs: {},
  });
}

// ─── Computed Layout ───────────────────────────────────────────────────────

/** Result of layout computation: maps tab IDs to their pixel rects. */
export type ComputedLayout = Map<TabId, Rect>;
