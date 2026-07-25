/**
 * Keyboard binding — a single keyboard shortcut registration.
 */
export interface IKeyboardBinding {
  /** Mask of modifier keys. ctrl=1, alt=2, shift=4, meta=8. Combined via bitwise OR. */
  modifiers: number;
  /** Key property from KeyboardEvent (e.g., "b", "n", "w"). */
  key: string;
  /** Code property from KeyboardEvent (e.g., "KeyB", "KeyN", "KeyW"). */
  code: string;
  /** Handler to execute when the binding is triggered. */
  handler: () => void;
  /** Human-readable description (for settings UI). */
  description: string;
  /** Category for grouping in settings. */
  category: string;
}

/**
 * Keyboard shortcut manager with registration pattern.
 *
 * Instead of a centralized switch statement, shortcuts are registered
 * individually and dispatched by matching against KeyboardEvent.
 *
 * Open/Closed: new shortcuts are added via .register(), not by modifying
 * a switch statement.
 *
 * Modal lockdown: when one or more confirmation modals are active,
 * ALL keyboard shortcuts are suppressed. The modal's own keydown
 * listener handles Enter, Escape, and Tab focus trapping.
 */
export interface IKeyboardManager {
  /** Register a keyboard binding. */
  register(binding: IKeyboardBinding): void;

  /** Unregister a keyboard binding. */
  unregister(binding: IKeyboardBinding): void;

  /** Handle a keydown event. Returns true if the event was consumed. */
  handleKeyDown(e: KeyboardEvent): boolean;

  /** Get all registered bindings (for settings UI). */
  getBindings(): IKeyboardBinding[];

  /** Push a modal onto the stack (all shortcuts blocked while count > 0). */
  pushModal(): void;

  /** Pop a modal from the stack. */
  popModal(): void;

  /** True when one or more modals are active. */
  readonly isModalActive: boolean;
}
