/**
 * <openp41ge-service-modal> — single tall modal for service views.
 *
 * Renders a full-viewport backdrop + centered panel below the titlebar.
 * The backdrop covers the entire window blocking interactions underneath,
 * except for a cutout zone for macOS traffic-light buttons (~70px left).
 * Closes on Escape key or clicking the backdrop.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { TITLEBAR_HEIGHT } from "openp41ge-constants";
import { serviceModalService } from "../services/service-modal-service";

const isMac = (() => {
  try {
    return window.openp41ge?.platform === "darwin" || navigator.platform.startsWith("Mac");
  } catch {
    return false;
  }
})();

class Openp41geServiceModal extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  private _unsub?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this._unsub = serviceModalService.subscribe(() => this.requestUpdate());
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("workspaces-tab:update", this._onUpdate);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("workspaces-tab:update", this._onUpdate);
  }

  private _onUpdate = (): void => {
    this.requestUpdate();
  };

  private _onHeaderClick(): void {
    if (serviceModalService.currentAppType === "workspace-manager") {
      document.dispatchEvent(new CustomEvent("workspace-modal:back"));
    }
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && serviceModalService.isOpen) {
      serviceModalService.closeModal();
    }
  };

  private _onBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      serviceModalService.closeModal();
    }
  }

  render(): TemplateResult | typeof nothing {
    if (!serviceModalService.isOpen) return nothing;

    const controller = serviceModalService.getController();

    return html`
      <style>
        .sm-backdrop {
          position: fixed;
          inset: 0;
          z-index: 200;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: ${TITLEBAR_HEIGHT + 20}px;
          background: rgba(0, 0, 0, 0.4);
        }
        /* Cutout zone over macOS traffic lights — lets clicks pass through */
        .sm-traffic-cutout {
          position: fixed;
          top: 0;
          left: 0;
          width: 70px;
          height: ${TITLEBAR_HEIGHT}px;
          z-index: 202;
          pointer-events: none;
        }
        .sm-panel {
          display: flex;
          flex-direction: column;
          background: var(--bg-primary, #1e1e1e);
          border: 1px solid var(--divider, #333);
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          max-width: 600px;
          min-width: 280px;
          width: calc(100% - 40px);
          height: calc(100vh - ${TITLEBAR_HEIGHT + 60}px);
          overflow: hidden;
        }
        .sm-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--divider, #333);
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, #ccc);
          flex-shrink: 0;
        }
        .sm-close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-secondary, #999);
        }
        .sm-close-btn:hover {
          background: var(--bg-hover, #2a2a2a);
          color: var(--text-primary, #ccc);
        }
        .sm-panel-content {
          flex: 1;
          overflow-y: auto;
          padding: 0;
        }
      </style>
      <div class="sm-backdrop" @click=${this._onBackdropClick}>
        <div class="sm-panel">
          <div class="sm-panel-header">
            ${this._renderTitle()}
            <span class="sm-close-btn" @click=${() => serviceModalService.closeModal()} title="Close">✕</span>
          </div>
          <div class="sm-panel-content">
            ${controller ? controller.render() as TemplateResult : nothing}
          </div>
        </div>
      </div>
      ${isMac ? html`<div class="sm-traffic-cutout"></div>` : nothing}
    `;
  }

  private _renderTitle(): TemplateResult {
    const ctrl = serviceModalService.getController();
    const title = ctrl?.title ?? "Workspaces";

    // Split title on "  >  " to create breadcrumb parts
    const parts = title.split("  >  ");

    if (parts.length <= 1) {
      return html`<span>${title}</span>`;
    }

    // Multiple parts — render as breadcrumbs with chevrons
    return html`
      <span style="display:flex;align-items:center;gap:6px;">
        ${parts.map((part, i) => {
          const isFirst = i === 0;
          return html`
            ${i > 0 ? html`
              <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" style="opacity:0.5;">
                <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
              </svg>
            ` : ''}
            <span
              style="${isFirst ? 'cursor:pointer;text-decoration:underline;text-decoration-color:var(--text-secondary,#999);' : ''}${i === parts.length - 1 ? 'font-weight:400;' : ''}${i === parts.length - 1 && part === 'Unnamed' ? 'font-style:italic;' : ''}"
              @click=${isFirst ? () => this._onHeaderClick() : undefined}
              @mouseenter=${isFirst ? (e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary,#ccc)' : undefined}
              @mouseleave=${isFirst ? (e: MouseEvent) => (e.currentTarget as HTMLElement).style.color = '' : undefined}
            >${part}</span>
          `;
        })}
      </span>
    `;
  }
}

customElements.define("openp41ge-service-modal", Openp41geServiceModal);
