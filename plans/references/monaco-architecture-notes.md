# Monaco Editor Architecture — Review Notes

Source: `microsoft/vscode` repo, `src/vs/editor/` directory
Reviewed: 2025-07-16

## Directory Structure

```
src/vs/editor/
├── common/           # Platform-agnostic core
│   ├── core/         # Position, Range, Selection, edit operations, strings
│   ├── config/       # Editor options, font info
│   ├── cursor/       # CursorsController, type/delete/move/word operations
│   ├── model/        # TextModel, PieceTreeTextBuffer, EditStack, tokens
│   ├── tokens/       # LineTokens, ContiguousTokensStore, sparse tokens
│   ├── languages/    # Language modes, tokenization support
│   ├── viewLayout/   # ViewLayout, LinesLayout, viewLineRenderer
│   ├── viewModel/    # ViewModelImpl, CoordinatesConverter, decorations
│   └── standalone/   # Monarch tokenizer
├── browser/          # Browser-specific rendering
│   ├── config/       # DOM font info
│   ├── controller/   # MouseHandler, PointerHandler, TextArea edit context
│   ├── view/         # View, ViewLayer, viewController, renderingContext
│   ├── viewParts/    # ViewLines, LineNumbers, Selections, Cursors, etc.
│   └── widget/       # CodeEditorWidget, DiffEditorWidget
└── contrib/          # Feature contributions
    ├── find/         # Find/Replace
    ├── folding/      # Code folding
    ├── suggest/      # Autocomplete
    ├── hover/        # Hover tooltips
    ├── format/       # Code formatting
    └── ...           # 40+ contribution modules
```

## Core Data Types

### Position (common/core/position.ts)

- `lineNumber: number` (1-based), `column: number` (1-based)
- Immutable. `with()`, `delta()`, `equals()`, `isBefore()`, `compare()`
- `IPosition` interface for serialization

### Range (common/core/range.ts)

- `startLineNumber, startColumn, endLineNumber, endColumn`
- Normalizes: ensures start <= end in constructor
- `isEmpty()`, `containsPosition()`, `containsRange()`, `intersectRanges()`, `plusRange()`
- `fromPositions()`, `lift()`, `collapseToStart()`, `collapseToEnd()`
- Static utility methods: `areIntersectingOrTouching()`, `compareRangesUsingStarts()`

### Selection (common/core/selection.ts)

- Extends Range, adds `selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn`
- Has direction: `LTR` (selectionStart is before position) vs `RTL`
- `getPosition()`, `getSelectionStart()`, `getDirection()`
- `fromPositions()`, `fromRange()`, `createWithDirection()`

### TextChange (common/core/textChange.ts)

- `(originalOffset, originalText, modifiedOffset, modifiedText)`
- `compressConsecutiveTextChanges()` — merges adjacent changes for undo stack efficiency

## Piece Tree Text Buffer

### Location: common/model/pieceTreeTextBuffer/

### Data Structure: Red-Black Tree

