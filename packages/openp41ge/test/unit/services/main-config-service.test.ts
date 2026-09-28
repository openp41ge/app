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
    expect(parsed.lineHeight).toBe(20);
    expect(parsed.fontSize).toBe(14);
    expect(parsed.editor.maxFileSize).toBe(50 * 1024 * 1024);
    expect(parsed.syntaxThemes).toEqual({});
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
        lineHeight: 24,
        fontSize: 16,
        editor: { fontFamily: "monospace" },
        syntaxThemes: { ".ts": "monokai" },
      }),
      "utf-8",
    );

    configService.init();

    expect(configService.get("appTheme")).toBe("light");
    expect(configService.get("lineHeight")).toBe(24);
    expect(configService.get("fontSize")).toBe(16);
    const themes = configService.get("syntaxThemes") as Record<string, string>;
    expect(themes[".ts"]).toBe("monokai");
    // Theme no longer has per-extension defaults; only what user set
  });

  test("init() promotes legacy nested editor.lineHeight/fontSize to top level", () => {
    // Configs written before the platform settings were lifted to the top
    // level store line-height/font-size nested under `editor`; they should be
    // promoted and the stale nested keys removed.
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        version: 1,
        appTheme: "dark",
        editor: { lineHeight: 30, fontSize: 12, fontFamily: "monospace", maxFileSize: 1024 },
      }),
      "utf-8",
    );

    configService.init();
    expect(configService.get("lineHeight")).toBe(30);
    expect(configService.get("fontSize")).toBe(12);
    const editor = configService.get("editor") as Record<string, unknown>;
    expect("lineHeight" in editor).toBe(false);
    expect("fontSize" in editor).toBe(false);
    expect(editor.fontFamily).toBe("monospace");
    expect(editor.maxFileSize).toBe(1024);
  });

  test("init() renames the provider-level `model` key to `defaultModel`", () => {
    // Configs written before the rename stored the provider's default model
    // under `model` (confusable with the `models` list); they should be
    // migrated to `defaultModel` and the stale key removed.
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        version: 1,
        appTheme: "dark",
        lineHeight: 20,
        fontSize: 14,
        editor: { fontFamily: "monospace", maxFileSize: 1024 },
        agent: {
          providerId: "vllm",
          providers: { vllm: { baseUrl: "http://x", model: "m", apiKey: "k" } },
        },
      }),
      "utf-8",
    );

    configService.init();
    const providers = configService.get("agent.providers") as Record<
      string,
      Record<string, unknown>
    >;
    expect(providers.vllm.defaultModel).toBe("m");
    expect("model" in providers.vllm).toBe(false);
    expect(providers.vllm.baseUrl).toBe("http://x");
    expect(providers.vllm.apiKey).toBe("k");
  });

  test("init() persists the migrated config so the legacy `model` key never reappears", () => {
    // The in-memory migration alone leaves the legacy `model` key in the file;
    // reopening would read it again. The cleaned shape must be written back.
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        version: 1,
        appTheme: "dark",
        lineHeight: 20,
        fontSize: 14,
        editor: { fontFamily: "monospace", maxFileSize: 1024 },
        agent: {
          providerId: "vllm",
          providers: { vllm: { baseUrl: "http://x", model: "m" } },
        },
      }),
      "utf-8",
    );

    configService.init();

    const raw = fs.readFileSync(path.join(configDir, "config.json"), "utf-8");
    const parsed = JSON.parse(raw) as {
      agent: { providers: Record<string, Record<string, unknown>> };
    };
    expect(parsed.agent.providers.vllm.defaultModel).toBe("m");
    expect("model" in parsed.agent.providers.vllm).toBe(false);
  });

  test("init() drops a lingering `model` key when `defaultModel` is already set", () => {
    // A config that somehow carries BOTH keys (e.g. an earlier partial edit)
    // must not keep the stale `model` — `defaultModel` wins and `model` is
    // removed.
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        version: 1,
        appTheme: "dark",
        lineHeight: 20,
        fontSize: 14,
        editor: { fontFamily: "monospace", maxFileSize: 1024 },
        agent: {
          providerId: "vllm",
          providers: { vllm: { baseUrl: "http://x", model: "legacy", defaultModel: "cur" } },
        },
      }),
      "utf-8",
    );

    configService.init();

    const providers = configService.get("agent.providers") as Record<
      string,
      Record<string, unknown>
    >;
    expect(providers.vllm.defaultModel).toBe("cur");
    expect("model" in providers.vllm).toBe(false);

    const parsed = JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf-8")) as {
      agent: { providers: Record<string, Record<string, unknown>> };
    };
    expect(parsed.agent.providers.vllm.defaultModel).toBe("cur");
    expect("model" in parsed.agent.providers.vllm).toBe(false);
  });

  test("set() strips a legacy `model` key before persisting (even after init)", () => {
    // A save path that carries a stale `model` (e.g. `model: ""` from a config
    // written pre-rename, alongside a `models` list) must never re-persist it.
    configService.init();

    configService.set("agent", {
      providerId: "vllm",
      providers: {
        vllm: {
          baseUrl: "http://x",
          name: "vLLM",
          model: "",
          models: [{ id: "deepseek-v4-flash" }],
        },
      },
    });

    const providers = configService.get("agent.providers") as Record<
      string,
      Record<string, unknown>
    >;
    expect("model" in providers.vllm).toBe(false);
    expect(providers.vllm.defaultModel).toBe("");
    expect(providers.vllm.models).toEqual([{ id: "deepseek-v4-flash" }]);

    const parsed = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".config", "config.json"), "utf-8"),
    ) as {
      agent: { providers: Record<string, Record<string, unknown>> };
    };
    expect("model" in parsed.agent.providers.vllm).toBe(false);
    expect(parsed.agent.providers.vllm.defaultModel).toBe("");
  });

  test("init() back-fills the maxFileSize default for legacy config files", () => {
    // A config written before editor.maxFileSize existed must get the 50MB
    // default via deepMerge rather than a missing/undefined value.
    const configDir = path.join(tmpDir, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        version: 1,
        appTheme: "dark",
        lineHeight: 20,
        fontSize: 14,
        editor: { fontFamily: "monospace" },
      }),
      "utf-8",
    );

    configService.init();
    expect(configService.get("editor.maxFileSize")).toBe(50 * 1024 * 1024);
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
    expect(configService.get("lineHeight")).toBe(20);
    expect(configService.get("fontSize")).toBe(14);
    // The auto-update channel defaults to the stable "latest" track.
    expect(configService.get("updateChannel")).toBe("latest");
    const themes = configService.get("syntaxThemes") as Record<string, string>;
    // syntaxThemes default is now empty — existing config is merged
    expect(themes).toEqual({});
  });

  test("getAll() returns the full config object", () => {
    configService.init();
    const all = configService.getAll();
    expect(all).toBeDefined();
    expect(all.version).toBe(1);
    expect(all.appTheme).toBeDefined();
    expect(all.editor).toBeDefined();
    expect(all.syntaxThemes).toBeDefined();
    expect(all.syntaxThemes).toEqual({});
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
    configService.set("lineHeight", 30);
    configService.set("fontSize", 18);

    expect(configService.get("lineHeight")).toBe(30);
    expect(configService.get("fontSize")).toBe(18);
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
