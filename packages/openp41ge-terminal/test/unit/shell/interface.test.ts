/**
 * Tests for the ShellConnector interface definition.
 * This primarily ensures the interface file is counted in coverage.
 */
import { describe, it, expect } from "vitest";

describe("ShellConnector interface", () => {
  it("can be imported as a type", async () => {
    // Importing the module validates it's syntactically valid
    const mod = await import("@openp41ge-terminal/shell/shell-connector");
    // The module exports only the type — no runtime values
    expect(Object.keys(mod)).toEqual([]);
  });
});
