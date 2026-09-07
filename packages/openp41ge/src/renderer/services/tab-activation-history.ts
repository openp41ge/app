/**
 * TabActivationHistory — per-window back/forward tab navigation.
 *
 * Maintains a navigation stack per window ID, similar to a browser's
 * back/forward history. The stack is capped at MAX_HISTORY entries per
 * window to avoid unbounded memory growth.
 *
 * Closed tabs are excluded from navigation: every navigation method accepts
 * an optional `isOpen(tabId)` predicate, and closed entries are skipped (and
 * dropped) as the stacks are traversed. `remove()` / `pruneClosed()` can also
 * be used to drop a tab from the history explicitly.
 *
 * API:
 *   pushActivation(windowId, tabId)      — record a tab activation
 *   goBack(windowId, isOpen?) → tabId|null
 *   goForward(windowId, isOpen?) → tabId|null
 *   canGoBack(windowId, isOpen?) → boolean
 *   canGoForward(windowId, isOpen?) → boolean
 *   getCurrent(windowId) → tabId|null
 *   remove(windowId, tabId)              — prune a closed tab from the stacks
 *   getCloseCandidates(windowId) → string[] — activation order (current first)
 *   pruneClosed(windowId, isOpen)        — drop every not-open tab
 *   clear(windowId)
 *   _reset()
 */

import { MAX_HISTORY } from "openp41ge-constants";

type IsOpen = (tabId: string) => boolean;

interface WindowHistory {
  backStack: string[];
  forwardStack: string[];
  currentTabId: string | null;
}

const _histories = new Map<string, WindowHistory>();

function getOrCreateHistory(winId: string): WindowHistory {
  let h = _histories.get(winId);
  if (!h) {
    h = { backStack: [], forwardStack: [], currentTabId: null };
    _histories.set(winId, h);
  }
  return h;
}

export const TabActivationHistory = {
  /**
   * Record a tab activation. If the tab is different from the current one,
   * the current tab is pushed onto the back stack and the forward stack
   * is cleared (standard browser behaviour).
   *
   * Returns true if the history was modified, false if it was a no-op.
   */
  pushActivation(winId: string, tabId: string): boolean {
    const h = getOrCreateHistory(winId);

    if (h.currentTabId === tabId) {
      return false; // No-op: same tab
    }

    if (h.currentTabId !== null) {
      h.backStack.push(h.currentTabId);
      // Cap the back stack
      if (h.backStack.length > MAX_HISTORY) {
        h.backStack.shift();
      }
    }

    // Clear forward stack on new navigation
    h.forwardStack = [];
    h.currentTabId = tabId;

    return true;
  },

  /**
   * Navigate back to the previous tab. Returns the tab ID or null if
   * there's no open history to go back to. Closed entries (per `isOpen`)
   * are skipped and discarded.
   */
  goBack(winId: string, isOpen?: IsOpen): string | null {
    const h = _histories.get(winId);
    if (!h || h.backStack.length === 0) return null;

    let prevTabId: string | null = null;
    while (h.backStack.length > 0) {
      const candidate = h.backStack.pop()!;
      if (!isOpen || isOpen(candidate)) {
        prevTabId = candidate;
        break;
      }
    }
    if (prevTabId === null) return null;

    // Push current tab onto forward stack
    if (h.currentTabId !== null) {
      h.forwardStack.push(h.currentTabId);
    }

    h.currentTabId = prevTabId;
    return prevTabId;
  },

  /**
   * Navigate forward to the next tab. Returns the tab ID or null if
   * there's no open forward history. Closed entries (per `isOpen`)
   * are skipped and discarded.
   */
  goForward(winId: string, isOpen?: IsOpen): string | null {
    const h = _histories.get(winId);
    if (!h || h.forwardStack.length === 0) return null;

    let nextTabId: string | null = null;
    while (h.forwardStack.length > 0) {
      const candidate = h.forwardStack.pop()!;
      if (!isOpen || isOpen(candidate)) {
        nextTabId = candidate;
        break;
      }
    }
    if (nextTabId === null) return null;

    // Push current tab onto back stack
    if (h.currentTabId !== null) {
      h.backStack.push(h.currentTabId);
    }

    h.currentTabId = nextTabId;
    return nextTabId;
  },

  canGoBack(winId: string, isOpen?: IsOpen): boolean {
    const h = _histories.get(winId);
    if (!h || h.backStack.length === 0) return false;
    if (!isOpen) return true;
    return h.backStack.some(isOpen);
  },

  canGoForward(winId: string, isOpen?: IsOpen): boolean {
    const h = _histories.get(winId);
    if (!h || h.forwardStack.length === 0) return false;
    if (!isOpen) return true;
    return h.forwardStack.some(isOpen);
  },

  /**
   * Get the current tab ID for a window, if any.
   */
  getCurrent(winId: string): string | null {
    const h = _histories.get(winId);
    return h ? h.currentTabId : null;
  },

  /**
   * Remove a tab from the navigation history (e.g. when it is closed).
   * No-op if the tab is not present.
   */
  remove(winId: string, tabId: string): void {
    const h = _histories.get(winId);
    if (!h) return;
    if (h.currentTabId === tabId) h.currentTabId = null;
    h.backStack = h.backStack.filter((t) => t !== tabId);
    h.forwardStack = h.forwardStack.filter((t) => t !== tabId);
  },

  /**
   * Cmd+W close order — activation order, most-recently-activated first.
   * The current tab comes first, then the back stack traversed from most
   * recent to least. `isOpen` filtering (see resolveCmdWTarget) picks the
   * next tab to close while skipping closed entries. Does not mutate state.
   */
  getCloseCandidates(winId: string): string[] {
    const h = _histories.get(winId);
    if (!h) return [];

    const ordered: string[] = [];
    if (h.currentTabId !== null) ordered.push(h.currentTabId);
    for (let i = h.backStack.length - 1; i >= 0; i--) ordered.push(h.backStack[i]);
    return ordered;
  },

  /**
   * Drop every tab that is no longer open (per `isOpen`) from the stacks.
   */
  pruneClosed(winId: string, isOpen: IsOpen): void {
    const h = _histories.get(winId);
    if (!h) return;
    if (h.currentTabId !== null && !isOpen(h.currentTabId)) h.currentTabId = null;
    h.backStack = h.backStack.filter((t) => isOpen(t));
    h.forwardStack = h.forwardStack.filter((t) => isOpen(t));
  },

  /**
   * Clear all history for a window (e.g., on window close).
   */
  clear(winId: string): void {
    _histories.delete(winId);
  },

  /** Reset all state (for testing). */
  _reset(): void {
    _histories.clear();
  },
};
