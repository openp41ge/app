import { describe, it, expect } from "vitest";
import { escapeHtml } from "@openp41ge-file-editor/services/escape-html";

describe("escapeHtml", () => {
  it("passes through plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  it("escapes & to &amp;", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes < to &lt;", () => {
    expect(escapeHtml("<tag>")).toBe("&lt;tag&gt;");
  });

  it("escapes > to &gt;", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("escapes all special characters together", () => {
    const input = "<script>alert(\"xss\") & 'test'</script>";
    const expected = "&lt;script&gt;alert(&quot;xss&quot;) &amp; &#39;test&#39;&lt;/script&gt;";
    expect(escapeHtml(input)).toBe(expected);
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles string with no special characters", () => {
    expect(escapeHtml("abc123_-.")).toBe("abc123_-.");
  });
});
