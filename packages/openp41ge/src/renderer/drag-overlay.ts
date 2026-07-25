/**
 * Module-level drag overlay manager.
 *
 * Uses a frameless transparent BrowserWindow in the main process so the
 * drag visual follows the cursor even outside the Electron window.
 * Components call startDrag / updatePos / endDrag with screenX/screenY.
 *
 * The overlay has pointer-events: none (via setIgnoreMouseEvents) so
 * elementFromPoint() still works through it in the source window.
 */

export interface DragState {
  active: boolean;
  x: number;
  y: number;
  label: string;
}

let state: DragState = { active: false, x: 0, y: 0, label: "" };
const listeners = new Set<(s: DragState) => void>();

function notify() {
  listeners.forEach((fn) => fn(state));
}

export function startDrag(screenX: number, screenY: number, label: string, emoji?: string) {
  state = { active: true, x: screenX, y: screenY, label };
  window.openp41ge.drag.start(label, screenX, screenY, emoji);
  notify();
}

export function updatePos(screenX: number, screenY: number) {
  state = { ...state, x: screenX, y: screenY };
  window.openp41ge.drag.move(screenX, screenY);
  notify();
}

export function endDrag() {
  state = { active: false, x: 0, y: 0, label: "" };
  window.openp41ge.drag.end();
  notify();
}
