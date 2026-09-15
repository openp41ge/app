import { describe, it, expect } from "vitest";
import {
  detectLanguage,
  detectLanguageCandidates,
  highlight,
  normalizeLanguage,
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

  it("returns only matching candidate languages, most-specific first", () => {
    expect(detectLanguageCandidates("const x = 1;")).toEqual(["javascript", "typescript"]);
    expect(detectLanguageCandidates("export interface Foo { a: string }")).toEqual([
      "typescript",
      "javascript",
    ]);
    expect(detectLanguageCandidates("def foo():\n    return 1")).toEqual(["python"]);
    expect(detectLanguageCandidates("just some words")).toEqual(["text"]);
    expect(detectLanguageCandidates("")).toEqual(["text"]);
  });

  it("detects Python even when it shares `import` with JS/TS", () => {
    // `import`/`from … import` used to be caught by the JS detector and mislabeled
    // the snippet as JavaScript/TypeScript.
    expect(detectLanguage("import os\nprint(os.getcwd())")).toBe("python");
    expect(detectLanguage("from pathlib import Path\nprint(Path('.').resolve())")).toBe("python");
    expect(detectLanguage("import sys\nfor arg in sys.argv:\n    print(arg)")).toBe("python");
    expect(detectLanguage("for i in range(10):\n    print(i)")).toBe("python");
    expect(detectLanguage("class Foo:\n    def __init__(self):\n        self.x = 1\n")).toBe(
      "python",
    );
    expect(detectLanguage("print('hello world')")).toBe("python");
  });

  it("still detects genuine JavaScript and ES module imports as JS", () => {
    expect(detectLanguage("const x = 1;\nconsole.log(x)")).toBe("javascript");
    // ESM import has `from`, so it must not fall into the Python detector.
    expect(detectLanguageCandidates("import { foo } from './foo'\nfoo()")).toEqual([
      "javascript",
      "typescript",
    ]);
    expect(detectLanguageCandidates("import x from './x'\nx()")).toEqual([
      "javascript",
      "typescript",
    ]);
    expect(detectLanguage("#!/bin/bash\necho hi")).toBe("bash");
  });

  it("returns a human label for language ids", () => {
    expect(langLabel("typescript")).toBe("TypeScript");
    expect(langLabel("python")).toBe("Python");
  });
});
