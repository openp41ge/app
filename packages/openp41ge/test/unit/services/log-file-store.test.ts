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
    system: "openp41ge",
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

describe("LogFileStore.readLogsBackward", () => {
  function seed(n: number): void {
    for (let i = 0; i < n; i++) {
      store.append(makeEntry({ system: "openp41ge", source: "mod", message: `m${i}` }));
    }
  }

  test("returns the newest entries oldest→newest from the live file", () => {
    seed(10);
    const page = store.readLogsBackward(null, 4);
    expect(page.entries.map((e) => e.message)).toEqual(["m6", "m7", "m8", "m9"]);
    expect(page.hasOlder).toBe(true);
    expect(page.cursor).toEqual({ fileIndex: 0, lineCount: 4 });
  });

  test("pages backward through the same file", () => {
    seed(10);
    const p1 = store.readLogsBackward(null, 4);
    const p2 = store.readLogsBackward(p1.cursor, 4);
    expect(p2.entries.map((e) => e.message)).toEqual(["m2", "m3", "m4", "m5"]);
    expect(p2.hasOlder).toBe(true);
    // m0, m1 follow
    const p3 = store.readLogsBackward(p2.cursor, 4);
    expect(p3.entries.map((e) => e.message)).toEqual(["m0", "m1"]);
    expect(p3.hasOlder).toBe(false);
    expect(p3.cursor).toBeNull();
  });

  test("sets hasOlder false and cursor null at the start of the file", () => {
    seed(3);
    const page = store.readLogsBackward(null, 10);
    expect(page.entries.map((e) => e.message)).toEqual(["m0", "m1", "m2"]);
    expect(page.hasOlder).toBe(false);
    expect(page.cursor).toBeNull();
  });

  test("stops at a day boundary and exposes the next day for confirmation", () => {
    const dir = logsDir();
    fs.mkdirSync(dir, { recursive: true });
    const pad = (n: number) => String(n).padStart(2, "0");
    const ago = (days: number) => {
      const d = new Date(Date.now() - days * 86_400_000);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const archive = path.join(dir, `openp41ge-${ago(3)}.log`);
    fs.writeFileSync(
      archive,
      [
        JSON.stringify({
          timestamp: 1,
          level: "INFO",
          system: "openp41ge",
          source: "old",
          message: "old0",
          process: "main",
        }),
        JSON.stringify({
          timestamp: 2,
          level: "INFO",
          system: "openp41ge",
          source: "old",
          message: "old1",
          process: "main",
        }),
      ].join("\n") + "\n",
      "utf-8",
    );
    // Live file (newest) with three entries.
    seed(3); // m0,m1,m2

    const p1 = store.readLogsBackward(null, 1); // m2
    expect(p1.entries.map((e) => e.message)).toEqual(["m2"]);
    const p2 = store.readLogsBackward(p1.cursor, 1); // m1
    expect(p2.entries.map((e) => e.message)).toEqual(["m1"]);
    const p3 = store.readLogsBackward(p2.cursor, 1); // m0
    expect(p3.entries.map((e) => e.message)).toEqual(["m0"]);
    // The live file is now exhausted: it must NOT silently cross into the
    // previous day. Instead it reports the boundary for explicit confirmation.
    expect(p3.hasOlder).toBe(false);
    expect(p3.cursor).toBeNull();
    expect(p3.nextDay).toEqual({
      cursor: { fileIndex: 1, lineCount: 0 },
      label: "Load logs from 3 days ago",
    });

    // Confirming loads the previous day's file from its bottom.
    const p4 = store.readLogsBackward(p3.nextDay!.cursor, 1); // old1
    expect(p4.entries.map((e) => e.message)).toEqual(["old1"]);
    expect(p4.hasOlder).toBe(true); // old0 remains in the same file
    const p5 = store.readLogsBackward(p4.cursor, 1); // old0
    expect(p5.entries.map((e) => e.message)).toEqual(["old0"]);
    expect(p5.hasOlder).toBe(false);
    expect(p5.cursor).toBeNull();
    expect(p5.nextDay).toBeNull(); // no third day
  });

  test("returns an empty page when there are no log files", () => {
    expect(store.readLogsBackward(null, 10)).toEqual({
      entries: [],
      hasOlder: false,
      cursor: null,
      nextDay: null,
    });
  });
});
