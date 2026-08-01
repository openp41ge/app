/**
 * ProjectStore — manages project configs stored in ~/.openp41ge/<name>/.
 *
 * Each project is its own directory directly under ~/.openp41ge/:
 *   - ~/.openp41ge/<name>/config.json  — ProjectConfig
 *   - ~/.openp41ge/<name>/repositories/ — cloned repos
 *   - ~/.openp41ge/<name>/workspace-state.json  — persisted workspace state
 *
 * Projects are self-contained: all repo clones live under the project directory.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createLogger } from "openp41ge-logger";

const log = createLogger("project-store");

/** Regex matching draft project names: draft-<uuid>.draft */
const DRAFT_NAME_RE = /^draft-[a-f0-9-]+\.draft$/;

/** Default draft expiry: 7 days in milliseconds. */


import { DRAFT_MAX_AGE_MS } from "openp41ge-constants";

export interface ProjectConfig {
  name: string;
  createdAt: string;
  updatedAt: string;
  /** True for auto-created draft projects that haven't been saved yet. */
  draft?: boolean;
}

export class ProjectStore {
  private readonly _openp41geDir: string;

  constructor(openp41geDir: string) {
    this._openp41geDir = openp41geDir;
  }

  /** Get the project directory for a given project name (~/.openp41ge/<name>/). */
  projectDir(name: string): string {
    return path.join(this._openp41geDir, name);
  }

  /** Get the repositories directory for a given project. */
  reposDir(name: string): string {
    return path.join(this._openp41geDir, name, "repositories");
  }

  /** Get the workspace state file path for a given project. */
  workspaceStatePath(name: string): string {
    return path.join(this._openp41geDir, name, "workspace-state.json");
  }

  /** Get the config file path for a given project. */
  configPath(name: string): string {
    return path.join(this._openp41geDir, name, "config.json");
  }

  /** Get the repo-order file path for a given project. */
  repoOrderPath(name: string): string {
    return path.join(this._openp41geDir, name, "repo-order.json");
  }

