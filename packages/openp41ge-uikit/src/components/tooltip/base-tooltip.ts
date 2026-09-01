/**
 * Shared light-DOM base for tooltip panel variants.
 *
 * Both `<openp41ge-tooltip>` and `<openp41ge-tooltip-detail>` extend this so
 * they present the same host-facing contract (a single render surface the
 * TooltipHost can create, position and fade). Light DOM (no shadow root) keeps
 * the popup host-agnostic and lets the host manage its box via inline styles.
 */
import { LitElement } from "lit";

export abstract class BaseTooltip extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }
}
