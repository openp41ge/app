/**
 * <openp41ge-log-viewer> — Log viewer Lit component.
 *
 * Renders a flat, datetime-ordered list of log entries with a level filter
 * bar. It is **backward-paging**: it starts at the newest entries (scrolled to
 * the bottom) and, when you scroll up toward the top, loads older pages and
 * prepends them (optionally reading into prior daily files via a
 * file-backed `LogPageReader`).
 *
 * By default it reads the in-memory log bus via `MemLogPageReader`; the
 * platform injects a file-backed reader (over `~/.openp41ge/logs`) by setting
 * the `pageReader` property.
 */

import { LitElement, html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { LogLevel, LOG_LEVEL_LABELS } from "./log-buffer";
import {
  LOG_PAGE_DEFAULT_LIMIT,
  MemLogPageReader,
  type LogPageReader,
  type LogViewEntry,
} from "./log-page-reader";
import { LogListLayout } from "./log-list-layout";
import { findMatchRanges, type TextRange } from "./log-search";

/**
 * One entry in the virtual list. Either the day-boundary confirmation row
 * (always index 0 when present) or a log entry.
 */
type ViewItem =
  | { kind: "boundary"; label: string; key: "__day-boundary" }
  | { kind: "entry"; entry: LogViewEntry; key: string };

/** A log entry's individually-searchable rendered fields. */
type SearchSegment = "level" | "time" | "source" | "message";

/** One individual matching occurrence — a range within one searchable segment
 * of one entry. Search counts and navigates occurrences, not whole rows. */
interface LogMatchOccurrence {
  entry: LogViewEntry;
  segment: SearchSegment;
  range: TextRange;
}

// Compact inline glyphs for the find toggles — kept as text so they read
// clearly at 11px (same intent as the file editor's find bar).
// The bottom-bar search icon matches the Explorer sidebar's Material
// magnifier+list searchIcon, so both use the same glyph.
const ICON_SEARCH =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="18" height="18" fill="currentColor"><path d="M80-200v-80h400v80H80Zm0-200v-80h200v80H80Zm0-200v-80h200v80H80Zm744 400L670-354q-24 17-52.5 25.5T560-320q-83 0-141.5-58.5T360-520q0-83 58.5-141.5T560-720q83 0 141.5 58.5T760-520q0 29-8.5 57.5T726-410l154 154-56 56ZM560-400q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Z"/></svg>';
const ICON_REGEX =
  '<svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><text x="0.5" y="11" font-size="11" font-family="Consolas,monospace" font-weight="600">.*</text></svg>';
const ICON_CASE =
  '<svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><text x="0.5" y="10.5" font-size="10.5" font-family="sans-serif" font-weight="700">Aa</text></svg>';
const ICON_WORD =
  '<svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><rect x="1" y="2" width="11" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1"/><text x="6.5" y="10" text-anchor="middle" font-size="7.5" font-family="sans-serif" font-weight="700">ab</text></svg>';
const ICON_PREV =
  '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5v-5M2.2 4.8l2.8-2.8 2.8 2.8"/></svg>';
const ICON_NEXT =
  '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5v5M2.2 5.2l2.8 2.8 2.8-2.8"/></svg>';

const LEVELS: LogLevel[] = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];

