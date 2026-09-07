/**
 * Cmd+W target resolution — pure helper, no window/DOM dependency.
 *
 * Decides what a Cmd+W press should do for a given workspace window:
 *   - close the next grid tab in **activation-history** order (most-recently
 *     activated first), or
 *   - close the window once no grid tabs remain.
 *
 * Sidebar (system) tabs are NEVER candidates — Cmd+W only ever targets tabs
 * that live in the window's grid placements.
 */

import type { Workspace } from "../../layout/types";
import { TabActivationHistory } from "./tab-activation-history";

export type CmdWTarget = { kind: "close-tab"; tabId: string } | { kind: "close-window" };

/**
 * Resolve the Cmd+W action for a workspace window.
 *
 * Prefers the window's activation history (via `TabActivationHistory`),
 * closing the most-recently-activated tab that is still open. When the
 * history is empty (e.g. a restored workspace that hasn't been activated
 * yet this session), it falls back to closing the last grid tab (rightmost
 * column, last tab) so Cmd+W still does something sensible. Returns `null`
 * when the workspace or window is unknown (nothing to do).
 */
export function resolveCmdWTarget(ws: Workspace | null, windowId: string): CmdWTarget | null {
  if (!ws) return null;
  const win = ws.windows.find((w) => w.id === windowId);
  if (!win) return null;

  // A tab is "open" when it appears in some grid placement.
  const isOpen = (tabId: string): boolean =>
    win.grid.placements.some((pl) => (pl.tabIds as string[]).includes(tabId));

  // 1. Prefer activation history — most-recently-activated open tab first.
  const openFromHistory = TabActivationHistory.getCloseCandidates(windowId).find(isOpen);
  if (openFromHistory) return { kind: "close-tab", tabId: openFromHistory };

  // 2. Fallback (empty history): close the last grid tab (rightmost column,
  //    last tab), preserving the old right-to-left behaviour.
  const gridTabIds: string[] = [];
  const placements = [...win.grid.placements].sort((a, b) => a.position.col - b.position.col);
  for (const pl of placements) {
    for (const id of pl.tabIds) gridTabIds.push(id as string);
  }

  if (gridTabIds.length === 0) return { kind: "close-window" };
  return { kind: "close-tab", tabId: gridTabIds[gridTabIds.length - 1] };
}
