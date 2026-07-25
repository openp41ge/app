/**
 * TabActivationHistory — per-window back/forward tab navigation.
 *
 * Maintains a navigation stack per window ID, similar to a browser's
 * back/forward history. The stack is capped at 50 entries per window
 * to avoid unbounded memory growth.
 *
 * API:
 *   pushActivation(windowId, tabId) — record a tab activation
 *   goBack(windowId) → tabId | null — navigate back
 *   goForward(windowId) → tabId | null — navigate forward
 *   canGoBack(windowId) → boolean
 *   canGoForward(windowId) → boolean
 */

const MAX_HISTORY = 50;

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
   * there's no history to go back to.
   */
  goBack(winId: string): string | null {
    const h = _histories.get(winId);
    if (!h || h.backStack.length === 0) return null;

    const prevTabId = h.backStack.pop()!;

    // Push current tab onto forward stack
    if (h.currentTabId !== null) {
      h.forwardStack.push(h.currentTabId);
    }

    h.currentTabId = prevTabId;
    return prevTabId;
  },

  /**
   * Navigate forward to the next tab. Returns the tab ID or null if
   * there's no forward history.
   */
  goForward(winId: string): string | null {
    const h = _histories.get(winId);
    if (!h || h.forwardStack.length === 0) return null;

    const nextTabId = h.forwardStack.pop()!;

    // Push current tab onto back stack
    if (h.currentTabId !== null) {
      h.backStack.push(h.currentTabId);
    }

    h.currentTabId = nextTabId;
    return nextTabId;
  },

  canGoBack(winId: string): boolean {
    const h = _histories.get(winId);
    return h ? h.backStack.length > 0 : false;
  },

  canGoForward(winId: string): boolean {
    const h = _histories.get(winId);
    return h ? h.forwardStack.length > 0 : false;
  },

  /**
   * Get the current tab ID for a window, if any.
   */
  getCurrent(winId: string): string | null {
    const h = _histories.get(winId);
    return h ? h.currentTabId : null;
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
