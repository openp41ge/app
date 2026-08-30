/**
 * CommitSearchSystemTabController — system tab controller for the Git panel
 * (registration id `"git"`), repurposed as a commit search/query UI.
 *
 * Search across connected repos by commit message or changed-file path, with
 * hierarchical results:
 *     commit rows (repo · short hash · message · author) ⊃ file rows
 * (path · +adds/−dels), expandable like the explorer repo → worktree nesting.
 *
 * Interactions:
 *   - Enter / auto-debounced input runs the search; Escape clears then blurs.
 *   - Single-click a commit → openp41ge:open-commit (unpinned preview git tab);
 *     double-click pins. File sub-rows open the working-tree file (unpinned
 *     preview), identical to explorer file single-click.
 *   - Rows are draggable via the unified bitmap pipeline (GitEntryDragSource):
 *     dropping on the grid opens the repo's git-content pane (action by drop
 *     location).
 *
 * Data access goes through the CommitSearchModel interface (public `_searchModel`
 * property for test injection — production IpcCommitSearchModel, tests
 * TestCommitSearchModel). Loads repoNames via workspaceController.listRepos.
 */

import type { SystemTabController } from "../../controllers/types";
import type { CommitSearchModel } from "../../models/commit-search-model";
import { IpcCommitSearchModel } from "../../models/commit-search-model";
import { workspaceFileService } from "../../services/workspace-file-service";
import type { SearchHunk, SearchResultCommit } from "openp41ge-git";

/** 250ms input debounce — search as you type without spamming IPC per key. */
const DEBOUNCE_MS = 250;

// Search-row toggle icons. The case icon swaps between its ON/OFF variants
// so the glyph reflects the current state.
const REGEX_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="M197-199q-56-57-86.5-130T80-482q0-80 30-153t87-130l57 57q-46 45-70 103.5T160-482q0 64 24.5 122.5T254-256l-57 57Zm140.5-58.5Q320-275 320-300t17.5-42.5Q355-360 380-360t42.5 17.5Q440-325 440-300t-17.5 42.5Q405-240 380-240t-42.5-17.5ZM519-440v-71l-61 36-40-70 61-35-61-35 40-70 61 36v-71h80v71l61-36 40 70-61 35 61 35-40 70-61-36v71h-80Zm244 241-57-57q46-45 70-103.5T800-482q0-64-24.5-122.5T706-708l57-57q56 57 86.5 130T880-482q0 80-30 153t-87 130Z"/></svg>';
const CASE_ON_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="m131-252 165-440h79l165 440h-76l-39-112H247l-40 112h-76Zm139-176h131l-64-182h-4l-63 182Zm395 186q-51 0-81-27.5T554-342q0-44 34.5-72.5T677-443q23 0 45 4t38 11v-12q0-29-20.5-47T685-505q-23 0-42 9.5T610-468l-47-35q24-29 54.5-43t68.5-14q69 0 103 32.5t34 97.5v178h-63v-37h-4q-14 23-38 35t-53 12Zm12-54q35 0 59.5-24t24.5-56q-14-8-33.5-12.5T689-393q-32 0-50 14t-18 37q0 20 16 33t40 13Z"/></svg>';
const CASE_OFF_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="m131-252 127-338L56-792l56-56 736 736-56 56-286-286 34 90h-76l-39-112H247l-40 112h-76Zm178-287-39 111h131l-10-29-82-82Zm436 210q8-10 12-22t4-25q-14-8-33.5-12.5T689-393h-8l-45-45q10-2 20-3.5t21-1.5q23 0 45 4t38 11v-12q0-29-20.5-47T685-505q-23 0-42 9.5T610-468l-43-39q23-27 52.5-40t66.5-13q69 0 103 32.5t34 97.5v179l-78-78Z"/></svg>';
// Search changed CONTENT lines (git -G pickaxe). A document with a magnifier.
const CONTENT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="M180-120q-25 0-42.5-17.5T120-180v-600q0-25 17.5-42.5T180-840h600q25 0 42.5 17.5T840-780v600q0 25-17.5 42.5T780-120H180Zm0-80h600v-600H180v600Zm80-120h200v-60H260v60Zm0-120h200v-60H260v60Zm0-160h360v-60H260v60Zm360 320q42 0 71-29t29-71q0-42-29-71t-71-29q-42 0-71 29t-29 71q0 42 29 71t71 29ZM620-120l-74-74q-20 11-42.5 17.5T457-170q-75 0-127.5-52.5T277-350q0-75 52.5-127.5T457-530q75 0 127.5 52.5T637-350q0 30-9 57t-24 48l74 74-58 51Z"/></svg>';

interface RepoOption {
  name: string;
}

