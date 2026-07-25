/**
 * Drag ghost IPC handlers — start, move, end, cross-window forwarding, hit-test.
 */

import { ipcMain, BrowserWindow } from "electron";
import type { DragGhostManager } from "../../src/main/index.js";
import { openp41geWindows } from "../window-manager.js";

export function registerDragHandlers(dragGhost: DragGhostManager): void {
  ipcMain.on("openp41ge:drag-start", (_event, data: string) => {
    const { label, screenX, screenY, emoji } = JSON.parse(data);
    dragGhost.show(label, screenX, screenY, emoji);
  });

  ipcMain.on("openp41ge:drag-move", (_event, data: string) => {
    const { screenX, screenY } = JSON.parse(data);
    dragGhost.move(screenX, screenY);
  });

  ipcMain.on("openp41ge:drag-end", () => {
    dragGhost.hide();
  });

  // ── Cross-window ghost forwarding ────────────────────────────────────────

  ipcMain.on("openp41ge:drag-ghost-show", (_event, data: string) => {
    const parsed = JSON.parse(data);
    const bw = openp41geWindows.get(parsed.targetWinId);
    if (bw && !bw.isDestroyed()) {
      bw.webContents.send(
        "openp41ge:drag-ghost",
        JSON.stringify({
          paneId: parsed.paneId,
          screenX: parsed.screenX,
          screenY: parsed.screenY,
          label: parsed.label,
        }),
      );
    }
  });

  ipcMain.on("openp41ge:drag-ghost-hide", (_event, data: string) => {
    const parsed = JSON.parse(data);
    const bw = openp41geWindows.get(parsed.targetWinId);
    if (bw && !bw.isDestroyed()) {
      bw.webContents.send("openp41ge:drag-ghost-hide");
    }
  });

  // ── Cross-window drag check ──────────────────────────────────────────────

  ipcMain.handle("openp41ge:drag-check", async (_event, data: string) => {
    const { screenX, screenY } = JSON.parse(data);
    const allWindows = BrowserWindow.getAllWindows();

    for (const bw of allWindows) {
      const bounds = bw.getBounds();
      if (
        screenX >= bounds.x &&
        screenX <= bounds.x + bounds.width &&
        screenY >= bounds.y &&
        screenY <= bounds.y + bounds.height
      ) {
        let targetOpenp41geWinId: string | null = null;
        for (const [sid, existing] of openp41geWindows) {
          if (existing === bw) {
            targetOpenp41geWinId = sid;
            break;
          }
        }
        if (!targetOpenp41geWinId) continue;

        const clientX = screenX - bounds.x;
        const clientY = screenY - bounds.y;

        try {
          const result = await bw.webContents.executeJavaScript(`
            (() => {
              const el = document.elementFromPoint(${clientX}, ${clientY});
              if (!el) return null;
              let cur = el;
              while (cur && !(cur)._dropTargetType) cur = cur.parentElement;
              if (cur) {
                const payload = JSON.parse(JSON.stringify((cur)._dropPayload || {}));
                if ((cur)._dropTargetType === "page-bar") {
                  // Compute the drop index based on cursor x position relative to openp41ge tabs
                  const tabs = Array.from(cur.querySelectorAll('[data-workset-id]'));
                  const relX = ${clientX} - cur.getBoundingClientRect().left;
                  let idx = tabs.length;
                  for (let i = 0; i < tabs.length; i++) {
                    const tabRect = tabs[i].getBoundingClientRect();
                    const tabMid = tabRect.left - cur.getBoundingClientRect().left + tabRect.width / 2;
                    if (relX < tabMid) {
                      idx = i;
                      break;
                    }
                  }
                  payload.idx = idx;
                }
                return { type: (cur)._dropTargetType, payload };
              }
              return null;
            })()
          `);
          return { target: result, windowId: targetOpenp41geWinId };
        } catch {
          return null;
        }
      }
    }
    return null;
  });
}
