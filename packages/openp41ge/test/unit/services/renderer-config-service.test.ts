/**
 * Tests for the renderer ConfigService.
 *
 * These tests mock window.openp41ge.config to simulate IPC calls.
 */

import { describe, expect, test, beforeEach, afterEach } from "vitest";

// Mock window.openp41ge.config before importing ConfigService
const mockConfig = {
  version: 1,
  appTheme: "dark",
  editor: {
    lineHeight: 20,
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
  },
  syntaxThemes: {
    ".ts": "openp41ge-dark",
    ".tsx": "openp41ge-dark",
    ".js": "openp41ge-dark",
    ".md": "github-dark",
  },
};

let setCallKey: string | null = null;
let setCallValue: unknown = null;

(globalThis as any).window = {
  openp41ge: {
    config: {
      getAll: async () => ({ ...mockConfig }),
      get: async (key?: string) => {
        if (!key) return { ...mockConfig };
        const keys = key.split(".");
        let obj: any = { ...mockConfig };
        for (const k of keys) obj = obj[k];
        return obj;
      },
      set: async (key: string, value: unknown) => {
        setCallKey = key;
        setCallValue = value;
      },
    },
  },
  document: {
    documentElement: { setAttribute: () => {} },
    addEventListener: () => {},
    dispatchEvent: () => {},
    createElement: () => ({}),
  },
} as any;

// Event tracking
let dispatchedEvents: Array<{ type: string; detail: any }> = [];
(globalThis as any).document = {
  documentElement: { setAttribute: () => {} },
  addEventListener: () => {},
  dispatchEvent: (evt: any) => {
    dispatchedEvents.push({ type: evt.type, detail: evt.detail });
  },
  createElement: () => ({}),
};

// Now import
import { ConfigService } from "@openp41ge/renderer/services/config-service";

let configService: ConfigService;

beforeEach(() => {
  configService = new ConfigService();
  setCallKey = null;
  setCallValue = null;
  dispatchedEvents = [];
});

afterEach(() => {
  // No cleanup needed
});

describe("ConfigService (renderer)", () => {
  test("loaded is false before load()", () => {
    expect(configService.loaded).toBe(false);
  });

  test("load() populates the config cache", async () => {
    await configService.load();
    expect(configService.loaded).toBe(true);
  });

  test("getAll() returns null before load()", () => {
    expect(configService.getAll()).toBeNull();
  });

  test("getAll() returns config after load()", async () => {
    await configService.load();
    const all = configService.getAll();
    expect(all).not.toBeNull();
    expect(all!.appTheme).toBe("dark");
    expect(all!.editor.lineHeight).toBe(20);
  });

  test("get() returns the correct value for a top-level key", async () => {
    await configService.load();
    expect(configService.get("appTheme")).toBe("dark");
  });

  test("get() returns the correct value for a nested key", async () => {
    await configService.load();
    expect(configService.get("editor.lineHeight")).toBe(20);
    expect(configService.get("editor.fontSize")).toBe(14);
  });

  test("get() returns undefined for unknown keys", async () => {
    await configService.load();
    expect(configService.get("nonexistent")).toBeUndefined();
  });

  test("getSyntaxTheme() returns correct theme for known extensions", async () => {
    await configService.load();
    expect(configService.getSyntaxTheme(".ts")).toBe("openp41ge-dark");
    expect(configService.getSyntaxTheme(".md")).toBe("github-dark");
  });

  test("getSyntaxTheme() falls back to openp41ge-dark for unknown extensions", async () => {
    await configService.load();
    expect(configService.getSyntaxTheme(".unknown")).toBe("openp41ge-dark");
  });

  test("getAppTheme() returns dark before load()", () => {
    expect(configService.getAppTheme()).toBe("dark");
  });

  test("getAppTheme() returns config value after load()", async () => {
    // Recreate with light theme
    (globalThis as any).window.openp41ge.config.getAll = async () => ({
      ...mockConfig,
      appTheme: "light" as const,
    });
    await configService.load();
    expect(configService.getAppTheme()).toBe("light");
    // Reset
    (globalThis as any).window.openp41ge.config.getAll = async () => ({ ...mockConfig });
  });

  test("set() calls window.openp41ge.config.set and dispatches event", async () => {
    await configService.load();
    const prevLen = dispatchedEvents.length;

    await configService.set("appTheme", "light");

    expect(setCallKey).toBe("appTheme");
    expect(setCallValue).toBe("light");
    // Should have dispatched a openp41ge:config-changed event
    const newEvents = dispatchedEvents.slice(prevLen);
    const configEvent = newEvents.find((e) => e.type === "openp41ge:config-changed");
    expect(configEvent).toBeDefined();
    expect(configEvent!.detail.key).toBe("appTheme");
    expect(configEvent!.detail.value).toBe("light");
  });

  test("onChange() fires when config changes", async () => {
    await configService.load();
    let changed = false;
    const unsub = configService.onChange(() => {
      changed = true;
    });

    await configService.set("appTheme", "light");
    expect(changed).toBe(true);
    unsub();
  });

  test("onKeyChange() fires only for the matching key", async () => {
    await configService.load();
    let lineHeightChanged = false;
    let fontSizeChanged = false;

    configService.onKeyChange("editor.lineHeight", () => {
      lineHeightChanged = true;
    });
    configService.onKeyChange("editor.fontSize", () => {
      fontSizeChanged = true;
    });

    await configService.set("editor.lineHeight", 30);
    expect(lineHeightChanged).toBe(true);
    expect(fontSizeChanged).toBe(false);
  });

  test("applyAppTheme() sets data-app-theme on documentElement", async () => {
    await configService.load();
    let attribute: string | null = null;
    let value: string | null = null;
    const origSetAttribute = document.documentElement.setAttribute;
    document.documentElement.setAttribute = (attr: string, val: string) => {
      attribute = attr;
      value = val;
    };

    configService.applyAppTheme();
    expect(attribute).toBe("data-app-theme");
    expect(value).toBe("dark");

    document.documentElement.setAttribute = origSetAttribute;
  });
});