export class CommitSearchSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "git";

  /** DI seam — production IpcCommitSearchModel; tests inject TestCommitSearchModel. */
  _searchModel: CommitSearchModel = new IpcCommitSearchModel();

  private _viewElement: HTMLElement | null = null;
  private _input: HTMLInputElement | null = null;
  private _filesToggle: HTMLButtonElement | null = null;
  private _contentToggle: HTMLButtonElement | null = null;
  private _regexToggle: HTMLButtonElement | null = null;
  private _caseToggle: HTMLButtonElement | null = null;
  // Filter box (below the search box): icon toggles → optional config rows.
  private _repoFilterActive = true;
  private _repoFilterIcon: HTMLButtonElement | null = null;
  private _repoFilterRow: HTMLElement | null = null;
  private _repoFilter: HTMLButtonElement | null = null; // custom-select trigger
  private _repoSelectLabel: HTMLElement | null = null;
  private _repoOptions: HTMLElement | null = null;
  private _repoActiveIndex = -1;
  // Repo scope: empty set = all repos, otherwise the selected repo names.
  private _selectedRepos = new Set<string>();
  private _repoMenuOpen = false;
  private _onRepoDocPointerDown: ((ev: PointerEvent) => void) | null = null;
  // Search depth limit — one active option among the icon row (default 5K).
  private _maxCount = 5000;
  private _limitOptions: HTMLButtonElement[] = [];
  private _results: HTMLElement | null = null;
  private _footer: HTMLElement | null = null;

  private _repos: RepoOption[] = [];
  // Gate: without a selected workspace the panel shows a single placeholder.
  private _hasWorkspace = workspaceFileService.activeFilePath != null;
  private _unsubscribeWorkspace: (() => void) | null = null;
  private _container: HTMLElement | null = null;
  private _expandedCommits = new Set<string>(); // "repoName<sep>shortHash"
  private _expandedFiles = new Set<string>(); // "repoName<sep>shortHash<sep>path"
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _searchToken = 0;
  /** Last search results (cache) — expansion toggles re-render, not refetch. */
  private _lastCommits: SearchResultCommit[] | null = null;
  /** Query used for the last render — match highlighting + hit context. */
  private _lastQuery = "";

  // Commit-message search is always on; the files icon toggles changed-file-
  // path search on top of it (on = combined 'all', off = messages only). The
  // content icon additionally enables the git -G content-lines dimension.
  private _searchFiles = true;
  private _searchContent = false;
  // Regex mode: treat the query as a regular expression.
  private _searchRegex = false;
  // Case-sensitive matching.
  private _searchCase = false;

  // Per-file hunk expansion for content search. Keys: repo:shortHash:path.
  private _expandedFileHunks = new Set<string>();
  /** Lazy hunk cache: key — repo:shortHash:path → rows | "pending" | "error". */
  private _hunkCache = new Map<string, SearchHunk[] | "pending" | "error">();

  /** Keep-alive (SystemTabController.setVisible). */
  private _suspended = false;
  private _suspendDirty = false;
  private _onGitRefresh: (() => void) | null = null;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  mount(container: HTMLElement): Promise<void> | void {
    this._container = container;
    if (this._hasWorkspace) {
      this._buildSearchUI(container);
    } else {
      this._renderPlaceholder(container);
    }
    // React when a workspace opens/closes (the top-bar picker drives this).
    this._unsubscribeWorkspace = workspaceFileService.onChange(() => this._updateWorkspaceGate());
  }

  /** Build the full search UI. Only called while a workspace is selected. */
  private _buildSearchUI(container: HTMLElement): void {
    const wrapper = document.createElement("div");
    wrapper.dataset.systemTab = "git";
    Object.assign(wrapper.style, {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    });

    // ── Search header: icon toggles (above) + full-width input + filters ──
    const searchBox = document.createElement("div");
    Object.assign(searchBox.style, {
      padding: "8px 10px",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      flexShrink: "0",
      borderBottom: "1px solid var(--divider,#2a2a2a)",
    });

    // Single row: full-width input with the icon toggles right-aligned beside it.
    const searchInputRow = document.createElement("div");
    Object.assign(searchInputRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "4px",
    });

    const FILES_ICON =
      '<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="M200-800v241-1 400-640 200-200Zm0 720q-33 0-56.5-23.5T120-160v-640q0-33 23.5-56.5T200-880h320l240 240v100q-19-8-39-12.5t-41-6.5v-41H480v-200H200v640h241q16 24 36 44.5T521-80H200Zm531-149q29-29 29-71t-29-71q-29-29-71-29t-71 29q-29 29-29 71t29 71q29 29 71 29t71-29ZM864-40 756-148q-21 14-45.5 21t-50.5 7q-75 0-127.5-52.5T480-300q0-75 52.5-127.5T660-480q75 0 127.5 52.5T840-300q0 26-7 50.5T812-204L920-96l-56 56Z"/></svg>';

    const makeIconToggle = (
      icon: string,
      title: string,
      key: string,
      value = "",
    ): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.type = "button";
      (btn.dataset as Record<string, string>)[key] = value; // camelCase → data-kebab attr
      btn.title = title;
      btn.innerHTML = icon; // SVG uses currentColor — grey off, white on.
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
      });
      return btn;
    };
    // Changed-file-path search lives in the filter box below; the search row
    // ends with the regex + match-case toggles.
    const filesToggle = makeIconToggle(
      FILES_ICON,
      "Search changed file paths",
      "searchInto",
      "files",
    );
    const contentToggle = makeIconToggle(
      CONTENT_ICON,
      "Search changed content lines",
      "searchInto",
      "content",
    );
    const regexToggle = makeIconToggle(REGEX_ICON, "Regex search", "searchRegex");
    const caseToggle = makeIconToggle(CASE_ON_ICON, "Match case (case-sensitive)", "searchCase");

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search commits…";
    input.setAttribute("spellcheck", "false");
    Object.assign(input.style, {
      flex: "1",
      minWidth: "0",
      boxSizing: "border-box",
      height: "26px",
      padding: "0", // searchBox's own padding supplies the horizontal space
      fontSize: "12px",
      color: "var(--text-primary,#ccc)",
      background: "transparent", // no field chrome — flush with the header padding
      border: "none",
      outline: "none",
    });

    searchInputRow.appendChild(input);
    searchInputRow.appendChild(regexToggle);
    searchInputRow.appendChild(caseToggle);
    searchBox.appendChild(searchInputRow);
    wrapper.appendChild(searchBox);

    // ── Filter box: icon toggles on top; each on-filter adds a config row ──
    const filterBox = document.createElement("div");
    Object.assign(filterBox.style, {
      padding: "6px 10px",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      flexShrink: "0",
      borderBottom: "1px solid var(--divider,#2a2a2a)",
    });

    const FILTER_ICON =
      '<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="M440-160q-17 0-28.5-11.5T400-200v-240L168-736q-15-20-4.5-42t36.5-22h560q26 0 36.5 22t-4.5 42L560-440v240q0 17-11.5 28.5T520-160h-80Zm40-308 198-252H282l198 252Zm0 0Z"/></svg>';
    // Depth-limit option icons (the number is drawn into the SVG). Repainted
    // to currentColor so the active option renders white and the rest grey.
    const limitSvg = (p: string): string =>
      `<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="${p}"/></svg>`;
    const ICON_5K = limitSvg(
      "M520-360h60v-90l70 90h73l-93-120 93-120h-73l-70 90v-90h-60v240Zm-260 0h140q17 0 28.5-11.5T440-400v-60q0-17-11.5-28.5T400-500h-80v-40h120v-60H260v140h120v40H260v60Zm-60 240q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z",
    );
    const ICON_10K = limitSvg(
      "M240-360h60v-240H200v60h40v180Zm140 0h100q17 0 28.5-11.5T520-400v-160q0-17-11.5-28.5T480-600H380q-17 0-28.5 11.5T340-560v160q0 17 11.5 28.5T380-360Zm20-60v-120h60v120h-60Zm157 60h60v-90l70 90h73l-93-120 93-120h-73l-70 90v-90h-60v240ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z",
    );
    const ICON_3K = limitSvg(
      "M520-360h60v-90l70 90h73l-93-120 93-120h-73l-70 90v-90h-60v240Zm-260 0h140q17 0 28.5-11.5T440-400v-160q0-17-11.5-28.5T400-600H260v60h120v40h-80v40h80v40H260v60Zm-60 240q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z",
    );
    const ICON_2K = limitSvg(
      "M520-360h60v-90l70 90h73l-93-120 93-120h-73l-70 90v-90h-60v240Zm-260 0h180v-60H320v-40h80q17 0 28.5-11.5T440-500v-60q0-17-11.5-28.5T400-600H260v60h120v40h-80q-17 0-28.5 11.5T260-460v100Zm-60 240q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z",
    );
    const ICON_1K = limitSvg(
      "M480-360h60v-90l70 90h73l-93-120 93-120h-73l-70 90v-90h-60v240Zm-140 0h60v-240H280v60h60v180ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z",
    );

    const makeFilterToggle = (key: string, icon: string, title: string): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.filterIcon = key;
      btn.title = title;
      btn.innerHTML = icon; // SVG uses currentColor — grey off, white on.
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
      });
      return btn;
    };
    const repoFilterIcon = makeFilterToggle("repo", FILTER_ICON, "Repo filter");

    // Search-depth limit options: a fixed row (not a toggle) where exactly one
    // is active. Active = white SVG, inactive = grey.
    const LIMIT_OPTIONS: Array<{ label: string; value: number; svg: string }> = [
      { label: "1K", value: 1000, svg: ICON_1K },
      { label: "2K", value: 2000, svg: ICON_2K },
      { label: "3K", value: 3000, svg: ICON_3K },
      { label: "5K", value: 5000, svg: ICON_5K },
      { label: "10K", value: 10000, svg: ICON_10K },
    ];
    const makeLimitOption = (o: (typeof LIMIT_OPTIONS)[number]): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.limitOption = String(o.value);
      btn.title = `Depth limit: ${o.label} newest commits`;
      btn.innerHTML = o.svg; // currentColor — grey idle, white when active.
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
      });
      btn.addEventListener("click", () => {
        if (o.value === this._maxCount) return;
        this._maxCount = o.value;
        this._applyLimitStyles();
        if (this._input?.value.trim()) this._debounce();
      });
      return btn;
    };
    const filterIconRow = document.createElement("div");
    Object.assign(filterIconRow.style, { display: "flex", gap: "4px", alignItems: "center" });
    filterIconRow.appendChild(repoFilterIcon);
    // Changed-file-path search is a config toggle like the filter icon.
    filterIconRow.appendChild(filesToggle);
    // Content search (git -G pickaxe on changed lines) is the third dimension.
    filterIconRow.appendChild(contentToggle);

    // A vertical divider between the repo icon and the depth-limit group —
    // only the middle 50% of the row height, vertically centred.
    const iconDivider = document.createElement("div");
    iconDivider.dataset.iconSeparator = "";
    Object.assign(iconDivider.style, {
      width: "1px",
      height: "50%",
      alignSelf: "center",
      flexShrink: "0",
      background: "var(--divider,#333)",
      margin: "0 2px",
    });
    filterIconRow.appendChild(iconDivider);

    for (const o of LIMIT_OPTIONS) filterIconRow.appendChild(makeLimitOption(o));
    filterBox.appendChild(filterIconRow);

    // Repo filter config row — shown while the funnel icon is on. A custom
    // (non-native) select, same box look as the text input it replaces.
    const repoFilterRow = document.createElement("div");
    Object.assign(repoFilterRow.style, {
      position: "relative",
      display: this._repoFilterActive ? "flex" : "none",
    });

    const repoFilter = document.createElement("button");
    repoFilter.type = "button";
    repoFilter.dataset.repoFilter = "";
    repoFilter.title = "Filter by repo";
    Object.assign(repoFilter.style, {
      width: "100%",
      boxSizing: "border-box",
      height: "24px",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "0 8px",
      fontSize: "11px",
      color: "var(--text-primary,#ccc)",
      background: "var(--bg-secondary,#252526)",
      border: "1px solid var(--divider,#333)",
      borderRadius: "4px",
      outline: "none",
      cursor: "pointer",
    });
    const repoSelectLabel = document.createElement("span");
    repoSelectLabel.textContent = "All repos";
    Object.assign(repoSelectLabel.style, {
      flex: "1",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      textAlign: "left",
    });
    const repoChevron = document.createElement("span");
    repoChevron.textContent = "▾";
    Object.assign(repoChevron.style, { flexShrink: "0", color: "var(--text-secondary,#888)" });
    repoFilter.appendChild(repoSelectLabel);
    repoFilter.appendChild(repoChevron);
    repoFilterRow.appendChild(repoFilter);

    const repoOptions = document.createElement("div");
    repoOptions.dataset.repoOptions = "";
    Object.assign(repoOptions.style, {
      display: "none",
      position: "absolute",
      top: "100%",
      left: "0",
      right: "0",
      zIndex: "20",
      maxHeight: "180px",
      overflowY: "auto",
      background: "var(--bg-secondary,#252526)",
      border: "1px solid var(--divider,#333)",
      borderRadius: "4px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
    });
    repoFilterRow.appendChild(repoOptions);
    filterBox.appendChild(repoFilterRow);
    wrapper.appendChild(filterBox);

    // ── Results list ──────────────────────────────────────────────────
    const results = document.createElement("div");
    Object.assign(results.style, {
      flex: "1",
      minHeight: "0",
      overflowY: "auto",
      overflowX: "hidden",
      display: "flex",
      flexDirection: "column",
    });
    wrapper.appendChild(results);

    // ── Footer ────────────────────────────────────────────────────────
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      flexShrink: "0",
      height: "24px",
      display: "flex",
      alignItems: "center",
      padding: "0 8px",
      borderTop: "1px solid var(--divider,#333)",
      fontSize: "12px",
      color: "var(--text-secondary,#999)",
      background: "var(--bg-secondary,#252526)",
      gap: "6px",
    });
    wrapper.appendChild(footer);

    container.appendChild(wrapper);
    this._viewElement = wrapper;
    this._input = input;
    this._filesToggle = filesToggle;
    this._contentToggle = contentToggle;
    this._regexToggle = regexToggle;
    this._caseToggle = caseToggle;
    this._repoFilterIcon = repoFilterIcon;
    this._limitOptions = Array.from(
      filterIconRow.querySelectorAll<HTMLButtonElement>("[data-limit-option]"),
    );
    this._repoFilterRow = repoFilterRow;
    this._repoFilter = repoFilter;
    this._repoSelectLabel = repoSelectLabel;
    this._repoOptions = repoOptions;
    this._results = results;
    this._footer = footer;

    // ── Wire events ───────────────────────────────────────────────────
    input.addEventListener("input", () => {
      this._debounce();
    });
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._schedule();
        void this._runSearch();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (input.value) {
          input.value = "";
          this._renderEmptyQuery();
        } else {
          input.blur();
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        this._moveFocus(e.key === "ArrowDown" ? 1 : -1, e);
      }
    });
    filesToggle.addEventListener("click", () => this._toggleSearch());
    contentToggle.addEventListener("click", () => this._toggleContent());
    regexToggle.addEventListener("click", () => this._toggleRegex());
    caseToggle.addEventListener("click", () => this._toggleCase());
    repoFilterIcon.addEventListener("click", () => this._toggleRepoFilter());
    repoFilter.addEventListener("click", () => this._toggleRepoMenu());
    repoFilter.addEventListener("keydown", (e: KeyboardEvent) => {
      const n = this._repoOptions?.children.length ?? 0;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!this._repoMenuOpen) {
          this._openRepoMenu();
        } else {
          this._repoActiveIndex = n === 0 ? 0 : (this._repoActiveIndex + 1) % n;
          this._renderRepoOptions();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this._repoActiveIndex = n === 0 ? 0 : Math.max(0, this._repoActiveIndex - 1);
        this._renderRepoOptions();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!this._repoMenuOpen) {
          this._openRepoMenu();
        } else {
          const box = this._repoOptions;
          const item = box
            ? (box.children[this._repoActiveIndex] as HTMLElement | undefined)
            : undefined;
          if (item?.dataset.repoOption !== undefined) {
            this._toggleRepo(item.dataset.repoOption);
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this._hideRepoMenu();
      }
    });

    // Close the repo menu when clicking anywhere outside it.
    this._onRepoDocPointerDown = (ev: PointerEvent) => {
      if (
        this._repoMenuOpen &&
        this._repoFilterRow &&
        !this._repoFilterRow.contains(ev.target as Node)
      ) {
        this._hideRepoMenu();
      }
    };
    document.addEventListener("pointerdown", this._onRepoDocPointerDown);

    // Both icons default on → render them white (enabled) immediately.
    this._applyToggleStyles();
    this._applySearchToggleStyles();
    this._applyFilterIconStyle();
    this._applyLimitStyles();

    // Load repoNames for the repo-filter autocomplete, then render states.
    void this._loadRepos();

    // Live refreshes (workspace/git changes) — deferred while hidden.
    this._onGitRefresh = () => {
      if (this._suspended) {
        this._suspendDirty = true;
        return;
      }
      void this._loadRepos();
    };
    document.addEventListener("git:refresh", this._onGitRefresh);

    // Autofocus the search input on open (clone-dialog pattern).
    requestAnimationFrame(() => input.focus());

    // Hover feedback on every result row (commit + file sub-rows).
    const style = document.createElement("style");
    style.textContent = `
      [data-system-tab="git"] .commit-result-head:hover,
      [data-system-tab="git"] .commit-file-row:hover {
        background: var(--bg-hover, #2a2d2e);
      }
      [data-system-tab="git"] .search-hit {
        background: rgba(74, 158, 255, 0.28);
        color: inherit;
        border-radius: 2px;
        padding: 0 1px;
      }
    `;
    wrapper.appendChild(style);

    this._renderEmptyQuery();
  }

  unmount(): void {
    if (this._unsubscribeWorkspace) {
      this._unsubscribeWorkspace();
      this._unsubscribeWorkspace = null;
    }
    this._teardownView();
    this._container = null;
  }

  /** Keep-alive: pause background work (reloads/debounce) while hidden. */
  setVisible(visible: boolean): void {
    this._suspended = !visible;
    if (visible && this._suspendDirty) {
      this._suspendDirty = false;
      void this._loadRepos();
    }
  }

  // ── Repo scope loading ────────────────────────────────────────────────

  private async _loadRepos(): Promise<void> {
    try {
      const repos = (await window.openp41ge.workspaceController.listRepos()) as RepoOption[];
      this._repos = repos;
      // Drop selected repos that are no longer present (empty set = all).
      for (const name of [...this._selectedRepos]) {
        if (!this._repos.some((r) => r.name === name)) this._selectedRepos.delete(name);
      }
      this._updateRepoSelectLabel();
      // Repo availability changed the empty-state hint — re-render it once
      // repos arrive (they load asynchronously after first paint).
      if (!this._input?.value.trim()) {
        this._renderEmptyQuery();
      }
    } catch {
      // Non-fatal — "All repos" scope still works.
      this._repos = [];
      this._selectedRepos.clear();
      this._updateRepoSelectLabel();
    }
  }

  // ── Repo filter (custom multi-select: trigger + dropdown) ────────────

  /** Current repo scope: the picked repo names, or null = all repos. */
  private _repoScope(): string[] | null {
    if (!this._repoFilterActive) return null;
    return this._selectedRepos.size > 0 ? [...this._selectedRepos] : null;
  }

  private _toggleRepoFilter(): void {
    this._repoFilterActive = !this._repoFilterActive;
    this._applyFilterIconStyle();
    if (this._repoFilterRow) {
      this._repoFilterRow.style.display = this._repoFilterActive ? "flex" : "none";
    }
    if (!this._repoFilterActive) this._hideRepoMenu();
    if (this._input?.value.trim()) {
      this._debounce();
    } else {
      this._renderEmptyQuery();
    }
  }

  private _toggleRepoMenu(): void {
    if (this._repoMenuOpen) {
      this._hideRepoMenu();
    } else {
      this._openRepoMenu();
    }
  }

  private _openRepoMenu(): void {
    if (!this._repoOptions) return;
    this._renderRepoOptions();
    this._repoMenuOpen = true;
  }

  private _hideRepoMenu(): void {
    if (this._repoOptions) this._repoOptions.style.display = "none";
    this._repoMenuOpen = false;
    this._repoActiveIndex = -1;
  }

  private _renderRepoOptions(): void {
    const box = this._repoOptions;
    if (!box) return;
    box.replaceChildren();
    const items: Array<{ value: string; label: string }> = [
      { value: "", label: "All repos" },
      ...this._repos.map((r) => ({ value: r.name, label: r.name })),
    ];
    if (items.length === 0) {
      box.style.display = "none";
      this._repoMenuOpen = false;
      this._repoActiveIndex = -1;
      return;
    }
    this._repoActiveIndex = 0;
    items.forEach((item, i) => {
      const opt = document.createElement("div");
      opt.dataset.repoOption = item.value;
      const selected = item.value !== "" && this._selectedRepos.has(item.value);
      opt.textContent = selected ? `✓ ${item.label}` : item.label;
      Object.assign(opt.style, {
        padding: "3px 8px",
        fontSize: "11px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        color: "var(--text-primary,#ccc)",
      });
      if (selected) opt.style.color = "#4a9eff";
      if (i === this._repoActiveIndex) opt.style.background = "var(--bg-hover,#2a2d2e)";
      opt.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault(); // keep focus on the trigger
        this._toggleRepo(item.value);
      });
      box.appendChild(opt);
    });
    box.style.display = "block";
  }

  /** Toggle a repo in/out of the selected set; "" clears back to All repos. */
  private _toggleRepo(value: string): void {
    if (value === "") {
      this._selectedRepos.clear();
      this._hideRepoMenu();
    } else if (this._selectedRepos.has(value)) {
      this._selectedRepos.delete(value);
    } else {
      this._selectedRepos.add(value);
    }
    this._updateRepoSelectLabel();
    if (this._input?.value.trim()) {
      this._debounce();
    } else {
      this._renderEmptyQuery();
    }
  }

  private _updateRepoSelectLabel(): void {
    if (!this._repoSelectLabel) return;
    const names = [...this._selectedRepos];
    this._repoSelectLabel.textContent =
      names.length === 0
        ? "All repos"
        : names.length <= 2
          ? names.join(", ")
          : `${names[0]}, ${names[1]} +${names.length - 2}`;
  }

  private _applyFilterIconStyle(): void {
    const btn = this._repoFilterIcon;
    if (!btn) return;
    // Grey when off, white (enabled) when on — the SVG uses currentColor.
    btn.style.color = this._repoFilterActive ? "#e3e3e3" : "var(--text-secondary,#888)";
  }

  /** Exactly one depth-limit option is active — the rest are greyed out. */
  private _applyLimitStyles(): void {
    for (const btn of this._limitOptions) {
      const value = btn.dataset.limitOption ? Number(btn.dataset.limitOption) : 0;
      btn.style.color = value === this._maxCount ? "#e3e3e3" : "var(--text-secondary,#888)";
    }
  }

  // ── Search-into toggles ───────────────────────────────────────────────

  private _toggleSearch(): void {
    this._searchFiles = !this._searchFiles;
    this._applyToggleStyles();
    if (this._input?.value.trim()) {
      this._debounce();
    } else {
      this._renderEmptyQuery();
    }
  }

  private _applyToggleStyles(): void {
    const btn = this._filesToggle;
    if (!btn) return;
    // Grey when off, white (enabled) when on — the SVG uses currentColor.
    btn.style.color = this._searchFiles ? "#e3e3e3" : "var(--text-secondary,#888)";
  }

  private _toggleContent(): void {
    this._searchContent = !this._searchContent;
    this._applyContentToggleStyle();
    if (this._input?.value.trim()) {
      this._debounce();
    } else {
      this._renderEmptyQuery();
    }
  }

  private _applyContentToggleStyle(): void {
    const btn = this._contentToggle;
    if (!btn) return;
    btn.style.color = this._searchContent ? "#e3e3e3" : "var(--text-secondary,#888)";
  }

  private _toggleRegex(): void {
    this._searchRegex = !this._searchRegex;
    this._applySearchToggleStyles();
    if (this._input?.value.trim()) {
      this._debounce();
    } else {
      this._renderEmptyQuery();
    }
  }

  private _toggleCase(): void {
    this._searchCase = !this._searchCase;
    this._applySearchToggleStyles();
    if (this._input?.value.trim()) {
      this._debounce();
    } else {
      this._renderEmptyQuery();
    }
  }

  private _applySearchToggleStyles(): void {
    if (this._regexToggle) {
      this._regexToggle.style.color = this._searchRegex ? "#e3e3e3" : "var(--text-secondary,#888)";
    }
    if (this._caseToggle) {
      // Swap between the 'match case on' and 'match case off' glyphs.
      this._caseToggle.innerHTML = this._searchCase ? CASE_ON_ICON : CASE_OFF_ICON;
      this._caseToggle.style.color = this._searchCase ? "#e3e3e3" : "var(--text-secondary,#888)";
      this._caseToggle.title = this._searchCase ? "Match case (on)" : "Match case (off)";
    }
  }

  // ── Search execution ──────────────────────────────────────────────────

  private _debounce(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      void this._runSearch();
    }, DEBOUNCE_MS);
  }

  private _schedule(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  private async _runSearch(): Promise<void> {
    const input = this._input;
    const results = this._results;
    if (!input || !results) return;
    const query = input.value.trim();
    if (!query) {
      this._renderEmptyQuery();
      return;
    }

    const token = ++this._searchToken;
    const repoNames = this._repoScope();
    const maxCount = this._maxCount;
    // Commits (messages) are always searched; files add the changed-file-path
    // dimension when the toggle is on; content the git -G content-lines pass.
    const mode = this._searchFiles ? "all" : "message";
    // A new search invalidates the per-file hunk expansion/cache.
    this._expandedFileHunks.clear();
    this._hunkCache.clear();

    results.replaceChildren(this._message("Searching…", "var(--text-secondary,#999)"));
    if (this._footer) {
      this._footer.textContent = "";
    }

    try {
      const commits = await this._searchModel.search(repoNames, {
        query,
        in: mode,
        limit: 100,
        maxCount,
        caseSensitive: this._searchCase,
        regex: this._searchRegex,
        content: this._searchContent,
      });
      if (token !== this._searchToken) return; // a newer search superseded this one
      this._lastCommits = commits;
      this._renderResults(commits, query);
    } catch (err: unknown) {
      if (token !== this._searchToken) return;
      const msg = err instanceof Error ? err.message : String(err);
      results.replaceChildren();
      results.appendChild(this._message(`Search failed: ${msg}`, "var(--error,#e53e3e)"));
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  private _message(text: string, color: string): HTMLElement {
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

  private _renderEmptyQuery(): void {
    const results = this._results;
    if (!results) return;
    results.replaceChildren();
    if (this._repos.length === 0) {
      results.appendChild(this._message("No repos", "var(--text-secondary,#999)"));
    } else {
      results.appendChild(
        this._message(
          "Type to search commit messages or changed file paths",
          "var(--text-muted,#777)",
        ),
      );
    }
    if (this._footer) this._footer.textContent = "";
  }

  /** Remove the current view (placeholder or full UI) and release its wiring. */
  private _teardownView(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._onGitRefresh) {
      document.removeEventListener("git:refresh", this._onGitRefresh);
      this._onGitRefresh = null;
    }
    if (this._onRepoDocPointerDown) {
      document.removeEventListener("pointerdown", this._onRepoDocPointerDown);
      this._onRepoDocPointerDown = null;
    }
    this._searchToken += 1; // cancel any in-flight search
    if (this._viewElement && this._viewElement.parentNode) {
      this._viewElement.parentNode.removeChild(this._viewElement);
    }
    this._viewElement = null;
    this._input = null;
    this._filesToggle = null;
    this._contentToggle = null;
    this._regexToggle = null;
    this._caseToggle = null;
    this._repoFilterIcon = null;
    this._repoFilterRow = null;
    this._repoFilter = null;
    this._repoSelectLabel = null;
    this._repoOptions = null;
    this._selectedRepos.clear();
    this._limitOptions = [];
    this._results = null;
    this._footer = null;
  }

  /** No workspace selected → the tab shows a single selection prompt, nothing else. */
  private _renderPlaceholder(container: HTMLElement): void {
    const el = document.createElement("div");
    el.dataset.systemTab = "git";
    Object.assign(el.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      boxSizing: "border-box",
      padding: "16px",
    });
    const msg = document.createElement("div");
    msg.textContent = "Select a workspace to get started";
    Object.assign(msg.style, {
      fontSize: "12px",
      lineHeight: "1.4",
      textAlign: "center",
      color: "var(--text-muted,#777)",
      userSelect: "none",
    });
    el.appendChild(msg);
    container.appendChild(el);
    this._viewElement = el;
  }

  /** Re-evaluate the workspace gate — swap the whole view in place. */
  private _updateWorkspaceGate(): void {
    const has = workspaceFileService.activeFilePath != null;
    if (has === this._hasWorkspace) return;
    this._hasWorkspace = has;
    const container = this._container;
    if (!container) return;
    this._teardownView();
    if (has) {
      this._buildSearchUI(container);
    } else {
      this._renderPlaceholder(container);
    }
  }

  private _renderResults(commits: SearchResultCommit[], query: string): void {
    const results = this._results;
    if (!results) return;
    results.replaceChildren();
    this._lastQuery = query;

    if (commits.length === 0) {
      results.appendChild(this._message("No matching commits", "var(--text-muted,#777)"));
      if (this._footer) this._footer.textContent = "";
      return;
    }

    for (const commit of commits) {
      results.appendChild(this._commitRow(commit));
    }

    if (this._footer) {
      this._footer.textContent = `${commits.length} result${commits.length === 1 ? "" : "s"}`;
    }
  }

  private _key(repoName: string, shortHash: string): string {
    return `${repoName}:${shortHash}`;
  }

  private _commitRow(commit: SearchResultCommit): HTMLElement {
    const key = this._key(commit.repoName, commit.shortHash);
    const expanded = this._expandedCommits.has(key);

    const row = document.createElement("div");
    row.className = "commit-result-row";
    row.tabIndex = 0;
    row.setAttribute("data-commit-row", "");
    row.setAttribute("data-repo-row", ""); // unified bitmap drag surface
    // Distinct from explorer repo rows: dropping THIS row opens the new
    // git-commit-search app (placeholder) scoped to the commit.
    row.setAttribute("data-git-search-result", "");
    row.setAttribute("data-repo", commit.repoName);
    row.setAttribute("data-hash", commit.hash);
    row.setAttribute("data-short-hash", commit.shortHash);
    row.setAttribute("draggable", "true");

    Object.assign(row.style, {
      display: "flex",
      flexDirection: "column",
      userSelect: "none",
      cursor: "pointer",
    });

    // Own hover surface for the two content lines — each file sub-row below is
    // its own row and highlights independently.
    const headBlock = document.createElement("div");
    headBlock.className = "commit-result-head";
    Object.assign(headBlock.style, { display: "flex", flexDirection: "column" });

    // Line 1 — [repo] [commit id] … [meta] with the explorer chevron on the left.
    const head = document.createElement("div");
    Object.assign(head.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      height: "20px",
      padding: "4px 10px 0 6px",
      fontSize: "12px",
      color: "var(--text-primary,#ccc)",
    });

    const chevron = document.createElement("openp41ge-icon");
    chevron.setAttribute("name", expanded ? "chevron-down" : "chevron-right");
    chevron.setAttribute("size", "10");
    const chevronWrap = document.createElement("span");
    Object.assign(chevronWrap.style, {
      width: "14px",
      flexShrink: "0",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    });
    chevronWrap.appendChild(chevron);
    head.appendChild(chevronWrap);

    const repo = document.createElement("span");
    repo.textContent = commit.repoName;
    repo.title = commit.repoName;
    Object.assign(repo.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      maxWidth: "50%",
      minWidth: "0",
      flexShrink: "1",
      fontSize: "10px",
      color: "var(--text-secondary,#888)",
    });
    head.appendChild(repo);

    const hash = document.createElement("span");
    hash.textContent = commit.shortHash;
    hash.title = commit.hash;
    Object.assign(hash.style, {
      flexShrink: "0",
      fontSize: "10px",
      color: "var(--accent,#4a9eff)",
    });
    head.appendChild(hash);

    const meta = document.createElement("span");
    meta.textContent = commit.relativeDate || commit.date || commit.author;
    Object.assign(meta.style, {
      marginLeft: "auto",
      flexShrink: "0",
      fontSize: "10px",
      color: "var(--text-muted,#666)",
    });
    head.appendChild(meta);
    headBlock.appendChild(head);

    // Line 2 — the commit message, truncated but positioned to show the match:
    // a “…”-window either side of the first hit, with the hit highlighted.
    const msgLine = document.createElement("div");
    msgLine.title = commit.message;
    Object.assign(msgLine.style, {
      padding: "1px 10px 0 26px",
      fontSize: "12px",
      color: "var(--text-primary,#ccc)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    this._appendMatchedText(msgLine, commit.message);
    headBlock.appendChild(msgLine);

    // Optional line 3 — “+ N more instances” / “matched in file(s)” so the
    // user knows to open the row (for file-name matches, before expanding).
    const metaLine = this._matchMeta(commit);
    if (metaLine) {
      Object.assign(metaLine.style, {
        padding: "1px 10px 4px 26px",
        fontSize: "10px",
        color: "var(--text-muted,#777)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      headBlock.appendChild(metaLine);
    } else {
      msgLine.style.paddingBottom = "4px";
    }

    row.appendChild(headBlock);

    // Click = expand/collapse the commit's file sub-rows (no preview). A drag
    // onto the grid opens the git-commit-search pane; double-click still opens
    // the commit preview (pinned). File sub-rows stopPropagation so they never
    // collapse the commit row.
    row.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      this._toggleCommitExpanded(key);
    });
    row.addEventListener("dblclick", (e: MouseEvent) => {
      e.stopPropagation();
      this._emitOpenCommit(commit, true);
    });
    row.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._toggleCommitExpanded(key);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (this._expandedCommits.has(key)) return;
        this._expandedCommits.add(key);
        this._expandedFiles.delete(key);
        this._rerender();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (!this._expandedCommits.has(key)) return;
        this._expandedCommits.delete(key);
        this._rerender();
      }
    });

    if (expanded) {
      const fileRows = this._fileRows(commit);
      if (fileRows.length === 0) {
        const none = this._message("No changed files", "var(--text-muted,#777)");
        Object.assign(none.style, { padding: "2px 10px 2px 20px", fontSize: "11px" });
        row.appendChild(none);
      } else {
        for (const fr of fileRows) row.appendChild(fr);
      }
    }

    return row;
  }

  /** Toggle a commit's file sub-rows (single-click / Enter / Space). */
  private _toggleCommitExpanded(key: string): void {
    if (this._expandedCommits.has(key)) this._expandedCommits.delete(key);
    else {
      this._expandedCommits.add(key);
      this._expandedFiles.delete(key);
    }
    this._rerender();
  }

  private _fileRows(commit: SearchResultCommit): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const file of commit.files) {
      const row = document.createElement("div");
      row.className = "commit-file-row";
      row.tabIndex = 0;
      row.setAttribute("data-worktree-row", ""); // unified bitmap drag surface
      row.setAttribute("data-git-search-result", "");
      row.setAttribute("data-repo", commit.repoName);
      row.setAttribute("data-branch", commit.shortHash);
      row.setAttribute("data-hash", commit.hash);
      row.setAttribute("data-short-hash", commit.shortHash);
      row.setAttribute("draggable", "true");

      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        height: "24px",
        padding: "0 10px 0 22px",
        fontSize: "11px",
        cursor: "pointer",
        color: "var(--text-secondary,#aaa)",
        userSelect: "none",
      });

      const fKey = this._fileHunkKey(commit.repoName, commit.shortHash, file.path);
      const contentOn = this._searchContent;
      const chev = document.createElement("button");
      chev.type = "button";
      Object.assign(chev.style, {
        width: "14px",
        flexShrink: "0",
        border: "none",
        background: "transparent",
        padding: "0",
        cursor: contentOn ? "pointer" : "default",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted,#666)",
      });
      const fExpanded = this._expandedFileHunks.has(fKey);
      chev.innerHTML = `<openp41ge-icon name="${fExpanded ? "chevron-down" : "chevron-right"}" size="10"></openp41ge-icon>`;
      chev.title = contentOn
        ? fExpanded
          ? "Collapse matching hunks"
          : "Show matching hunks"
        : "";
      chev.addEventListener("click", (ce: MouseEvent) => {
        ce.stopPropagation();
        if (!this._searchContent) return;
        this._toggleFileHunks(fKey);
      });
      row.appendChild(chev);
      if (!contentOn) chev.style.opacity = "0"; // reserve the 14px slot

      const name = document.createElement("span");
      name.title = file.path;
      Object.assign(name.style, {
        flex: "1",
        minWidth: "0",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      this._appendHighlighted(name, file.path);
      row.appendChild(name);

      // Additions / deletions each get their own coloured span.
      const counts = document.createElement("span");
      Object.assign(counts.style, {
        flexShrink: "0",
        display: "inline-flex",
        gap: "5px",
        fontSize: "10px",
      });
      if (file.additions > 0) {
        const a = document.createElement("span");
        a.className = "commit-adds";
        a.textContent = `+${file.additions}`;
        a.style.color = "#3fb950";
        counts.appendChild(a);
      }
      if (file.deletions > 0) {
        const d = document.createElement("span");
        d.className = "commit-dels";
        d.textContent = `\u2212${file.deletions}`;
        d.style.color = "#f85149";
        counts.appendChild(d);
      }
      row.appendChild(counts);

      row.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        // Working-tree file preview (v1) — file-at-revision is an open question.
        document.dispatchEvent(
          new CustomEvent("openp41ge:open-file", {
            detail: {
              path: file.path,
              name: file.path.split("/").pop() ?? file.path,
              pinned: false,
              search: this._searchPayload(),
            },
          }),
        );
      });
      row.addEventListener("dblclick", (e: MouseEvent) => {
        e.stopPropagation();
        document.dispatchEvent(
          new CustomEvent("openp41ge:open-file", {
            detail: {
              path: file.path,
              name: file.path.split("/").pop() ?? file.path,
              pinned: true,
              search: this._searchPayload(),
            },
          }),
        );
      });
      row.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          document.dispatchEvent(
            new CustomEvent("openp41ge:open-file", {
              detail: {
                path: file.path,
                name: file.path.split("/").pop() ?? file.path,
                pinned: true,
                search: this._searchPayload(),
              },
            }),
          );
          return;
        }
        if (this._searchContent && e.key === "ArrowRight") {
          e.preventDefault();
          this._expandFileHunks(fKey);
          return;
        }
        if (this._searchContent && e.key === "ArrowLeft" && this._expandedFileHunks.has(fKey)) {
          e.preventDefault();
          this._collapseFileHunks(fKey);
        }
      });

      out.push(row);
      if (this._expandedFileHunks.has(fKey)) {
        const hunkContainer = document.createElement("div");
        hunkContainer.className = "commit-hunk-block";
        out.push(hunkContainer);
        void this._renderFileHunks(hunkContainer, commit, fKey, file.path);
      }
    }
    return out;
  }

  private _fileHunkKey(repoName: string, shortHash: string, path: string): string {
    return `${repoName}:${shortHash}:${path}`;
  }

  private _toggleFileHunks(fKey: string): void {
    if (this._expandedFileHunks.has(fKey)) this._collapseFileHunks(fKey);
    else this._expandFileHunks(fKey);
  }

  private _expandFileHunks(fKey: string): void {
    this._expandedFileHunks.add(fKey);
    this._rerender();
  }

  private _collapseFileHunks(fKey: string): void {
    this._expandedFileHunks.delete(fKey);
    this._rerender();
  }

  /**
   * Render the lazy hunk sub-rows for an expanded file row into `container`.
   * Cached in _hunkCache (rows | "pending" | "error"); a re-render paints the
   * cache synchronously, so collapsing/expanding again never refetches.
   */
  private async _renderFileHunks(
    container: HTMLElement,
    commit: SearchResultCommit,
    fKey: string,
    path: string,
  ): Promise<void> {
    const render = (rows: SearchHunk[] | "error", empty: boolean): void => {
      container.replaceChildren();
      if (rows === "error") {
        container.appendChild(this._message("Couldn't load hunks", "var(--text-muted,#777)"));
      } else if (empty) {
        container.appendChild(this._message("No matching hunks", "var(--text-muted,#777)"));
      } else {
        for (const h of rows as SearchHunk[]) container.appendChild(this._hunkRow(h));
      }
    };
    const cached = this._hunkCache.get(fKey);
    if (cached === "error") {
      render("error", false);
      return;
    }
    if (cached && cached !== "pending") {
      render(cached as SearchHunk[], cached.length === 0);
      return;
    }
    this._hunkCache.set(fKey, "pending");
    container.replaceChildren(this._message("Loading…", "var(--text-muted,#777)"));
    const query = this._lastQuery.trim();
    if (!query) {
      this._hunkCache.set(fKey, []);
      render([], true);
      return;
    }
    try {
      const hunks = await this._searchModel.fileHunks(commit.repoName, commit.hash, path, query, {
        regex: this._searchRegex,
        caseSensitive: this._searchCase,
      });
      if (this._hunkCache.get(fKey) !== "pending") return; // superseded
      this._hunkCache.set(fKey, hunks);
      render(hunks, hunks.length === 0);
    } catch {
      if (this._hunkCache.get(fKey) !== "pending") return;
      this._hunkCache.set(fKey, "error");
      render("error", false);
    }
  }

  /** One matching hunk as a block of monospace rows (header + lines). */
  private _hunkRow(h: SearchHunk): HTMLElement {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      padding: "1px 10px 2px 36px",
      fontSize: "11px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      userSelect: "text",
    });
    const header = document.createElement("div");
    header.textContent = h.header;
    Object.assign(header.style, {
      color: "var(--text-muted,#666)",
      whiteSpace: "pre",
    });
    wrap.appendChild(header);
    for (const ln of h.lines) {
      const line = document.createElement("div");
      line.textContent = (ln.type === " " ? " " : ln.type) + ln.text;
      Object.assign(line.style, {
        color:
          ln.type === "+"
            ? "#3fb950"
            : ln.type === "-"
              ? "#f85149"
              : "var(--text-secondary,#aaa)",
        whiteSpace: "pre",
      });
      wrap.appendChild(line);
    }
    return wrap;
  }

  // ── Match highlighting + hit context ───────────────────────────────────

  /**
   * The sidebar's current search as an external highlight payload for files
   * opened from a result row — the file editor highlights these matches.
   */
  private _searchPayload():
    | {
        query: string;
        regex: boolean;
        caseSensitive: boolean;
      }
    | undefined {
    const q = this._lastQuery.trim();
    if (!q) return undefined;
    return { query: q, regex: this._searchRegex, caseSensitive: this._searchCase };
  }

  /** Optional third line: “+ N more instances” and/or which file(s) matched. */
  private _matchMeta(commit: SearchResultCommit): HTMLElement | null {
    if (!this._lastQuery.trim()) return null;
    const bits: string[] = [];
    const msgCount = this._hits(commit.message).length;
    if (msgCount > 1) {
      bits.push(`+ ${msgCount - 1} more instance${msgCount - 1 === 1 ? "" : "s"}`);
    }
    const matchedPaths = commit.files.map((f) => f.path).filter((p) => this._hits(p).length > 0);
    if (matchedPaths.length > 0) {
      const shown = matchedPaths.slice(0, 2).join(", ");
      const more = matchedPaths.length > 2 ? ` +${matchedPaths.length - 2} more` : "";
      bits.push(`matched file${matchedPaths.length === 1 ? "" : "s"}: ${shown}${more}`);
    }
    if (bits.length === 0) return null;
    const el = document.createElement("div");
    el.textContent = bits.join(" · ");
    return el;
  }

  /** All [start,end) spans where the query hits `text`, honouring the regex
   * and match-case toggles. Empty when none / no query / an invalid regex. */
  private _hits(text: string): Array<[number, number]> {
    const q = this._lastQuery.trim();
    if (!q) return [];
    if (this._searchRegex) {
      let re: RegExp;
      try {
        re = new RegExp(q, this._searchCase ? "g" : "gi");
      } catch {
        return [];
      }
      re.lastIndex = 0;
      const out: Array<[number, number]> = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          if (re.lastIndex >= text.length) break;
          re.lastIndex += 1; // avoid zero-width infinite loop
          continue;
        }
        out.push([m.index, m.index + m[0].length]);
      }
      return out;
    }
    const needle = this._searchCase ? q : q.toLowerCase();
    const hay = this._searchCase ? text : text.toLowerCase();
    const out: Array<[number, number]> = [];
    let i = hay.indexOf(needle);
    while (i !== -1) {
      out.push([i, i + needle.length]);
      i = hay.indexOf(needle, i + needle.length);
    }
    return out;
  }

  /** Append a one-line window around the first message hit so the match is
   * visible (not just the message start), with each hit highlighted. */
  private _appendMatchedText(parent: HTMLElement, message: string): void {
    const hits = this._hits(message);
    if (hits.length === 0) {
      parent.textContent = message;
      return;
    }
    const idx = hits[0][0];
    const LEAD = 14; // chars of context shown before the match
    const MAX_LEN = 96; // visible window including the match
    let start = Math.max(0, idx - LEAD);
    let end = message.length;
    if (end - start > MAX_LEN) end = start + MAX_LEN;
    const prefix = start > 0 ? "\u2026" : "";
    const suffix = end < message.length ? "\u2026" : "";
    if (prefix) parent.appendChild(document.createTextNode(prefix));
    this._appendHighlighted(parent, message.slice(start, end));
    if (suffix) parent.appendChild(document.createTextNode(suffix));
  }

  /** Append text with every match wrapped in a .search-hit (mode-aware). */
  private _appendHighlighted(parent: HTMLElement, text: string): void {
    const hits = this._hits(text);
    if (hits.length === 0) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    let i = 0;
    for (const [s, e] of hits) {
      if (s > i) parent.appendChild(document.createTextNode(text.slice(i, s)));
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = text.slice(s, e);
      parent.appendChild(mark);
      i = e;
    }
    if (i < text.length) parent.appendChild(document.createTextNode(text.slice(i)));
  }

  private _emitOpenCommit(commit: SearchResultCommit, pinned: boolean): void {
    document.dispatchEvent(
      new CustomEvent("openp41ge:open-commit", {
        detail: {
          repoName: commit.repoName,
          hash: commit.hash,
          pinned,
        },
      }),
    );
  }

  /** Rebuild the results in place (e.g. after expand/collapse) without refetching. */
  private _rerender(): void {
    if (this._lastCommits) this._renderResults(this._lastCommits, this._lastQuery);
  }

  // ── Keyboard navigation across top-level commit rows ─────────────────

  private _moveFocus(delta: number, e: KeyboardEvent): void {
    const results = this._results;
    if (!results) return;
    e.preventDefault();
    const rows = Array.from(results.querySelectorAll<HTMLElement>(".commit-result-row"));
    if (rows.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    let idx = active ? rows.indexOf(active) : -1;
    if (active && !rows.includes(active)) {
      // Find the containing commit row if focus is on a nested file row.
      const parent = active.closest?.(".commit-result-row");
      idx = parent instanceof HTMLElement ? rows.indexOf(parent) : -1;
    }
    const next = Math.min(rows.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + delta));
    rows[next].focus();
  }
}
