/**
 * createSettingsPanel — minimal placeholder settings surface.
 *
 * Renders a titled panel with a short description. Used by sidebar-tab
 * settings grid tabs that don't (yet) have a bespoke settings component, so
 * every sidebar tab can provide its own settings surface. Real controls can
 * replace this when a feature's settings are fleshed out.
 */

export function createSettingsPanel(title: string, description: string): HTMLElement {
  const root = document.createElement("div");
  root.dataset.settingsPanel = "true";
  Object.assign(root.style, {
    padding: "16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    height: "100%",
    overflowY: "auto",
    boxSizing: "border-box",
  });

  const h = document.createElement("h2");
  h.textContent = title;
  Object.assign(h.style, {
    fontSize: "14px",
    fontWeight: "600",
    margin: "0",
    color: "var(--text-primary,#ccc)",
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

  root.append(h, p, note);
  return root;
}