function levelClass(level: LogLevel): string {
  return LogLevel[level].toLowerCase();
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return [
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join(":");
}

export class Openp41geLogViewer extends LitElement {
  static readonly tagName = "openp41ge-log-viewer";

  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @state() private _minLevel: LogLevel = LogLevel.DEBUG;
  @state() private _wrap = false;
  @state() private _entries: LogViewEntry[] = [];

  private _pageReader: LogPageReader | null = null;
  private _system: string | null = null;
  private _source: string | null = null;
  private _cursor: unknown = null;
  private _hasOlder = false;
  private _nextDayCursor: unknown = null;
  private _nextDayLabel = "";
  private _loadingOlder = false;
  private _unsubscribeLive: (() => void) | null = null;
  private _isScrolledUp = false;
  private _scrollToBottomPending = false;

  // Virtual list. Only the visible window of items is rendered; measured per-item
  // heights are cached by a stable key so they survive prepend/append/filter.
  private _layout = new LogListLayout();
  private _heightCache = new Map<string, number>();
  private _items: ViewItem[] = [];
  private _layoutDirty = true;
  private _viewStart = 0;
  private _viewEnd = 0;
  /** Guards the measure→re-render loop so a pathology can't spin the renderer. */
  private _measurePasses = 0;

  // In-log find bar (Cmd/Ctrl+F or the bottom-bar search icon). Spans today's
  // logs plus any day the user explicitly confirmed via the day-boundary row —
  // including entries not yet loaded into the virtual window.
  @state() private _searchOpen = false;
  @state() private _searchQuery = "";
  @state() private _searchRegex = false;
  @state() private _searchCase = false;
  @state() private _searchWholeWord = false;
  private _searchMatches: LogMatchOccurrence[] = [];
  private _activeMatchIndex = 0;
  private _activeEntry: LogViewEntry | null = null;
  private _activeSegment: SearchSegment | null = null;
  private _activeRange: TextRange | null = null;
  private _searchRangeMap = new Map<string, Record<SearchSegment, TextRange[]>>();
  /** Once the confirmed-day window has been fully drained, search is a pure
   * in-memory op (today + any explicitly-confirmed older days). */
  private _searchDrained = false;
  private _searchLoading = false;
  private _searchDebounce: ReturnType<typeof setTimeout> | null = null;

  /** Optional backward-paging log source. Defaults to `MemLogPageReader`. */
  get pageReader(): LogPageReader | null {
    return this._pageReader;
  }

  set pageReader(value: LogPageReader | null) {
    if (value !== this._pageReader) {
      this._pageReader = value;
      if (this.isConnected) this._start();
    }
  }

  /** Optional system (plugin id / platform) filter; null = any system. */
  get system(): string | null {
    return this._system;
  }

  set system(value: string | null) {
    if (value !== this._system) {
      this._system = value;
      this.requestUpdate();
    }
  }

  /** Optional stream (logger namespace) filter; null = all logs. */
  get source(): string | null {
    return this._source;
  }

  set source(value: string | null) {
    if (value !== this._source) {
      this._source = value;
      this.requestUpdate();
    }
  }

  private get _listEl(): HTMLElement | null {
    return this.querySelector(".log-list");
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Cmd/Ctrl+F is listened on the host so it works whether focus is on the
    // host element or anywhere inside the viewer. Because the component renders
    // into light DOM, keydown events from .log-list bubble up through
    // .viewer-root to the host, so this one listener covers both. It only fires
    // when focus is actually inside THIS viewer — it must not open search when
    // focus is on the sidebar or another pane (there'd be no way to decide
    // which of several log viewers owns the shortcut).
    this.addEventListener("keydown", this._onListKeyDown);
    // Keep focus inside the viewer when the user clicks a non-interactive part
    // of the pane (gaps, padding, .log-list background). Without this, focus
    // falls back to <body> and the host listener stops catching Cmd/Ctrl+F.
    // Interactive controls (buttons, inputs, …) keep their own focus.
    this.addEventListener("pointerdown", this._onPointerDown);
    this._start();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this._onListKeyDown);
    this.removeEventListener("pointerdown", this._onPointerDown);
    this._teardown();
  }

  private _onPointerDown = (e: PointerEvent): void => {
    // Don't steal focus from interactive controls the user is about to operate.
    const t = e.target as HTMLElement | null;
    if (t && t.closest("button, input, textarea, select, a, [contenteditable]")) return;
    this._listEl?.focus();
  };

  /** The entries that pass the current level filter (all logs, datetime order). */
  private get _visible(): LogViewEntry[] {
    return this._entries.filter((e) => e.level >= this._minLevel);
  }

  /** Stable key used to cache an item's measured pixel height. */
  private _entryKey(entry: LogViewEntry): string {
    return `${entry.timestamp}|${entry.level}|${entry.system}|${entry.source}|${entry.message}`;
  }

  /** Rebuild the virtual-item list (boundary row first, then filtered entries). */
  private _rebuildItems(): ViewItem[] {
    const items: ViewItem[] = [];
    if (this._nextDayCursor !== null) {
      items.push({ kind: "boundary", label: this._nextDayLabel, key: "__day-boundary" });
    }
    for (const entry of this._visible) {
      items.push({ kind: "entry", entry, key: this._entryKey(entry) });
    }
    this._items = items;
    return items;
  }

  /**
   * Reconcile the layout with the current item list after a mutation
   * (prepend, append, filter change, boundary appearance). Re-applies the
   * measured-height cache so previously measured rows keep their height even
   * when their index shifted after a prepend.
   */
  private _syncLayout(items: ViewItem[]): void {
    const n = items.length;
    if (this._layout.count !== n) {
      this._layout.setCount(n);
    }
    const updates: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const h = this._heightCache.get(items[i].key);
      if (h !== undefined) updates.push([i, h]);
    }
    if (updates.length > 0) this._layout.updateHeights(updates);
    this._layoutDirty = false;
    this._measurePasses = 0;
  }

  private _start(): void {
    this._teardown();
    const reader = this._pageReader || new MemLogPageReader();
    this._pageReader = reader;
    this._entries = [];
    this._cursor = null;
    this._hasOlder = false;
    this._nextDayCursor = null;
    this._nextDayLabel = "";
    this._loadingOlder = false;
    this._layout = new LogListLayout();
    this._heightCache = new Map<string, number>();
    this._items = [];
    this._layoutDirty = true;
    this._viewStart = 0;
    this._viewEnd = 0;
    this._measurePasses = 0;
    this._searchOpen = false;
    this._searchQuery = "";
    this._searchMatches = [];
    this._activeMatchIndex = 0;
    this._activeEntry = null;
    this._activeSegment = null;
    this._activeRange = null;
    this._searchRangeMap = new Map<string, Record<SearchSegment, TextRange[]>>();
    this._searchDrained = false;
    this._searchLoading = false;
    if (this._searchDebounce) {
      clearTimeout(this._searchDebounce);
      this._searchDebounce = null;
    }
    this._unsubscribeLive = reader.subscribe((entry) => this._onLiveEntry(entry));
    this._loadLatest(reader);
  }

  private _teardown(): void {
    this._unsubscribeLive?.();
    this._unsubscribeLive = null;
  }

  private async _loadLatest(reader: LogPageReader): Promise<void> {
    try {
      const page = await reader.loadLatest(LOG_PAGE_DEFAULT_LIMIT);
      if (this._pageReader !== reader) return;
      // Merge, don't clobber: live entries may have arrived while the initial
      // page was being loaded (they are newer than the loaded window).
      this._entries = [...page.entries, ...this._entries];
      this._layoutDirty = true;
      this._cursor = page.cursor;
      this._hasOlder = page.hasOlder;
      this._nextDayCursor = page.nextDayCursor ?? null;
      this._nextDayLabel = page.nextDayLabel ?? "";
      this._scrollToBottomPending = true;
    } catch {
      // The injected reader failed (e.g. the file-backed bridge isn't wired
      // yet). Fall back to the in-memory bus so the pane is never blank.
      this._pageReader = new MemLogPageReader();
      this._unsubscribeLive?.();
      this._unsubscribeLive = this._pageReader.subscribe((e) => this._onLiveEntry(e));
      try {
        const page = await this._pageReader.loadLatest(LOG_PAGE_DEFAULT_LIMIT);
        this._entries = page.entries;
        this._layoutDirty = true;
        this._cursor = page.cursor;
        this._hasOlder = page.hasOlder;
        this._nextDayCursor = page.nextDayCursor ?? null;
        this._nextDayLabel = page.nextDayLabel ?? "";
        this._scrollToBottomPending = true;
      } catch {
        // ignore
      }
    }
  }

  /**
   * Load the next older page. Called by the scroll handler (within-day, auto)
   * with no argument, or by the day-boundary confirmation row with an explicit
   * `target` cursor to cross into an older day.
   */
  private async _loadOlder(target?: unknown): Promise<void> {
    if (this._loadingOlder || !this._pageReader) return;
    if (target === undefined && !this._hasOlder) return;
    this._loadingOlder = true;
    const list = this._listEl;
    const oldScrollTop = list?.scrollTop ?? 0;
    const oldScrollHeight = list?.scrollHeight ?? 0;
    const reader = this._pageReader;
    const cursor = target !== undefined ? target : this._cursor;
    try {
      const page = await reader.loadOlder(cursor, LOG_PAGE_DEFAULT_LIMIT);
      if (this._pageReader !== reader) return;
      this._entries = [...page.entries, ...this._entries];
      this._layoutDirty = true;
      this._cursor = page.cursor;
      this._hasOlder = page.hasOlder;
      this._nextDayCursor = page.nextDayCursor ?? null;
      this._nextDayLabel = page.nextDayLabel ?? "";
      await this.updateComplete;
      const newList = this._listEl;
      if (newList) {
        newList.scrollTop = oldScrollTop + (newList.scrollHeight - oldScrollHeight);
      }
      // A day-boundary click crossed into an explicitly-confirmed older day:
      // that day is now part of the searchable window. Mark it undrained (so the
      // next search re-drains the rest of that day) and re-run the search so
      // matches span the newly-confirmed entries too.
      if (target !== undefined) {
        this._searchDrained = false;
        if (this._searchOpen) this._scheduleSearch();
      }
    } catch {
      // ignore — the next scroll will retry.
    } finally {
      this._loadingOlder = false;
    }
  }

  private _onLiveEntry(entry: LogViewEntry): void {
    this._entries = [...this._entries, entry];
    this._layoutDirty = true;
    // If the user is at the bottom, auto-scroll to it on the next paint.
    if (!this._isScrolledUp) this._scrollToBottomPending = true;
    // Live entries may match the active query → refresh the search result set.
    if (this._searchOpen) this._scheduleSearch();
  }

  private _setLevel(lvl: LogLevel): void {
    this._minLevel = lvl;
    this._layoutDirty = true;
    if (this._searchOpen) this._computeSearchMatches();
  }

  private _toggleWrap(): void {
    this._wrap = !this._wrap;
    // Wrapping changes every row's height, so discard measured heights.
    this._heightCache = new Map<string, number>();
    this._layoutDirty = true;
  }

  // ═══ In-log find (Cmd/Ctrl+F) ─────────────────────────────────────────

  private _searchSegments(entry: LogViewEntry): Array<{ segment: SearchSegment; text: string }> {
    return [
      { segment: "level", text: LOG_LEVEL_LABELS[entry.level] },
      { segment: "time", text: formatTime(entry.timestamp) },
      { segment: "source", text: entry.source },
      { segment: "message", text: entry.message },
    ];
  }

  private _openSearch(): void {
    this._searchOpen = true;
    void this._refreshSearch();
    // Focus AFTER Lit has rendered the find input (openSearch just marks
    // state; the DOM node exists on the next tick).
    setTimeout(() => this._focusSearch(), 0);
  }

  private _closeSearch(): void {
    this._searchOpen = false;
    this._searchMatches = [];
    this._activeMatchIndex = 0;
    this._activeEntry = null;
    this._activeSegment = null;
    this._activeRange = null;
    this._searchRangeMap = new Map<string, Record<SearchSegment, TextRange[]>>();
  }

  /**
   * Focus the log list so keyboard shortcuts (Cmd/Ctrl+F, arrow nav) apply.
   * Called by the platform when the log-viewer tab becomes active, since a
   * freshly-activated grid tab does not otherwise move focus into its content.
   */
  focus(): void {
    void this.updateComplete.then(() => {
      this.querySelector<HTMLElement>(".log-list")?.focus();
    });
  }

  private _focusSearch(): void {
    const input = this.querySelector<HTMLInputElement>("[data-testid=log-find-input]");
    input?.focus();
    input?.select();
  }

  private _onListKeyDown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      this._openSearch();
    }
  };

  private _onFindInput = (e: InputEvent): void => {
    this._searchQuery = (e.target as HTMLInputElement).value;
    this._scheduleSearch();
  };

  private _onFindKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      void this._nextMatch(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      this._closeSearch();
      this._listEl?.focus();
    }
  };

  private _toggleRegex = (): void => {
    this._searchRegex = !this._searchRegex;
    if (this._searchOpen) this._computeSearchMatches();
  };

  private _toggleCase = (): void => {
    this._searchCase = !this._searchCase;
    if (this._searchOpen) this._computeSearchMatches();
  };

  private _toggleWholeWord = (): void => {
    this._searchWholeWord = !this._searchWholeWord;
    if (this._searchOpen) this._computeSearchMatches();
  };

  private _scheduleSearch(): void {
    if (this._searchDebounce) clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => {
      this._searchDebounce = null;
      void this._refreshSearch();
    }, 150);
  }

  /** Drain the confirmed-day window (today + any explicitly-confirmed older
   * days) fully so search covers entries the user hasn't scrolled to yet. Stops
   * at the next day boundary — it never auto-crosses into an unconfirmed
   * previous day. Pages are accumulated and applied in a single `_entries`
   * assignment so the drain does not re-render (and scroll-anchor) once per
   * page — that repetition is what made typing "scroll". */
  private async _drainSearchWindow(): Promise<void> {
    if (this._searchDrained || this._searchLoading || !this._pageReader) return;
    this._searchLoading = true;
    // Hold the page lock so the scroll handler's auto-load doesn't race us.
    this._loadingOlder = true;
    const reader = this._pageReader;
    const list = this._listEl;
    const oldScrollTop = list?.scrollTop ?? 0;
    const oldScrollHeight = list?.scrollHeight ?? 0;
    let cursor = this._cursor;
    let hasOlder = this._hasOlder;
    let nextDayCursor = this._nextDayCursor;
    let nextDayLabel = this._nextDayLabel;
    let guard = 0;
    const collected: LogViewEntry[] = [];
    try {
      while (hasOlder && guard < 20000) {
        guard++;
        const page = await reader.loadOlder(cursor, LOG_PAGE_DEFAULT_LIMIT);
        if (this._pageReader !== reader) return;
        collected.push(...page.entries);
        cursor = page.cursor;
        hasOlder = page.hasOlder;
        nextDayCursor = page.nextDayCursor ?? null;
        nextDayLabel = page.nextDayLabel ?? "";
      }
      this._searchDrained = true;
      // Apply the whole drain in one state change (one render), not per page.
      this._entries = [...collected, ...this._entries];
      this._cursor = cursor;
      this._hasOlder = hasOlder;
      this._nextDayCursor = nextDayCursor;
      this._nextDayLabel = nextDayLabel;
      this._layoutDirty = true;
    } finally {
      this._searchLoading = false;
      this._loadingOlder = false;
      // Let the render rebuild the spacers, then reposition exactly once so the
      // content the user was viewing stays put. The drain only prepends, so the
      // single delta keeps the viewport anchored (no jump, no scroll-animating).
      await this.updateComplete;
      const newList = this._listEl;
      if (newList) {
        newList.scrollTop = oldScrollTop + (newList.scrollHeight - oldScrollHeight);
      }
      this.requestUpdate();
    }
  }

  private async _refreshSearch(): Promise<void> {
    if (!this._searchOpen) return;
    // Only drain the confirmed-day window once a query is typed. Opening the
    // bar with an empty query must not prepend all of today's entries — that
    // reflows the virtual list and (via the scroll-preserve delta) yanks a
    // top-scrolled view down to the bottom the moment Cmd/Ctrl+F is pressed.
    if (this._searchQuery.trim()) {
      await this._drainSearchWindow();
      if (!this._searchOpen) return;
    }
    this._computeSearchMatches();
    this.requestUpdate();
  }

  private _computeSearchMatches(): void {
    const q = this._searchQuery.trim();
    this._searchMatches = [];
    this._searchRangeMap = new Map<string, Record<SearchSegment, TextRange[]>>();
    this._activeMatchIndex = 0;
    this._activeEntry = null;
    this._activeSegment = null;
    this._activeRange = null;
    if (!this._searchOpen || !q) return;
    const opts = {
      regex: this._searchRegex,
      caseSensitive: this._searchCase,
      wholeWord: this._searchWholeWord,
    };
    for (const entry of this._visible) {
      const ranges: Record<SearchSegment, TextRange[]> = {
        level: [],
        time: [],
        source: [],
        message: [],
      };
      const segments = this._searchSegments(entry);
      for (const seg of segments) {
        const rr = findMatchRanges(seg.text, q, opts);
        if (rr.length > 0) ranges[seg.segment] = rr;
      }
      if (!segments.some((s) => ranges[s.segment].length > 0)) continue;
      // Keep ranges for highlighting every occurrence in the entry.
      this._searchRangeMap.set(this._entryKey(entry), ranges);
      // Count each occurrence individually, in the visual order of the row
      // (level → time → source → message).
      for (const seg of segments) {
        for (const range of ranges[seg.segment]) {
          this._searchMatches.push({ entry, segment: seg.segment, range });
        }
      }
    }
    if (this._searchMatches.length > 0) {
      const first = this._searchMatches[0];
      this._activeEntry = first.entry;
      this._activeSegment = first.segment;
      this._activeRange = first.range;
    }
  }

  private async _nextMatch(dir: 1 | -1): Promise<void> {
    if (this._searchMatches.length === 0) return;
    this._activeMatchIndex =
      (this._activeMatchIndex + dir + this._searchMatches.length) % this._searchMatches.length;
    const occ = this._searchMatches[this._activeMatchIndex];
    this._activeEntry = occ.entry;
    this._activeSegment = occ.segment;
    this._activeRange = occ.range;
    await this.updateComplete;
    const visibleIndex = this._visible.indexOf(this._activeEntry);
    if (visibleIndex < 0) return;
    const itemIndex = visibleIndex + (this._nextDayCursor !== null ? 1 : 0);
    const list = this._listEl;
    if (list) {
      const top = Math.max(0, this._layout.offsetAt(itemIndex));
      // Jump straight to the match — never animate. The offset table is exact
      // now that unmeasured items use the measured row height, so this lands
      // on the match (not drifted by accumulated estimate error).
      if (typeof list.scrollTo === "function") {
        list.scrollTo({ top, behavior: "instant" });
      } else {
        // jsdom has no scrollTo; assign scrollTop directly.
        list.scrollTop = top;
      }
      this._measurePasses = 0;
    }
    this.requestUpdate();
  }

  /** Render a searchable field with `<mark>` highlight(s) for the matching ranges. */
  private _highlighted(entry: LogViewEntry, segment: SearchSegment): TemplateResult {
    const text: string = {
      level: LOG_LEVEL_LABELS[entry.level],
      time: formatTime(entry.timestamp),
      source: entry.source,
      message: entry.message,
    }[segment];
    const ranges = this._searchRangeMap.get(this._entryKey(entry))?.[segment];
    if (!this._searchOpen || !ranges || ranges.length === 0) {
      return html`${this._escapeHtml(text)}`;
    }
    const parts: TemplateResult[] = [];
    let last = 0;
    for (const r of ranges) {
      if (r.start > last) parts.push(html`${this._escapeHtml(text.slice(last, r.start))}`);
      const isActive =
        this._activeEntry === entry &&
        this._activeSegment === segment &&
        this._activeRange?.start === r.start &&
        this._activeRange?.end === r.end;
      parts.push(
        html`<mark class="${isActive ? "find-match-active" : "find-match"}"
          >${this._escapeHtml(text.slice(r.start, r.end))}</mark
        >`,
      );
      last = r.end;
    }
    if (last < text.length) parts.push(html`${this._escapeHtml(text.slice(last))}`);
    return html`${parts}`;
  }

  /** One icon toggle for the find strip (regex / match-case / whole-word). */
  private _findToggle(
    icon: string,
    title: string,
    active: boolean,
    testId: string,
    onClick: () => void,
  ): TemplateResult {
    return html`<button
      type="button"
      data-testid=${testId}
      title=${title}
      class="find-toggle${active ? " active" : ""}"
      @click=${onClick}
    >
      ${unsafeHTML(icon)}
    </button>`;
  }

  private _onScroll(): void {
    const el = this._listEl;
    if (!el) return;
    this._isScrolledUp = el.scrollTop + el.clientHeight < el.scrollHeight - 10;
    // Near the top → load the next (older) page.
    if (this._isScrolledUp && el.scrollTop < 48) {
      this._loadOlder();
    }
    // Re-render the window for the new scroll position. Lit coalesces these
    // into one update per microtask.
    this._measurePasses = 0;
    this.requestUpdate();
  }

  private _escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  updated(): void {
    const el = this._listEl;
    if (!el) return;

    // Measure the rendered window so offset math stays accurate (rows may wrap
    // to variable heights). Cache by stable key and re-render once if anything
    // changed; converges after one correction because heights stop changing.
    const updates: Array<[number, number]> = [];
    el.querySelectorAll<HTMLElement>("[data-item-key]").forEach((node, idx) => {
      const key = node.getAttribute("data-item-key") ?? "";
      const h = node.offsetHeight;
      if (this._heightCache.get(key) !== h) {
        this._heightCache.set(key, h);
        updates.push([this._viewStart + idx, h]);
      }
    });
    this._measurePasses += 1;
    if (updates.length > 0) {
      this._layout.updateHeights(updates);
      // If the visible rows share a consistent real height, use it as the
      // estimate for every *unmeasured* item. Otherwise a far-away match is
      // offset by the accumulated estimate error (rows are ~20px but the
      // default estimate is 18px), so jump-to-match lands in the wrong place.
      const counts = new Map<number, number>();
      let mode = 0;
      let best = 0;
      for (const [, h] of updates) {
        const c = (counts.get(h) ?? 0) + 1;
        counts.set(h, c);
        if (c > best) {
          best = c;
          mode = h;
        }
      }
      if (mode > 0) this._layout.setDefaultHeight(mode);
      // Re-render so the offset table reflects measured heights — but stop after
      // a few corrections so a pathological height oscillation can't loop.
      if (this._measurePasses <= 3) {
        this.requestUpdate();
      }
    }

    if (this._scrollToBottomPending) {
      this._scrollToBottomPending = false;
      this._isScrolledUp = false;
      el.scrollTop = el.scrollHeight;
    }
  }

  render() {
    const items = this._layoutDirty ? this._rebuildItems() : this._items;
    if (this._layoutDirty) this._syncLayout(items);
    const list = this._listEl;
    const viewportH = list?.clientHeight ?? 300;
    const scrollTop = list?.scrollTop ?? 0;
    // When auto-scrolling to the bottom, seed the window at the bottom so the
    // user never sees a flash of the top of the list.
    const winScroll = this._scrollToBottomPending
      ? Math.max(0, this._layout.totalHeight - viewportH)
      : scrollTop;
    const { start, end, offsetTop, offsetBottom } = this._layout.window(winScroll, viewportH);
    this._viewStart = start;
    this._viewEnd = end;
    const windowItems = items.slice(start, end);
    const searchCount =
      this._searchMatches.length > 0
        ? `${this._activeMatchIndex + 1}/${this._searchMatches.length}`
        : this._searchQuery.trim()
          ? "No matches"
          : "";
    return html`
      <style>
        /* Light-DOM component: the :host selector is ignored here, so the host
           is matched by tag selector to fill its pane container. */
        openp41ge-log-viewer {
          display: block;
          height: 100%;
          overflow: hidden;
          box-sizing: border-box;
        }
        .viewer-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary, #1e1e1e);
          color: var(--text-primary, #d4d4d4);
          font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace;
          font-size: 12px;
          overflow: hidden;
        }
        .log-list {
          flex: 1;
          overflow-y: auto;
          padding: 4px 0;
          /* Never let the browser re-anchor scrollTop when the drain prepends
             content above the viewport. Without this, every re-render during a
             search drain nudges scrollTop down (appearing as "scrolling"). */
          overflow-anchor: none;
        }
        .bottom-bar {
          display: flex;
          align-items: center;
          height: 34px;
          padding: 0;
          box-sizing: border-box;
          background: var(--bg-primary, #1e1e1e);
          border-top: 1px solid var(--border-divider, #2d2d2d);
          color: var(--text-secondary, #999);
          font-size: 12px;
          flex-shrink: 0;
        }
        .level-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          align-self: stretch;
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-secondary, #999);
          cursor: pointer;
          font-size: 12px;
          font-family: inherit;
          padding: 0 10px;
          height: auto;
          box-sizing: border-box;
        }
        .level-btn:hover {
          background: rgba(255, 255, 255, 0.07);
          color: var(--text-primary, #fff);
        }
        .level-btn.active {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-primary, #fff);
        }
        .spacer {
          flex: 1;
        }
        .sep {
          flex-shrink: 0;
          width: 1px;
          align-self: stretch;
          margin: 0;
          background: var(--border-divider, #2d2d2d);
        }
        .wrap-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          align-self: stretch;
          aspect-ratio: 1 / 1;
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-secondary, #999);
          cursor: pointer;
          font-size: 12px;
          font-family: inherit;
          padding: 0;
          box-sizing: border-box;
          flex-shrink: 0;
        }
        .wrap-btn svg {
          display: block;
        }
        .wrap-btn:hover {
          background: rgba(255, 255, 255, 0.07);
          color: var(--text-primary, #fff);
        }
        .wrap-btn.active {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-primary, #fff);
        }
        .day-boundary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 6px 8px;
          margin: 4px 8px;
          border: 1px solid var(--border-divider, #3c3c3c);
          border-radius: 4px;
          background: #2a2a2a;
          color: var(--text-secondary, #999);
          cursor: pointer;
          user-select: none;
        }
        .day-boundary:hover {
          background: #333;
          color: var(--text-primary, #d4d4d4);
        }
        .day-boundary-label {
          color: #569cd6;
        }
        .day-boundary-hint {
          font-size: 11px;
          opacity: 0.7;
        }
        .log-entry {
          display: block;
          padding: 1px 8px;
          line-height: 1.5;
          word-break: break-all;
        }
        .log-entry:hover {
          background: #2a2a2a;
        }
        .log-entry.level-debug {
          color: #6a9955;
        }
        .log-entry.level-info {
          color: #d4d4d4;
        }
        .log-entry.level-warn {
          color: #d7ba7d;
        }
        .log-entry.level-error {
          color: #f44747;
        }
        .log-level-tag {
          display: inline;
          font-weight: bold;
          opacity: 0.7;
          margin-right: 6px;
        }
        .log-time {
          display: inline;
          color: #666;
          margin-right: 6px;
        }
        .log-name {
          display: inline;
          color: #569cd6;
          margin-right: 4px;
        }
        .log-text {
          display: inline;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .log-list.nowrap {
          overflow-x: auto;
        }
        .log-list.nowrap .log-entry {
          white-space: nowrap;
        }
        .log-list.nowrap .log-text {
          white-space: pre;
          word-break: normal;
        }
        .vspacer {
          flex-shrink: 0;
        }
        .empty-msg {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #555;
          font-size: 13px;
        }
        .find-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 28px;
          padding: 0 8px;
          flex-shrink: 0;
          background: var(--bg-primary, #1e1e1e);
          border-top: 1px solid var(--border-divider, #2d2d2d);
          font-size: 11px;
          color: var(--text-secondary, #999);
        }
        .find-input {
          flex: 1 1 auto;
          min-width: 0;
          height: 100%;
          padding: 0;
          box-sizing: border-box;
          background: transparent;
          border: none;
          border-radius: 0;
          color: var(--text-primary, #ccc);
          font-size: 12px;
          font-family: inherit;
          outline: none;
        }
        /* The app injects a global input:focus-visible { outline: 2px solid
           #4a9eff }. This input sits in a dark strip and gets a distracting
           blue box around it, so suppress it here (higher specificity wins). */
        .find-input:focus,
        .find-input:focus-visible {
          outline: none;
        }
        .find-count {
          flex-shrink: 0;
          color: var(--text-secondary, #888);
          font-size: 11px;
        }
        .find-toggle {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
          padding: 0;
          cursor: pointer;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 3px;
          color: var(--text-muted, #888);
        }
        .find-toggle:hover {
          color: var(--text-primary, #d4d4d4);
        }
        .find-toggle.active {
          color: #4a9eff;
        }
        .find-entry-btn {
          flex-shrink: 0;
          align-self: stretch;
          aspect-ratio: 1 / 1;
          display: grid;
          place-items: center;
          padding: 0;
          cursor: pointer;
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-secondary, #999);
          box-sizing: border-box;
        }
        .find-entry-btn:hover {
          background: rgba(255, 255, 255, 0.07);
          color: var(--text-primary, #fff);
        }
        .find-entry-btn.active {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-primary, #fff);
        }
        mark.find-match {
          background: rgba(234, 140, 0, 0.32);
          color: inherit;
        }
        mark.find-match-active {
          background: rgba(255, 158, 0, 0.6);
          color: #000;
        }
      </style>
      <div class="viewer-root">
        <div class="log-list${this._wrap ? "" : " nowrap"}" tabindex="0" @scroll=${this._onScroll}>
          ${offsetTop > 0 ? html`<div class="vspacer" style="height:${offsetTop}px"></div>` : ""}
          ${
            windowItems.length === 0
              ? html`<div class="empty-msg">No log entries</div>`
              : windowItems.map((item) =>
                  item.kind === "boundary"
                    ? html`
                        <div
                          class="day-boundary"
                          data-item-key="${item.key}"
                          title="Load the previous day's logs (the next day is not loaded until you confirm)"
                          @click=${() => this._loadOlder(this._nextDayCursor)}
                        >
                          <span class="day-boundary-label">${this._escapeHtml(item.label)}</span>
                          <span class="day-boundary-hint">click to load</span>
                        </div>
                      `
                    : html`
                        <div
                          class="log-entry level-${levelClass(item.entry.level)}"
                          data-item-key="${item.key}"
                        >
                          <span class="log-level-tag"
                            >${this._highlighted(item.entry, "level")}</span
                          >
                          <span class="log-time">${this._highlighted(item.entry, "time")}</span>
                          <span class="log-name">[${this._highlighted(item.entry, "source")}]</span>
                          <span class="log-text">${this._highlighted(item.entry, "message")}</span>
                        </div>
                      `,
                )
          }
          ${offsetBottom > 0 ? html`<div class="vspacer" style="height:${offsetBottom}px"></div>` : ""}
        </div>
        ${
          this._searchOpen
            ? html`
                <div class="find-bar">
                  <input
                    class="find-input"
                    data-testid="log-find-input"
                    type="text"
                    placeholder="Search today's logs"
                    spellcheck="false"
                    .value=${this._searchQuery}
                    @input=${this._onFindInput}
                    @keydown=${this._onFindKeyDown}
                  />
                  ${searchCount ? html`<span class="find-count">${searchCount}</span>` : ""}
                  ${this._findToggle(ICON_PREV, "Previous match", this._searchMatches.length > 0, "log-find-prev", () => void this._nextMatch(-1))}
                  ${this._findToggle(ICON_NEXT, "Next match", this._searchMatches.length > 0, "log-find-next", () => void this._nextMatch(1))}
                  ${this._findToggle(ICON_REGEX, "Regex search", this._searchRegex, "log-find-regex", this._toggleRegex)}
                  ${this._findToggle(ICON_CASE, "Match case", this._searchCase, "log-find-case", this._toggleCase)}
                  ${this._findToggle(ICON_WORD, "Whole word", this._searchWholeWord, "log-find-whole-word", this._toggleWholeWord)}
                </div>
              `
            : ""
        }
        <div class="bottom-bar">
          <button
            type="button"
            class="find-entry-btn${this._searchOpen ? " active" : ""}"
            title="Find in logs (⌘F)"
            @click=${() => (this._searchOpen ? this._closeSearch() : this._openSearch())}
          >
            ${unsafeHTML(ICON_SEARCH)}
          </button>
          <span class="sep"></span>
          <span class="spacer"></span>
          ${LEVELS.map(
            (lvl) => html`
              <button
                class="level-btn${lvl === this._minLevel ? " active" : ""}"
                @click=${() => this._setLevel(lvl)}
              >
                ${LOG_LEVEL_LABELS[lvl]}
              </button>
            `,
          )}
          <span class="sep"></span>
          <button
            class="wrap-btn${this._wrap ? " active" : ""}"
            title="Toggle line wrapping"
            @click=${() => this._toggleWrap()}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M2 4h12" />
              <path d="M2 8h8" />
              <path d="M2 12h6" />
              <path d="M13 10l2 2-2 2" />
              <path d="M15 12h-5" />
            </svg>
          </button>
        </div>
      </div>
    `;
  }
}

let _registered = false;
export function registerOpenp41geLogViewer(): void {
  if (!_registered) {
    _registered = true;
    customElements.define(Openp41geLogViewer.tagName, Openp41geLogViewer);
  }
}
registerOpenp41geLogViewer();
