import { describe, it, expect } from "vitest";
import { ExtensionFormatterRegistry } from "@openp41ge-file-editor/services/extension-formatter-registry";
import type { IFormatter } from "@openp41ge-file-editor/interfaces/formatter-registry";

function makeFormatter(name: string): IFormatter {
  return { name, format: (c: string) => c };
}

describe("ExtensionFormatterRegistry", () => {
  it("starts empty", () => {
    const r = new ExtensionFormatterRegistry();
    expect(r.size).toBe(0);
    expect(r.get("js")).toBe(null);
  });

  it("registers a formatter for a single extension", () => {
    const r = new ExtensionFormatterRegistry();
    r.register(["js"], makeFormatter("Prettier"));
    expect(r.size).toBe(1);
    expect(r.get("js")?.name).toBe("Prettier");
  });

  it("registers a formatter for multiple extensions", () => {
    const r = new ExtensionFormatterRegistry();
    const f = makeFormatter("Formatter");
    r.register(["ts", "tsx"], f);
    expect(r.size).toBe(2);
    expect(r.get("ts")).toBe(f);
    expect(r.get("tsx")).toBe(f);
  });

  it("strips leading dot via register (as loader does)", () => {
    const r = new ExtensionFormatterRegistry();
    r.register(
      [".css"].map((e) => e.replace(/^\./, "")),
      makeFormatter("CSS"),
    );
    expect(r.get("css")?.name).toBe("CSS");
  });

  it("overwrites existing formatter for same extension", () => {
    const r = new ExtensionFormatterRegistry();
    r.register(["js"], makeFormatter("Old"));
    r.register(["js"], makeFormatter("New"));
    expect(r.get("js")?.name).toBe("New");
  });

  it("returns null for unregistered extension", () => {
    const r = new ExtensionFormatterRegistry();
    expect(r.get("nonexistent")).toBe(null);
  });

  it("handles empty extensions array", () => {
    const r = new ExtensionFormatterRegistry();
    r.register([], makeFormatter("Empty"));
    expect(r.size).toBe(0);
  });
});
