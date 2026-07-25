# Lit Mapping Analysis for openp41ge-file-editor Rewrite

This document analyses every component and layer of the planned rewrite and determines whether it should be a Lit element, a Lit reactive controller, or a custom-built (non-Lit) class.

## Core Principle

**Lit handles the shell; custom code handles the viewport.**

The `<file-editor>` element itself, its attributes, lifecycle, and peripheral UI (status bar, modals, buttons) map naturally to Lit. But the **core text viewport** — the visible lines, gutter, cursor, selections — must bypass Lit's template system and use direct DOM manipulation for performance. Lit's `html` template diffing cannot efficiently handle the rapid creation/destruction and absolute positioning of hundreds of line elements during scrolling.

---

## Layer 1: The Outer `<file-editor>` Element

**Decision: ✅ LitElement**

| Aspect              | Current (vanilla)                                             | Future (Lit)                                               |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Observed attributes | `static observedAttributes` + `attributeChangedCallback`      | `@property({ type: String, attribute: 'data-file-path' })` |
| Lifecycle           | `connectedCallback` / `disconnectedCallback` + manual cleanup | Lit built-in, plus `firstUpdated` for mount                |
| Event listeners     | Manual `addEventListener`/`removeEventListener` pairs         | `@eventOptions` decorator or `connectedCallback`           |
| Internal state      | Private fields + manual getters                               | `@state() private _mode: FileEditorMode`                   |
| Render              | Manual `_buildDOM()` with `document.createElement`            | Lit template for shell, custom rendering for viewport      |

**Template structure:**

```typescript
@customElement("file-editor")
export class FileEditorElement extends LitElement {
  // Shadow DOM: none (light DOM for compatibility with host styles)
  protected createRenderRoot() {
    return this;
  }

  @property({ type: String, attribute: "data-file-path" })
  filePath: string = "";

  @property({ type: String, attribute: "data-mode" })
  mode: FileEditorMode = "preview";

  @property({ type: String, attribute: "data-file-name" })
  fileName: string = "";

  @state()
  private _isDirty = false;

  render() {
    return html`
      <div class="fe-root" style="...">
        <div class="fe-content" style="...">
          <!-- Viewport lives here — rendered by custom pipeline, NOT by Lit -->
          <div class="fe-viewport"></div>
        </div>
        <fe-status-bar></fe-status-bar>
      </div>
    `;
  }

  firstUpdated() {
    // Mount custom rendering pipeline into .fe-viewport
    this._initViewport(this.renderRoot.querySelector(".fe-viewport")!);
    if (this.filePath) this.loadFile(this.filePath);
  }
}
```

**Why Lit fits:**

- `@property` elegantly replaces the three observed attributes
- `@state` for `_isDirty` triggers targeted re-render of status area only
- No manual `_attachListeners`/`_detachListeners` management needed in most cases
- The element lifecycle (connect, disconnect, attribute change) is clean

**What stays custom:** The viewport rendering pipeline is mounted into `.fe-viewport` and managed entirely outside Lit's template system.

---

## Layer 2: Peripheral UI Components

### `<fe-status-bar>` — Already Lit

**Decision: ✅ LitElement (keep as-is)**

No changes needed. It already uses:

- `@state` for all display state
- Lit template for rendering
- Light DOM (no shadow root)
- Public API methods that set `@state` properties

The `Openp41geStatusBar` service class that bridges between `FileEditorElement` and `<fe-status-bar>` also stays as-is — it's a plain class that calls methods on the Lit element.

### `<fe-confirm-modal>`

**Decision: ✅ Could be converted to LitElement**

Currently a vanilla HTMLElement building DOM manually in `_render()`. The template is small and stable — a good candidate for Lit's declarative approach:

