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
    isFile?: boolean,
    bitmapDataUrl?: string,
  ): void {
    this.hide();

    // Store offset for subsequent move() calls
    this._offsetX = offsetX ?? Math.round((tabWidth ?? 110) / 2);
    this._offsetY = offsetY ?? Math.round((tabHeight ?? 35) / 2);

    // Use tab dimensions if provided, otherwise use defaults
    const ghostW = tabWidth ?? 110;
    const ghostH = tabHeight ?? 35;
    // When dimensions are explicit (files and tabs always pass the element's
    // size) we can make the window VISIBLE immediately at that size instead of
    // waiting for did-finish-load — a fast drag can otherwise mousedown+release
    // and hide the ghost before its content ever loads, so it never appears.
    const showImmediately = typeof tabWidth === "number" || typeof tabHeight === "number";

    const initialX = screenX - this._offsetX;
    const initialY = screenY - this._offsetY;
    const ghost = new this._BrowserWindow({
      width: ghostW,
      height: ghostH,
      x: isFinite(initialX) ? initialX : 0,
      y: isFinite(initialY) ? initialY : 0,
      frame: false,
      transparent: true,
      roundedCorners: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      show: false, // shown immediately (below) or after content load when no dims
    });

    ghost.setIgnoreMouseEvents(true, { forward: true });

    // Seed the assumed size with the explicit/fallback dims so move() always has
    // sane bounds even before content loads (otherwise a fast drag would move a
    // 0×0 window). The did-finish-load measure overwrites these with the real size.
    this._contentW = ghostW;
    this._contentH = ghostH;

    if (showImmediately && !process.env.OPENP41GE_E2E_TEST) {
      ghost.show();
    }

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

    const isFileGhost = !!isFile;
    const rowHtml = `<div style="display:flex;align-items:center;gap:7px;height:${ghostH}px;min-width:160px;padding:0 9px;background:#1e1e1e;border:1px solid #3a3d3f;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.3);outline:1px solid rgba(74,158,255,0.5);outline-offset:-1px;font-size:12px;color:#d4d4d4;letter-spacing:0.02em;white-space:nowrap;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#4a9eff" stroke-width="1.3" shape-rendering="geometricPrecision" style="flex-shrink:0"><path d="M4 1h6l3 3v10H4z"/><path d="M10 1v3h3"/></svg>
${nameHtml}</div>`;
    const pillHtml = `<div style="display:flex;align-items:center;gap:6px;width:${ghostW}px;height:${ghostH}px;padding:0 14px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:6px;outline:1px solid #4a9eff;outline-offset:-2px;font-size:12px;color:#e0e0e0;white-space:nowrap;letter-spacing:0.02em;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${emojiHtml}${nameHtml}</div>`;

    // A captured bitmap of the actual dragged element is the most faithful
    // ghost: render the PNG at the exact source element size and let the window
    // adopt those dimensions. Falls back to the file-row / pill HTML otherwise.
    const innerHtml = bitmapDataUrl
      ? `<img src="${bitmapDataUrl}" alt="" style="display:block;width:${ghostW}px;height:${ghostH}px;" />`
      : isFileGhost
        ? rowHtml
        : pillHtml;

    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:transparent;cursor:grabbing;">${innerHtml}
</body></html>`;

    ghost.webContents.on("did-finish-load", () => {
      if (ghost.isDestroyed()) return;
      // Measure the content and resize the window to match exactly
      ghost.webContents
        .executeJavaScript(
          `JSON.stringify({w:document.body.scrollWidth,h:document.body.scrollHeight})`,
        )
        .then((json) => {
          if (ghost.isDestroyed()) return;
          const { w, h } = JSON.parse(json);
          const cw = Math.ceil(w);
          const ch = Math.ceil(h);
          this._contentW = cw;
          this._contentH = ch;
          const boundsX = isFinite(screenX - this._offsetX) ? screenX - this._offsetX : 0;
          const boundsY = isFinite(screenY - this._offsetY) ? screenY - this._offsetY : 0;
          try {
            ghost.setBounds({
              x: boundsX,
              y: boundsY,
              width: cw,
              height: ch,
            });
          } catch {
            // setBounds can throw if the window is closing. Swallow.
          }
          // Only show after the window is correctly sized (no-op when already
          // visible via the immediate show path).
          if (!ghost.isDestroyed() && !process.env.OPENP41GE_E2E_TEST) {
            ghost.show();
          }
        })
        .catch(() => {
          if (!ghost.isDestroyed() && !process.env.OPENP41GE_E2E_TEST) {
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

  /**
   * Swap the ghost's content to a captured bitmap in-place (same window, no
   * destroy/recreate) so the already-visible row-style ghost is upgraded to the
   * pixel-accurate source snapshot without any window-churn flicker.
   */
  setBitmap(dataUrl: string, width: number, height: number): void {
    if (!this._ghost || this._ghost.isDestroyed()) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this._contentW = w;
    this._contentH = h;
    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:transparent;cursor:grabbing;"><img src="${dataUrl}" alt="" style="display:block;width:${w}px;height:${h}px;" />
</body></html>`;
    this._ghost.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  }

  move(screenX: number, screenY: number): void {
    if (this._ghost && !this._ghost.isDestroyed()) {
      const x = screenX - this._offsetX;
      const y = screenY - this._offsetY;
      if (isFinite(x) && isFinite(y)) {
        try {
          this._ghost.setBounds({
            x: Math.round(x),
            y: Math.round(y),
            width: this._contentW,
            height: this._contentH,
          });
        } catch {
          // setBounds can throw if the window enters a closing/destroyed state
          // between the isDestroyed() check above and this call. Swallow.
        }
      }
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
