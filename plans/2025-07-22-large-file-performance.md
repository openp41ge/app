2025-07-22

# Performance: Large file loading and rendering causes UI freezes

## Status (2025-08-29)

- [x] **Phase 1A** — content width. `LineWidthTracker` (renamed from
      `LazyLineWidthTracker`) + wired into `FileEditorElement`. **Requirement
      change (explicit user decision 2025-08-29):** the horizontal scrollbar
      must be the CORRECT size from the start and must NOT change size as more
      of the file is measured. So the original "approximate + background
      idle-batch refine (Monaco-style)" design was replaced with a full
      synchronous scan on load (`measureRange(1, lineCount)`) — measured
      <10ms for a 3MB / 100k-line doc, so there is no practical cost — and
      edits re-measure only touched lines (tail rescan for line
      insert/delete, single line for same-line edits), keeping the max exact
      via `recomputeMax()` when the max line shrinks. No background widening.
- [x] **Phase 1B** — version-based dirty tracking: `VersionBasedDirtyTracker`
      implemented + wired in; model `undo()/redo()` now restore `beforeVersionId`/
      `afterVersionId` so undo-to-clean is detected. 6 engine + uikit tracker tests green.
- [x] **Phase 2** — lazy DOM / virtual scrolling for word-wrap mode: `ViewLines`
      now virtualizes over VIEW lines in wrapped mode, rendering only the visible
      window (+ over-render) instead of up to 5000 static nodes. `WrappedLineIndex`
      provides the O(log n) view↔model mapping (segment-count cache + binary
      search). Model-space accessors (`startLineNumber`, `onVisibleRangeChanged`)
      preserved so the gutter stays correct.
- [x] **Phase 2 fix (2025-08-29)** — DOM leak on wrap toggle: entering wrapped
      mode (or leaving it) now clears the stale non-wrapped/accumulated
      `_collection` lines before building the wrapped window, so DOM node
      count == rendered-line count after toggling (was: ~70 stale nodes vs 34
      rendered).
- [x] **Phase 2 in-app verification (2026-08-29)** — completed in the running
      editor demo: 2000-line doc wraps to 8000 view lines with only ~35 DOM
      nodes; scroll-to-bottom reaches the true end (model 2000 visible);
      wrapped gutter shows the correct model-space range; click-to-caret maps
      wrapped view lines to the right model line. Two more stale-cache bugs
      surfaced and fixed during the pass: - **Scrollbar-height ordering**: `_onViewModelChange` now invalidates the
      wrap index BEFORE `setTotalLineCount`, so `_updateScrollHeight` re-
      measures against the new content (was 7787 view lines instead of 8000
      when a wrapped document was replaced). - **CoordinatesConverter cache**: `ViewModel._handleModelChange` calls
      `converter.markDirty()` on every content change, fixing click-to-caret + `getTotalViewLineCount` after a wrapped reload. - **Infinite-loop guard**: `computeWrapSegments` clamps `wrapColumn < 1`
      so a 0/negative column can't wedge the editor main thread.
- [x] **Phase 3 (2026-08-30)** — async tokenization, render path never blocks
      on TextMate (Monaco-style "paint plain, highlight after"): - `LazyTokenizationManager.tokenizeLineIfCached(line)` — cache-only peek
      that NEVER invokes the grammar (syntax-highlighting unit tests). - `ViewModel.getLineTokensIfCached(line)` + `ViewModel.hasTokenizer`
      (engine unit tests, incl. tail-beyond-top-100 case). - `file-editor`: `loadFile` no longer awaits TextMate WASM bootstrap
      (deferred `_initTextMateOnce`); `_applyLanguageToCurrentModel()`
      applies the grammar — and re-renders — once WASM is ready, so a file
      that opened (and painted plain) cold still gets highlighted. - Render path uses cache-only tokens everywhere (`_renderLineContent` AND
      the wrapped line provider); `_noteRenderedLineTokens` flags uncached
      lines and schedules a single rAF catch-up (`_scheduleAsyncTokenize` /
      `_asyncTokenizeVisible`) that tokenizes the visible window and
      re-renders. Removed the synchronous init `tokenizeVisibleRange(1,100)`. - In-app verified (editor demo): plain-first-paint then one-frame
      highlight on content change (wrapped + non-wrapped); cold reload
      highlights once TextMate finishes; deep scroll paints plain with 0
      synchronous tokenize calls during the scroll render and exactly one
      rAF catch-up after — painting/scrolling never blocks on the grammar.
