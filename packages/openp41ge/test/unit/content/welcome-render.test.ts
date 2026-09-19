import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../../src/renderer/content/render-markdown";
import { welcomeHtml } from "../../../src/renderer/content/welcome";

describe("welcome", () => {
  it("renders h1/h2, bullets, numbered, bold, code", () => {
    const md = "# Hi\n\nA **bold** and `code` line.\n\n- one\n- two\n\n1. first\n2. second\n\n## Sub\n";
    const html = renderMarkdown(md);
    expect(html).toContain("<h1>Hi</h1>");
    expect(html).toContain("<h2>Sub</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
  });
  it("welcomeHtml parses", () => {
    expect(welcomeHtml).toContain("<h1>Welcome to openp41ge</h1>");
  });
  it("merges wrapped source lines into one paragraph", () => {
    const html = renderMarkdown("A line that\ncontinues here\nand ends here.");
    expect(html).toBe("<p>A line that continues here and ends here.</p>");
  });
  it("keeps blank-line-separated paragraphs apart", () => {
    const html = renderMarkdown("First paragraph.\n\nSecond paragraph.");
    expect(html).toBe("<p>First paragraph.</p>\n<p>Second paragraph.</p>");
  });
  it("renders a button directive with its tab target", () => {
    const html = renderMarkdown(":::button tab=workspaces\nOpen Workspaces\n:::");
    expect(html).toContain('<button class="wm-md-button" data-tab="workspaces">Open Workspaces</button>');
  });
  it("renders blockquote info notes", () => {
    const html = renderMarkdown("> You can reach this any time.\n> From the **Openp41ge** menu.");
    expect(html).toContain('<blockquote class="wm-md-quote">You can reach this any time. From the <strong>Openp41ge</strong> menu.</blockquote>');
  });
  it("renders a workspace-window container with a demo and its explanation beside it", () => {
    const md =
      ":::workspace-window\n:::sidebar-demo\n:::\n\n**The sidebar** helps.\n:::";
    const html = renderMarkdown(md);
    expect(html).toContain('<div class="wm-window-stage">');
    expect(html).toContain("<openp41ge-sidebar-demo></openp41ge-sidebar-demo>");
    expect(html).toContain("<strong>The sidebar</strong> helps.");
    expect(html).not.toContain("wm-window-card");
  });
  it("renders the grid demo with its explanation beside it", () => {
    const md =
      ":::workspace-window\n:::grid-demo\n:::\n\n**The grid** holds work.\n:::";
    const html = renderMarkdown(md);
    expect(html).toContain("<openp41ge-grid-demo></openp41ge-grid-demo>");
    expect(html).toContain("<strong>The grid</strong> holds work.");
    expect(html).not.toContain("wm-window-card");
  });
  it("renders the sidebar-move demo with its explanation beside it", () => {
    const md =
      ":::workspace-window\n:::sidebar-move-demo\n:::\n\n**Moving the sidebar** helps.\n:::";
    const html = renderMarkdown(md);
    expect(html).toContain("<openp41ge-sidebar-move-demo></openp41ge-sidebar-move-demo>");
    expect(html).toContain("<strong>Moving the sidebar</strong> helps.");
  });
  it("ignores unknown directives but still consumes their body", () => {
    const html = renderMarkdown(":::unknown\nignored text\n:::\n\nAfter.");
    expect(html).toContain("After.");
    expect(html).not.toContain("ignored text");
  });
});
