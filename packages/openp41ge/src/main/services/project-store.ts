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
import { createLogger } from "openp41ge-logger";

const log = createLogger("project-store");

export interface ProjectConfig {
  name: string;
  createdAt: string;
  updatedAt: string;
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
