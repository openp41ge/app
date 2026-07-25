import { describe, it, expect } from "vitest";
import { ExtensionGrammarRegistry } from "@openp41ge-file-editor/services/extension-grammar-registry";
import type { IGrammar } from "@openp41ge-file-editor/interfaces/grammar-registry";

function makeGrammar(name: string): IGrammar {
  return { name, tokenizeLine: (line: string) => line };
}

describe("ExtensionGrammarRegistry", () => {
  it("starts empty", () => {
    const r = new ExtensionGrammarRegistry();
    expect(r.size).toBe(0);
    expect(r.get("js")).toBe(null);
  });

  it("registers a grammar for a single extension", () => {
    const r = new ExtensionGrammarRegistry();
    r.register(["js"], makeGrammar("JS"));
    expect(r.size).toBe(1);
    expect(r.get("js")?.name).toBe("JS");
  });

  it("registers a grammar for multiple extensions", () => {
    const r = new ExtensionGrammarRegistry();
    const g = makeGrammar("JS");
    r.register(["js", "mjs", "cjs"], g);
    expect(r.size).toBe(3);
    expect(r.get("js")?.name).toBe("JS");
    expect(r.get("mjs")?.name).toBe("JS");
    expect(r.get("cjs")?.name).toBe("JS");
  });

  it("strips leading dot via register (as loader does)", () => {
    // The registry itself preserves the key as-is.
    // Dot-stripping happens in loader.ts → ModuleContext.registerGrammar.
    const r = new ExtensionGrammarRegistry();
    const g = makeGrammar("JSON");
    // Simulate what loader does
    r.register(
      [".json"].map((e) => e.replace(/^\./, "")),
      g,
    );
    expect(r.get("json")).toBe(g);
  });

  it("overwrites existing grammar for same extension", () => {
    const r = new ExtensionGrammarRegistry();
    r.register(["ts"], makeGrammar("Old"));
    r.register(["ts"], makeGrammar("New"));
    expect(r.get("ts")?.name).toBe("New");
  });

  it("returns null for unregistered extension", () => {
    const r = new ExtensionGrammarRegistry();
    expect(r.get("nonexistent")).toBe(null);
  });

  it("handles empty extensions array", () => {
    const r = new ExtensionGrammarRegistry();
    r.register([], makeGrammar("Empty"));
    expect(r.size).toBe(0);
  });
});