- [ ] **Phase 4/5** — chunked loading + web-worker tokenization. NOT started.
      Note: the file-size-limit feature (editor.maxFileSize, default 50MB,
      File Editor Settings overlay tab — 2026-08-29, plan deleted on
      completion, committed as `6bd4f32`) caps how large an openable file may
      be, a complementary guardrail on top of Phases 1-3.

## Problem

Opening a 2.9MB file causes significant UI slowdown — the application freezes
during load and remains sluggish during editing. This is caused by several
blocking O(n) operations that process the entire file content synchronously
on the renderer thread.

## Path Update (2025-08-29) — files have moved

Since this plan was written the editor was split into packages. The plan's
`file-editor.ts` references now resolve to:

| Old path (this plan)               | Current path                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `file-editor.ts`                   | `packages/openp41ge-uikit/src/components/file-editor/file-editor.ts`          |
| `view-lines.ts`                    | `packages/openp41ge-editor-engine/src/view/view-lines.ts`                     |
| `piece-tree-text-content-model.ts` | `packages/openp41ge-editor-engine/src/model/piece-tree-text-content-model.ts` |
| `electron-file-system.ts`          | `packages/openp41ge/src/main/services/electron-file-system.ts`                |
| `lazy-tokenization-manager.ts`     | `packages/openp41ge-syntax-highlighting/src/lazy-tokenization-manager.ts`     |

Line numbers in the step-by-step review below are approximate against the
original layout and will drift — verify each spot before editing.

**Confirmed still present (2025-08-29):**

- `_updateContentWidth()` still scans ALL lines on load + every edit
  (`file-editor.ts` ~`:905`).
- `_savedContent` full-string dirty tracking still live
  (`file-editor.ts` ~`:79`, compare at ~`:1082`).
- Word-wrap `onScroll` bail-out + up-to-5000-node statically rendered lines
  (`view-lines.ts:~245`, `~:356`).

**New discovery — Phase 1B needs a model change:** the plan assumed
`versionId === _savedVersionId` becomes true after undo-to-clean, because the
model "already has" `versionId`/`alternativeVersionId`. That assumption is
WRONG against the current implementation:

- `undo()` and `redo()` in `piece-tree-text-content-model.ts` do
  `this._versionId++` — they NEVER restore the pre-edit version.
