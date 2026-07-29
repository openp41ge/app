/**
 * Core interfaces for the openp41ge-tabs package.
 *
 * No Electron/IPC dependencies.  Cross-window integration is handled
 * via CustomEvents fired on `document`.
 */

// ─── Drag Source Data ─────────────────────────────────────────────────────

export type DragSourceData =
  | { type: "tab"; tabId: string; winId: string; worksetId: string; title?: string }
  | { type: "openp41ge-tab"; tabId: string; winId: string; worksetId: string; title?: string }
  | { type: "file"; filePath: string; fileName?: string }
  | { type: "repo"; repoName: string };

// ─── Ghost Factory ─────────────────────────────────────────────────────────

export type GhostFactory = () => HTMLElement;

// ─── Drag Source ──────────────────────────────────────────────────────────

export interface IDragSource {
  readonly type: string;
  createGhost(): HTMLElement;
  getDragData(): DragSourceData;
  onDragStart(): void;
  onDragEnd(result: DragResult): void;
}

// ─── Drop Target ──────────────────────────────────────────────────────────

export interface TargetFeedback {
  cssClass?: string;
  showGhost?: boolean;
  ghostConfig?: Record<string, unknown>;
  indicatorKey?: string;
}

export interface IDropTarget {
  readonly type: string;
  readonly element: HTMLElement;
  onHover(source: IDragSource, clientX: number, clientY: number): TargetFeedback | null;
  onDrop(source: IDragSource, clientX: number, clientY: number): Promise<DragResult>;
  onLeave(): void;
}

// ─── Drag Result ──────────────────────────────────────────────────────────

export type DragResult = { success: true } | { success: false; reason?: string };

// ─── Drag Handler (for orchestrator) ──────────────────────────────────────

export interface IDragHandler {
  simulateDrag(source: IDragSource, target: IDropTarget): Promise<DragResult>;
  startDrag(source: IDragSource, clientX: number, clientY: number): void;
  cancelDrag(): void;
  readonly isDragging: boolean;
}
