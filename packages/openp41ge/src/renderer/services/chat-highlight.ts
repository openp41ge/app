/**
 * chat-highlight — highlight a chat tab's handle in this window's tab bars.
 *
 * The Chat sidebar's "Highlight" button paints the blue accent on the owning
 * window's chat tab handle (transient, ~3s, no focus/activation). The main
 * process routes `chat:highlight` to the owning window; here we resolve the
 * grid tab id for the chat and paint the matching `[data-tab-id]` handle.
 *
 * Tab handles live inside uikit custom elements' shadow roots, so we
 * deep-traverse shadow roots rather than relying on a single `document`.
 */

import { createLogger } from "openp41ge-logger";

const log = createLogger("openp41ge", "chat-highlight");

const HIGHLIGHT_MS = 3000;

/** Deep-traverse `root` (and nested shadow roots) collecting matching elements. */
function deepQueryAll(root: ParentNode | ShadowRoot, selector: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walk = (node: ParentNode | ShadowRoot): void => {
    if (!node) return;
    const matches = node.querySelectorAll(selector);
    for (const m of matches) out.push(m as HTMLElement);
    // Descend into shadow roots of custom elements.
    const elements = node.querySelectorAll("*");
    for (const el of elements) {
      const shadow = (el as HTMLElement).shadowRoot;
      if (shadow) walk(shadow);
    }
  };
  walk(root);
  return out;
}

/** Resolve the grid tab id for a chat id from the current workspace state. */
async function resolveTabId(chatId: string): Promise<string | null> {
  try {
    const stateJson = await window.openp41ge.workspace.getState();
    const ws = JSON.parse(stateJson) as {
      editorTabs?: Record<string, { appType?: string; config?: Record<string, unknown> }>;
    } | null;
    if (!ws?.editorTabs) return null;
    for (const [tabId, tab] of Object.entries(ws.editorTabs)) {
      if (tab.appType === "agents" && tab.config?.chatId === chatId) return tabId;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Paint a transient highlight on all `[data-tab-id]` handles matching `tabId`. */
export async function highlightChatTab(chatId: string): Promise<void> {
  const tabId = await resolveTabId(chatId);
  if (!tabId) {
    log.warn("no chat tab found for highlight", chatId);
    return;
  }
  const handles = deepQueryAll(document, `[data-tab-id="${tabId}"]`);
  if (handles.length === 0) return;
  for (const el of handles) {
    (el as HTMLElement).style.setProperty("--tab-highlight", "rgba(74,158,255,0.9)");
    (el as HTMLElement).style.boxShadow = "0 0 0 2px var(--tab-highlight)";
    (el as HTMLElement).style.borderRadius = "4px";
    (el as HTMLElement).style.transition = "box-shadow 0.15s ease";
  }
  setTimeout(() => {
    for (const el of handles) {
      (el as HTMLElement).style.boxShadow = "";
      (el as HTMLElement).style.borderRadius = "";
    }
  }, HIGHLIGHT_MS);
}
