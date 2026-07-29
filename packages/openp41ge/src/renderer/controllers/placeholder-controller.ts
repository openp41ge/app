/**
 * PlaceholderController — shared controller for all placeholder panes.
 *
 * Creates the same header + close button + content DOM that was previously
 * duplicated in three places (openp41ge-pane._renderPlaceholder, openp41ge-pane's
 * internal PlaceholderController, and openp41ge-grid's Openp41geGridPlaceholderController).
 *
 * This is the DEFAULT controller used when no app-specific controller exists.
 * It proves the lifecycle works end-to-end: mount() creates DOM, unmount()
 * detaches, controller survives in registry across tab switches.
 *
 * Phase 4+ will replace this with app-specific controllers (TerminalController,
 * VideoController, etc.) that extend BaseController with real functionality.
 */

import { BaseController } from "./base-controller";
import { paneHeaderButton } from "../components/pane-header-button";
import { APP_TYPES } from "../app-types";
import { getWorkspace, dispatch } from "../app";
import type { TabId } from "../../layout/types";

export class PlaceholderController extends BaseController {
  mount(container: HTMLElement): void {
    this.container = container;

    const appType = APP_TYPES.find((t) => t.id === this.appType);
    const icon = appType?.icon ?? "\u25A1";
    const label = appType?.label ?? this.appType ?? "pane";

    container.innerHTML = `
      <div class="flex items-center justify-between px-2 h-7 bg-bg-tertiary border-b border-divider shrink-0 select-none cursor-grab">
        <span class="pane-label text-xs text-secondary tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">${label}</span>
      </div>
      <div class="flex-1 flex items-center justify-center text-muted text-sm italic bg-bg-secondary">${icon}</div>
    `;
    container.className =
      "w-full h-full flex flex-col bg-gutter overflow-hidden cursor-grab";

    // Append close button via the shared component
    const headerEl = container.querySelector("div");
    if (!(headerEl instanceof HTMLElement)) return;
    headerEl.appendChild(
      paneHeaderButton({
        content: "\u00D7",
        className: "pane-close",
        title: "Close",
        onClick: () => {
          const ws = getWorkspace();
          if (!ws) return;
          for (const win of ws.windows) {
            for (const p of win.grid.placements) {
              if (p.tabIds.includes(this.tabId as TabId)) {
                dispatch("removeColumnTab", win.id, this.tabId);
                return;
              }
            }
          }
        },
      }),
    );
  }

  unmount(): void {
    this.container = null;
  }
}