- Generic RB tree in `rbTreeBase.ts` with:
  - `TreeNode { parent, left, right, color, piece, size_left, size_right, ...
  - `fixInsert()`, `rbDelete()`, `righttest()`, `updateTreeMetadata()`
  - `SENTINEL` sentinel node, `leftest()` for min node

### Piece (pieceTreeBase.ts)

```typescript
class Piece {
  bufferIndex: number; // Index into _buffers array
  start: BufferCursor; // { line, column } in buffer
  end: BufferCursor; // { line, column } in buffer
  length: number; // Character count
  lineFeedCnt: number; // Number of \n in this piece
}
```

### StringBuffer (pieceTreeBase.ts)

```typescript
class StringBuffer {
  buffer: string; // The actual text
  lineStarts: Uint32Array; // Offsets of each line start in buffer
}
```

### PieceTreeBase (pieceTreeBase.ts)

- `root: TreeNode`, `_buffers: StringBuffer[]`, `_lineCnt`, `_length`
- `create()` — builds tree from initial chunks
- `insert(offset, text, incrementBuffer?)` — splits piece at offset, inserts new piece with text
- `delete(offset, length)` — removes range across possibly multiple pieces
- `getLineContent(lineNumber)` — returns full line text
- `getLineCount()` — returns total line count
- `getOffsetAt(lineNumber, column)` — returns character offset
- `getPositionAt(offset)` — returns Position from offset
- `getValueInRange(range)` — returns text in range
- `findMatchesLineByLine(range, searchData, ...)` — search within range
- Uses `PieceTreeSearchCache` (LRU, size=1) for fast offset→node lookup
- Uses `_lastVisitedLine` cache for fast line content access

### PieceTreeTextBuffer (pieceTreeTextBuffer.ts)

- Wraps PieceTreeBase with edit validation
- `applyEdits(operations, trimAutoWhitespace, computeUndoEdits)` → ApplyEditsResult
  - Validates operations (normalizes ranges, counts EOLs)
  - Sorts operations ascending, checks for overlapping
  - Calls `_doApplyEdits()`: for each operation, calls `_pieceTree.delete()` then `_pieceTree.insert()`
  - Returns `reverseOperations` (undo operations) and `contentChanges` (for event emission)
- `reduceOperations()` — collapses >1000 edits into single operation to prevent OOM

## TextModel (common/model/textModel.ts)

- `ITextModel` interface: the central model interface
- Methods:
  - `getValue()`, `getValueInRange()`, `getLineContent()`, `getLineCount()`
  - `getOffsetAt()`, `getPositionAt()`
  - `pushEditOperations()` — main mutation entry point
  - `applyEdits()` — apply without cursor state computer
  - `pushStackElement()`, `popStackElement()` — undo stack management
  - `getAlternativeVersionId()` — current version for undo tracking
- Parts:
  - `TokenizationTextModelPart` — tokenization
  - `BracketPairsTextModelPart` — bracket pair matching
  - `GuidesTextModelPart` — indentation guides
  - EditStack integration with IUndoRedoService

## Tokenization

### Tokens (tokens/lineTokens.ts)

- `LineTokens` — array of `(offset, tokenMetadata)` for one line
- Metadata encodes: languageId, tokenType, fontStyle, foreground, background
- `StandardTokenType`: Other, Comment, String, RegEx

### Token Stores

- `ContiguousTokensStore` — contiguous array per line, fast O(1) lookup
- `SparseTokensStore` — for semantic tokens (language server)
- `SparseMultilineTokens` — sparse tokens spanning multiple lines

### Backends

- `TokenizerSyntaxTokenBackend` — TextMate grammars (main path)
- `TreeSitterSyntaxTokenBackend` — tree-sitter integration
- Both implement `AbstractSyntaxTokenBackend` with:
  - `onDidChangeTokens: Event`
  - `getTokens()` → LineTokens for a range of lines
  - Background tokenization with progress

## ViewModel (common/viewModel/viewModelImpl.ts)

### Architecture

```typescript
class ViewModel extends Disposable implements IViewModel {
  model: ITextModel; // The underlying text model
  viewLayout: ViewLayout; // Scroll position, line heights
  coordinatesConverter: ICoordinatesConverter; // Model ↔ View
  private _lines: IViewModelLines; // Line projection (handles wrapping)
  private _cursor: CursorsController;
  private _decorations: ViewModelDecorations;
}
```

### Key concepts:

- `IViewModelLines` — interface for line storage
  - `ViewModelLinesFromModelAsIs` — no wrapping (identity projection)
  - `ViewModelLinesFromProjectedModel` — wrapping enabled
- `ModelLineProjection` — maps one model line to one or more view lines when wrapping
- `CoordinatesConverter` — transforms model positions to view positions and back
  - Model position (2,10) may correspond to view position (2,5) if wrapped
- ViewModel listens to model events and re-emits as view events

## View + Rendering

### ViewLayer (browser/view/viewLayer.ts)

- `RenderedLinesCollection<T>` — manages window of visible `IVisibleLine` instances
  - `onLinesDeleted()` — removes lines from collection, updates offsets
  - `onLinesInserted()` — adds lines to collection
  - `onLinesChanged()` — marks lines as needing re-render
  - Only stores lines in visible range, destroys out-of-view lines

### ViewLines (browser/viewParts/viewLines/viewLines.ts)

- Extends `ViewPart`, implements `IViewLines`
- Manages the DOM for visible lines inside `_linesContent` div
- On render pass:
  1. Gets viewport data from ViewLayout (which lines are visible)
  2. Iterates visible lines, calls `ViewLine.renderLine()`
  3. Creates new ViewLine instances for newly visible lines
  4. Removes ViewLine instances for scrolled-away lines
  5. Positions lines absolutely using `deltaTop` and `lineHeight`

### ViewLine (browser/viewParts/viewLines/viewLine.ts)

- Implements `IVisibleLine`
- `renderLine()` — generates HTML string for one view line
  - Gets line rendering data from viewport: content, tokens, decorations
  - Creates `RenderLineInput` with all options
  - Calls `renderViewLine()` → produces HTML string + CharacterMapping
  - If HTML is unchanged (same input), skips DOM update
  - Two modes: `FastRenderedViewLine` (monospace, uses char-width math) and `SlowRenderedViewLine` (reads DOM rects)
- `layoutLine()` — updates domNode's top, height, line-height
- `getVisibleRangesForRange()` — maps text range to pixel ranges (for cursor positioning)

### View Line Renderer (common/viewLayout/viewLineRenderer.ts)

- `renderViewLine(input, sb)` → `RenderLineOutput { characterMapping, containsForeignElements }`
- `_renderLine()` — the core algorithm:
  1. Resolves input options, applies font ligatures
  2. Walks tokens and decorations together (sorted by offset)
  3. Outputs `<span class="mtkX">text</span>` for each token segment
  4. Handles whitespace rendering (space characters, tab arrows)
  5. Injects inline decoration spans
- `CharacterMapping` — maps each output character position back to input offset, used for cursor→position mapping
- `OutputPosition` enum: `Regular`, `OutputCharacter`, `OffsetColumn`

### StringBuilder (core/stringBuilder.ts)

- Efficient string/char concatenation
- Tracks line count, character count
- Used by renderViewLine for output generation

## Input System (Hidden TextArea)

### TextAreaEditContext (browser/controller/editContext/textArea/)

- `TextAreaEditContext` — renders hidden textarea overlaying cursor
- `TextAreaInput` — processes textarea events:
  - `onKeyDown` → keyboard shortcuts, cursor movement
  - `onCompositionStart/Update/End` → IME composition
  - `onBeforeInput` → character typing
  - `onCut/Copy/Paste` → clipboard operations
- `TextAreaState` — tracks textarea content, selection, validates state
- Textarea is positioned absolutely over the cursor, synced on every cursor move
- Textarea value is set to the current line content (or a subset around cursor)

### TextAreaState

- Stores `value`, `selectionStart`, `selectionEnd`
- On each cursor/scroll change:
  - Compute what the textarea "should" contain (current line near cursor)
  - If different from actual textarea state, update textarea
- `apply()` → sets textarea.value, selectionStart, selectionEnd
- `validateState()` → checks textarea state matches expected

## Cursor System

### CursorsController (common/cursor/cursor.ts)

- Manages array of `OneCursor` instances (multi-cursor)
- Each cursor has a `CursorState { modelState, viewState }`
- `CursorState.modelState` — `SingleCursorState { selectionStart, position }`
- Methods:
  - `moveTo()`, `moveLeft()`, `moveRight()`, `moveUp()`, `moveDown()`
  - `type()` → handles character insertion
  - `deleteLeft()`, `deleteRight()`
  - `tab()`, `paste()`
- All mutations go through `_executeOperations()` which calls `model.pushEditOperations()`

### cursorTypeOperations.ts

- `TypeOperations.type()` — main entry for character insertion
- Handles: auto-close pairs, surround selection, auto-indent, tab
- Returns `EditOperationResult { commands: ICommand[], shouldPushStackElement }`

### cursorDeleteOperations.ts

- `DeleteOperations.deleteRight()` — forward delete
- `DeleteOperations.deleteLeft()` — backspace
- Handles: auto-close pair deletion, smart line joining, word delete

### cursorMoveOperations.ts

- `MoveOperations.left/right/up/down()` — basic movement
- `MoveOperations.moveWordLeft/Right()` — word boundaries
- `MoveOperations.moveLineUp/Down()` — line moves

## Commands

### ICommand interface

```typescript
interface ICommand {
  getEditOperations(model, builder): void;
  computeCursorState(model, helper): Selection;
}
```

### Key command types:

- `ReplaceCommand` — replace range with text
- `ReplaceCommandWithOffset` — replace with cursor offset
- `ShiftCommand` — indent/outdent
- `SurroundSelectionCommand` — bracket pair wrapping

## Decorations

### Interval Tree (common/model/intervalTree.ts)

- `IntervalNode` — stores decoration data keyed by range
- `IntervalTree` — efficient query: `search(offset)` returns overlapping decorations
- `recomputeMaxEnd()` — maintains tree invariants

### Decoration Types

- `ModelDecoration` — stored on model, has `ModelDecorationOptions`
- Options control: inline class, line class, glyph margin, minimap, overview ruler
- Stickiness: how decoration behaves when text is inserted at its edges

## FastDomNode (base/browser/fastDomNode.ts)

- Wraps HTMLElement with cached property setters
- Only sets DOM properties when values change
- Methods: `setTop()`, `setLeft()`, `setWidth()`, `setHeight()`, `setDisplay()`, `setClassName()`, etc.
- Significantly reduces layout thrash during rendering

## Event System (Observables)

- Observable pattern using `IObservable<T>`, `derived()`, `observableValue()`
- Used for: tokenization backend selection, cursor state, configuration
- `recomputeInitiallyAndOnChange()` — subscribes with initial computation
- Not used everywhere — legacy code uses `Emitter<T>` pattern

## Key Architectural Insights for openp41ge-file-editor

1. **Separation into common/browser**: Core logic (model, tokens, cursor) is platform-agnostic. Only the view layer is browser-specific. This would be valuable for openp41ge too.

2. **Output-only rendering**: No contenteditable. Full control over DOM output. This is the single most important architectural decision.

3. **Piece Tree for text storage**: Essential for large files and undo/redo efficiency.

4. **Lazy everything**: Only tokenize visible lines. Only render visible lines. Only decorate visible regions.

5. **Selection/Cursor as separate render passes**: Selections and cursors are rendered as overlays on top of base text, not baked into the line HTML. This makes them easy to update independently.

6. **Character Mapping**: After rendering, a mapping from output DOM positions back to input text positions enables correct cursor placement without DOM walking.

7. **ViewPart / DynamicViewOverlay pattern**: Each visual feature is a class that registers for view events and renders into its own DOM layer. This makes the rendering pipeline composable.
