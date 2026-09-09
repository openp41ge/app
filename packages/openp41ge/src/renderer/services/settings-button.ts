import { settingsIcon } from "../icons";
import { tooltipController } from "openp41ge-uikit";
import { subscribeSettingsTabState } from "./settings-tab-state";

/** Which sidebar edge a panel is docked to. */
export type Side = "left" | "right";

/**
 * createSettingsButton — a tab's own settings gear button.
 *
 * Instead of a shared global settings event, each sidebar tab builds its own
 * button with a *unique* `openEvent` and dispatches that event with the tab's
 * settings `appType` + `title`. The registered document listener for that
 * event opens the tab's own settings grid tab.
 */

export function createSettingsButton(
  openEvent: string,
  appType: string,
  title: string,
  tooltip: string = "Settings",
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", tooltip);
  btn.dataset.tip = tooltip;
  btn.innerHTML = settingsIcon(14);
  Object.assign(btn.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "18px",
    width: "18px",
    padding: "0",
    border: "none",
    borderRadius: "3px",
    background: "transparent",
    color: "var(--text-secondary,#999)",
    cursor: "pointer",
    flexShrink: "0",
  });

  const state = { active: false, hover: false };
  const applyColor = () => {
    btn.style.color = state.active || state.hover
      ? "var(--text-primary,#ccc)"
      : "var(--text-secondary,#999)";
  };

  btn.addEventListener("mouseenter", () => {
    state.hover = true;
    applyColor();
  });
  btn.addEventListener("mouseleave", () => {
    state.hover = false;
    applyColor();
  });

  // Keep the icon lit (white) while its own settings grid tab is open.
  subscribeSettingsTabState(appType, (open) => {
    state.active = open;
    applyColor();
  });

  btn.addEventListener("click", () => {
    document.dispatchEvent(
      new CustomEvent(openEvent, {
        bubbles: true,
        composed: true,
        detail: { appType, title },
      }),
    );
  });
  // Custom tooltip (replaces native title) from the data-tip attribute.
  tooltipController.attach(btn, { type: "simple", text: tooltip });
  return btn;
}

/**
 * appendSettingsButton — append a settings gear to a footer, placing it on the
 * **outside** edge relative to the sidebar side.
 *
 * A left sidebar's outside edge is the left; a right sidebar's is the right.
 * A flex `flex: 1 1 auto` spacer pushes the gear toward whichever edge is
 * outermost for the given side.
 */
export function appendSettingsButton(
  footer: HTMLElement,
  side: Side,
  openEvent: string,
  appType: string,
  title: string,
  tooltip: string = "Settings",
): void {
  const btn = createSettingsButton(openEvent, appType, title, tooltip);
  const spacer = document.createElement("div");
  Object.assign(spacer.style, { flex: "1 1 auto" });
  if (side === "left") {
    // Outside edge = left → gear first.
    footer.appendChild(btn);
    footer.appendChild(spacer);
  } else {
    // Outside edge = right → spacer first, gear last.
    footer.appendChild(spacer);
    footer.appendChild(btn);
  }
}
