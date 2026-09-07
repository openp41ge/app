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
  btn.title = tooltip;
  btn.textContent = "⚙";
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
    fontSize: "14px",
    lineHeight: "1",
    cursor: "pointer",
    flexShrink: "0",
  });
  btn.addEventListener("mouseenter", () => {
    btn.style.color = "var(--text-primary,#ccc)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.color = "var(--text-secondary,#999)";
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
  return btn;
}
