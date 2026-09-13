/**
 * SettingsDrawerOpenHandler — opens a settings surface into the "negative
 * drawer" host, so it slides out from the sidebar edge OVER the grid instead of
 * opening as a grid tab.
 *
 * EXPERIMENTAL: this is the new settings-drawer path. It is wired in alongside
 * (not instead of) the existing grid-tab SettingsOpenHandler so the old
 * behaviour stays intact and revertible.
 *
 * The handler finds the single <openp41ge-settings-drawer-host> mounted inside
 * the window's grid area, sets the anchor side (from the clicked sidebar's
 * settings button), and opens the matching surface as the base drawer layer.
 *
 * Single-pane settings reuse the same settings components the grid tab shell
 * renders, wrapped in a generic <openp41ge-settings-surface>. The Agents
 * surface is bespoke because it nests sub-drawers (provider → model).
 */

import { createLogger } from "openp41ge-logger";
import { Openp41geSettingsDrawerHost } from "../components/openp41ge-settings-drawer-host";
import { Openp41geAgentSettingsDrawer } from "../components/openp41ge-agent-settings-drawer";
import { Openp41geSettingsSurface } from "../components/openp41ge-settings-surface";
import { createSettingsPanel } from "./settings-panel";

const log = createLogger("openp41ge", "settings-drawer-open-handler");

/** Build a single-pane settings surface for a tab using its existing settings
 * component (or placeholder panel). */
function singleSettingsSurface(
  label: string,
  content: HTMLElement,
  appType: string,
): Openp41geSettingsSurface {
  const surface = new Openp41geSettingsSurface(label, content);
  surface.appType = appType;
  return surface;
}

export class SettingsDrawerOpenHandler {
  handleOpenDrawer(e: CustomEvent): void {
    const detail = (e.detail ?? {}) as { appType?: string; title?: string; side?: string };
    const appType = detail.appType;
    if (!appType) return;

    const host = document.querySelector("openp41ge-settings-drawer-host");
    if (!(host instanceof Openp41geSettingsDrawerHost)) {
      log.warn("settings drawer host not mounted; skipping drawer open");
      return;
    }

    // Determine the anchor side FIRST so the toggle can target the correct
    // stack. Only one drawer is open at a time; opening on the other side
    // closes whichever drawer is currently shown.
    const side = detail.side === "left" ? "left" : "right";

    // Toggle: if this is the same surface that is ALREADY the open top-level
    // drawer, pressing its gear again closes it instead of re-opening it.
    if (host.isOpenFor(appType, side)) {
      host.closeSide(side);
      return;
    }

    host.side = side;

    switch (appType) {
      case "agent": {
        const surface = new Openp41geAgentSettingsDrawer();
        surface.appType = "agent";
        host.openSurface(surface, side);
        break;
      }
      case "file-editor-settings": {
        host.openSurface(
          singleSettingsSurface(
            detail.title ?? "Explorer",
            document.createElement("openp41ge-file-editor-settings"),
            appType,
          ),
          side,
        );
        break;
      }
      case "logs-settings": {
        host.openSurface(
          singleSettingsSurface(
            detail.title ?? "Logs",
            document.createElement("openp41ge-logs-settings"),
            appType,
          ),
          side,
        );
        break;
      }
      case "git-settings": {
        host.openSurface(
          singleSettingsSurface(
            detail.title ?? "History",
            createSettingsPanel("Configure the History panel."),
            appType,
          ),
          side,
        );
        break;
      }
      default:
        log.warn(`no drawer surface registered for appType "${appType}"`);
    }
  }
}
