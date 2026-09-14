/**
 * Search-drawer framework — the shared "search drawer" that slides out of a
 * sidebar edge (over the grid) when a sidebar tab's bottom-bar search icon is
 * pressed, replacing the old inline search bar at the top of the sidebar.
 *
 * The shell (drawer head, slide-out, resize, Escape/outside-click close) is
 * provided by the existing <openp41ge-settings-drawer-host>. This module owns
 * the *search surface* body — the part that must look the same across every
 * sidebar — and a per-tab provider hook so each tab supplies its own search
 * needs (options, query semantics, result rendering).
 *
 * Shared look (rendered identically for every tab):
 *   - a flush, borderless full-width query input, focus on open;
 *   - shared regex + match-case toggles (every tab gets these by default);
 *   - an optional per-tab options row (e.g. Git's depth-limit / search-into
 *     toggles) appended by the provider via `buildOptions`, so the common
 *     controls read the same everywhere while each tab layers its own.
 *
 * Per-tab customization is expressed through the `SearchDrawerProvider`
 * interface: a tab registers a provider with its search semantics and result
 * renderer, and the surface handles input state, debounce and shared toggles.
 */

import type { Openp41geSettingsDrawerHost } from "../components/openp41ge-settings-drawer-host";
import type { Side } from "./settings-button";
import { REGEX_ICON, CASE_ON_ICON } from "../apps/git-commit-search/search-icons";

/** The shared option state the surface passes to a provider's `search`. */
export interface SearchDrawerOptions {
  regex: boolean;
  caseSensitive: boolean;
}

/**
 * A tab's search behaviour — the per-tab part of the search drawer.
 */
export interface SearchDrawerProvider {
  /** Stable id used for drawer toggle-close (should be unique per tab). */
  readonly appType: string;
  /** Drawer head title (e.g. "Search chats"). */
  readonly title: string;
  /** Query input placeholder (e.g. "Search chats…"). */
  readonly placeholder: string;

  /**
   * Append this tab's own option controls into `container`. Called once on
   * open. Return an optional cleanup function (run on close). `onOptionsChanged`
   * should be invoked whenever an option that affects the query changes, so the
   * surface re-runs the active search.
   */
  buildOptions?(container: HTMLElement, onOptionsChanged: () => void): (() => void) | void;

  /**
   * Run a search for `query` ("" clears) and render into the `results` element.
   * `opts` carries the shared regex / match-case state. May be async.
   */
  search(
    query: string,
    opts: SearchDrawerOptions,
    results: HTMLElement,
  ): Promise<void> | void;

  /** Called once when the drawer opens (defaults to focusing the input). */
  open?(input: HTMLInputElement): void;
}

/** The surface the drawer host mounts as its base layer. */
export interface Openp41geSearchSurface extends HTMLElement {
  readonly title: string;
  appType?: string;
  side?: Side;
  host: Openp41geSettingsDrawerHost | null;
}

/** Idle time after the last keystroke before an incremental search fires. */
const DEBOUNCE_MS = 200;

/**
 * Build the search-surface body for `provider`. This element is opened in the
 * drawer host as a base layer; the host renders the head (title + close) and
 * handles slide-out, resize and dismiss. Returns the surface element wired to
 * the provider.
 */
