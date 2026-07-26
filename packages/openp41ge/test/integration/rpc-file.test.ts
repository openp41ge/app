/**
 * Integration tests for file tRPC handlers.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { setFileService } from "../../electron/trpc/file-handlers";
import { fileHandlers } from "../../electron/trpc/file-handlers";
import { TestFileService } from "./test-services";

describe("file tRPC handlers", () => {
  let testService: TestFileService;

  beforeEach(() => {
    testService = new TestFileService();
    setFileService(testService);
  });

  it("readdir returns an array of file entries", async () => {
    const entries = await fileHandlers.readdir("/repos/openp41ge");
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("src");
    expect(entries[0].isDirectory).toBe(true);
    expect(entries[0]).toHaveProperty("path");
    expect(entries[0]).toHaveProperty("size");
    expect(entries[0]).toHaveProperty("modifiedAt");
  });

  it("readRange returns file content and total size", async () => {
    const result = await fileHandlers.readRange("/repos/openp41ge/README.md", 0, 100);
    expect(result.data).toBe("# Openp41ge\n");
    expect(result.totalSize).toBe(12);
  });

  it("writeFile returns success", async () => {
    const result = await fileHandlers.writeFile("/repos/openp41ge/test.txt", "hello world");
    expect(result.success).toBe(true);
  });

  it("stat returns file entry for an existing path", async () => {
    const entry = await fileHandlers.stat("/repos/openp41ge/README.md");
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe("README.md");
    expect(entry!.isDirectory).toBe(false);
  });

  it("stat returns null for non-existent path", async () => {
    const entry = await fileHandlers.stat("/repos/openp41ge/missing.txt");
    expect(entry).toBeNull();
  });
});
