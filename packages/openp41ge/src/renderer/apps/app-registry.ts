/**
 * App type and system tab registries — maps type IDs to controller factories.
 *
 * Two separate registries:
 *   1. Editor app types (for the grid) — e.g., file-viewer, terminal
 *   2. System tab types (for sidebars) — e.g., explorer, git, search, projects
 *
 * When a pane is created, the grid looks up the editor app type here and calls
 * `createController(paneId)` to get the appropriate controller.
 * If no registration exists, PlaceholderController is used as fallback.
 */

import type { AppTypeRegistration, SystemTabRegistration, EditorSystemTabRegistration } from "../controllers/types";

// ─── Editor App Type Registry ─────────────────────────────────────────────

const _appRegistry = new Map<string, AppTypeRegistration>();

export function registerAppType(reg: AppTypeRegistration): void {
  _appRegistry.set(reg.id, reg);
}

export function getAppTypeRegistration(id: string): AppTypeRegistration | undefined {
  return _appRegistry.get(id);
}

// ─── System Tab Type Registry ─────────────────────────────────────────────

const _systemTabRegistry = new Map<string, SystemTabRegistration>();

export function registerSystemTabType(reg: SystemTabRegistration): void {
  _systemTabRegistry.set(reg.id, reg);
}

export function getSystemTabRegistration(id: string): SystemTabRegistration | undefined {
  return _systemTabRegistry.get(id);
}

export function getAllSystemTabRegistrations(): SystemTabRegistration[] {
  return Array.from(_systemTabRegistry.values());
}

// ─── Editor System Tab Registry ────────────────────────────────────────────

const _editorSystemTabRegistry = new Map<string, EditorSystemTabRegistration>();

export function registerEditorSystemTabType(reg: EditorSystemTabRegistration): void {
  _editorSystemTabRegistry.set(reg.appType, reg);
}

export function getEditorSystemTabRegistration(appType: string): EditorSystemTabRegistration | undefined {
  return _editorSystemTabRegistry.get(appType);
}

export function getAllEditorSystemTabRegistrations(): EditorSystemTabRegistration[] {
  return Array.from(_editorSystemTabRegistry.values());
}
