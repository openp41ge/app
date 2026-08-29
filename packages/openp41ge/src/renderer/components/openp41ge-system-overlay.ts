/**
 * <openp41ge-system-overlay> — full-window "system overlay" over the main area.
 *
 * Mounted inside the window's main area (tabs + sidebars), so it covers exactly
 * that region and never the window title bar or the bottom bar. Renders a top
 * bar of REGISTERED system tabs (see SystemOverlayService.registerTab) plus the
 * active tab's controller, mounting it while the overlay is open / tab active
 * and tearing it down on switch/close.
 *
 * Each tab button gets a right-side separator and a hover background, matching
 * the editor-area system tab bar.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import type { EditorSystemTabController } from "../controllers/types";
import { systemOverlayService } from "../services/system-overlay-service";

class Openp41geSystemOverlay extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private _controllers = new Map<string, EditorSystemTabController>();
  private _activeId: string | null = null;
  private _unsub?: () => void;
  private _wasOpen = false;
  private _lastMode: "list" | "create" = "list";

  connectedCallback(): void {
    super.connectedCallback();
    this._unsub = systemOverlayService.subscribe(() => this.requestUpdate());
    document.addEventListener("keydown", this._onKeyDown);
    // The managers re-render by dispatching this event on `document`; re-run
    // the overlay render so the inner controller.render() is re-invoked.
    document.addEventListener("workspaces-tab:update", this._onManagerUpdate);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("workspaces-tab:update", this._onManagerUpdate);
    this._teardownAll();
  }

  private _onManagerUpdate = (): void => {
    this.requestUpdate();
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && systemOverlayService.isOpen) {
      e.stopPropagation();
      systemOverlayService.close();
    }
  };

  private _onBackdropClick = (e: MouseEvent): void => {
    if (e.target === e.currentTarget) systemOverlayService.close();
  };

  private _teardown(id: string): void {
    const c = this._controllers.get(id);
    if (c) {
      c.unmount?.();
      this._controllers.delete(id);
    }
  }

  private _teardownAll(): void {
    for (const id of Array.from(this._controllers.keys())) this._teardown(id);
    this._activeId = null;
  }

  /**
   * Create (and mount) the controller for a tab. The workspaces controller
   * reads the current mode (list/create) from the service at creation time.
   */
  private _mountTab(id: string): void {
    const reg = systemOverlayService.getTab(id);
    if (!reg || this._controllers.has(id)) return;
    const controller = reg.createController(`overlay-${id}`);
    controller.mount?.();
    this._controllers.set(id, controller);
  }

  updated(): void {
    const open = systemOverlayService.isOpen;
    const mode = systemOverlayService.mode;
    const defaultId = systemOverlayService.defaultTabId;
    let changed = false;

    if (open) {
      const wanted = systemOverlayService.takeRequestedTab() ?? this._activeId ?? defaultId;
      if (wanted && wanted !== this._activeId) {
        if (this._activeId) this._teardown(this._activeId);
        this._activeId = wanted;
        changed = true;
      }
      if (this._activeId) {
        // Recreate the workspaces tab when its mode intent changed while open.
        if (
          this._activeId === "workspaces" &&
          mode !== this._lastMode &&
          this._controllers.has(this._activeId)
        ) {
          this._teardown(this._activeId);
          changed = true;
        }
        const had = this._controllers.has(this._activeId);
        this._mountTab(this._activeId);
        if (!had) changed = true;
      }
      const report = this._activeId ?? defaultId ?? "";
      if (systemOverlayService.activeTab !== report) {
        systemOverlayService.reportActiveTab(report);
      }
    } else if (this._wasOpen) {
      this._teardownAll();
      changed = true;
    }

    this._lastMode = mode;
    this._wasOpen = open;
    // Re-render only when something actually changed — an unconditional
    // requestUpdate() here would loop forever.
    if (changed) this.requestUpdate();
  }

  render(): TemplateResult | typeof nothing {
    if (!systemOverlayService.isOpen) return nothing;

    const tabs = systemOverlayService.registeredTabs;
    const activeId = this._activeId;
    const controller = activeId ? this._controllers.get(activeId) : undefined;

    return html`
      <style>
        openp41ge-system-overlay {
          display: block;
          position: absolute;
          inset: 0;
          z-index: 200;
        }
        .so-backdrop {
          position: absolute;
          inset: 0;
          /* Must sit above main-area children (sidebar tab-add z-index:2,
             resize notches z-index:5) since .openp41ge-main-area does not
             create its own stacking context. */
          z-index: 50;
          /* The centered two-pane body is 600px wide; paint everything left
             of it with the same background as the left list column so the
             entire left side reads as one color, and keep the right side in
             the lighter pane background. Offsets track the body centering
             (600px / 2 = 300px). */
          background: linear-gradient(
            to right,
            var(--bg-secondary, #252526) 0%,
            var(--bg-secondary, #252526) calc(50% - 300px),
            var(--bg-primary, #1e1e1e) calc(50% - 300px),
            var(--bg-primary, #1e1e1e) 100%
          );
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        /* Top bar — feature tabs (reordered/unclosed from the registry) +
           close on the right. */
        .so-topbar {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          box-sizing: border-box;
          height: 35px;
          padding: 0;
          border-bottom: 1px solid var(--divider, #333);
          background: var(--bg-secondary, #252526);
        }
        .so-topbar-inner {
          display: flex;
          align-items: stretch;
          height: 100%;
          flex: 1;
          min-width: 0;
        }
        .so-tabs {
          display: flex;
          align-items: stretch;
          gap: 0;
        }
        /* Every tab gets a right separator line. */
        .so-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 20px;
          border: none;
          border-right: 1px solid var(--divider, #333);
          background: transparent;
          color: var(--text-secondary, #999);
          font-size: 12px;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          white-space: nowrap;
          /* No focus ring — the active tab state already carries the colour. */
          outline: none;
        }
        .so-tab:focus {
          outline: none;
        }
        .so-tab:focus-visible {
          outline: none;
        }
        /* Hover background on the tab face. */
        .so-tab:hover {
          background: var(--bg-hover, #2a2a2a);
          color: var(--text-primary, #ccc);
        }
        .so-tab.active {
          color: var(--text-primary, #ccc);
          background: var(--bg-hover, #2a2a2a);
        }
        .so-topbar-close-side {
          display: flex;
          align-items: center;
          margin-left: auto;
          padding: 0 10px 0 0;
        }
        .so-tb-close {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 22px;
          height: 22px;
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-secondary, #999);
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          border: none;
        }
        .so-tb-close:hover {
          background: var(--bg-hover, #2a2a2a);
          color: var(--text-primary, #ccc);
        }
        .so-body {
          flex: 1;
          min-height: 0;
          position: relative;
        }
        .so-body-inner {
          position: absolute;
          inset: 0;
        }
        /* Hosted tab content fills the body (e.g. the app-log panel must reach
           the window bottom — no dead space below its footer). */
        .so-body-inner debug-log-panel {
          display: flex;
          position: absolute;
          inset: 0;
        }
      </style>
      <div class="so-backdrop" @click=${this._onBackdropClick}>
        <div class="so-topbar">
          <div class="so-topbar-inner">
            <div class="so-tabs">
              ${tabs.map(
                (t) => html`
                  <button
                    type="button"
                    class="so-tab${t.id === activeId ? " active" : ""}"
                    @click=${() => systemOverlayService.openTab(t.id)}
                  >
                    ${t.icon ? html`<span>${t.icon}</span>` : nothing}
                    <span>${t.label}</span>
                  </button>
                `,
              )}
            </div>
            <div class="so-topbar-close-side">
              <button
                type="button"
                class="so-tb-close"
                title="Close"
                @click=${() => systemOverlayService.close()}
              >
                <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor">
                  <path
                    d="M256-200l-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="so-body">
          <div class="so-body-inner">
            ${controller ? (controller.render() as TemplateResult) : nothing}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("openp41ge-system-overlay", Openp41geSystemOverlay);
