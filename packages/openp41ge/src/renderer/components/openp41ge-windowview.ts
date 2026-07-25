/**
 * <openp41ge-windowview> — top-level component for a Openp41ge window (Lit).
 *
 * Provides workspace context to children. Renders the grid, titlebar,
 * worktree tree, bottom bar, and overlays.
 *
 * Each window has its own grid, sidebar, and repo refs — no worksets.
 */

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import { createLogger } from "openp41ge-logger";
import type { Window, Workspace, Rect, Tab } from "../../layout/types";
import { dispatch, appServices } from "../app";
import { Openp41geScrollbar } from "./openp41ge-scrollbar";

const log = createLogger("openp41ge-windowview");

/** Built-in syntax theme options for the settings UI. */
const SYNTAX_THEME_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "openp41ge-dark", label: "Openp41ge Dark" },
  { id: "openp41ge-light", label: "Openp41ge Light" },
  { id: "monokai", label: "Monokai" },
  { id: "github-dark", label: "GitHub Dark" },
  { id: "github-light", label: "GitHub Light" },
];

import { setContextMenuActive } from "../services/tab-drag-handler";
import "./openp41ge-bottom-button";
import "./openp41ge-activity-bar";
import "./openp41ge-sidebar";

class Openp41geWindowView extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  @property({ attribute: false })
  windowData: Window | null = null;

  @property({ attribute: false })
  workspaceData: Workspace | null = null;

  @property({ attribute: false })
  layouts: Map<string, Map<string, Rect>> = new Map();

  private _contextMenu: { x: number; y: number; paneId?: string } | null = null;
  private _skeletonInitialized = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._ensureSkeleton();
  }

  private _ensureSkeleton(): void {
    if (this._skeletonInitialized) return;
    this._skeletonInitialized = true;

    this.addEventListener("contextmenu", (e: MouseEvent) => {
      const gridArea = this.querySelector(".openp41ge-grid-area");
      if (!gridArea || !gridArea.contains(e.target as Node)) return;
      e.preventDefault();
      if (!(e.target instanceof HTMLElement)) return;
      const paneEl = e.target.closest("[data-pane-id]");
      if (!(paneEl instanceof HTMLElement)) {
        this._contextMenu = { x: e.clientX, y: e.clientY, paneId: undefined };
      } else {
        const paneId = paneEl.getAttribute("data-pane-id") ?? undefined;
        this._contextMenu = { x: e.clientX, y: e.clientY, paneId };
      }
      this._updateContextMenu();
    });

    document.addEventListener("openp41ge:toggle-settings", () => {
      this._toggleSettingsModal();
    });

    document.addEventListener("fe:cursor-changed", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const posEl = this.querySelector("#cursor-position");
      if (posEl) {
        posEl.textContent = "Ln " + detail.lineNumber + ", Col " + detail.column;
      }
    });
  }

  render(): TemplateResult | typeof nothing {
    const win = this.windowData;
    const ws = this.workspaceData;
    if (!win) return nothing;

    // Build tab-data and active-tab-ids for <tab-grid>
    const tabData: Record<string, { title: string; content: string; pinned: boolean }> = {};
    const activeTabIds: Record<string, string> = {};
    for (const p of win.grid.placements) {
      const col = String(p.position.col);
      activeTabIds[col] = p.activeTabId ?? p.tabIds[0] ?? "";
      for (const tabId of p.tabIds) {
        const tab = ws?.tabs?.[tabId as string];
        const pinned = tab ? !(tab as { isPreview?: boolean }).isPreview : true;
        tabData[tabId as string] = { title: tab?.title ?? "untitled", content: "", pinned };
      }
    }

    return html`
      <div
        style="display:flex;flex-direction:column;width:100%;height:100%;background:var(--bg-surface);position:relative"
      >
        <openp41ge-titlebar .windowData=${win}></openp41ge-titlebar>
        <div
          class="openp41ge-main-area"
          style="display:flex;flex:1;overflow:hidden;min-height:0;position:relative;"
        >
          <div class="openp41ge-grid-area" style="flex:1;position:relative;overflow:hidden">
            <tab-grid
              winId=${win.id}
              .cols=${win.grid.cols}
              .placements=${win.grid.placements.map((p) => ({ position: { ...p.position }, tabIds: [...p.tabIds] }))}
              .tabData=${tabData}
              .activeTabIds=${activeTabIds}
            ></tab-grid>
          </div>
          <openp41ge-sidebar
            .windowId=${win.id}
            .activeViewId=${win.sidebar?.activeViewId ?? null}
            .width=${win.sidebar?.width ?? 280}
          ></openp41ge-sidebar>
          <openp41ge-activity-bar
            .activeViewId=${win.sidebar?.activeViewId ?? null}
          ></openp41ge-activity-bar>
        </div>
        <div
          class="openp41ge-bottom-bar"
          style="display:flex;align-items:center;height:28px;background:var(--bg-primary);border-top:1px solid var(--border-divider);flex-shrink:0;"
        >
          <span
            id="cursor-position"
            style="color:var(--text-muted);font-size:11px;padding:0 8px;font-style:normal;white-space:nowrap;"
          ></span>
          <div style="flex:1"></div>
          <openp41ge-bottom-button
            @click=${(e: MouseEvent) => {
              e.stopPropagation();
              this._togglePromptOverlay();
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="16px"
              viewBox="0 -960 960 960"
              width="16px"
              fill="currentColor"
            >
              <path
                d="M80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z"
              />
            </svg>
          </openp41ge-bottom-button>
          <openp41ge-bottom-button
            @click=${(e: MouseEvent) => {
              e.stopPropagation();
              this._toggleSettingsModal();
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="16px"
              viewBox="0 -960 960 960"
              width="16px"
              fill="currentColor"
              style="margin-top:-1px"
            >
              <path
                d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"
              />
            </svg>
          </openp41ge-bottom-button>
          ${
            window.openp41ge.isDev()
              ? html`<openp41ge-bottom-button
                    title="Toggle DevTools"
                    @click=${(e: MouseEvent) => {
                      e.stopPropagation();
                      window.openp41ge.window.openDevTools();
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="16px"
                      viewBox="0 -960 960 960"
                      width="16px"
                      fill="currentColor"
                      style="margin-top:-1px"
                    >
                      <path
                        d="M756-120 537-339l84-84 219 219-84 84Zm-552 0-84-84 276-276-68-68-28 28-51-51v82l-28 28-121-121 28-28h82l-50-50 142-142q20-20 43-29t47-9q24 0 47 9t43 29l-92 92 50 50-28 28 68 68 90-90q-4-11-6.5-23t-2.5-24q0-59 40.5-99.5T701-841q15 0 28.5 3t27.5 9l-99 99 72 72 99-99q7 14 9.5 27.5T841-701q0 59-40.5 99.5T701-561q-12 0-24-2t-23-7L204-120Z"
                      />
                    </svg>
                  </openp41ge-bottom-button>
                  <openp41ge-bottom-button
                    flat
                    title="Reset app state"
                    @click=${(e: MouseEvent) => {
                      e.stopPropagation();
                      window.openp41ge.workspace.reset();
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="16px"
                      viewBox="0 -960 960 960"
                      width="16px"
                      fill="currentColor"
                      style="margin-top:-1px"
                    >
                      <path
                        d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86.5q54.5 55 86 127T880-480h-80q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q97 0 183-57t115-143h82q-31 114-123 187T480-80Zm238-240-56-58 102-102H520v-80h244L662-662l56-58 162 162-162 238Z"
                      />
                    </svg>
                  </openp41ge-bottom-button>`
              : nothing
          }
        </div>
        <div
          class="prompt-overlay"
          style="position:absolute;bottom:36px;left:50%;transform:translateX(-50%) scale(0.85) translateY(8px);width:520px;max-width:90vw;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;padding:8px 12px;z-index:50;box-shadow:0 -4px 20px rgba(0,0,0,0.4);flex-shrink:0;opacity:0;visibility:hidden;pointer-events:none;transition:opacity 0.15s ease,transform 0.15s ease,box-shadow 0.15s ease;transform-origin:bottom center;"
        >
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <textarea
              class="prompt-input"
              placeholder="Type a command or ask a question…"
              rows="2"
              style="flex:1;background:transparent;border:none;color:#e0e0e0;font-size:13px;padding:4px 0;outline:none;font-family:inherit;resize:none;line-height:1.5;min-height:47px;max-height:203px;overflow-y:auto;"
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Escape") this._hidePromptOverlay();
              }}
              @input=${(e: InputEvent) => {
                const ta = e.target as HTMLTextAreaElement;
                ta.style.height = "auto";
                ta.style.height = ta.scrollHeight + "px";
              }}
              @focus=${() => {
                this.querySelector(".prompt-overlay")?.classList.add("prompt-focus");
              }}
              @blur=${() => {
                this.querySelector(".prompt-overlay")?.classList.remove("prompt-focus");
              }}
            ></textarea>
            <button
              class="prompt-submit"
              style="background:var(--accent);border:none;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;cursor:pointer;line-height:1;padding:0;flex-shrink:0;margin-top:2px;"
              @click=${() => {
                const input = this.querySelector(".prompt-input") as HTMLTextAreaElement | null;
                if (input) input.value = "";
                this._hidePromptOverlay();
              }}
            >
              →
            </button>
          </div>
        </div>
        <style>
          .bottom-prompt-btn:hover {
            color: #e0e0e0 !important;
            background: var(--accent) !important;
          }
          .bottom-gear:hover {
            color: #e0e0e0 !important;
            background: var(--bg-tertiary) !important;
          }
          .prompt-overlay.prompt-open {
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
            transform: translateX(-50%) scale(1) translateY(0) !important;
          }
          .prompt-overlay.prompt-focus {
            border-color: var(--accent-hover) !important;
            box-shadow:
              0 -4px 20px rgba(0, 0, 0, 0.4),
              0 0 0 1px #4a9eff !important;
          }
        </style>
      </div>
    `;
  }

  updated(): void {
    // Context menu is now shown synchronously from the event handler,
    // not from updated() — no need to re-trigger here.
  }

  // ═══ Context menu ─────────────────────────────────────────────────────

  private async _updateContextMenu(_win?: Window): Promise<void> {
    if (!this._contextMenu) return;
    const w = _win ?? this.windowData;
    if (!w) return;

    const items: Array<{ label: string; id: string }> = [];

    if (this._contextMenu?.paneId) {
      items.push({ label: "Move to new window", id: "detach-tab-window" });
    }
    if (this._contextMenu?.paneId) {
      items.push({ label: "Close", id: "close-tab" });
    }

    setContextMenuActive(true);
    const blockNextMousedown = (e: MouseEvent) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      document.removeEventListener("mousedown", blockNextMousedown, true);
    };
    document.addEventListener("mousedown", blockNextMousedown, true);
    const id = await window.openp41ge.showContextMenu(items);
    document.removeEventListener("mousedown", blockNextMousedown, true);
    setTimeout(() => setContextMenuActive(false), 0);
    if (!id) {
      this._contextMenu = null;
      return;
    }

    switch (id) {
      case "detach-tab-window":
        if (this._contextMenu?.paneId) {
          window.openp41ge.workspace.detachTab(w.id, this._contextMenu.paneId, {
            x: 100,
            y: 100,
            width: 800,
            height: 600,
          });
        }
        break;
      case "close-tab":
        if (this._contextMenu?.paneId) {
          dispatch("removeTabFromCell", w.id, this._contextMenu.paneId);
        }
        break;
    }
    this._contextMenu = null;
  }

  // ═══ Prompt overlay ───────────────────────────────────────────────────

  private _togglePromptOverlay(): void {
    const overlay = this.querySelector(".prompt-overlay") as HTMLElement | null;
    const input = this.querySelector(".prompt-input") as HTMLTextAreaElement | null;
    if (!overlay) return;

    if (!overlay.classList.contains("prompt-open")) {
      overlay.classList.add("prompt-open");
      if (input) {
        input.value = "";
        requestAnimationFrame(() => input.focus());
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
      }
    } else {
      this._hidePromptOverlay();
    }
  }

  private _hidePromptOverlay(): void {
    const overlay = this.querySelector(".prompt-overlay") as HTMLElement | null;
    const input = this.querySelector(".prompt-input") as HTMLTextAreaElement | null;
    if (overlay) {
      overlay.classList.remove("prompt-open");
      overlay.classList.remove("prompt-focus");
    }
    if (input) input.value = "";
  }

  // ═══ Settings modal ───────────────────────────────────────────────────

  private _toggleSettingsModal(): void {
    const existing = this.querySelector(".settings-modal");
    if (existing) {
      existing.remove();
      return;
    }

    const sections = [
      { id: "appearance", label: "Appearance", icon: "\uD83C\uDFA8" },
      { id: "about", label: "About", icon: "\u2139\uFE0F" },
    ];
    let _activeSection = "appearance";
    const modal = document.createElement("div");
    modal.className = "settings-modal";
    modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:200;display:flex;align-items:center;justify-content:center;`;

    const container = document.createElement("div");
    container.style.cssText = `display:flex;flex-direction:column;width:100%;height:100%;max-width:100%;max-height:100%;background:var(--bg-primary);border:none;border-radius:0;overflow:hidden;`;

    const titleBar = document.createElement("div");
    titleBar.style.cssText = `display:flex;align-items:center;height:38px;flex-shrink:0;background:var(--bg-secondary);border-bottom:1px solid var(--border-divider);padding:0 12px;`;

    const titleSpacer = document.createElement("div");
    titleSpacer.style.flex = "1";
    titleBar.appendChild(titleSpacer);

    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = `\u2715`;
    closeBtn.style.cssText = `
      display:flex;align-items:center;justify-content:center;
      width:28px;height:28px;border:none;border-radius:6px;
      background:transparent;color:var(--text-secondary);
      font-size:14px;cursor:pointer;
    `;
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.background = "var(--bg-hover)";
      closeBtn.style.color = "var(--text-primary)";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.background = "transparent";
      closeBtn.style.color = "var(--text-secondary)";
    });
    closeBtn.addEventListener("click", () => modal.remove());
    titleBar.appendChild(closeBtn);

    container.appendChild(titleBar);

    const body = document.createElement("div");
    body.style.cssText = `display:flex;flex:1;overflow:hidden;`;

    const sidebar = document.createElement("div");
    sidebar.style.cssText = `width:180px;flex-shrink:0;background:var(--bg-secondary);border-right:1px solid var(--border-divider);padding:12px 0;overflow-y:auto;`;
    Openp41geScrollbar.apply(sidebar, { axis: "vertical" });

    const menuEls: HTMLElement[] = [];
    for (const s of sections) {
      const item = document.createElement("div");
      item.style.cssText = `display:flex;align-items:center;gap:8px;padding:8px 16px;font-size:13px;color:var(--text-secondary);cursor:pointer;`;
      item.innerHTML = `${s.icon} <span>${s.label}</span>`;
      item.addEventListener("click", () => {
        _activeSection = s.id;
        menuEls.forEach((el) => {
          el.style.color = "#999";
          el.style.background = "";
        });
        item.style.background = "rgba(42,111,209,0.15)";
        item.style.color = "#e0e0e0";
        contentArea.innerHTML = "";
        if (s.id === "appearance") {
          this._renderAppearanceSettingsInto(contentArea);
        } else {
          contentArea.innerHTML = `<div style="font-size:15px;font-weight:600;color:#e0e0e0;margin-bottom:8px;">About Openp41ge</div><div style="color:var(--text-secondary);font-size:12px;">Openp41ge \u2014 a modern window manager and workspace tool.</div>`;
        }
      });
      sidebar.appendChild(item);
      menuEls.push(item);
    }
    menuEls[0].style.background = "rgba(42,111,209,0.15)";
    menuEls[0].style.color = "#e0e0e0";

    const contentArea = document.createElement("div");
    contentArea.style.cssText = `flex:1;padding:24px 32px;font-size:13px;color:var(--text-primary);overflow-y:auto;`;

    body.appendChild(sidebar);
    body.appendChild(contentArea);
    container.appendChild(body);
    modal.appendChild(container);
    this.appendChild(modal);

    this._renderAppearanceSettingsInto(contentArea);

    modal.addEventListener("mousedown", (e) => {
      if (e.target === modal) modal.remove();
    });
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        modal.remove();
        document.removeEventListener("keydown", keyHandler);
      }
    };
    document.addEventListener("keydown", keyHandler);
  }

  // ═══ Appearance settings renderer ──────────────────────────────────────

  private _renderAppearanceSettingsInto(container: HTMLElement): void {
    container.innerHTML = "";
    try {
      let currentTheme = "dark";
      let lineHeight = 20;
      let fontSize = 14;
      let syntaxThemes: Record<string, string> = {};
      try {
        const config = appServices.configService.getAll();
        if (config) {
          if (config.appTheme) currentTheme = config.appTheme;
          if (config.editor) {
            if (config.editor.lineHeight) lineHeight = config.editor.lineHeight;
            if (config.editor.fontSize) fontSize = config.editor.fontSize;
          }
          if (config.syntaxThemes) syntaxThemes = config.syntaxThemes;
        }
      } catch (e) {
        log.warn("Config read error, using defaults:", e);
      }

      const title = document.createElement("div");
      title.style.cssText =
        "font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:20px;";
      title.textContent = "Appearance";
      container.appendChild(title);

      const themeSection = document.createElement("div");
      themeSection.style.marginBottom = "20px";

      const themeLabel = document.createElement("div");
      themeLabel.style.cssText =
        "font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:10px;";
      themeLabel.textContent = "App Theme";
      themeSection.appendChild(themeLabel);

      const themeRow = document.createElement("div");
      themeRow.style.display = "flex";
      themeRow.style.gap = "16px";

      for (const t of ["dark", "light"]) {
        const label = document.createElement("label");
        label.style.cssText =
          "display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:var(--text-secondary);font-size:13px;";

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "app-theme";
        radio.value = t;
        if (currentTheme === t) radio.checked = true;
        radio.style.accentColor = "var(--accent)";
        radio.addEventListener("change", () => {
          if (radio.checked) {
            appServices.configService.set("appTheme", radio.value);
            document.documentElement.setAttribute("data-app-theme", radio.value);
          }
        });

        label.appendChild(radio);
        label.appendChild(document.createTextNode(t.charAt(0).toUpperCase() + t.slice(1)));
        themeRow.appendChild(label);
      }
      themeSection.appendChild(themeRow);
      container.appendChild(themeSection);

      const editorSection = document.createElement("div");
      editorSection.style.marginBottom = "20px";

      const editorLabel = document.createElement("div");
      editorLabel.style.cssText =
        "font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:10px;";
      editorLabel.textContent = "Editor";
      editorSection.appendChild(editorLabel);

      const editorRow = document.createElement("div");
      editorRow.style.cssText = "display:flex;flex-direction:column;gap:10px;";

      editorRow.appendChild(
        this._makeNumberField("Line Height", "fe-line-height", lineHeight, 14, 40, (val) => {
          appServices.configService.set("editor.lineHeight", val);
        }),
      );

      editorRow.appendChild(
        this._makeNumberField("Font Size", "fe-font-size", fontSize, 10, 30, (val) => {
          appServices.configService.set("editor.fontSize", val);
        }),
      );

      editorSection.appendChild(editorRow);
      container.appendChild(editorSection);

      const syntaxSection = document.createElement("div");
      syntaxSection.style.marginBottom = "20px";

      const syntaxHeader = document.createElement("div");
      syntaxHeader.style.cssText =
        "font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:10px;";
      syntaxHeader.textContent = "Syntax Themes";
      syntaxSection.appendChild(syntaxHeader);

      const extInfo = document.createElement("div");
      extInfo.style.cssText = "color:var(--text-muted);font-size:11px;margin-bottom:10px;";
      extInfo.textContent = "Choose a syntax colour scheme per file type.";
      syntaxSection.appendChild(extInfo);

      const table = document.createElement("table");
      table.style.cssText = "width:100%;border-collapse:collapse;font-size:12px;";

      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      for (const h of ["Language", "Extension", "Theme"]) {
        const th = document.createElement("th");
        th.style.cssText =
          "text-align:left;padding:6px 8px;color:var(--text-muted);font-weight:500;border-bottom:1px solid var(--border-divider);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;";
        th.textContent = h;
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      const DEFAULT_EXTENSIONS: Array<{ ext: string; lang: string }> = [
        { ext: ".ts", lang: "TypeScript" },
        { ext: ".tsx", lang: "TypeScript React" },
        { ext: ".js", lang: "JavaScript" },
        { ext: ".jsx", lang: "JavaScript React" },
        { ext: ".json", lang: "JSON" },
        { ext: ".md", lang: "Markdown" },
        { ext: ".css", lang: "CSS" },
        { ext: ".html", lang: "HTML" },
        { ext: ".yaml", lang: "YAML" },
        { ext: ".sh", lang: "Shell" },
      ];

      for (const { ext, lang } of DEFAULT_EXTENSIONS) {
        const row = document.createElement("tr");
        row.style.cssText = "border-bottom:1px solid var(--border-divider);";

        const langCell = document.createElement("td");
        langCell.style.cssText = "padding:6px 8px;color:var(--text-primary);";
        langCell.textContent = lang;
        row.appendChild(langCell);

        const extCell = document.createElement("td");
        extCell.style.cssText =
          "padding:6px 8px;color:var(--text-secondary);font-family:monospace;";
        extCell.textContent = ext;
        row.appendChild(extCell);

        const themeCell = document.createElement("td");
        themeCell.style.cssText = "padding:4px 8px;";

        const select = document.createElement("select");
        select.style.cssText =
          "width:100%;min-width:120px;padding:3px 6px;background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-primary);border-radius:3px;font-size:12px;";

        const currentThemeId = syntaxThemes[ext] || "openp41ge-dark";
        for (const { id, label } of SYNTAX_THEME_OPTIONS) {
          const opt = document.createElement("option");
          opt.value = id;
          if (id === currentThemeId) opt.selected = true;
          opt.textContent = label;
          select.appendChild(opt);
        }

        select.addEventListener("change", () => {
          appServices.configService.set("syntaxThemes", {
            ...syntaxThemes,
            [ext]: select.value,
          });
        });

        themeCell.appendChild(select);
        row.appendChild(themeCell);
        tbody.appendChild(row);
      }

      table.appendChild(tbody);
      syntaxSection.appendChild(table);

      container.appendChild(syntaxSection);
    } catch (err) {
      log.error("Failed to render appearance settings:", err);
      log.error("Error details:", (err as Error)?.stack || (err as Error)?.message || String(err));
      container.innerHTML = `<div style="color:var(--accent-error);font-size:12px;">Failed to load settings. Check console for details.</div>`;
    }
  }

  private _makeNumberField(
    label: string,
    id: string,
    value: number,
    min: number,
    max: number,
    onChange: (val: number) => void,
  ): HTMLLabelElement {
    const labelEl = document.createElement("label");
    labelEl.style.cssText =
      "display:flex;align-items:center;gap:8px;color:var(--text-secondary);font-size:12px;";

    const textSpan = document.createElement("span");
    textSpan.textContent = label;
    labelEl.appendChild(textSpan);

    const input = document.createElement("input");
    input.type = "number";
    input.id = id;
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.step = "1";
    input.style.cssText =
      "width:60px;padding:2px 6px;background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-primary);border-radius:4px;font-size:12px;";
    input.addEventListener("change", () => {
      const val = parseInt(input.value, 10);
      if (val >= min && val <= max) {
        onChange(val);
      }
    });

    labelEl.appendChild(input);
    return labelEl;
  }

  private _getActiveFileExtension(): string {
    try {
      const ws = appServices.workspaceState.getWorkspace();
      if (!ws) return ".ts";
      for (const win of ws.windows) {
        for (const pl of win.grid.placements) {
          const activeTabId = pl.activeTabId ?? (pl.tabIds && pl.tabIds[0]);
          if (!activeTabId) continue;
          const tabs = ws.tabs as unknown as Record<string, Tab | undefined>;
          const tab = tabs[activeTabId as string];
          if (tab && tab.appType === "file-viewer") {
            const fp = tab.config && (tab.config.filePath as string | undefined);
            if (fp) {
              const dot = fp.lastIndexOf(".");
              if (dot >= 0) return fp.slice(dot);
            }
          }
        }
      }
      return ".ts";
    } catch {
      return ".ts";
    }
  }
}

customElements.define("openp41ge-windowview", Openp41geWindowView);
