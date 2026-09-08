/**
 * CommitSearchSystemTabController — system tab controller for the History panel
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
 *     double-click pins. File sub-rows open the file AT that commit in a
 *     read-only diff pane (openp41ge:open-commit-file: unpinned preview, or
 *     pinned on double-click/Enter) — see the commit-file-diff app type. The
 *     sidebar never renders diff content below the file rows.
 *   - Rows are draggable via the unified bitmap pipeline (GitEntryDragSource):
 *     dropping on the grid opens the repo's git-content pane (action by drop
 *     location).
 *
 * Data access goes through the CommitSearchModel interface (public `_searchModel`
 * property for test injection — production IpcCommitSearchModel, tests
 * TestCommitSearchModel). The repo scope is the current workspace's connected
 * repos (from the workspace repo list), never the whole repo directory.
 */

import type { SystemTabController } from "../../controllers/types";
import type { CommitSearchModel } from "../../models/commit-search-model";
import { IpcCommitSearchModel } from "../../models/commit-search-model";
import { workspaceFileService, deriveRepoName } from "../../services/workspace-file-service";
import type { SearchResultCommit } from "openp41ge-git";
import { tooltipController } from "openp41ge-uikit";
import { appendSettingsButton, type Side } from "../../services/settings-button";
import { REGEX_ICON, CASE_ON_ICON } from "../git-commit-search/search-icons";

/** 250ms input debounce — search as you type without spamming IPC per key. */
const DEBOUNCE_MS = 250;

