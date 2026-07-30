/**
 * RecentProjectsModel — reads/writes ~/.openp41ge/.config/recent-projects.json
 * from the main process.
 *
 * Stores an ordered list of recently opened projects, newest first.
 * Maximum 20 entries. Each entry records the project name and the
 * timestamp it was last opened.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { createLogger } from "openp41ge-logger";

const log = createLogger("RecentProjectsModel");

const MAX_ENTRIES = 20;

export interface RecentProjectEntry {
  name: string;
  openedAt: string; // ISO-8601
}

export class RecentProjectsModel {
  private _filePath: string;
  private _entries: RecentProjectEntry[] = [];

  constructor(openp41geDir?: string) {
    const baseDir = openp41geDir ?? path.join(os.homedir(), ".openp41ge");
    const configDir = path.join(baseDir, ".config");
    this._filePath = path.join(configDir, "recent-projects.json");
    this._load();
  }

  /** Return the list of recent projects, newest first. */
  list(): RecentProjectEntry[] {
    return [...this._entries];
  }

  /**
   * Remove a project from the recent list.
   */
  remove(name: string): void {
    this._entries = this._entries.filter((e) => e.name !== name);
    this._save();
  }

  /**
   * Record that a project was just opened.
   * Moves it to the top of the list (or adds it).
   */
  add(name: string): void {
    // Remove existing entry for this project
    this._entries = this._entries.filter((e) => e.name !== name);
    // Add to front
    this._entries.unshift({ name, openedAt: new Date().toISOString() });
    // Trim to max
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(0, MAX_ENTRIES);
    }
    this._save();
  }

  // ── Private ─────────────────────────────────────────────────

  private _load(): void {
    try {
      if (fs.existsSync(this._filePath)) {
        const raw = fs.readFileSync(this._filePath, "utf-8");
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this._entries = data.slice(0, MAX_ENTRIES);
        }
      }
    } catch (err) {
      log.error("Failed to load recent projects:", err);
      this._entries = [];
    }
  }

  private _save(): void {
    try {
      const dir = path.dirname(this._filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Atomic write: temp file + rename
      const tmp = this._filePath + ".tmp." + process.pid;
      fs.writeFileSync(tmp, JSON.stringify(this._entries, null, 2), "utf-8");
      fs.renameSync(tmp, this._filePath);
    } catch (err) {
      log.error("Failed to save recent projects:", err);
    }
  }
}
