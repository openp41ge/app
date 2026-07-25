import type { TabController } from "../controllers/types";
import type { Window, Workspace } from "../../layout/types";

/**
 * Type guard: checks if an element is a <openp41ge-grid> custom element.
 */
export interface Openp41geGridElement extends HTMLElement {
  winId: string;
  pageData: Window | null;
  _lastActiveCellCol: number;
  _clearFocus: () => void;
  _updateCellFocus: (col: number) => void;
  _focusedCol: number;
  setLastActiveCellCol?(col: number): void;
  _getNextTabForCell?(col: number, closedTabId: string): string | null;
  _trackTabFocus?(col: number, tabId: string): void;
  /** @internal DI injection point for unified drag system */
  dragHandler?: unknown;
  _setFocusedCol?(col: number): void;
}

export function isOpenp41geGrid(el: unknown): el is Openp41geGridElement {
  return el instanceof HTMLElement && el.tagName === "OPENP41GE-GRID";
}

/**
 * Type guard: checks if an element is a <openp41ge-topbar> custom element.
 */
export interface Openp41geTopBarElement extends HTMLElement {
  _dropTargetType: string;
  _dropPayload: Record<string, unknown>;
  windowData: Window;
  getDropIndex?: (clientX: number) => number;
  calcIndicatorPos?: (idx: number) => { x: number; width: number };
}

export function isOpenp41geTopbar(el: unknown): el is Openp41geTopBarElement {
  return el instanceof HTMLElement && el.tagName === "OPENP41GE-TOPBAR";
}

/**
 * Type guard: checks if an element is a <openp41ge-windowview> custom element.
 */
export interface Openp41geWindowviewElement extends HTMLElement {
  windowData: Window;
  workspaceData: Workspace;
  layouts: Map<string, Map<string, { x: number; y: number; width: number; height: number }>>;
}

export function isOpenp41geWindowview(el: unknown): el is Openp41geWindowviewElement {
  return el instanceof HTMLElement && el.tagName === "OPENP41GE-WINDOWVIEW";
}

/**
 * Type guard: checks if an element is a <openp41ge-tab-content> custom element.
 */
export interface Openp41geTabContentElement extends HTMLElement {
  _winId: string;
  _pageId: string;
  _tabData: { id: string; appType: string } | null;
  controller: TabController | null;
  _controller: TabController | null;
  tabData: { id: string; appType: string; content?: string } | null;
  _onTabMouseDown: ((e: MouseEvent, pid: string) => void) | null;
}

export function isOpenp41geTabContent(el: unknown): el is Openp41geTabContentElement {
  return el instanceof HTMLElement && el.tagName === "OPENP41GE-TAB-CONTENT";
}

/**
 * Type guard: checks if an element is a <openp41ge-pane-picker> custom element.
 */
export interface Openp41gePanePickerElement extends HTMLElement {
  onSelect: (result: { type: string; appTypeId?: string; path?: string; name?: string }) => void;
}

export function isOpenp41gePanePicker(el: unknown): el is Openp41gePanePickerElement {
  return el instanceof HTMLElement && el.tagName === "OPENP41GE-PANE-PICKER";
}

/**
 * Type guard: checks if a value is an HTMLElement.
 */
export function isHTMLElement(el: unknown): el is HTMLElement {
  return el instanceof HTMLElement;
}

/**
 * Type guard: checks if an unknown value has _dropTargetType and _dropPayload properties
 * (used for grid cells that have these set directly via property assignment).
 */
export interface DropTargetElement extends HTMLElement {
  _dropTargetType: string;
  _dropPayload: Record<string, unknown>;
}

export function isDropTarget(el: unknown): el is DropTargetElement {
  return isHTMLElement(el) && "_dropTargetType" in el;
}

/**
 * Context menu data interface.
 */
export interface ContextMenuData {
  x: number;
  y: number;
  items: unknown[];
  onclose: () => void;
}

/** @public */
export function createContextMenuData(data: {
  x: number;
  y: number;
  items: unknown[];
  onclose?: () => void;
}): ContextMenuData {
  return {
    x: data.x,
    y: data.y,
    items: data.items,
    onclose: data.onclose ?? (() => {}),
  };
}

/** Context menu element type that exposes the custom properties. */
export interface Openp41geContextMenuElement extends HTMLElement {
  x: number;
  y: number;
  items: unknown[];
  onclose: () => void;
}

/**
 * Type guard: checks if an element is a <openp41ge-worktree-tree> custom element.
 */
export interface Openp41geWorktreeTreeElement extends HTMLElement {
  toggle(): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

/** Create a <openp41ge-contextmenu> element with correctly typed properties. */
export function createOpenp41geContextMenu(data: ContextMenuData): Openp41geContextMenuElement {
  const el = document.createElement("openp41ge-contextmenu") as Openp41geContextMenuElement;
  el.x = data.x;
  el.y = data.y;
  el.items = data.items;
  el.onclose = data.onclose;
  return el;
}
