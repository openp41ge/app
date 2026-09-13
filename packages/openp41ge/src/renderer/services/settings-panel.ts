/**
 * createSettingsPanel — minimal placeholder settings surface.
 *
 * Renders a short description for sidebar-tab settings grid tabs that don't
 * (yet) have a bespoke settings component. The tab's name is shown by the
 * surrounding `createSettingsTabShell` top bar, so this only renders content.
 */

export function createSettingsPanel(description: string): HTMLElement {
  const root = document.createElement("div");
  root.dataset.settingsPanel = "true";
  Object.assign(root.style, {
    // Use the drawer surface's --settings-pane-padding (18px) when hosted in a
    // drawer; fall back to the panel's own 16px 14px when used as a grid tab.
    padding: "var(--settings-pane-padding, 16px 14px)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    height: "100%",
    overflowY: "auto",
    boxSizing: "border-box",
  });

  const p = document.createElement("p");
  p.textContent = description;
  Object.assign(p.style, {
    fontSize: "12px",
    margin: "0",
    color: "var(--text-muted,#888)",
  });

  const note = document.createElement("p");
  note.textContent = "Settings for this panel are not configured yet.";
  Object.assign(note.style, {
    fontSize: "11px",
    margin: "0",
    fontStyle: "italic",
    color: "var(--text-muted,#888)",
  });

  root.append(p, note);
  return root;
}

/**
 * createSettingsTabShell — wraps a settings tab's content in a consistent
 * chrome: a top bar showing the tab's name and an empty bottom bar.
 *
 * The shell is a flex column: [top bar (42px), body (flex:1), bottom bar
 * (24px)]. The body hosts `content`, which is expected to fill it (e.g. a
 * settings custom element whose `:host` is `height:100%`). The bottom bar is
 * intentionally empty.
 */
export function createSettingsTabShell(label: string, content: HTMLElement): HTMLElement {
  const root = document.createElement("div");
  root.dataset.settingsTabShell = "true";
  Object.assign(root.style, {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: "0",
    boxSizing: "border-box",
    background: "var(--bg-primary, #161616)",
  });

  const topBar = document.createElement("div");
  topBar.dataset.topBar = "true";
  Object.assign(topBar.style, {
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    height: "43px",
    padding: "0 14px",
    borderBottom: "1px solid var(--divider,#333)",
    background: "var(--bg-secondary, #161616)",
    boxSizing: "border-box",
  });

  const title = document.createElement("span");
  title.textContent = label;
  Object.assign(title.style, {
    fontSize: "11px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-secondary,#999)",
  });
  topBar.appendChild(title);

  const body = document.createElement("div");
  Object.assign(body.style, {
    flex: "1 1 auto",
    minHeight: "0",
    overflow: "hidden",
    position: "relative",
  });
  body.appendChild(content);

  const bottomBar = document.createElement("div");
  bottomBar.dataset.bottomBar = "true";
  Object.assign(bottomBar.style, {
    flexShrink: "0",
    height: "34px",
    borderTop: "1px solid var(--divider,#333)",
    background: "var(--bg-secondary, #161616)",
    boxSizing: "border-box",
  });

  root.append(topBar, body, bottomBar);
  return root;
}
