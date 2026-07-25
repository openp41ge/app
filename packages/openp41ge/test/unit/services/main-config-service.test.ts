/**
 * Tests for the main process ConfigService.
 *
 * These tests create a temporary directory to simulate ~/.openp41ge/.config/
 * and verify read/write/watch behavior without touching the real config.
 */

import { describe, expect, test, beforeEach, afterEach, mock } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { ConfigService } from "@openp41ge/main/services/config-service";

let tmpDir: string;
let configService: ConfigService;

beforeEach(() => {
  // Create a temp directory for each test
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-config-test-"));
  configService = new ConfigService(tmpDir);
});

afterEach(() => {
  configService.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ConfigService (main process)", () => {
  test("init() creates the config file with defaults when missing", () => {
    configService.init();

    const configPath = path.join(tmpDir, ".config", "config.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.appTheme).toBe("dark");
    expect(parsed.editor.lineHeight).toBe(20);
    expect(parsed.editor.fontSize).toBe(14);
    expect(parsed.syntaxThemes[".ts"]).toBe("openp41ge-dark");
  });

  test("init() reads existing config file correctly", () => {
    // Pre-create config with custom values
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        version: 1,
        appTheme: "light",
        editor: { lineHeight: 24, fontSize: 16, fontFamily: "monospace" },
        syntaxThemes: { ".ts": "monokai" },
      }),
      "utf-8",
    );

    configService.init();

    expect(configService.get("appTheme")).toBe("light");
    expect(configService.get("editor.lineHeight")).toBe(24);
    expect(configService.get("editor.fontSize")).toBe(16);
    const themes = configService.get("syntaxThemes") as Record<string, string>;
    expect(themes[".ts"]).toBe("monokai");
  });

  test("init() deep-merges existing config with defaults", () => {
    // Config with only some fields — missing fields should use defaults
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        version: 1,
        appTheme: "light",
      }),
      "utf-8",
    );

    configService.init();

    // Custom value preserved
    expect(configService.get("appTheme")).toBe("light");
    // Defaults filled in
    expect(configService.get("editor.lineHeight")).toBe(20);
    expect(configService.get("editor.fontSize")).toBe(14);
    const themes = configService.get("syntaxThemes") as Record<string, string>;
    expect(themes[".ts"]).toBe("openp41ge-dark");
  });

  test("getAll() returns the full config object", () => {
    configService.init();
    const all = configService.getAll();
    expect(all).toBeDefined();
    expect(all.version).toBe(1);
    expect(all.appTheme).toBeDefined();
    expect(all.editor).toBeDefined();
    expect(all.syntaxThemes).toBeDefined();
  });

  test("get() returns undefined for unknown keys", () => {
    configService.init();
    expect(configService.get("nonexistent")).toBeUndefined();
    expect(configService.get("editor.nonexistent")).toBeUndefined();
  });

  test("get() with no key returns the entire config", () => {
    configService.init();
    const all = configService.get() as Record<string, unknown>;
    expect(all.version).toBe(1);
  });

  test("set() persists a value and updates the in-memory config", () => {
    configService.init();
    configService.set("appTheme", "light");

    expect(configService.get("appTheme")).toBe("light");

    // Verify on disk
    const configPath = path.join(tmpDir, ".config", "config.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.appTheme).toBe("light");
  });

  test("set() supports nested keys", () => {
    configService.init();
    configService.set("editor.lineHeight", 30);
    configService.set("editor.fontSize", 18);

    expect(configService.get("editor.lineHeight")).toBe(30);
    expect(configService.get("editor.fontSize")).toBe(18);
  });

  test("onChange() fires when config is updated via set()", () => {
    configService.init();
    let changed = false;
    const unsub = configService.onChange(() => {
      changed = true;
    });

    configService.set("appTheme", "light");
    expect(changed).toBe(true);
    unsub();
  });

  test("onChange() unsubscribe works", () => {
    configService.init();
    let callCount = 0;
    const fn = () => callCount++;
    const unsub = configService.onChange(fn);

    configService.set("appTheme", "light");
    expect(callCount).toBe(1);

    unsub();
    configService.set("appTheme", "dark");
    // Should not have incremented since unsubscribed
    expect(callCount).toBe(1);
  });

  test("init() does not fail when config file has invalid JSON", () => {
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "not valid json", "utf-8");

    // Should fall back to defaults without throwing
    configService.init();
    expect(configService.get("appTheme")).toBe("dark");
  });

  test("destroy() stops the file watcher", () => {
    configService.init();
    expect(() => configService.destroy()).not.toThrow();
  });
});
