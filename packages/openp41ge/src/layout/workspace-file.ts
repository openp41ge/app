/**
 * Workspace file (v2) — manifest + session conversion.
 *
 * The `.openp41ge-workspace` file is the single source of truth for a workspace:
 * it carries the manifest (name, repos, dataDir) AND the session that used to be
 * the global `workspace.json` (the workspace's windows, grid layouts, and shared
 * sidebar state).
 *
 * This module is pure (no I/O, no Electron) and holds:
 *   - `WORKSPACE_FILE_VERSION`
 *   - v1 → v2 migration (`migrateWorkspaceFileData`)
 *   - conversion between the in-memory layout `Workspace` and the file's session
 *     (`workspaceToFileData` / `fileDataToWorkspace`)
 *   - JSON serialize/deserialize helpers
 *
 * Kept separate from `layout/serialization.ts` (which is the legacy global
 * workspace.json serialization, being retired).
 */

import type { Workspace, WorkspaceFileData, Window } from "./types.js";
import { WorkspaceSchema } from "./types.js";

/** Current workspace-file format version. */
export const WORKSPACE_FILE_VERSION = 2;

/** The shared sidebar section of a workspace file. */
export type SharedSidebars = NonNullable<WorkspaceFileData["sharedSidebars"]>;

/** The session portion of a workspace file, as a plain object. */
export interface WorkspaceSession {
  systemTabs: Workspace["systemTabs"];
  editorTabs: Workspace["editorTabs"];
  tabGroups: Workspace["tabGroups"];
  scopedFolders: Workspace["scopedFolders"];
  sharedSidebars: SharedSidebars;
  windows: Window[];
}

/** An empty shared-sidebar block (no tabs, both sidebars closed). */
export function emptySharedSidebars(): SharedSidebars {
  return {
    leftSidebarTabs: [],
    rightSidebarTabs: [],
    leftSidebarOpen: false,
    rightSidebarOpen: false,
  };
}

/** Build an empty session for a freshly created workspace. */
export function emptyWorkspaceSession(): WorkspaceSession {
  return {
    systemTabs: {},
    editorTabs: {},
    tabGroups: {},
    scopedFolders: [],
    sharedSidebars: emptySharedSidebars(),
    windows: [],
  };
}

/**
 * Migrate any raw workspace-file JSON to the current v2 shape, filling defaults
 * for the manifest-only (v1) and partial inputs. Never throws.
 */
export function migrateWorkspaceFileData(raw: unknown): WorkspaceFileData {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<WorkspaceFileData>;
  return {
    ...obj,
    id: obj.id ?? "",
    version: WORKSPACE_FILE_VERSION,
    createdAt: obj.createdAt ?? new Date().toISOString(),
    dataDir: obj.dataDir ?? "",
    repos: obj.repos ?? [],
    systemTabs: obj.systemTabs ?? {},
    editorTabs: obj.editorTabs ?? {},
    tabGroups: obj.tabGroups ?? {},
    scopedFolders: obj.scopedFolders ?? [],
    sharedSidebars: obj.sharedSidebars ?? emptySharedSidebars(),
    windows: obj.windows ?? [],
  } as WorkspaceFileData;
}

/** Extract the session (shared + per-window state) from a layout Workspace. */
export function extractWorkspaceSession(ws: Workspace): WorkspaceSession {
  return {
    systemTabs: { ...(ws.systemTabs ?? {}) },
    editorTabs: { ...(ws.editorTabs ?? {}) },
    tabGroups: { ...(ws.tabGroups ?? {}) },
    scopedFolders: [...(ws.scopedFolders ?? [])],
    sharedSidebars: deriveSharedSidebars(ws),
    windows: ws.windows.map((w) => structuredClone(w)),
  };
}

/**
 * Derive the shared sidebar block from a layout workspace. Sidebars now hold
 * their shared set/side/open state directly on `Workspace.sidebar`.
 */
function deriveSharedSidebars(ws: Workspace): SharedSidebars {
  const shared = ws.sidebar;
  return {
    leftSidebarTabs: [...shared.leftSidebarTabs],
    rightSidebarTabs: [...shared.rightSidebarTabs],
    leftSidebarOpen: shared.leftSidebarOpen,
    rightSidebarOpen: shared.rightSidebarOpen,
  };
}

/**
 * Produce a full v2 workspace-file object by merging a manifest (the existing
 * `.openp41ge-workspace` content) with the session extracted from a layout
 * `Workspace`. The manifest wins for identity/name/repos; session fields are
 * replaced by the workspace's current state.
 */
export function workspaceToFileData(
  workspace: Workspace,
  manifest: WorkspaceFileData,
): WorkspaceFileData {
  const base = migrateWorkspaceFileData(manifest);
  const session = extractWorkspaceSession(workspace);
  return {
    ...base,
    version: WORKSPACE_FILE_VERSION,
    systemTabs: session.systemTabs,
    editorTabs: session.editorTabs,
    tabGroups: session.tabGroups,
    scopedFolders: session.scopedFolders,
    sharedSidebars: session.sharedSidebars,
    windows: session.windows,
  };
}

/**
 * Rebuild a layout `Workspace` from a workspace-file's session. The manifest
 * fields (repos/name/dataDir) are ignored — the returned Workspace carries only
 * layout state (windows, tabs, sidebars).
 */
export function fileDataToWorkspace(data: WorkspaceFileData): Workspace {
  const migrated = migrateWorkspaceFileData(data);
  const shared = migrated.sharedSidebars ?? emptySharedSidebars();
  return WorkspaceSchema.parse({
    id: data.id,
    windows: migrated.windows ?? [],
    editorTabs: (migrated.editorTabs ?? {}) as Workspace["editorTabs"],
    systemTabs: (migrated.systemTabs ?? {}) as Workspace["systemTabs"],
    tabGroups: (migrated.tabGroups ?? {}) as Workspace["tabGroups"],
    scopedFolders: migrated.scopedFolders ?? [],
    sidebar: {
      leftSidebarTabs: [...(shared.leftSidebarTabs ?? [])],
      rightSidebarTabs: [...(shared.rightSidebarTabs ?? [])],
      leftSidebarOpen: shared.leftSidebarOpen ?? false,
      rightSidebarOpen: shared.rightSidebarOpen ?? false,
    },
  }) as Workspace;
}

/** Serialize a workspace-file object to JSON. */
export function serializeWorkspaceFile(data: WorkspaceFileData): string {
  return JSON.stringify(migrateWorkspaceFileData(data));
}

/** Parse a workspace-file JSON string, migrating to the current version. */
export function deserializeWorkspaceFile(json: string): WorkspaceFileData {
  return migrateWorkspaceFileData(JSON.parse(json));
}
