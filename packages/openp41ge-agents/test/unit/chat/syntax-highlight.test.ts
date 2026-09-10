import { describe, it, expect } from "vitest";
import {
  detectLanguage,
  highlight,
  normalizeLanguage,
  cycleLanguage,
  langLabel,
} from "@openp41ge-agents/ui/syntax-highlight";

describe("syntax-highlight", () => {
  it("normalises aliases to canonical language ids", () => {
    expect(normalizeLanguage("js")).toBe("javascript");
    expect(normalizeLanguage("TS")).toBe("typescript");
    expect(normalizeLanguage("py")).toBe("python");
    expect(normalizeLanguage("yml")).toBe("yaml");
    expect(normalizeLanguage("unknown")).toBeNull();
  });

  it("highlights Javascript keywords, strings and numbers", () => {
    const html = highlight("const x = 1;", "javascript");
    expect(html).toContain('<span class="hl-key">const</span>');
    expect(html).toContain('<span class="hl-number">1</span>');
  });

  it("highlights Python keywords", () => {
    const html = highlight("def foo():\n    return 1", "python");
    expect(html).toContain('<span class="hl-key">def</span>');
    expect(html).toContain('<span class="hl-key">return</span>');
  });

  it("escapes HTML in code so it cannot be injected", () => {
    const html = highlight("<script>alert(1)</script>", "javascript");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</script>");
  });

  it("detects common languages from content", () => {
    expect(detectLanguage("const x = 1;\nconsole.log(x)")).toBe("javascript");
    expect(detectLanguage("export interface Foo { a: string }")).toBe("typescript");
    expect(detectLanguage("def foo():\n    return 1")).toBe("python");
    expect(detectLanguage("#!/bin/bash\necho hi")).toBe("bash");
    expect(detectLanguage("select * from users")).toBe("sql");
    expect(detectLanguage('{"a": 1}')).toBe("json");
  });

  it("returns text for ambiguous/puny content", () => {
    expect(detectLanguage("")).toBe("text");
    expect(detectLanguage("just some words")).toBe("text");
  });

  it("cycles through supported languages", () => {
    expect(cycleLanguage("text")).toBe("typescript");
    expect(cycleLanguage("typescript")).toBe("javascript");
    expect(cycleLanguage("markdown")).toBe("text");
  });

  it("returns a human label for language ids", () => {
    expect(langLabel("typescript")).toBe("TS");
    expect(langLabel("python")).toBe("PY");
  });
});
