/**
 * Verify barrel exports from shell/index.ts are accessible.
 */
import { describe, it, expect } from "vitest";

describe("shell barrel exports", () => {
  it("exports IpcShellConnector from the barrel", async () => {
    const mod = await import("@openp41ge-terminal/shell/index");
    expect(mod.IpcShellConnector).toBeDefined();
    expect(typeof mod.IpcShellConnector).toBe("function");
  });

  it("exports NodePtyConnector from the barrel", async () => {
    const mod = await import("@openp41ge-terminal/shell/index");
    expect(mod.NodePtyConnector).toBeDefined();
    expect(typeof mod.NodePtyConnector).toBe("function");
  });
});