function buildSearchSurface(provider: SearchDrawerProvider): Openp41geSearchSurface {
  const surface = document.createElement("div") as unknown as Openp41geSearchSurface;
  Object.defineProperty(surface, "title", { value: provider.title, configurable: true });
  surface.appType = provider.appType;
  Object.assign(surface.style, {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
  });

  let regex = false;
  let caseSensitive = false;

  // ── Query row: flush input + shared regex / match-case toggles ─────────
  const inputRow = document.createElement("div");
  Object.assign(inputRow.style, {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "8px 10px",
    flexShrink: "0",
  });

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = provider.placeholder;
  input.setAttribute("spellcheck", "false");
  Object.assign(input.style, {
    flex: "1",
    minWidth: "0",
    boxSizing: "border-box",
    height: "26px",
    padding: "0",
    fontSize: "12px",
    color: "var(--text-primary,#ccc)",
    background: "transparent",
    border: "none",
    outline: "none",
  });

  const makeToggle = (icon: string, title: string): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = title;
    btn.innerHTML = icon;
    Object.assign(btn.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "18px",
      height: "18px",
      padding: "0",
      cursor: "pointer",
      background: "transparent",
      border: "1px solid transparent",
      borderRadius: "4px",
      color: "var(--text-secondary,#888)",
      flexShrink: "0",
    });
    return btn;
  };

  const regexToggle = makeToggle(REGEX_ICON, "Regex search");
  regexToggle.addEventListener("click", () => {
    regex = !regex;
    regexToggle.style.color = regex ? "#e3e3e3" : "var(--text-secondary,#888)";
    if (input.value.trim()) schedule();
  });
  const caseToggle = makeToggle(CASE_ON_ICON, "Match case (case-sensitive)");
  caseToggle.addEventListener("click", () => {
    caseSensitive = !caseSensitive;
    caseToggle.style.color = caseSensitive ? "#e3e3e3" : "var(--text-secondary,#888)";
    if (input.value.trim()) schedule();
  });

  inputRow.appendChild(input);
  inputRow.appendChild(regexToggle);
  inputRow.appendChild(caseToggle);
  surface.appendChild(inputRow);

  // ── Per-tab options row (provider-owned) ───────────────────────────────
  let optionsCleanup: (() => void) | undefined;
  const optionsRow = document.createElement("div");
  Object.assign(optionsRow.style, {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "4px",
    padding: "0 10px 6px",
    flexShrink: "0",
  });
  const cleanup = provider.buildOptions?.(optionsRow, () => {
    if (input.value.trim()) schedule();
  });
  if (typeof cleanup === "function") optionsCleanup = cleanup;
  if (optionsRow.childElementCount > 0) surface.appendChild(optionsRow);

  // ── Results container ──────────────────────────────────────────────────
  const results = document.createElement("div");
  Object.assign(results.style, {
    flex: "1",
    minHeight: "0",
    overflowY: "auto",
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column",
    borderTop: "1px solid var(--border-divider,#2a2a2a)",
  });
  surface.appendChild(results);

  // ── Search execution (debounced) ───────────────────────────────────────
  let timer: ReturnType<typeof setTimeout> | null = null;
  let token = 0;
  function run(): void {
    const query = input.value.trim();
    const t = ++token;
    void Promise.resolve(
      provider.search(query, { regex, caseSensitive }, results),
    ).catch((err: unknown) => {
      if (t !== token) return;
      results.replaceChildren();
      results.appendChild(
        message(`Search failed: ${err instanceof Error ? err.message : String(err)}`, "var(--error,#e53e3e)"),
      );
    });
  }
  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      run();
    }, DEBOUNCE_MS);
  }
  input.addEventListener("input", schedule);
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      input.value = "";
      run();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      run();
    }
  });

  // Initial empty state, then focus on open.
  run();
  if (provider.open) provider.open(input);
  else requestAnimationFrame(() => input.focus());

  // Tear down provider-owned options + cancel pending work when the surface is
  // removed (the host unmounts the layer on close).
  const teardown = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    token += 1;
    optionsCleanup?.();
    optionsCleanup = undefined;
  };
  surface.addEventListener("disconnected", teardown);

  return surface;
}

/** Shared inline message/empty-state helper. */
function message(text: string, color: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text;
  Object.assign(el.style, {
    padding: "8px 10px",
    fontSize: "12px",
    fontStyle: "italic",
    color,
  });
  return el;
}

/**
 * Open (or, if already open for this provider, toggle-close) a search drawer
 * anchored to `side` in the drawer `host`.
 */
export function openSearchDrawer(
  host: Openp41geSettingsDrawerHost,
  side: Side,
  provider: SearchDrawerProvider,
): void {
  // Toggle: pressing the same tab's search icon again closes its drawer.
  if (host.isOpenFor(provider.appType, side)) {
    host.closeSide(side);
    return;
  }
  host.openSurface(buildSearchSurface(provider), side);
}