  /** Read persisted repo order for a project. Returns null if none saved. */
  readRepoOrder(name: string): string[] | null {
    try {
      const p = this.repoOrderPath(name);
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, "utf-8")) as string[];
    } catch {
      return null;
    }
  }

  /** Write persisted repo order for a project. */
  writeRepoOrder(name: string, order: string[]): void {
    fs.writeFileSync(this.repoOrderPath(name), JSON.stringify(order), "utf-8");
  }

  /** List all projects (directories under ~/.openp41ge/ that have a config.json). */
  list(): string[] {
    try {
      if (!fs.existsSync(this._openp41geDir)) {
        fs.mkdirSync(this._openp41geDir, { recursive: true });
        return [];
      }
      return fs.readdirSync(this._openp41geDir).filter((entry) => {
        // Skip dot-prefixed directories (.config, .pending, etc.)
        if (entry.startsWith(".")) return false;
        // Skip draft projects — they're transparent to the picker
        if (DRAFT_NAME_RE.test(entry)) return false;
        const fullPath = path.join(this._openp41geDir, entry);
        return fs.statSync(fullPath).isDirectory() && this.exists(entry);
      });
    } catch (err) {
      log.error("Failed to list projects:", err);
      return [];
    }
  }

  /** Check if a project exists. */
  exists(name: string): boolean {
    try {
      return fs.existsSync(this.configPath(name));
    } catch {
      return false;
    }
  }

  /** Read a project's config. */
  readConfig(name: string): ProjectConfig | null {
    try {
      const configPath = this.configPath(name);
      if (!fs.existsSync(configPath)) return null;
      const raw = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(raw) as ProjectConfig;
    } catch (err) {
      log.error(`Failed to read config for project "${name}":`, err);
      return null;
    }
  }

  /** Create a new project with the given name. Returns true on success. */
  create(name: string): boolean {
    try {
      const dir = this.projectDir(name);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Create repos directory
      const reposDir = this.reposDir(name);
      if (!fs.existsSync(reposDir)) {
        fs.mkdirSync(reposDir, { recursive: true });
      }
      // Write initial config
      const config: ProjectConfig = {
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.configPath(name), JSON.stringify(config, null, 2), "utf-8");
      log.info(`Project "${name}" created at ${dir}`);
      return true;
    } catch (err) {
      log.error(`Failed to create project "${name}":`, err);
      return false;
    }
  }

  /** Update the project's config timestamp. */
  touch(name: string): void {
    try {
      const config = this.readConfig(name);
      if (config) {
        config.updatedAt = new Date().toISOString();
        fs.writeFileSync(this.configPath(name), JSON.stringify(config, null, 2), "utf-8");
      }
    } catch (err) {
      log.error(`Failed to touch project "${name}":`, err);
    }
  }

  /** Rename a project. Returns true on success, false if oldName doesn't exist or newName conflicts. */
  rename(oldName: string, newName: string): boolean {
    try {
      if (!this.exists(oldName)) {
        log.warn(`Cannot rename "${oldName}": doesn't exist`);
        return false;
      }
      if (oldName === newName) return true;
      if (this.exists(newName)) {
        log.warn(`Cannot rename "${oldName}" to "${newName}": already exists`);
        return false;
      }
      const oldDir = this.projectDir(oldName);
      const newDir = this.projectDir(newName);
      fs.renameSync(oldDir, newDir);
      const config = this.readConfig(newName);
      if (config) {
        config.name = newName;
        config.updatedAt = new Date().toISOString();
        fs.writeFileSync(this.configPath(newName), JSON.stringify(config, null, 2), "utf-8");
      }
      log.info(`Project "${oldName}" renamed to "${newName}"`);
      return true;
    } catch (err) {
      log.error(`Failed to rename "${oldName}" to "${newName}":`, err);
      return false;
    }
  }

  // ── Draft project support ──────────────────────────────────────────

  /** Create a draft project with a unique name. Returns the draft project name. */
  createDraft(): string {
    const uuid = crypto.randomUUID();
    const name = `draft-${uuid}.draft`;
    this.create(name);
    // Re-write config with draft flag
    const config = this.readConfig(name);
    if (config) {
      config.draft = true;
      fs.writeFileSync(this.configPath(name), JSON.stringify(config, null, 2), "utf-8");
    }
    log.info(`Draft project "${name}" created`);
    return name;
  }

  /** Check whether a project name matches the draft pattern. */
  isDraft(name: string): boolean {
    return DRAFT_NAME_RE.test(name);
  }

  /**
   * Convert a draft project to a permanent named project.
   * Renames the directory from draft-<uuid>.draft/ to <newName>/ and
   * updates the config to remove the draft flag.
   * Returns true on success, false if the draft doesn't exist or newName conflicts.
   */
  saveDraftAs(draftName: string, newName: string): boolean {
    try {
      if (!this.isDraft(draftName) || !this.exists(draftName)) {
        log.warn(`Cannot save draft "${draftName}": not a draft or doesn't exist`);
        return false;
      }
      if (this.exists(newName)) {
        log.warn(`Cannot save draft as "${newName}": project already exists`);
        return false;
      }
      const draftDir = this.projectDir(draftName);
      const newDir = this.projectDir(newName);
      fs.renameSync(draftDir, newDir);
      // Update config: remove draft flag, set new name, update updatedAt
      const config = this.readConfig(newName);
      if (config) {
        config.name = newName;
        config.draft = false;
        config.updatedAt = new Date().toISOString();
        fs.writeFileSync(this.configPath(newName), JSON.stringify(config, null, 2), "utf-8");
      }
      log.info(`Draft "${draftName}" saved as project "${newName}"`);
      return true;
    } catch (err) {
      log.error(`Failed to save draft "${draftName}" as "${newName}":`, err);
      return false;
    }
  }

  /**
   * Garbage-collect draft projects older than the given max age.
   * Returns the number of drafts deleted.
   */
  gcDrafts(maxAgeMs: number = DRAFT_MAX_AGE_MS): number {
    let deleted = 0;
    try {
      if (!fs.existsSync(this._openp41geDir)) return 0;
      const entries = fs.readdirSync(this._openp41geDir);
      const now = Date.now();
      for (const entry of entries) {
        if (!DRAFT_NAME_RE.test(entry)) continue;
        const config = this.readConfig(entry);
        if (!config || !config.draft) continue;
        const createdAt = new Date(config.createdAt).getTime();
        if (now - createdAt > maxAgeMs) {
          if (this.delete(entry)) {
            deleted++;
          }
        }
      }
    } catch (err) {
      log.error("Failed to garbage-collect drafts:", err);
    }
    if (deleted > 0) {
      log.info(`Garbage-collected ${deleted} old draft(s)`);
    }
    return deleted;
  }

  /** Delete a project and all its contents. */
  delete(name: string): boolean {
    try {
      const dir = this.projectDir(name);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      log.info(`Project "${name}" deleted`);
      return true;
    } catch (err) {
      log.error(`Failed to delete project "${name}":`, err);
      return false;
    }
  }
}
