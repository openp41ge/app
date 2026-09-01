/**
 * Integration test: the `tooltipContent` Lit directive on real elements drives
 * the real TooltipHost (appended to document.body) — variant selection, content,
 * and ARIA wiring through the whole pipeline.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { html, LitElement } from "lit";
import { tooltipContent } from "../../src/components/tooltip/tooltip-directive";
import { tooltipController } from "../../src/components/tooltip/tooltip-controller";
import { Openp41geTooltipHost } from "../../src/components/tooltip/tooltip-host";

class TooltipDemoHost extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }
  render() {
    return html`
      <button
        data-tooltip
        ${tooltipContent({
          type: "detail",
          title: "Workspaces",
          subtitle: "Open the Workspaces overlay.",
        })}
      >
        workspaces
      </button>
      <span data-other ${tooltipContent({ type: "simple", text: "Save" })}>save</span>
    `;
  }
}
customElements.define("tooltip-demo-host", TooltipDemoHost);

describe("tooltipContent directive (integration)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Openp41geTooltipHost.instance = null;
    tooltipController._host = null; // reset singleton so it lazily creates a fresh host
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    Openp41geTooltipHost.instance = null;
    tooltipController._host = null;
  });

  test("hovering a tooltip-bound element shows the matching popup in the mounted host, and leaving hides it", async () => {
    const host = new TooltipDemoHost();
    document.body.appendChild(host);
    await host.updateComplete;

    const btn = host.querySelector("[data-tooltip]")!;
    btn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(120);
    await Promise.resolve();

    const hostEl = Openp41geTooltipHost.instance;
    expect(hostEl).not.toBeNull();
    const popup = hostEl!.querySelector("openp41ge-tooltip-detail");
    expect(popup).not.toBeNull();
    expect(popup!.textContent).toContain("Workspaces");
    expect(popup!.getAttribute("role")).toBe("tooltip");
    expect(btn.getAttribute("aria-describedby")).toBe(popup!.id);
    expect(btn.style.pointerEvents).not.toBe("none");

    // Leave → faded out + aria cleared.
    btn.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(61);
    expect(btn.getAttribute("aria-describedby")).toBeNull();
  });

  test("the simple variant also binds and shows", async () => {
    const host = new TooltipDemoHost();
    document.body.appendChild(host);
    await host.updateComplete;

    const span = host.querySelector("[data-other]")!;
    span.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(120);
    await Promise.resolve();

    const hostEl = Openp41geTooltipHost.instance!;
    const popup = hostEl.querySelector("openp41ge-tooltip");
    expect(popup).not.toBeNull();
    expect(popup!.textContent).toContain("Save");
  });
});
