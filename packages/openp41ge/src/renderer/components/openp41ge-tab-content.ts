/**
 * <openp41ge-tab-content> — the content area for a single tab (Lit).
 *
 * Hosts a PaneController's view (file-editor, terminal, etc.) inside a
 * mount point div. Controller mounting/unmounting is handled via Lit
 * lifecycle (firstUpdated / updated).
 */

import { LitElement, html, nothing } from "lit";
import { property } from "lit/decorators.js";
import type { Tab } from "../../layout/types";
import type { TabController } from "../controllers/types";

// Focus style injected once per session
let _focusStyleAdded = false;

export class Openp41geTabContent extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  winId = "";

  @property({ attribute: false })
  pageId = "";

  @property({ attribute: false })
  tabData: Tab | null = null;

  @property({ attribute: false })
  controller: TabController | null = null;

  /** Callback for mousedown on the tab content (triggers drag). */
  @property({ attribute: false })
  onTabMouseDown: ((e: MouseEvent, tabId: string) => void) | null = null;

  /** Track which tab ID was mounted to detect changes. */
  private _mountedTabId: string | null = null;

  /** Track which controller was mounted to detect changes. */
  private _mountedController: TabController | null = null;

  constructor() {
    super();
    if (!_focusStyleAdded) {
      _focusStyleAdded = true;
      const style = document.createElement("style");
      style.textContent = `
        openp41ge-tab-content { display:flex; flex:1; min-height:0; min-width:0; }
        .tab-content-wrapper:focus { outline: none; }
        .tab-content-wrapper:focus .tab-content-inner {
          outline: 1px solid rgba(74,158,255,0.08);
        }
      `;
      document.head.appendChild(style);
    }
  }

  render() {
    if (!this.tabData) return nothing;

    return html`
      <div
        class="tab-content-wrapper"
        style="display:flex;flex-direction:column;width:100%;height:100%;position:relative;"
        tabindex="0"
        data-tab-id=${this.tabData.id}
        data-app-type=${this.tabData.appType}
        data-pane-id=${this.tabData.id}
        @mousedown=${(e: MouseEvent) => {
          if (this.onTabMouseDown && this.tabData) {
            this.onTabMouseDown(e, this.tabData.id);
          }
        }}
      >
        <div
          class="tab-content-inner"
          style="flex:1;min-height:0;overflow:hidden;position:relative;"
        ></div>
      </div>
    `;
  }

  firstUpdated(): void {
    this._syncController();
  }

  updated(changedProperties: Map<string, unknown>): void {
    // Determine if we need to re-sync the controller.
    // NOTE: firstUpdated() runs before updated() in the same update cycle,
    // so on the first mount the controller is already mounted by firstUpdated().
    // Don't unmount + re-mount it — just skip if already current.
    const controllerChanged =
      changedProperties.has("controller") && this.controller !== this._mountedController;

    const tabChanged = changedProperties.has("tabData") && this.tabData?.id !== this._mountedTabId;

    if (controllerChanged || tabChanged) {
      // Unmount previous controller before re-mounting
      if (this._mountedController) {
        this._mountedController.unmount();
        this._mountedController = null;
        this._mountedTabId = null;
      }
      this._syncController();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._mountedController) {
      this._mountedController.unmount();
      this._mountedController = null;
      this._mountedTabId = null;
    }
  }

  private _syncController(): void {
    if (!this.controller || !this.tabData) return;

    const mountPoint = this.querySelector(".tab-content-inner") as HTMLElement | null;
    if (!mountPoint) return;

    // If same controller + same tab ID, skip
    if (this._mountedController === this.controller && this._mountedTabId === this.tabData.id) {
      return;
    }

    // Remove all children to clean up any pending Lit updates.
    // Using replaceChildren() properly triggers disconnectedCallback on
    // each removed element, allowing Lit to cancel pending updates.
    mountPoint.replaceChildren();
    this.controller.mount(mountPoint);
    this._mountedController = this.controller;
    this._mountedTabId = this.tabData.id;
  }

  /** Get the Openp41geBottomBar element for this tab. */
  get bottomBar(): HTMLElement | null {
    return this.querySelector("openp41ge-bottom-bar");
  }
}

customElements.define("openp41ge-tab-content", Openp41geTabContent);
