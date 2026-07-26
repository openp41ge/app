/**
 * Integration tests for config tRPC handlers.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { setConfigService } from "../../electron/trpc/config-handlers";
import { configHandlers } from "../../electron/trpc/config-handlers";
import { TestConfigService } from "./test-services";

describe("config tRPC handlers", () => {
  let testService: TestConfigService;

  beforeEach(() => {
    testService = new TestConfigService();
    setConfigService(testService);
  });

  it("get returns a value for a known key", async () => {
    const value = await configHandlers.get("editor.fontSize");
    expect(value).toBe(14);
  });

  it("getAll returns a record of config values", async () => {
    const config = await configHandlers.getAll();
    expect(config).toHaveProperty("editor.fontSize", 14);
    expect(config).toHaveProperty("editor.lineHeight", 22);
  });

  it("get returns null for unknown key", async () => {
    const value = await configHandlers.get("nonexistent.key");
    expect(value).toBeNull();
  });
});
