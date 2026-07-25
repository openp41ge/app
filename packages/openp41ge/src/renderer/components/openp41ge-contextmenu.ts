/**
 * <openp41ge-contextmenu> — positioned context menu with optional submenus (Lit).
 */

import { LitElement, html, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import type { Openp41geContextMenuElement } from "../interfaces/element-guards";

type MenuItem = { label?: string; action?: () => void; children?: MenuItem[]; type?: "separator" };

class Openp41geContextMenu extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ type: Number }) _x = 0;
  @property({ type: Number }) _y = 0;
  @property({ attribute: false }) _items: MenuItem[] = [];
  @property({ attribute: false }) _onclose: (() => void) | null = null;

  get x(): number {
    return this._x;
  }
  set x(v: number) {
    this._x = v;
    this.requestUpdate();
  }
  get y(): number {
    return this._y;
  }
  set y(v: number) {
    this._y = v;
    this.requestUpdate();
  }
  get items(): MenuItem[] {
    return this._items;
  }
  set items(v: MenuItem[]) {
    this._items = v;
    this.requestUpdate();
  }
  get onclose(): (() => void) | null {
    return this._onclose;
  }
  set onclose(fn: (() => void) | null) {
    this._onclose = fn;
  }

  private _clickHandler: ((e: MouseEvent) => void) | null = null;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._clickHandler = (e: MouseEvent) => {
      if (!this.contains(e.target as Node)) this.cleanup();
    };
    this._keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") this.cleanup();
    };
    setTimeout(() => {
      if (this._clickHandler) document.addEventListener("click", this._clickHandler);
      if (this._keyHandler) document.addEventListener("keydown", this._keyHandler);
    }, 0);
  }

  updated(): void {
    // Reposition if menu would overflow viewport
    const menuEl = this.querySelector(":scope > div");
    if (!menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    const pad = 8;
    let dx = 0;
    let dy = 0;
    if (rect.right > window.innerWidth - pad) {
      dx = window.innerWidth - pad - rect.right;
    }
    if (rect.bottom > window.innerHeight - pad) {
      dy = window.innerHeight - pad - rect.bottom;
    }
    if (rect.left < pad) {
      dx = pad - rect.left;
    }
    if (rect.top < pad) {
      dy = pad - rect.top;
    }
    if (dx !== 0 || dy !== 0) {
      (menuEl as HTMLElement).style.left = `${this._x + dx}px`;
      (menuEl as HTMLElement).style.top = `${this._y + dy}px`;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._clickHandler) document.removeEventListener("click", this._clickHandler);
    if (this._keyHandler) document.removeEventListener("keydown", this._keyHandler);
  }

  cleanup(): void {
    if (this._clickHandler) document.removeEventListener("click", this._clickHandler);
    if (this._keyHandler) document.removeEventListener("keydown", this._keyHandler);
    this._onclose?.();
    this.remove();
  }

  render(): TemplateResult {
    if (this._items.length === 0) {
      setTimeout(() => this.cleanup(), 0);
      return html``;
    }

    return html`
      <div
        style="position:fixed;left:${this._x}px;top:${this._y}px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.5);padding:4px 0;min-width:150px;z-index:10000;pointer-events:auto;"
      >
        ${this._items.map((item) => {
          if (item.type === "separator") {
            return html`<div style="height:1px;background:#333;margin:4px 8px;"></div>`;
          }
          const hasChildren = item.children && item.children.length > 0;
          return html`
            <div
              style="padding:6px 16px;cursor:pointer;color:var(--text-primary);font-size:12px;transition:background 0.1s;display:flex;align-items:center;justify-content:space-between;"
              @mouseenter=${(e: MouseEvent) => {
                const row = e.currentTarget as HTMLElement;
                row.style.background = "#333";
                if (hasChildren && item.children) {
                  const r = row.getBoundingClientRect();
                  this.querySelectorAll("openp41ge-contextmenu").forEach((el) => el.remove());
                  const sub = document.createElement(
                    "openp41ge-contextmenu",
                  ) as Openp41geContextMenuElement;
                  sub.x = r.right;
                  sub.y = r.top;
                  sub.items = item.children;
                  sub.onclose = () => {};
                  this.appendChild(sub);
                }
              }}
              @mouseleave=${(e: MouseEvent) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
              @click=${() => {
                if (!hasChildren && item.action) {
                  item.action();
                  this.cleanup();
                }
              }}
            >
              <span>${item.label ?? ""}</span>
              ${hasChildren ? html`<span style="color:var(--text-muted);margin-left:16px;">▸</span>` : ""}
            </div>
          `;
        })}
      </div>
    `;
  }
}

customElements.define("openp41ge-contextmenu", Openp41geContextMenu);