// Search-row toggle icons (shared with the Workspace Manager header search).
// The case icon keeps its ON glyph always; state is conveyed by colour, not by
// swapping between ON/OFF variants.
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
  private _repoFilterActive = false; // repo filter off by default
  private _repoFilterIcon: HTMLButtonElement | null = null;
  private _repoFilterRow: HTMLElement | null = null;
  private _repoFilterInput: HTMLInputElement | null = null;
  private _repoFilterRegexBtn: HTMLButtonElement | null = null;
  private _repoFilterCaseBtn: HTMLButtonElement | null = null;
  // Repo filter scope: empty = all repos; otherwise a pattern matched against
  // repo names with regex + case-sensitivity when those toggles are on.
  private _repoFilterRegex = false;
  private _repoFilterCase = false;
  // Search depth limit — one active option among the icon row (default 1K).
  private _maxCount = 1000;
  private _limitOptions: HTMLButtonElement[] = [];
  /** Buttons that received a custom tooltip — detached on teardown. */
  private _tooltipTargets: Element[] = [];
  private _results: HTMLElement | null = null;
  private _footer: HTMLElement | null = null;

  private _repos: RepoOption[] = [];
  // Gate: without a selected workspace the panel shows a single placeholder.
  private _hasWorkspace = workspaceFileService.openFilePath != null;
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
  private _searchFiles = false; // changed-file-path search off by default
  private _searchContent = false;
  // Regex mode: treat the query as a regular expression.
  private _searchRegex = false;
  // Case-sensitive matching.
  private _searchCase = false;

  /** Keep-alive (SystemTabController.setVisible). */
  private _suspended = false;
  private _suspendDirty = false;
  private _onGitRefresh: (() => void) | null = null;
  private _side: Side = "right";

  constructor(tabId: string, config?: Record<string, unknown>) {
    this.tabId = tabId;
    this._side = (config?.side as Side) ?? "right";
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
      this._attachTooltip(btn, title);
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
      this._attachTooltip(btn, title);
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
      this._attachTooltip(btn, `Depth limit: ${o.label} newest commits`);
      btn.addEventListener("click", () => {
        if (o.value === this._maxCount) return;
        this._maxCount = o.value;
        this._applyLimitStyles();
        if (this._input?.value.trim()) this._debounce();
      });
      return btn;
    };
    // Config row wraps by separator-delimited groups when the sidebar narrows,
    // so a whole group moves to the next line instead of splitting icons.
    const filterIconRow = document.createElement("div");
    Object.assign(filterIconRow.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px",
      alignItems: "center",
    });

    const filterGroupA = document.createElement("div");
    Object.assign(filterGroupA.style, {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      flexShrink: "0",
    });
    filterGroupA.appendChild(repoFilterIcon);
    // Changed-file-path search is a config toggle like the filter icon.
    filterGroupA.appendChild(filesToggle);
    // Content search (git -G pickaxe on changed lines) is the third dimension.
    filterGroupA.appendChild(contentToggle);
    // A vertical divider between the repo icon group and the depth-limit group —
    // only the middle 50% of the row height, vertically centred. It trails the
    // config group (not the limit group) so that when the row wraps, the limit
    // buttons start flush with the container's padding instead of being indented
    // by a leading divider + gap.
    const iconDivider = document.createElement("div");
    iconDivider.dataset.iconSeparator = "";
    Object.assign(iconDivider.style, {
      width: "1px",
      height: "50%",
      alignSelf: "center",
      flexShrink: "0",
      background: "var(--divider,#333)",
    });
    filterGroupA.appendChild(iconDivider);
    filterIconRow.appendChild(filterGroupA);

    const filterGroupB = document.createElement("div");
    Object.assign(filterGroupB.style, {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      flexShrink: "0",
    });
    for (const o of LIMIT_OPTIONS) filterGroupB.appendChild(makeLimitOption(o));
    filterIconRow.appendChild(filterGroupB);

    filterBox.appendChild(filterIconRow);

    // Repo filter config row — shown while the funnel icon is on. Mirrors the
    // main search input: a flush, borderless full-width field with its own
    // regex + match-case toggles, reading as its own row in the filter block.
    // A top border separates it from the config-icon row above. Negative side
    // margins push the border out to the block edges (edge-to-edge) while the
    // matching side padding keeps the input and toggles aligned with the config
    // icons. Vertical padding makes the border sit the same distance above the
    // input as the block's bottom border sits below it.
    const repoFilterRow = document.createElement("div");
    Object.assign(repoFilterRow.style, {
      display: this._repoFilterActive ? "flex" : "none",
      alignItems: "center",
      gap: "4px",
      borderTop: "1px solid var(--divider,#2a2a2a)",
      marginLeft: "-10px",
      marginRight: "-10px",
      paddingLeft: "10px",
      paddingRight: "10px",
      paddingTop: "6px",
      boxSizing: "border-box",
    });

    const repoFilterInput = document.createElement("input");
    repoFilterInput.type = "text";
    repoFilterInput.placeholder = "Filter repos…";
    repoFilterInput.setAttribute("spellcheck", "false");
    repoFilterInput.dataset.repoFilter = "";
    Object.assign(repoFilterInput.style, {
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
    const repoRegexToggle = makeIconToggle(REGEX_ICON, "Repo filter regex", "repoRegex");
    const repoCaseToggle = makeIconToggle(CASE_ON_ICON, "Repo filter match case", "repoCase");

    repoFilterRow.appendChild(repoFilterInput);
    repoFilterRow.appendChild(repoRegexToggle);
    repoFilterRow.appendChild(repoCaseToggle);
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
    // Spacer + this tab's own settings button, with the gear on the OUTSIDE
    // edge (right for a right sidebar, left for a left sidebar).
    appendSettingsButton(
      footer,
      this._side,
      "openp41ge:open-git-settings",
      "git-settings",
      "History",
      "History settings",
    );
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
    this._repoFilterInput = repoFilterInput;
    this._repoFilterRegexBtn = repoRegexToggle;
    this._repoFilterCaseBtn = repoCaseToggle;
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
    repoFilterInput.addEventListener("input", () => this._debounce());
    repoFilterInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._schedule();
        void this._runSearch();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (repoFilterInput.value) {
          repoFilterInput.value = "";
          this._debounce();
        }
      }
    });
    repoRegexToggle.addEventListener("click", () => this._toggleRepoFilterRegex());
    repoCaseToggle.addEventListener("click", () => this._toggleRepoFilterCase());

    // Both icons default on → render them white (enabled) immediately.
    this._applyToggleStyles();
    this._applySearchToggleStyles();
    this._applyFilterIconStyle();
    this._applyLimitStyles();
    this._applyRepoFilterToggleStyles();

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
      /* Regex + match-case toggles are flat icons; brighten on hover. */
      [data-system-tab="git"] [data-search-regex]:hover,
      [data-system-tab="git"] [data-search-case]:hover {
        color: var(--text-primary, #ddd) !important;
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

  /**
   * Repos connected to the current workspace, derived from the workspace repo
   * list. Leftover/removed folders under the repo directory are never included
   * (they are not part of the workspace's repo list).
   */
  private _connectedRepoOptions(): RepoOption[] {
    const repos = workspaceFileService.openData?.repos ?? [];
    return repos.map((r) => ({ name: deriveRepoName(r.url) }));
  }

  private _loadRepos(): void {
    // The repo scope is the current workspace's connected repos — never the
    // whole repo directory (which would include leftover/removed folders).
    this._repos = this._connectedRepoOptions();
    // Repo availability changed the empty-state hint — re-render it once.
    if (!this._input?.value.trim()) {
      this._renderEmptyQuery();
    }
  }

  // ── Repo filter (text field + regex/case toggles) ────────────────────

  /** The active repo-filter pattern, or "" when the filter is off/empty. */
  private _repoFilterPattern(): string {
    return this._repoFilterActive ? (this._repoFilterInput?.value ?? "").trim() : "";
  }

  /**
   * Current repo scope: the connected repo names matching the filter pattern,
   * or null (all repos) when the filter is off/empty. An empty array means the
   * filter is active but matched no connected repo.
   */
  private _repoScope(): string[] | null {
    if (!this._repoFilterActive) return null;
    const pattern = this._repoFilterPattern();
    if (!pattern) return null;
    const names = this._connectedRepoOptions().map((r) => r.name);
    if (this._repoFilterRegex) {
      try {
        const re = new RegExp(pattern, this._repoFilterCase ? "" : "i");
        return names.filter((n) => re.test(n));
      } catch {
        // Invalid regex — fall through to a literal substring match below.
      }
    }
    const needle = this._repoFilterCase ? pattern : pattern.toLowerCase();
    return names.filter((n) =>
      this._repoFilterCase ? n.includes(needle) : n.toLowerCase().includes(needle),
    );
  }

  private _toggleRepoFilter(): void {
    this._repoFilterActive = !this._repoFilterActive;
    this._applyFilterIconStyle();
    if (this._repoFilterRow) {
      this._repoFilterRow.style.display = this._repoFilterActive ? "flex" : "none";
    }
    if (this._input?.value.trim()) {
      this._debounce();
    } else {
      this._renderEmptyQuery();
    }
  }

  private _toggleRepoFilterRegex(): void {
    this._repoFilterRegex = !this._repoFilterRegex;
    this._applyRepoFilterToggleStyles();
    if (this._input?.value.trim()) this._debounce();
    else this._renderEmptyQuery();
  }

  private _toggleRepoFilterCase(): void {
    this._repoFilterCase = !this._repoFilterCase;
    this._applyRepoFilterToggleStyles();
    if (this._input?.value.trim()) this._debounce();
    else this._renderEmptyQuery();
  }

  private _applyRepoFilterToggleStyles(): void {
    if (this._repoFilterRegexBtn) {
      this._repoFilterRegexBtn.style.color = this._repoFilterRegex
        ? "#e3e3e3"
        : "var(--text-secondary,#888)";
    }
    if (this._repoFilterCaseBtn) {
      // Always render the 'match case on' glyph; the state is shown purely by
      // colour (on = bright, off = muted). No glyph swap.
      this._repoFilterCaseBtn.innerHTML = CASE_ON_ICON;
      this._repoFilterCaseBtn.style.color = this._repoFilterCase
        ? "#e3e3e3"
        : "var(--text-secondary,#888)";
      this._attachTooltip(
        this._repoFilterCaseBtn,
        this._repoFilterCase ? "Repo filter match case (on)" : "Repo filter match case (off)",
      );
    }
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
      // Always render the 'match case on' glyph; the state is shown purely by
      // colour (on = bright, off = muted). No glyph swap.
      this._caseToggle.innerHTML = CASE_ON_ICON;
      this._caseToggle.style.color = this._searchCase ? "#e3e3e3" : "var(--text-secondary,#888)";
      this._attachTooltip(
        this._caseToggle,
        this._searchCase ? "Match case (on)" : "Match case (off)",
      );
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
    // Resolve the repo scope: the user's selected repos, else every repo
    // connected to the current workspace. Empty means nothing is connected —
    // render the empty state and do not dispatch a search.
    const repoNames = this._repoScope() ?? this._connectedRepoOptions().map((r) => r.name);
    if (repoNames.length === 0) {
      this._renderEmptyQuery();
      return;
    }
    const maxCount = this._maxCount;
    // Commits (messages) are always searched; files add the changed-file-path
    // dimension when the toggle is on; content the git -G content-lines pass.
    const mode = this._searchFiles ? "all" : "message";

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
      results.appendChild(this._message("No repositories to search", "var(--text-secondary,#999)"));
    } else if (this._repoFilterPattern() && this._repoScope()?.length === 0) {
      results.appendChild(this._message("No repos match the filter", "var(--text-muted,#777)"));
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

  /** Register a custom tooltip on an imperative button (replaces native `title`). */
  private _attachTooltip(target: Element, text: string): void {
    tooltipController.attach(target, { type: "simple", text });
    if (!this._tooltipTargets.includes(target)) this._tooltipTargets.push(target);
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
    for (const el of this._tooltipTargets) tooltipController.detach(el);
    this._tooltipTargets = [];
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
    this._repoFilterInput = null;
    this._repoFilterRegexBtn = null;
    this._repoFilterCaseBtn = null;
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
    const has = workspaceFileService.openFilePath != null;
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

      // Activate the file at this commit in a read-only diff pane. Content
      // never renders below in the sidebar — it appears in the editor grid.
      const openFileDiff = (pinned: boolean): void => {
        document.dispatchEvent(
          new CustomEvent("openp41ge:open-commit-file", {
            detail: {
              repoName: commit.repoName,
              hash: commit.hash,
              path: file.path,
              name: file.path.split("/").pop() ?? file.path,
              pinned,
            },
          }),
        );
      };
      row.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        openFileDiff(false);
      });
      row.addEventListener("dblclick", (e: MouseEvent) => {
        e.stopPropagation();
        openFileDiff(true);
      });
      row.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openFileDiff(true);
        }
      });

      out.push(row);
    }
    return out;
  }

  // ── Match highlighting + hit context ───────────────────────────────────

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
