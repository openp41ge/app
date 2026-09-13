/**
 * Verifies the built-in agent tools register through their own packages.
 *
 * Each built-in tool (read_file, search_files, run_command) lives in a separate
 * package and self-registers via `register(registry)`. This test exercises the
 * aggregate `registerBuiltinTools` entry point so a regression in the plugin
 * wiring fails loudly.
 */

import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../../../src/main/services/tool-registry";
import { registerBuiltinTools } from "../../../src/main/services/node-tool-executor";

describe("registerBuiltinTools", () => {
  it("registers read_file, search_files, and run_command", () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);
    const names = registry
      .list()
      .map((t) => t.name)
      .sort();
    expect(names).toEqual(["read_file", "run_command", "search_files"]);
  });

  it("each registered tool exposes the full tool contract", () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);
    for (const tool of registry.list()) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters.type).toBe("object");
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("run_command is gated on a working directory being present", async () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);
    const run = registry.get("run_command")!;
    expect(run.isAvailable?.({})).toBe(false);
    expect(run.isAvailable?.({ cwd: "/tmp" })).toBe(true);
  });
});
