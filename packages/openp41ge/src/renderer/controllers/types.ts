/**
 * TabController interface — every app tab must implement this.
 *
 * Controllers own tab content state outside the DOM and survive tab switches
 * (unmount → keep controller registered → mount on return).
 *
 * Lifecycle:
 *   createController(tabId, appType)
 *     → new instance, registerController(ctrl)
 *     → ctrl.restore(savedState)  // if restoring from session
 *     → ctrl.mount(container)     // tab enters DOM
 *     → ctrl.setVisible(false)    // tab switched away
 *     → ctrl.unmount()            // tab leaves DOM (but ctrl stays in registry)
 *     → ctrl.mount(container)     // tab switched back, same or new container
 *     → ctrl.setVisible(true)     // tab becomes active
 *     → ctrl.snapshot()           // serializable state for persistence
 */

export interface TabController {
  readonly tabId: string;
  readonly appType: string;

  /** Called when the tab enters the DOM. Must create content inside `container`. */
  mount(container: HTMLElement): void;

  /** Called when the tab leaves the DOM. Detach resources (not processes), save state. */
  unmount(): void;

  /** Called when the tab's tab becomes active/inactive. Subclasses throttle output here. */
  setVisible(visible: boolean): void;

  /** Serializable state for save/restore across sessions. Must be JSON-safe. */
  snapshot(): Record<string, unknown>;

  /** Restore state after re-mount. Called before mount() or any render. */
  restore(state: Record<string, unknown>): void;
}

/**
 * FileViewerController — subtype of TabController for file-viewer tabs.
 *
 * Only FileEditorController implements this. Calling code uses
 * isFileViewerController() to safely access file-specific properties
 * instead of duck-typing against optional properties on TabController.
 */
export interface FileViewerController extends TabController {
  filePath: string;
  _isDirty: boolean;
  loadFile(path: string, fileName?: string): Promise<void>;
}

/** Type guard: checks if a TabController is a FileViewerController. */
export function isFileViewerController(ctrl: TabController): ctrl is FileViewerController {
  return ctrl.appType === "file-viewer";
}

/**
 * Registration record for an app type — how the app creates its controllers.
 */
export interface AppTypeRegistration {
  id: string;
  label: string;
  icon: string;
  description: string;
  createController: (tabId: string) => TabController;
}

// ─── System Tab Registration ──────────────────────────────────────────────

/**
 * SystemTabController — interface for system tab content in the sidebar.
 *
 * Simpler lifecycle than TabController since system tabs don't support
 * preview slots, pinning in the same way, or cross-cell dragging.
 * They mount/unmount with the sidebar's active tab.
 */
export interface SystemTabController {
  readonly tabId: string;
  readonly appType: string;
  mount(container: HTMLElement): void | Promise<void>;
  unmount(): void;
}

/**
 * Registration record for a system tab type.
 *
 * System tabs are sidebar-based app panels (Explorer, Git, Search, Projects).
 * They are separate from editor tab types and use a simpler lifecycle.
 */
export interface SystemTabRegistration {
  id: string;
  label: string;
  icon: string;
  description: string;
  /** Default sidebar where this tab type opens when first created. */
  defaultSide: "left" | "right";
  /** Factory function to create the system tab content controller. */
  createController: (tabId: string, config?: Record<string, unknown>) => SystemTabController;
}

// ─── Editor System Tab Registration ─────────────────────────────────────

/**
 * EditorSystemTabController — interface for editor-area system tab content.
 *
 * Editor system tabs override the grid. They use a simple render() pattern
 * rather than the mount/unmount lifecycle since they don't need persistence
 * across tab switches in the same way.
 */
export interface EditorSystemTabController {
  readonly id: string;
  readonly appType: string;
  readonly title: string;
  render(): unknown;
}

export interface EditorSystemTabRegistration {
  appType: string;
  title: string;
  createController(tabId: string): EditorSystemTabController;
}
