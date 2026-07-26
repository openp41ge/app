2025-07-25

# Goal

Replace ad-hoc inline DOM diagnostics (used during cross-window drag development) with a proper **Debug Event Dispatcher** system. Components dispatch structured debug events through a shared emitter; a `<debug-overlay>` component subscribes and renders live data in a floating panel, visible only when `OPENP41GE_DEBUG=1` is set.

# Rationale

During cross-window drag debugging, diagnostic counters and coordinates were shown by directly creating DOM elements (`document.createElement("div")`) inside `init-drag-system.ts`. This approach:

- Couples diagnostic logic with production code
- Lacks a standardised event schema — each debug site uses ad-hoc string formatting
- Is not reusable by other packages or future debugging needs
- Cannot be toggled without modifying source code

A proper Debug Event Dispatcher decouples diagnostics from production logic, provides a typed event schema, and lives in a self-contained component gated by an environment variable.

# Approach

## 1. Debug Event Dispatcher (`openp41ge-logger`)

Extend the existing `openp41ge-logger` package (or create a new `openp41ge-debug` package) with a typed event emitter:

```typescript
interface DebugEvent {
  source: string;       // e.g., "cross-window-drag"
  label: string;        // e.g., "ghost-update", "mousemove", "dispatch"
  data: Record<string, unknown>;
  timestamp: number;
}

class DebugEventBus {
  private _listeners: Set<(event: DebugEvent) => void> = new Set();
  private _enabled: boolean;

  constructor() { this._enabled = !!process.env.OPENP41GE_DEBUG || false; }

  emit(source: string, label: string, data: Record<string, unknown>): void { ... }
  on(listener: (event: DebugEvent) => void): () => void { ... }
  setEnabled(v: boolean): void { ... }
}
```

## 2. `<debug-overlay>` Web Component

A self-contained Lit component that shows a floating panel with live debug events:

- Renders only when `window.__OPENP41GE_DEBUG__` is `true` (set from env var during bootstrap)
- Shows a scrollable, auto-updating table of recent events
- Columns: source, label, data (collapsible), timestamp
- Toggle-able via keyboard shortcut (Cmd+Shift+D)
- Floating position (draggable), follows same styling conventions as other overlays

## 3. Wire Cross-Window Drag Diagnostics

Replace inline DOM creation in `init-drag-system.ts` with debug events:

- `onMouseMove` firing → emit `"mousemove"` with `{ x, y, localDragActive, remoteDragActive }`
- `_updateCrossWindowGhost` called → emit `"ghost-update"` with `{ x, y, cols, isBoundary, mouseCol }`
- `onGhostShow` received → emit `"ipc-ghost"` with `{ screenX, screenY, clientX, clientY }`
- `_handleCrossWindowDrop` → emit `"drop"` with `{ targetType, winId, col }`
- `computeDropTarget` result → emit `"compute-drop-target"` with `{ col, isBoundary, boundaryIndex }`

## 4. Env Var Gating

- `process.env.OPENP41GE_DEBUG` in Vite config mapped to `__OPENP41GE_DEBUG__` global
- `window.__OPENP41GE_DEBUG__` checked before registering the debug overlay component
- At runtime, `localStorage.getItem("openp41ge-debug")` can override

# Files Changed

| File                                                                    | Change                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------------- |
| `packages/openp41ge-logger/src/debug-event-bus.ts`                      | New: typed `DebugEventBus` class with `emit`/`on`        |
| `packages/openp41ge-logger/src/index.ts`                                | Export `DebugEventBus` and types                         |
| `packages/openp41ge/src/renderer/components/debug-overlay.ts`           | New: `<debug-overlay>` Lit component                     |
| `packages/openp41ge/src/renderer/app.ts`                                | Register debug-overlay component, gate on env var        |
| `packages/openp41ge/src/renderer/services/init-drag-system.ts`          | Remove inline DOM diagnostics, emit debug events instead |
| `packages/openp41ge/src/renderer/bootstrap/steps/init-services.step.ts` | Pass `DebugEventBus` instance to drag system             |
| `packages/openp41ge/vite.config.ts`                                     | Define `__OPENP41GE_DEBUG__` global from env             |
| `packages/openp41ge/README.md`                                          | Document `OPENP41GE_DEBUG=1` usage                       |
| `.pi/skills/test-cross-window-drag/SKILL.md`                            | Update to mention debug overlay                          |

# UX Considerations

- **Floating panel**: Positioned bottom-right, draggable, with min-width and max-height
- **Auto-scroll**: New events appear at the top, older events scroll off
- **Keyboard shortcut**: Cmd+Shift+D toggles visibility (when debug mode is active)
- **Visual style**: Uses existing CSS variables (`--bg-surface`, `--text-primary`, etc.)
- **Persistence**: `localStorage` override allows enabling debug at runtime without restart
- **Performance**: Events are buffered (max 500), older events dropped

# Completion Criteria

- [ ] `DebugEventBus` class with typed events exists in `openp41ge-logger`
- [ ] `<debug-overlay>` Lit component renders floating debug panel
- [ ] Cross-window drag diagnostics use `DebugEventBus.emit()` instead of inline DOM
- [ ] Panel only renders when `OPENP41GE_DEBUG=1` env var is set
- [ ] All inline diagnostic DOM elements removed from `init-drag-system.ts`
- [ ] `README.md` documents the debug system
- [ ] All existing tests pass
