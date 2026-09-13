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
  side?: Side,
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
        detail: { appType, title, side },
      }),
    );
  });
  // Custom tooltip (replaces native title) from the data-tip attribute.
  tooltipController.attach(btn, { type: "simple", text: tooltip });
  return btn;
}

/**
 * Place footer action icons on the INSIDE edge of a sidebar (the edge facing
 * the grid/content): a left sidebar's inside edge is the RIGHT; a right
 * sidebar's is the LEFT. A flex spacer on the outer side pushes the icon
 * group inward.
 *
 * The displayed order is the same regardless of side — reading outward from
 * the innermost (grid-facing) edge it is always settings, then search — but
 * because the group is mirrored per side the DOM/visual order is reversed for
 * the left sidebar. The settings icon is always the innermost one.
 */
export function layoutFooterIcons(
  footer: HTMLElement,
  side: Side,
  buttons: HTMLElement[],
): void {
  const spacer = document.createElement("div");
  Object.assign(spacer.style, { flex: "1 1 auto" });
  if (side === "left") {
    // Inside edge = right → spacer on the far left, then the icon group reading
    // toward the inside edge. The group is reversed so the settings icon ends
    // up innermost (closest to the grid).
    footer.appendChild(spacer);
    for (const b of [...buttons].reverse()) footer.appendChild(b);
  } else {
    // Inside edge = left → icon group first (settings innermost), then spacer.
    for (const b of buttons) footer.appendChild(b);
    footer.appendChild(spacer);
  }
}

/**
 * appendSettingsButton — append a settings gear to a footer, placing it on the
 * **inside** edge relative to the sidebar side (the edge facing the grid).
 *
 * A left sidebar's inside edge is the right; a right sidebar's is the left.
 * A flex spacer pushes the gear toward whichever edge is innermost.
 */
export function appendSettingsButton(
  footer: HTMLElement,
  side: Side,
  openEvent: string,
  appType: string,
  title: string,
  tooltip: string = "Settings",
): void {
  const btn = createSettingsButton(openEvent, appType, title, tooltip, side);
  layoutFooterIcons(footer, side, [btn]);
}
