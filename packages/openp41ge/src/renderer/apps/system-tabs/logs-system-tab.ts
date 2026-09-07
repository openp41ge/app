/**
 * LogsSystemTabController — system tab controller for the Logs sidebar
 * (registration id `"logs"`).
 *
 * Lists every system (plugin id / platform) that has logged, one row per
 * system, with the live total entry count. Clicking a system dispatches
 * `openp41ge:open-log-system` so it opens as a system-scoped `log-viewer`
 * grid tab (the tab groups the system's streams).
 *
 * Data comes from the openp41ge-logger stream registry (`listLogStreams`),
 * refreshed on log events, stream registration, and when the tab becomes
 * visible.
 */

import type { SystemTabController } from "../../controllers/types";
import { createSettingsButton } from "../../services/settings-button";
import {
  listLogStreams,
  subscribeLogStreams,
  subscribeLogs,
  type LogStreamInfo,
} from "openp41ge-logger";

interface LogSystem {
  system: string;
  names: string[];
  entryCount: number;
}

export class LogsSystemTabController implements SystemTabController {
  readonly tabId: string;
  readonly appType = "logs";

  private _container: HTMLElement | null = null;
  private _list: HTMLElement | null = null;
  private _systems: LogSystem[] = [];
  private _unsubscribers: Array<() => void> = [];
  private _suspended = false;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  mount(container: HTMLElement): void {
    this._container = container;
    this._buildUI(container);
    this._subscribe();
    this._render();
  }

  unmount(): void {
    for (const un of this._unsubscribers) un();
    this._unsubscribers = [];
    if (this._view && this._view.parentNode) this._view.parentNode.removeChild(this._view);
    this._view = null;
    this._list = null;
    this._container = null;
  }

  setVisible(visible: boolean): void {
    this._suspended = !visible;
    if (visible) this._render();
  }

  // ── UI ───────────────────────────────────────────────────────────────

  private _view: HTMLElement | null = null;

  private _buildUI(container: HTMLElement): void {
    const view = document.createElement("div");
    view.dataset.systemTab = "logs";
    Object.assign(view.style, {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      overflow: "hidden",
    });

    const list = document.createElement("div");
    Object.assign(list.style, {
      flex: "1",
      overflowY: "auto",
      minHeight: "0",
    });

    const empty = document.createElement("div");
    Object.assign(empty.style, {
      padding: "12px 10px",
      fontSize: "12px",
      fontStyle: "italic",
      color: "var(--text-muted,#888)",
    });
    empty.textContent = "No log systems yet";

    // Footer: this tab's own settings button, emitting a unique event to open
    // the Logs settings grid tab.
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      flexShrink: "0",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 10px",
      borderTop: "1px solid var(--divider,#232323)",
      fontSize: "11px",
      color: "var(--text-muted,#888)",
      userSelect: "none",
    });
    const spacer = document.createElement("div");
    Object.assign(spacer.style, { flex: "1 1 auto" });
    footer.appendChild(spacer);
    footer.appendChild(
      createSettingsButton("openp41ge:open-logs-settings", "logs-settings", "Logs", "Log settings"),
    );

    view.append(list, footer);
    container.appendChild(view);

    this._view = view;
    this._list = list;
    this._empty = empty;
  }

  private _empty: HTMLDivElement | null = null;

  private _subscribe(): void {
    this._unsubscribers.push(subscribeLogs(() => this._render()));
    this._unsubscribers.push(subscribeLogStreams(() => this._render()));
  }

  private _aggregate(streams: LogStreamInfo[]): LogSystem[] {
    const bySystem = new Map<string, LogSystem>();
    for (const s of streams) {
      let sys = bySystem.get(s.system);
      if (!sys) {
        sys = { system: s.system, names: [], entryCount: 0 };
        bySystem.set(s.system, sys);
      }
      sys.names.push(s.name);
      sys.entryCount += s.entryCount;
    }
    return [...bySystem.entries()]
      .map(([, sys]) => sys)
      .sort((a, b) => a.system.localeCompare(b.system));
  }

  private _render(): void {
    if (this._suspended || !this._list) return;
    this._systems = this._aggregate(listLogStreams());

    // Clear existing rows.
    this._list.textContent = "";

    if (this._systems.length === 0 && this._empty) {
      this._list.appendChild(this._empty);
      return;
    }

    for (const sys of this._systems) {
      this._list.appendChild(this._row(sys));
    }
  }

  private _row(sys: LogSystem): HTMLElement {
    const row = document.createElement("div");
    row.dataset.logSystem = sys.system;
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 10px",
      cursor: "pointer",
      fontSize: "12px",
      minHeight: "34px",
      boxSizing: "border-box",
      borderBottom: "1px solid var(--divider,#232323)",
    });
    row.addEventListener("mouseenter", () => {
      row.style.background = "var(--bg-hover,#262626)";
    });
    row.addEventListener("mouseleave", () => {
      row.style.background = "transparent";
    });
    row.addEventListener("click", () => {
      // Each system opens as its own pinned grid tab (logs are meant to be
      // monitored concurrently — a second system must not replace the first).
      document.dispatchEvent(
        new CustomEvent("openp41ge:open-log-system", {
          detail: { system: sys.system, title: sys.system, pinned: true },
        }),
      );
    });

    const name = document.createElement("span");
    name.textContent = sys.system;
    Object.assign(name.style, {
      flex: "1",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: "var(--text-primary,#ccc)",
      fontFamily: "monospace",
    });

    const streams = document.createElement("span");
    streams.textContent = `${sys.names.length} stream${sys.names.length === 1 ? "" : "s"}`;
    Object.assign(streams.style, {
      flexShrink: "0",
      color: "var(--text-muted,#888)",
      fontSize: "10px",
      fontFamily: "monospace",
    });

    const badge = document.createElement("span");
    badge.textContent = String(sys.entryCount);
    Object.assign(badge.style, {
      flexShrink: "0",
      color: "var(--text-muted,#888)",
      fontSize: "11px",
      background: "var(--bg-secondary,#252526)",
      borderRadius: "8px",
      padding: "1px 7px",
    });

    row.append(name, streams, badge);
    return row;
  }
}
