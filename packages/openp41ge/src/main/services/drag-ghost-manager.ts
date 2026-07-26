import type { BrowserWindow } from "electron";
import type { IDragGhostManager } from "../interfaces/drag-ghost-manager.js";

/**
 * Manages a frameless BrowserWindow used as a drag ghost.
 *
 * The ghost follows the cursor outside the app window during drag-and-drop
 * operations. It has pointer-events: none so clicks pass through to windows
 * underneath.
 *
 * BrowserWindow constructor is injected to avoid ESM import issues
 * (Electron's main process module is available at the call site).
 */
export class DragGhostManager implements IDragGhostManager {
  private _ghost: BrowserWindow | null = null;
  private readonly _BrowserWindow: typeof BrowserWindow;
  private _contentW = 0;
  private _contentH = 0;
  private _offsetX = 0;
  private _offsetY = 0;

  constructor(BrowserWindowCtor: typeof BrowserWindow) {
    this._BrowserWindow = BrowserWindowCtor;
  }

  show(
    label: string,
    screenX: number,
    screenY: number,
    emoji?: string,
    tabWidth?: number,
    tabHeight?: number,
    offsetX?: number,
    offsetY?: number,
  ): void {
    this.hide();

    // Store offset for subsequent move() calls
    this._offsetX = offsetX ?? Math.round((tabWidth ?? 110) / 2);
    this._offsetY = offsetY ?? Math.round((tabHeight ?? 35) / 2);

    // Use tab dimensions if provided, otherwise use defaults
    const ghostW = tabWidth ?? 110;
    const ghostH = tabHeight ?? 35;

    const ghost = new this._BrowserWindow({
      width: ghostW,
      height: ghostH,
      x: screenX - this._offsetX,
      y: screenY - this._offsetY,
      frame: false,
      transparent: true,
      roundedCorners: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      show: false, // always hidden until content is loaded and sized
    });

    ghost.setIgnoreMouseEvents(true, { forward: true });

    const escapedLabel = label
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const escapedEmoji = emoji
      ? emoji
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
      : "";

    const emojiHtml = escapedEmoji
      ? `<span style="margin-right:6px;flex-shrink:0;font-size:14px;line-height:1">${escapedEmoji}</span>`
      : "";
    const nameHtml = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0">${escapedLabel}</span>`;

    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:transparent;cursor:grabbing;">
<div style="
  display:flex;align-items:center;gap:6px;
  width:${ghostW}px;height:${ghostH}px;
  padding:0 14px;
  background:#1e1e1e;
  border:1px solid #2a2a2a;
  border-radius:6px;
  outline:1px solid #4a9eff;
  outline-offset:-2px;
  font-size:12px;color:#e0e0e0;
  white-space:nowrap;letter-spacing:0.02em;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  box-sizing:border-box;
">${emojiHtml}${nameHtml}</div>
</body></html>`;

    ghost.webContents.on("did-finish-load", () => {
      // Measure the content and resize the window to match exactly
      ghost.webContents
        .executeJavaScript(
          `JSON.stringify({w:document.body.scrollWidth,h:document.body.scrollHeight})`,
        )
        .then((json) => {
          const { w, h } = JSON.parse(json);
          if (ghost.isDestroyed()) return;
          const cw = Math.ceil(w);
          const ch = Math.ceil(h);
          this._contentW = cw;
          this._contentH = ch;
          ghost.setBounds({
            x: screenX - this._offsetX,
            y: screenY - this._offsetY,
            width: cw,
            height: ch,
          });
          // Only show after the window is correctly sized
          if (!process.env.OPENP41GE_E2E_TEST) {
            ghost.show();
          }
        })
        .catch(() => {
          if (!process.env.OPENP41GE_E2E_TEST) {
            ghost.show();
          }
        });
    });

    ghost.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    this._ghost = ghost;
    ghost.on("closed", () => {
      if (this._ghost === ghost) this._ghost = null;
    });
  }

  move(screenX: number, screenY: number): void {
    if (this._ghost && !this._ghost.isDestroyed()) {
      this._ghost.setPosition(screenX - this._offsetX, screenY - this._offsetY);
    }
  }

  hide(): void {
    if (this._ghost && !this._ghost.isDestroyed()) {
      this._ghost.close();
    }
    this._ghost = null;
    this._contentW = 0;
    this._contentH = 0;
    this._offsetX = 0;
    this._offsetY = 0;
  }

  isActive(): boolean {
    return this._ghost !== null && !this._ghost.isDestroyed();
  }
}
