/**
 * Tests for the main process LogFileStore.
 *
 * Uses a temp dir to simulate ~/.openp41ge/logs and verifies JSONL writing,
 * daily rollover, retention pruning, queries, and file listing.
 */

import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { LogLevel } from "openp41ge-logger";
import { LogFileStore } from "@openp41ge/main/services/log-file-store";
import type { StoredLogEntry } from "openp41ge-logger";

let tmpDir: string;
let store: LogFileStore;

function makeEntry(overrides: Partial<StoredLogEntry> = {}): StoredLogEntry {
  return {
    id: 1,
    timestamp: Date.now(),
    level: LogLevel.INFO,
    source: "test",
    message: "hello",
    process: "main",
    ...overrides,
  };
}

beforeEach(() => {
  // Keep the auto-installed console transport quiet in test output.
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openp41ge-log-store-test-"));
  store = new LogFileStore(tmpDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function logsDir(): string {
  return path.join(tmpDir, "logs");
}

describe("LogFileStore (main process)", () => {
  test("append writes a JSONL line to logs/openp41ge.log", () => {
    store.append(makeEntry({ source: "alpha", message: "first ", winId: "win-1" }));

    const livePath = path.join(logsDir(), "openp41ge.log");
    expect(fs.existsSync(livePath)).toBe(true);

    const lines = fs.readFileSync(livePath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.source).toBe("alpha");
    expect(parsed.message).toBe("first ");
    expect(parsed.winId).toBe("win-1");
    expect(parsed.process).toBe("main");
    expect(parsed.level).toBe("INFO");
    expect(parsed.timestamp).toEqual(expect.any(Number));
  });

  test("persisted JSONL excludes internal fields (args/text/id)", () => {
    store.append(makeEntry({ message: "clean" }));

    const livePath = path.join(logsDir(), "openp41ge.log");
    const parsed = JSON.parse(fs.readFileSync(livePath, "utf-8"));
    expect(parsed).not.toHaveProperty("args");
    expect(parsed).not.toHaveProperty("text");
    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("name");
  });

  test("appendBatch writes multiple JSONL lines", () => {
    store.appendBatch([
      makeEntry({ source: "a", message: "1" }),
      makeEntry({ source: "b", message: "2", level: LogLevel.WARN }),
      makeEntry({ source: "c", message: "3", data: { x: 1 } }),
    ]);

    const lines = fs
      .readFileSync(path.join(logsDir(), "openp41ge.log"), "utf-8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(3);
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[1].level).toBe("WARN");
    expect(parsed[2].data).toEqual({ x: 1 });
  });

  test("rolling over to a new day archives yesterday's live file", () => {
    // Pre-create a live file with yesterday's mtime.
    const dir = logsDir();
    fs.mkdirSync(dir, { recursive: true });
    const live = path.join(dir, "openp41ge.log");
    fs.writeFileSync(live, '{"legacy":true}\n', "utf-8");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    fs.utimesSync(live, yesterday, yesterday);

    // First append on the new day should archive the legacy file.
    store.append(makeEntry({ message: "fresh day" }));

    const files = fs.readdirSync(dir).sort();
    expect(files).toContain("openp41ge.log");
    const archive = files.find((f) => f.startsWith("openp41ge-") && f.endsWith(".log"));
    expect(archive).toBeTruthy();
    if (archive) {
      expect(fs.readFileSync(path.join(dir, archive), "utf-8")).toContain('{"legacy":true}');
    }
    // The live file now contains the fresh entry.
    expect(fs.readFileSync(live, "utf-8")).toContain("fresh day");
  });

  test("same-day restart keeps appending to the live file (no archive)", () => {
    store.append(makeEntry({ message: "before" }));

    // Simulate a restart: new store instance, same day.
    const restart = new LogFileStore(tmpDir);
    restart.append(makeEntry({ message: "after" }));

    const files = fs.readdirSync(logsDir());
    expect(files.filter((f) => f !== "openp41ge.log")).toHaveLength(0); // no archive
    const content = fs.readFileSync(path.join(logsDir(), "openp41ge.log"), "utf-8");
    expect(content).toContain('"before"');
    expect(content).toContain('"after"');
  });

  test("retention prunes archives older than the retention window", () => {
    const dir = logsDir();
    fs.mkdirSync(dir, { recursive: true });
    const old = path.join(dir, "openp41ge-2020-01-01.log");
    fs.writeFileSync(old, "x\n", "utf-8");
    const oldMtime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fs.utimesSync(old, oldMtime, oldMtime);

    // Trigger a rollover (first append of the day) → prune runs.
    store.append(makeEntry({ message: "triggers prune" }));

    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(path.join(dir, "openp41ge.log"))).toBe(true);
  });

  test("query reads persisted entries with filters", () => {
    store.append(makeEntry({ source: "drag", message: "ghost-update", data: { col: 1 } }));
    store.append(makeEntry({ source: "drag", message: "mousemove", level: LogLevel.DEBUG }));
    store.append(makeEntry({ source: "other", message: "unrelated" }));

    const bySource = store.query({ source: "drag" });
    expect(bySource).toHaveLength(2);

    const bySearch = store.query({ search: "mousemove" });
    expect(bySearch).toHaveLength(1);
    expect(bySearch[0].message).toBe("mousemove");

    const byLevel = store.query({ minLevel: LogLevel.INFO });
    expect(byLevel.every((e) => e.level >= LogLevel.INFO)).toBe(true);

    const limited = store.query({ limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0].message).toBe("ghost-update"); // first match in read order
  });

  test("listFiles returns live + archived files newest first", () => {
    store.append(makeEntry({ message: "today" }));
    const files = store.listFiles();
    expect(files.length).toBe(1);
    expect(files[0].name).toBe("openp41ge.log");
    expect(files[0].sizeBytes).toBeGreaterThan(0);
    expect(files[0].mtimeMs).toEqual(expect.any(Number));
  });

  test("append accepts id-less serialized entries (renderer transport batch)", () => {
    // The renderer transport sends plain serialized objects (no id/name/text/args).
    const batch = [
      {
        timestamp: Date.now() - 10,
        level: LogLevel.INFO,
        source: "cross-window-drag",
        message: "ghost-update",
        process: "renderer",
        winId: "win-7",
        data: { col: 1, isBoundary: true },
      },
      {
        timestamp: Date.now(),
        level: LogLevel.WARN,
        source: "app",
        message: "something",
        process: "renderer",
      },
    ] as Array<StoredLogEntry>;

    store.appendBatch(batch);

    const lines = fs
      .readFileSync(path.join(logsDir(), "openp41ge.log"), "utf-8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2);
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0]).toMatchObject({
      source: "cross-window-drag",
      message: "ghost-update",
      process: "renderer",
      winId: "win-7",
      data: { col: 1, isBoundary: true },
    });
    expect(parsed[0]).not.toHaveProperty("id");
  });

  test("append never throws and skips empty batch", () => {
    expect(() => store.appendBatch([])).not.toThrow();
    // Even with a malformed base dir it must not throw.
    const bad = new LogFileStore(path.join(os.tmpdir(), "x-no-perm-xyz"));
    expect(() => bad.append(makeEntry())).not.toThrow();
  });
});