- So `versionId` is a monotonic counter of edits (Monaco's restores it from
  the edit element's `beforeVersionId`/`afterVersionId`). After save at v=5,
  edit twice (v=7), undo twice (v=9) — the document equals the saved content
  but `versionId` is 9, not 5. A comparison-based tracker would report dirty
  forever.
- `alternativeVersionId` is only the `afterVersionId` of the top undo
  element — not usable for undo-to-clean detection.
- **Fix (prerequisite for Phase 1B):** make `undo()` set
  `_versionId = element.beforeVersionId` and `redo()` set
  `_versionId = element.afterVersionId` (Monaco semantics). Then
  `VersionBasedDirtyTracker` is correct. This is a small, contained change
  to the shared editor-engine model with no current test coverage — so it
  gets its own regression tests.

## Review of the Loading Pipeline

Below is the complete loading flow for a file opened in the editor, with
performance issues identified at each step.

### Step 1: IPC file read (`_readFile` → `window.openp41ge.file.readRange`)

**File**: `file-editor.ts` line 1179

```typescript
const result = await window.openp41ge.file.readRange(path, 0, 1024 * 1024 * 10);
```

- Reads up to 10MB into memory as a single string
- IPC serializes the full 2.9MB string across the process boundary
- **Issue**: Entire file loaded at once, held in memory as one big JS string
  (~2.9MB heap, plus GC pressure)

**File**: `electron-file-system.ts` line 69

```typescript
const buf = Buffer.alloc(Math.min(length, Math.max(0, totalSize - offset)));
const { bytesRead } = await fd.read(buf, 0, buf.length, offset);
```

- Main process: opens file, reads into Buffer, converts to UTF-8 string
- Returns full string across IPC

### Step 2: Piece tree construction (`PieceTreeTextContentModel` constructor)

**File**: `piece-tree-text-content-model.ts` line 63

```typescript
const lineStarts = createLineStartsFast(normalized);
const buffer = new StringBuffer(normalized, lineStarts);
this._pieceTree = new PieceTreeBase([buffer], "\n", true);
```

- Normalizes EOL (`.replace(/\r\n/g, "\n")` — creates a NEW 2.9MB string)
- `createLineStartsFast` scans the entire 2.9MB to find all `\n` positions
  (O(n) CPU on the renderer thread)
- `PieceTreeBase.create()` builds the red-black tree from the large buffer
- **Issue**: Two full string copies created (normalized + original) during
  construction. Line starts array built by scanning entire file.

### Step 3: ViewModel setup / view pipeline creation

**File**: `file-editor.ts` line 193 (`_initWithModel`)

- Creates `CursorController`, `KeyboardHandler`, `TextAreaInput`, etc.
- These are lightweight, no performance issue here.

### Step 4: Initial tokenization

**File**: `file-editor.ts` line 292

```typescript
this._viewModel.tokenizeVisibleRange(1, Math.min(100, model.lineCount));
```

- Tokenizes the first 100 lines through oniguruma (regex engine)
- Each line calls into the TextMate grammar via WASM
- **Issue**: If the first 100 lines are long (e.g., minified file), each line
  can be thousands of characters, making tokenization very slow.

### Step 5: `_updateContentWidth` — SCANS ALL LINES ⚠️ CRITICAL

**File**: `file-editor.ts` line 430-452

```typescript
private _updateContentWidth(): void {
    // ...
    let maxCols = 0;
    for (let i = 1; i <= lineCount; i++) {     // ← SCANS EVERY SINGLE LINE
        const content = this._viewModel.getLineContent(i);
        const cols = this._computeVisibleColumns(content, tabSize);
        if (cols > maxCols) maxCols = cols;
    }
    // ...
}
```

- **Loops over ALL lines** in the file (potentially 50K+ lines for a 2.9MB file)
- Calls `getLineContent(i)` for each line — this walks the piece tree O(log n)
  per call and creates a new substring
- Calls `_computeVisibleColumns` which tab-expands each line
- **This is called on EVERY file load and EVERY edit**, including typing a single character
- **MAJOR BOTTLENECK**: For 50K lines, this alone can freeze the UI for seconds

### Step 6: `_savedContent = model.getValue()` — copies entire file

**File**: `file-editor.ts` line 294

```typescript
this._savedContent = model.getValue();
```

- `getValue()` concatenates all pieces from the tree into one string
- Copies the entire 2.9MB document
- **Issue**: Full string copy on every load, plus comparison on every change

### Step 7: Full DOM rebuild for word wrap (if enabled)

**File**: `view-lines.ts` line 330-350

```typescript
if (this._wordWrapEnabled) {
  const totalView = this.getViewLineCount();
  this._visibleStartLine = 1;
  this._visibleEndLine = Math.min(totalView, 5000);
  this._rebuildLines(1, this._visibleEndLine);
}
```

- Creates up to 5000 ViewLine DOM elements
- Each element is an absolutely-positioned div
- **Issue**: 5000 DOM nodes created upfront for word wrap mode

### Step 8: `_onModelContentChange` — re-scans all lines on every edit

**File**: `file-editor.ts` line 485-496

```typescript
private _onModelContentChange(event: TextContentChangeEvent): void {
    const model = this.textContentModel;
    if (model) {
        const isClean = model.getValue() === this._savedContent;  // ← full string compare
        // ...
    }
    this._updateContentWidth();  // ← re-scans ALL lines
}
```

- **Two expensive operations on every keystroke**:
  - `model.getValue()` — full string concatenation of all pieces
  - `_updateContentWidth()` — re-scans all lines for max width

### Unrelated to this file but worth noting

- `initTextMate()` decodes a ~500KB base64 WASM blob synchronously via
  `atob()` + manual byte copy. This blocks the first file open.
- The onig.wasm is loaded via `atob()` of an inline base64 string, not from
  a file URL. This adds ~500KB to the bundle and decoding time.

## How VSCode/Monaco Handles Large Files

> **Deviation (2025-08-29, explicit user requirement):** the sections below
> describing Monaco's "approximate max width that refines over time" were
> originally adopted as the plan's design, but the user requires the horizontal
> scrollbar to be the CORRECT size from the start (no size change as more of
> the file is measured). A full synchronous width scan is <10ms for a 3MB /
> 100k-line doc with the current engine, so Phase 1A implements
> correct-from-start instead (see Status). Kept here for provenance.

### 1. Incremental max line width tracking

VSCode does NOT scan all lines on load for content width. Instead, it starts
with `maxLineWidth = 0` and updates it incrementally:

- On load: only measure visible lines
- On scroll: measure newly visible lines
- On edit: remeasure only the edited line(s)
- Background: lazy measurement of off-screen lines via idle callback

**Key insight**: The horizontal scrollbar doesn't need to be accurate from
the start with large files. It can be approximate and refine over time.

### 2. Chunked file loading for very large files

VSCode has a `LargeFileBinary` mode for files > 50MB that loads them as a
streaming buffer. Files between ~20MB and 50MB get loaded with a progress
indicator. The model only holds the piece tree structure, not the entire
content as a single string — pieces reference slices of memory-mapped or
streamed chunks.

### 3. Tokenization limits

- VSCode limits tokenization to the first N lines by default (50K?)
- Tokenization runs in a web worker (separate thread)
- Grammar matching has time limits per line

### 4. Dirty state via version counters

Instead of comparing the full string, VSCode tracks dirty state via:

- `versionId` increments on each edit
- `alternativeVersionId` from edit stack
- Dirty = `versionId !== altVersionId` after accounting for saved snapshot
- **No full string comparison needed**

### 5. Virtual scrolling (fixed)

VSCode only creates DOM nodes for visible lines + over-render buffer (~5
lines above/below). Off-screen lines have no DOM representation. This is
already implemented in the current editor (for non-wrapped mode) but not
for word wrap mode.

### 6. Web workers for tokenization

VSCode runs TextMate tokenization in a web worker to avoid blocking the
UI thread. This is a major architectural difference.

### 7. Incremental content width measurement

Monaco calls `ModelLine.invalidateDecorations()` instead of recalculating
everything. Width measurement is done lazily and cached per line.

## SOLID Principles Alignment

### Single Responsibility — FileEditorElement does far too much

The plan identifies that `file-editor.ts` is the main bottleneck. Every phase
below should be implemented with extraction, not accretion:

**Extract these from FileEditorElement:**

```typescript
// 1. Line width tracking
interface ILineWidthTracker {
  getMaxWidth(): number;
  measureLine(lineNumber: number): number;
  invalidateLine(lineNumber: number): void;
  scheduleBackgroundScan(): void;
}
class LazyLineWidthTracker implements ILineWidthTracker {
  private _lineCache: Map<number, number> = new Map();
  private _maxWidth: number = 0;
  private _maxWidthDirty: boolean = false;

  // Phase 1A: scan first 1000 lines on load, background for rest
  // Phase 1A: only re-measure edited lines on change
}

// 2. Dirty state tracking
interface IDirtyStateTracker {
  readonly isDirty: boolean;
  markSaved(): void;
  notifyChange(versionId: number): void;
}
class VersionBasedDirtyTracker implements IDirtyStateTracker {
  // Phase 1B: use versionId instead of full string comparison
  private _savedVersionId: number = -1;
  private _currentVersionId: number = 0;
  get isDirty(): boolean {
    return this._currentVersionId !== this._savedVersionId;
  }
}

// 3. Tokenization scheduling
interface ITokenizationScheduler {
  scheduleBatch(lines: number[]): void;
  cancelPending(): void;
}
class IdleCallbackTokenizationScheduler implements ITokenizationScheduler {
  // Phase 3: batch tokenization via requestIdleCallback
}

// 4. File reading abstraction
interface IFileReader {
  readRange(path: string, offset: number, length: number): Promise<string>;
}
interface IChunkedFileReader extends IFileReader {
  readWithProgress(
    path: string,
    onProgress: (percent: number) => void,
  ): Promise<{ content: string; lineStarts: number[] }>;
}
class ElectronFileReader implements IFileReader {
  /* IPC wrapping */
}
class ChunkedIpcFileReader implements IChunkedFileReader {
  /* Phase 4 */
}
```

### Open/Closed

- The background width scanning uses an idle-callback strategy by default.
  If a platform doesn't support `requestIdleCallback`, a fallback
  `SetTimeoutTokenizationScheduler` can be injected without changing the
  scheduler interface.
- Tokenization can be offloaded to a web worker (Phase 5) without changing
  the editor — swap `IInlineTokenizer` for `IWorkerTokenizer`.

```typescript
interface ITokenizer {
  tokenizeLines(
    lines: { lineNumber: number; text: string }[],
    grammar: TextMateGrammar,
  ): Promise<ITokenizationResult[]>;
}
// Inline: blocks UI, synchronous
class InlineTokenizer implements ITokenizer { ... }
// Worker: runs in web worker, async
class WorkerTokenizer implements ITokenizer { ... }
// FileEditorElement accepts ITokenizer as constructor injection
```

### Dependency Inversion

- `FileEditorElement` should accept `ILineWidthTracker`, `IDirtyStateTracker`,
  `ITokenizationScheduler`, `IFileReader`, and `ITokenizer` as injectable
  dependencies.
- **Default constructor** provides production implementations.
- **Test override** via setter methods or optional constructor args.

```typescript
class FileEditorElement extends HTMLElement {
  // Accept overrides via optional constructor param or public setter
  private _lineWidthTracker: ILineWidthTracker;
  private _dirtyTracker: IDirtyStateTracker;

  constructor() {
    super();
    this._lineWidthTracker = new LazyLineWidthTracker(this._viewModel);
    this._dirtyTracker = new VersionBasedDirtyTracker();
  }

  // For testing
  setLineWidthTracker(tracker: ILineWidthTracker): void {
    this._lineWidthTracker = tracker;
  }
}
```

### Interface Segregation

- `ILineWidthTracker`: 4 methods — focused on line width concerns only
- `IDirtyStateTracker`: 3 methods — focused on dirty state only
- `ITokenizer`: 1 method — focused on tokenization only
- `IFileReader`: 1 method — focused on file reading only
- No interface has more than 4 methods.

### Liskov Substitution

- `VersionBasedDirtyTracker.markSaved()` sets `_savedVersionId = _currentVersionId`,
  so `isDirty` returns `false` immediately. This mimics the previous
  `_savedContent = model.getValue()` contract precisely.
- `LazyLineWidthTracker` returns `_maxWidth` even if background scan hasn't
  completed — it degrades gracefully (approximate width) instead of throwing.

## Improvement Plan

### Phase 1: Eliminate full-file scans (HIGH IMPACT)

#### A. Make `_updateContentWidth()` incremental

**File**: `file-editor.ts`

**Problem**: `_updateContentWidth()` scans all lines on every load and edit.

**Solution**:

- On file load: scan only the first 1000 lines (or limit to 10 seconds of
  scanning time). Set an initial max width based on partial data.
- After load, schedule a background idle callback to finish scanning off-screen
  lines in chunks (1000 lines per batch, yielding between batches).
- On edit: only re-measure the affected line(s), track per-line widths in a
  `Map<number, number>`.
- Add a `_pendingWidthScan` flag that prevents duplicate background scans.

**Implementation**:

```typescript
private _lineWidthCache: Map<number, number> = new Map();
private _maxLineWidth: number = 0;
private _pendingWidthScan: boolean = false;

private _updateContentWidth(editedLines?: number[]): void {
    if (editedLines) {
        // Incremental: only re-measure changed lines
        for (const line of editedLines) {
            const width = this._measureLineWidth(line);
            this._lineWidthCache.set(line, width);
        }
        this._recomputeMaxWidth();
    } else {
        // Initial: scan first 1000 lines, schedule rest in background
        this._scanLineWidthsPartial();
    }
}

private _scanLineWidthsPartial(startLine: number = 1, batchSize: number = 1000): void {
    const endLine = Math.min(startLine + batchSize - 1, this._viewModel!.lineCount);
    for (let i = startLine; i <= endLine; i++) {
        const width = this._measureLineWidth(i);
        this._lineWidthCache.set(i, width);
    }
    if (endLine < this._viewModel!.lineCount) {
        // Schedule next batch via requestIdleCallback or setTimeout
        this._pendingWidthScan = true;
        requestIdleCallback(() => {
            this._pendingWidthScan = false;
            this._scanLineWidthsPartial(endLine + 1);
        });
    }
    this._recomputeMaxWidth();
}
```

#### B. Eliminate full string copy for dirty state tracking

**Problem**: `_savedContent = model.getValue()` copies the entire file;
`model.getValue() === this._savedContent` compares full strings on every edit.

**Solution**: Use version-based dirty tracking instead:

- `_savedVersionId: number` — stores the version ID at last save/load
- On content change: `isClean = this.textContentModel.versionId === this._savedVersionId`
- On save: `this._savedVersionId = this.textContentModel.versionId`
- The model already has `versionId` and `alternativeVersionId`. When undo
  restores to the save point, `versionId === _savedVersionId` will be true.

**This eliminates the O(n) `getValue()` call from every keystroke.**

### Phase 2: Lazy DOM for word wrap mode (HIGH IMPACT)

**Problem**: Word wrap mode creates up to 5000 ViewLine DOM elements upfront.

**Solution**: Apply virtual scrolling to word wrap mode:

- Only create ViewLine elements for the visible viewport + over-render buffer
  (same as non-wrapped mode)
- When scrolling with word wrap, update visible range and create/destroy
  ViewLine elements incrementally
- The `ViewLines.onScroll()` method currently bails out for word wrap with
  `if (this._wordWrapEnabled) return;` — remove this guard and implement
  proper incremental scrolling for wrapped lines.

### Phase 3: Async tokenization and line rendering (MEDIUM IMPACT)

**Problem**: Tokenization of visible lines and line rendering happen synchronously
during `_initWithModel`, blocking the initial paint.

**Solution**:

- Split `_initWithModel` into sync (setup data structures) and async (render)
  phases
- Show a "Loading..." state in the status bar during the async phase
- Tokenize lines in batches, rendering each batch as it completes
- Use `requestAnimationFrame` or `requestIdleCallback` between batches to
  keep the UI responsive

### Phase 4: Chunked file loading (LOWER IMPACT for 2.9MB files)

**Problem**: The entire file is read as one IPC message and stored in memory.

**Solution**:

- For files > 1MB, switch to chunked loading with progress indication
- Main process streams file chunks at ~1MB per chunk
- Renderer builds the piece tree incrementally as chunks arrive
- Status bar shows progress: "Loading... 45%"
- Editor becomes interactive as soon as the first chunk is loaded and rendered

### Phase 5: Offload tokenization to web workers (LOWER IMPACT)

**Problem**: TextMate tokenization via oniguruma WASM runs on the renderer
thread, blocking the UI.

**Solution**:

- Move tokenization to a web worker
- The worker loads the oniguruma WASM and TextMate grammars independently
- Main thread sends line content to the worker, receives token results via
  postMessage
- During tokenization, lines render without highlighting (plain text),
  then highlights appear asynchronously

## Files to Change

### High Impact

| File                                                                 | Change                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `openp41ge-uikit/src/components/file-editor/file-editor.ts`          | Incremental `_updateContentWidth()` — scan first 1000 lines, background for rest |
| `openp41ge-uikit/src/components/file-editor/file-editor.ts`          | Version-based dirty tracking instead of full string copy                         |
| `openp41ge-uikit/src/components/file-editor/file-editor.ts`          | Remove `_savedContent` field, wire `VersionBasedDirtyTracker`                    |
| `openp41ge-uikit/src/components/file-editor/line-width-tracker.ts`   | NEW — `ILineWidthTracker` + `LazyLineWidthTracker` (injectable, idle-batched)    |
| `openp41ge-uikit/src/components/file-editor/dirty-state-tracker.ts`  | NEW — `IDirtyStateTracker` + `VersionBasedDirtyTracker` (injectable)             |
| `openp41ge-editor-engine/src/view/view-lines.ts`                     | Remove `if (this._wordWrapEnabled) return;` guard in `onScroll()`                |
| `openp41ge-editor-engine/src/view/view-lines.ts`                     | Implement virtual scrolling for word wrap mode (incremental line creation)       |
| `openp41ge-editor-engine/src/model/piece-tree-text-content-model.ts` | Restore `_versionId` on `undo()`/`redo()` — Phase 1B prerequisite                |
| `openp41ge-uikit/src/components/file-editor/file-editor.ts`          | Split `_initWithModel` init into sync/async phases for initial paint             |

### Medium Impact

| File                                                        | Change                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `openp41ge-uikit/src/components/file-editor/file-editor.ts` | Add batch-based initial rendering with `requestIdleCallback`         |
| `openp41ge-uikit/src/components/file-editor/file-editor.ts` | Show loading progress in status bar                                  |
| various                                                     | Add `isLoading` state management to prevent interactions during load |

### Lower Impact

| File                                                                 | Change                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| `openp41ge/src/main/services/electron-file-system.ts`                | Add streaming/chunked `readRange` support for large files |
| `openp41ge-uikit/src/components/file-editor/file-editor.ts`          | Use chunked reads for files > 1MB                         |
| `openp41ge-editor-engine/src/model/piece-tree-text-content-model.ts` | Support incremental buffer appending                      |
| New file                                                             | Web worker for TextMate tokenization                      |
| `openp41ge-syntax-highlighting/src/lazy-tokenization-manager.ts`     | Accept worker-based tokenizer                             |

## Non-Goal for This Plan

This plan does NOT address:

- The `domino` effect from oniguruma WASM loading (base64 decode) — this is a
  one-time cost and acceptable for now.
- General memory usage beyond the immediately required changes.
- File editing performance for files > 50MB (that's a separate "large file
  support" feature).

## Test Plan

### Automated (Vitest, written first)

**`openp41ge-editor-engine/test/unit/model/version-id.test.ts`** — undo/redo must
restore `_versionId` (Monaco semantics), enabling undo-to-clean detection:

- edit increments `versionId`; `undo()` restores to the batch's `beforeVersionId`;
  `redo()` restores to `afterVersionId`
- `markClean()` at v, edit, undo → document equals saved state and
  `versionId === savedVersionId`

**`openp41ge-uikit/test/components/file-editor/line-width-tracker.test.ts`** —
`LazyLineWidthTracker` unit tests:

- `init` measures only the first batch synchronously; `maxColumns` reflects them
- background scan (injected idle scheduler) eventually measures all remaining
  lines in batches without blocking
- `measure(line)` re-measures just one line and raises `maxColumns`
- `invalidateFrom(n)` drops shifted lines; `reset()` clears everything
- `dispose()` cancels pending background scans

**`openp41ge-uikit/test/components/file-editor/dirty-state-tracker.test.ts`** —
`VersionBasedDirtyTracker` unit tests: dirty after change, clean after
`markSaved`, clean when undo returns to the saved version.

**`openp41ge-uikit/test/components/file-editor/performance-trackers.integration.test.ts`** —
mount a real `file-editor` with a `PieceTreeTextContentModel`:

- typing → `_isDirty` true; save → false; **undo-to-clean → false** (regression
  guard for the `_savedContent` replacement)
- a large model (e.g. 20k lines) mounts without scanning all lines synchronously
  (spy that the width measure function is not called once per line on load)

#- `packages/openp41ge-syntax-highlighting/test/lazy-tokenization-manager.test.ts` —
`tokenizeLineIfCached` returns cached tokens or null WITHOUT invoking the
grammar; null for out-of-range; reflects only the lines `tokenizeVisibleRange`
produced synchronously. (Phase 3)

- `packages/openp41ge-editor-engine/test/unit/model/view-model-tokens.test.ts` —
  `hasTokenizer` false before a grammar; `setTokenizer` flags it and tokenizes
  the top 100; `getLineTokensIfCached` returns null beyond the tokenized window
  without invoking the grammar; returns cached tokens after `tokenizeVisibleRange`.
  (Phase 3)

## Manual

1. Open a 2.9MB file:
   - Verify the editor loads within 2 seconds (milliseconds for the first
     visible lines to appear, full width measurement in background)
   - Verify the editor is interactive during the background width scan
     (typing, scrolling work without freezing)
2. Open a small file (1KB) — verify no regression in load speed
3. Type in a large file — verify edits don't trigger full-file re-scans
4. Scroll in a large file — verify smooth scrolling (no frame drops)
5. Check horizontal scrollbar — verify it becomes accurate as background
   width scan progresses
6. Toggle word wrap on a large file — verify it only renders visible
   lines, not 5000 DOM nodes
7. Check dirty state — verify "● Modified" indicator works correctly
   after undo-to-clean
