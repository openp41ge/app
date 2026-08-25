/**
 * <openp41ge-workspaces-overlay> — full workspace manager overlay.
 *
 * Mounted inside the window's main area (tabs + sidebars), so it covers
 * exactly that region and never the window title bar or the bottom bar.
 * Owns a single WorkspaceManagerModal controller, mounting it while the
 * overlay is open and tearing it down on close.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { WorkspaceManagerModal } from "../apps/system-tabs/workspace-manager-system-tab";
import { workspacesOverlayService } from "../services/workspaces-overlay-service";

class Openp41geWorkspacesOverlay extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private _controller: WorkspaceManagerModal | null = null;
  private _unsub?: () => void;
  private _wasOpen = false;
  private _wasMode: "list" | "create" = "list";

  connectedCallback(): void {
    super.connectedCallback();
    this._unsub = workspacesOverlayService.subscribe(() => this.requestUpdate());
    document.addEventListener("keydown", this._onKeyDown);
    // The manager re-renders by dispatching this event on `document`; re-run
    // the overlay render so the inner controller.render() is re-invoked.
    document.addEventListener("workspaces-tab:update", this._onManagerUpdate);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("workspaces-tab:update", this._onManagerUpdate);
    this._teardownController();
  }

  private _onManagerUpdate = (): void => {
    this.requestUpdate();
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && workspacesOverlayService.isOpen) {
      e.stopPropagation();
      workspacesOverlayService.close();
    }
  };

  private _onBackdropClick = (e: MouseEvent): void => {
    if (e.target === e.currentTarget) workspacesOverlayService.close();
  };

  private _teardownController(): void {
    if (this._controller) {
      this._controller.unmount();
      this._controller = null;
    }
  }

  updated(): void {
    const open = workspacesOverlayService.isOpen;
    const mode = workspacesOverlayService.mode;
    if (open && !this._wasOpen) {
      const c = new WorkspaceManagerModal("overlay-workspaces");
      this._controller = c;
      if (mode === "create") c.startCreate();
      else c.startList();
      c.mount();
      this.requestUpdate();
    } else if (open && this._wasOpen && mode !== this._wasMode) {
      // Switched intent while already open (e.g. File > New Workspace).
      if (mode === "create") this._controller?.startCreate();
      else this._controller?.startList();
      this.requestUpdate();
    } else if (!open && this._wasOpen) {
      this._teardownController();
    }
    this._wasOpen = open;
    this._wasMode = mode;
  }

  render(): TemplateResult | typeof nothing {
    if (!workspacesOverlayService.isOpen) return nothing;

    const controller = this._controller;
    return html`
      <style>
        :host {
          display: block;
          position: absolute;
          inset: 0;
          z-index: 200;
        }
        .wm-overlay-backdrop {
          position: absolute;
          inset: 0;
          background: var(--bg-primary, #1e1e1e);
          overflow: hidden;
        }
      </style>
      <div class="wm-overlay-backdrop" @click=${this._onBackdropClick}>
        ${controller ? (controller.render() as TemplateResult) : nothing}
      </div>
    `;
  }
}

customElements.define("openp41ge-workspaces-overlay", Openp41geWorkspacesOverlay);
