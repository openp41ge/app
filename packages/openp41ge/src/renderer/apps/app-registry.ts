/**
 * AppTypeRegistration registry — maps app type IDs to controller factories.
 *
 * When a pane is created, the grid looks up the app type here and calls
 * `createController(paneId)` to get the appropriate controller.
 * If no registration exists, PlaceholderController is used as fallback.
 */

import type { AppTypeRegistration } from "../controllers/types";

const _registry = new Map<string, AppTypeRegistration>();

export function registerAppType(reg: AppTypeRegistration): void {
  _registry.set(reg.id, reg);
}

export function getAppTypeRegistration(id: string): AppTypeRegistration | undefined {
  return _registry.get(id);
}