```typescript
@customElement("fe-confirm-modal")
export class FeConfirmModal extends LitElement {
  @property() message = "";
  @property() detail = "";
  @property({ attribute: "confirm-label" }) confirmLabel = "Confirm";
  @property({ attribute: "cancel-label" }) cancelLabel = "Cancel";
  private _resolve: ((v: boolean) => void) | null = null;

  render() {
    return html`
      <div class="overlay" @keydown=${this._onKeydown}>
        <div class="dialog">
          <div class="title">${this.message}</div>
          ${this.detail ? html`<div class="detail">${this.detail}</div>` : ""}
          <div class="buttons">
            <button class="cancel" @click=${() => this._close(false)}>${this.cancelLabel}</button>
            <button class="confirm" @click=${() => this._close(true)}>${this.confirmLabel}</button>
          </div>
        </div>
      </div>
    `;
  }

  waitForResult() {
    /* Promise that resolves on _close */
  }
}
```

**Priority:** Low. Vanilla works fine. Convert if the team prefers consistency.

### Custom Bottom-bar Buttons

**Decision: ✅ Already Lit** (rendered inside `<fe-status-bar>`'s Lit template via `@state() _buttons` + `repeat` directive)

---

## Layer 3: Data Model & Types (No DOM)

### TextPosition, TextRange, TextSelection

**Decision: ❌ Not Lit. Plain immutable classes.**

```typescript
export class TextPosition {
  constructor(readonly lineNumber: number, readonly column: number) {}
  with(newLine?: number, newCol?: number): TextPosition { ... }
  equals(other: TextPosition): boolean { ... }
  isBefore(other: TextPosition): boolean { ... }
  compare(other: TextPosition): number { ... }
}
```

No reactive properties needed. These are value objects — they're created, compared, and discarded. Making them reactive would add overhead for no benefit.

### TextContentModel Interface + Implementation

**Decision: ❌ Not Lit. Interface + plain class.**

```typescript
export interface TextContentModel {
  readonly uri: string;
  readonly lineCount: number;
  readonly length: number;
  getLineContent(lineNumber: number): string;
  pushEditOperations(edits: TextEditOperation[], ...): TextSelection[];
  onDidChangeContent: Event<TextContentChangeEvent>;
  // ...
}
```

The model is a service that manages text state. It emits events when content changes. Making it a Lit reactive controller would couple it to the element lifecycle unnecessarily — models can exist independently (e.g., in the openp41ge platform's model registry, or in test fixtures).

### Piece Tree (Piece, StringBuffer, RB tree)

**Decision: ❌ Not Lit. Pure data structures.**

The red-black tree and piece management are performance-critical algorithms with zero DOM involvement. They're plain TypeScript classes with methods like `insert()`, `delete()`, `getLineContent()`.

### Edit Stack (TextChange, undo/redo)

**Decision: ❌ Not Lit. Plain class.**

```typescript
export class EditStack {
  pushElement(): void { ... }
  popElement(): EditStackElement | null { ... }
  // Uses TextChange deltas
}
```

No DOM, no reactive state. Just a stack data structure.

### Tokenization (ITokenizer, LineTokens, ContiguousTokensStore)

**Decision: ❌ Not Lit. Plain services + data structures.**

The token registry, token stores, and lazy tokenization manager are pure logic. They take input (line text), produce output (Token[]), and cache results. No DOM involvement.

---

## Layer 4: ViewModel Layer (No DOM)

### ViewModel + CoordinatesConverter

**Decision: ❌ Not Lit. Plain class with event emitter.**

```typescript
export class ViewModel {
  constructor(
    private _model: TextContentModel,
    private _options: ViewModelOptions,
  ) {}

  // Transforms model positions to view positions (handles word wrap)
  readonly coordinatesConverter: CoordinatesConverter;

  // Emits view events for the rendering layer
  readonly onEvent: Event<ViewEvent>;
}
```

The ViewModel is a transformation layer. It listens to model events, transforms them, and re-emits as view events. It doesn't render anything. Lit's reactive system doesn't add value here — a simple `Emitter<T>` pattern is cleaner and has zero overhead.

**Could it be a ReactiveController?** Technically yes — `ReactiveController` gives `hostConnected()`/`hostDisconnected()` lifecycle hooks. But the ViewModel is already owned by the FileEditorElement and its lifecycle is managed by it. Making it a ReactiveController would:

- Couple it to the Lit host
- Require it to be instantiated in `constructor()` with access to the host
- Add no tangible benefit

**Recommendation:** Plain class. The `FileEditorElement` creates/destroys it in `firstUpdated()` / `disconnectedCallback()`.

---

## Layer 5: Core Rendering Pipeline (Heavily Custom)

This is where Lit is NOT the right tool. All these components need direct DOM management for performance.

### ViewLines + RenderedLinesCollection

**Decision: ❌ Not Lit. Custom virtual scroller.**

```typescript
export class ViewLines {
  private _lines: RenderedLinesCollection<ViewLine>;
  private _linesContent: HTMLElement; // The .fe-viewport div

  // Called on every animation frame during scroll
  renderLines(viewportData: ViewportData): void {
    // 1. Determine which lines are now visible
    // 2. Create ViewLine DOM nodes for newly visible lines
    // 3. Remove ViewLine DOM nodes for newly invisible lines
    // 4. Position remaining lines absolutely with top: Npx
    // 5. Re-render lines whose content/tokens changed
  }
}
```

**Why Lit won't work here:**

- **Absolute positioning.** Lines are positioned with `style.top: Npx`. Lit's template iteration (`map()` or `repeat()`) doesn't know about absolute positioning — it renders elements in document order. You'd need to constantly swap DOM order or use transforms, both of which are worse than absolute positioning.

- **DOM recycling.** When the user scrolls by one line, we want to reuse the line that scrolled out of view (just change its content and position). Lit's `repeat` with `keyFn` can do keyed updates, but it still creates/destroys DOM nodes at the boundaries. For 1000-line-per-second scrolling, this is too much GC pressure.

- **No virtual scroller primitive.** Lit doesn't have a built-in virtual scroller. You'd need to build one anyway — but inside Lit's template system, fighting against Lit's diff algorithm.

- **Character mapping.** After rendering a line, Monaco builds a `CharacterMapping` from the output DOM structure back to input text positions. This requires walking the rendered DOM. Lit's template system doesn't expose this.

**Implementation:** Use `FastDomNode`-style wrappers. Each `ViewLine` gets a cached DOM node. `renderLine()` compares new input to previous input and skips DOM write if unchanged. Lines are positioned via `requestAnimationFrame` batches.

### renderViewLine() + CharacterMapping

**Decision: ❌ Not Lit. Pure string-building function.**

```typescript
function renderViewLine(input: RenderLineInput, sb: StringBuilder): RenderLineOutput {
  // Walks tokens + decorations together
  // Outputs HTML: <span class="mtk1">keyword</span> etc.
  // Returns CharacterMapping for cursor → text position
}
```

This function produces raw HTML strings. Making each `<span>` token a Lit component would create thousands of component instances for a single line — catastrophic for performance.

The `CharacterMapping` is a `Uint32Array` that maps each output character index back to an input offset. Pure data.

### FastDomNode

**Decision: ❌ Not Lit. Custom utility class.**

```typescript
class FastDomNode {
  private _domNode: HTMLElement;
  private _top: number = -1;
  private _height: number = -1;
  private _display: string | null = null;

  setTop(v: number) {
    if (v !== this._top) {
      this._top = v;
      this._domNode.style.top = v + "px";
    }
  }
  setHeight(v: number) {
    if (v !== this._height) {
      this._height = v;
      this._domNode.style.height = v + "px";
    }
  }
}
```

This is the opposite of Lit's approach. Lit re-renders the entire template and diffs the result. FastDomNode short-circuits DOM writes at the property level. For the scrolling viewport, where 50+ line elements each need top/height set every frame, this avoids unnecessary layout thrash.

---

## Layer 6: Rendering Overlays (Performance-Critical, Pixel-Accurate)

### Line Numbers Gutter

**Decision: 🟡 Hybrid — custom DOM manipulation, but could have Lit wrapper**

Line numbers need:

1. A gutter `<div>` fixed to the left side
2. One `<div>` per visible line with the line number text
3. Heights synced with wrapped line heights
4. Scroll position synced with content scroll

The gutter container itself is a Lit-rendered `<div class="ln-gutter">` inside the `FileEditorElement`'s template. But the **line number divs inside it** should be managed by custom code for the same reasons as ViewLines — they're absolutely positioned, created/destroyed on scroll, and need height syncing.

```typescript
// In FileEditorElement's template:
html`
  <div class="fe-root">
    <div class="fe-content">
      <div class="fe-gutter"></div>
      <!-- Lit renders the container -->
      <div class="fe-viewport"></div>
      <!-- But contents are custom-managed -->
    </div>
    <fe-status-bar></fe-status-bar>
  </div>
`;
```

**Implementation:** `LineNumbersOverlay` class receives the gutter element from `firstUpdated()`, then manages its children directly.

### Cursor Renderer

**Decision: ❌ Not Lit. Custom DOM management.**

```typescript
export class CursorRenderer {
  private _cursors: FastDomNode[] = [];

  render(positions: ViewPosition[], blinkVisible: boolean): void {
    // Create/remove cursor FastDomNodes as count changes
    // Position each at (x, y) in the viewport
    // Toggle visibility for blinking
  }
}
```

The cursor needs to:

- Be positioned at precise pixel coordinates within the viewport
- Blink (toggle CSS class on a timer)
- Move when the user types or presses arrow keys
- Support multiple cursors (multi-cursor mode)

Each cursor is a single `<div class="cursor">`. Creating a Lit component for each feels wrong when it's just one absolutely-positioned div with a class toggle. Direct DOM is simpler and faster.

### Selection Renderer

**Decision: ❌ Not Lit. Custom DOM management.**

Selections are rendered as absolutely-positioned `<div class="selection">` spans layered on top of the text. They need:

- Pixel positions computed from CharacterMapping
- Re-rendering on every cursor move, click, or keyboard selection
- Support for multiple selections (multi-cursor)

Same reasoning as cursor: a few positioned divs, rapidly changing, not a good fit for template diffing.

### Current Line Highlight

**Decision: 🟡 Hybrid — could be Lit inside the gutter, but trivial either way**

The current line highlight is a single background color on the current line. The gutter needs to highlight the line number too. This is simple enough for Lit, but it needs to sync with the cursor position which is managed by custom code. A pragmatic approach: the `CursorRenderer` also sets a CSS class on the appropriate gutter line element via `FastDomNode.setClassName()`.

### Decorations Overlay (syntax highlight backgrounds, find results, etc.)

**Decision: ❌ Not Lit. Custom DOM management.**

Inline decorations (<span> wrappers) are baked into the ViewLine HTML by `renderViewLine()`. Line-level decorations (background colors on ranges) are rendered as absolutely-positioned spans, same as selections. These need pixel-accurate positioning and re-rendering on scroll — direct DOM is the right tool.

---

## Layer 7: Input System (No Visible DOM)

### Hidden TextArea

**Decision: ❌ Not Lit. Direct DOM element + event handlers.**

```typescript
export class TextAreaInput {
  private _textArea: HTMLTextAreaElement;

  constructor(host: HTMLElement) {
    this._textArea = document.createElement('textarea');
    this._textArea.style.cssText = 'position:absolute;opacity:0;...';
    host.appendChild(this._textArea);
    this._textArea.addEventListener('beforeinput', ...);
    this._textArea.addEventListener('keydown', ...);
    this._textArea.addEventListener('compositionstart', ...);
    // ...
  }

  setValue(value: string, selection: { start, end }): void {
    if (this._textArea.value !== value) this._textArea.value = value;
    if (this._textArea.selectionStart !== selection.start)
      this._textArea.selectionStart = selection.start;
    if (this._textArea.selectionEnd !== selection.end)
      this._textArea.selectionEnd = selection.end;
  }
}
```

This is a transparent element overlay. It has no visual rendering. It's managed entirely through direct DOM property access. Lit has no role here.

Could it be a `ReactiveController`? It could use `hostConnected()`/`hostDisconnected()`, but it also needs direct access to DOM elements (the viewport for positioning, the textarea for value syncing). Making it a ReactiveController adds the lifecycle hooks but doesn't simplify the core logic. **Recommendation:** plain class, created by FileEditorElement.

### Keyboard Handler

**Decision: ❌ Not Lit. Pure logic.**

Maps key events to cursor commands. No DOM. No reactive state. Just functions like:

```typescript
export function handleKeyDown(
  event: KeyboardEvent,
  cursor: CursorController,
  model: TextContentModel,
): boolean {
  /* returns true if handled */
}
```

### Clipboard Handler

**Decision: ❌ Not Lit. Pure logic.**

```typescript
export class ClipboardHandler {
  handleCopy(event: ClipboardEvent, cursor: CursorController, model: TextContentModel): void { ... }
  handlePaste(event: ClipboardEvent, cursor: CursorController, model: TextContentModel): void { ... }
}
```

### Composition Handler

**Decision: ❌ Not Lit. Pure logic.**

Handles IME composition events from the textarea. No DOM beyond the textarea (handled by TextAreaInput).

---

## Layer 8: Services & Registries

### ExtensionGrammarRegistry, ExtensionFormatterRegistry

**Decision: ❌ Not Lit. Plain services.**

These are maps from extension → grammar/formatter. They're injected into the FileEditorElement as service instances. They don't need reactivity — they're populated once during initialization and queried during file loading.

**Could they be ReactiveControllers?** They could, but since they have no lifecycle needs (no cleanup, no DOM, no state updates), there's no benefit. Plain classes are cleaner.

### Tokenization Manager (lazy tokenization)

**Decision: ❌ Not Lit. Plain class.**

Manages which lines are tokenized. Triggers background tokenization for off-screen lines. Emits events when new tokens are available. No DOM.

---

## Layer 9: Scroll Management

### ScrollManager

**Decision: ❌ Not Lit. Direct DOM + event listeners.**

```typescript
export class ScrollManager {
  private _scrollable: HTMLElement;
  private _state: { scrollTop: number; scrollLeft: number };

  onDidScroll: Event<ScrollEvent>;
  setScrollPosition(pos: ScrollPosition): void;
  getViewport(): Viewport;
  getScrollDimensions(): ScrollDimensions;
}
```

The scroll manager listens to native scroll events on the viewport element, computes viewport state, and notifies the rendering pipeline. Lit has no concept of scroll management. Direct DOM subscriptions are appropriate.

---

## Summary Table

| Component / Layer                            | Lit?      | Pattern                         | Notes                                   |
| -------------------------------------------- | --------- | ------------------------------- | --------------------------------------- |
| **Outer `<file-editor>`**                    | ✅ Yes    | LitElement                      | `@property`, `@state`, Lit lifecycle    |
| **`<fe-status-bar>`**                        | ✅ Yes    | LitElement                      | Already done, keep as-is                |
| **`<fe-confirm-modal>`**                     | ✅ Yes    | LitElement                      | Nice-to-have conversion                 |
| **Inline styles + CSS**                      | ✅ Yes    | Lit template                    | Style strings in template, or CSS files |
| **TextPosition / TextRange / TextSelection** | ❌ No     | Plain value classes             | Immutable, no reactivity                |
| **TextContentModel interface**               | ❌ No     | Interface                       | Platform-owned, no DOM                  |
| **Piece Tree**                               | ❌ No     | Plain data structs              | RB tree, Piece, StringBuffer            |
| **Edit Stack**                               | ❌ No     | Plain class                     | TextChange deltas                       |
| **ITokenizer / TokenRegistry**               | ❌ No     | Plain services                  | Extension → tokenizer map               |
| **ContiguousTokensStore**                    | ❌ No     | Plain data struct               | Token cache                             |
| **LazyTokenizationManager**                  | ❌ No     | Plain class                     | Event emitter                           |
| **ViewModel + CoordinatesConverter**         | ❌ No     | Plain class                     | Event emitter, transforms               |
| **ViewLines + RenderedLinesCollection**      | ❌ No     | Custom DOM                      | FastDomNode, absolute pos               |
| **renderViewLine() + CharacterMapping**      | ❌ No     | Pure function                   | String builder                          |
| **FastDomNode**                              | ❌ No     | Custom utility                  | Cached property setter                  |
| **Line Numbers Gutter**                      | 🟡 Hybrid | Custom DOM inside Lit container | Container is Lit, children are custom   |
| **Cursor Renderer**                          | ❌ No     | Custom DOM                      | Absolutely positioned divs              |
| **Selection Renderer**                       | ❌ No     | Custom DOM                      | Absolutely positioned spans             |
| **Current Line Highlight**                   | 🟡 Hybrid | Custom class                    | Trivial, Lit not worth it               |
| **Decoration Overlays**                      | ❌ No     | Custom DOM                      | Absolutely positioned spans             |
| **Hidden TextArea**                          | ❌ No     | Direct DOM                      | Transparent overlay element             |
| **Keyboard Handler**                         | ❌ No     | Pure logic                      | KeyEvent → Command                      |
| **Clipboard Handler**                        | ❌ No     | Pure logic                      | ClipboardEvent → Command                |
| **Composition Handler**                      | ❌ No     | Pure logic                      | IME events                              |
| **Grammar / Formatter Registries**           | ❌ No     | Plain services                  | Extension maps                          |
| **Scroll Manager**                           | ❌ No     | Direct DOM                      | Native scroll events                    |
| **ElectronFileService**                      | ❌ No     | Plain service                   | IPC bridge                              |

---

## Architecture Diagram

```
<file-editor>  (LitElement — shell, attributes, lifecycle)
 │
 ├── Lit template renders:
 │   ├── .fe-root (container div)
 │   │   ├── .fe-content
 │   │   │   ├── .fe-gutter       (Lit renders container, but child line-num divs are custom-managed)
 │   │   │   └── .fe-viewport     (ENTIRELY custom-managed — no Lit involvement)
 │   │   └── <fe-status-bar>      (LitElement)
 │
 ├── Custom pipeline (mounted in firstUpdated):
 │   ├── `ViewLines` — manages visible line DOM nodes (FastDomNode)
 │   │   └── `ViewLine` — per-line DOM + renderViewLine() output
 │   ├── `LineNumbersOverlay` — manages gutter children
 │   ├── `CursorRenderer` — blinking caret divs
 │   ├── `SelectionRenderer` — selection highlight spans
 │   └── `ScrollManager` — scroll events + viewport state
 │
 ├── Input (custom, no Lit):
 │   ├── `TextAreaInput` — hidden textarea overlay
 │   ├── `KeyboardHandler` — key event → command
 │   └── `ClipboardHandler` — cut/copy/paste
 │
 ├── ViewModel (custom, no Lit):
 │   ├── `CoordinatesConverter` — model ↔ view position transform
 │   └── Event dispatch — model events → view events
 │
 └── Model (custom, no Lit):
     └── `TextContentModel` — Piece tree + Edit Stack + Tokens
```

The dotted line is the Lit/non-Lit boundary. Everything at or above `.fe-content` is Lit-managed. Everything inside `.fe-viewport` and `.fe-gutter` (children) is custom-managed.

---

## Performance Rationale

**Why the viewport can't be Lit:**

1. **DOM churn during scrolling.** If Lit owned the viewport, every scroll event would trigger a re-render. Lit's `render()` would diff the template, create/destroy line elements at the boundaries, and touch the DOM of still-visible lines. With custom code, we check `if (lineNumber in [visibleRange])` and either skip, create, or destroy — O(1) per line.

2. **Absence of virtual scroller support.** Lit has no built-in virtual scroll. Building one inside Lit means fighting Lit's diff algorithm. Building one outside Lit means bypassing Lit entirely, which is what we need.

3. **Recycled DOM nodes.** When a line scrolls out of view, we want to reuse its DOM node for the line scrolling into view at the opposite edge — just change the content and absolute position. Lit's `repeat` directive can't do this.

4. **Character Mapping.** After setting `innerHTML` on a line (via `renderViewLine()`), we need the `CharacterMapping` to know where in the output DOM each input character ended up. This requires walking the DOM we just set. Lit's template system doesn't expose this — we'd have to walk the rendered DOM anyway, bypassing any benefit from Lit.

5. **Synchronous rendering.** The rendering pipeline needs tight synchronization between scroll position, line heights, cursor position, and selection ranges. These all need to be computed in the same frame. Lit's async batching (microtask-based) adds latency.

**Bottom line:** Let Lit manage what it's good at — the element shell, attributes, style bindings, and infrequently-changing UI (status bar). Let custom code manage what Lit is bad at — high-frequency, pixel-absolute, DOM-intensive rendering.
