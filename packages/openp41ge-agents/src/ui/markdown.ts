/**
 * Lightweight markdown → HTML renderer for chat responses.
 *
 * Covers the common constructs a coding agent emits: headings, fenced + inline
 * code, paragraphs, unordered/ordered lists, blockquotes, horizontal rules,
 * bold/italic/strikethrough, links and images.
 *
 * All text is HTML-escaped and only a fixed set of tags is emitted, so the
 * LLM's output cannot inject arbitrary HTML (no raw `<script>` etc.).
 */

/** Escape text for embedding as HTML text content. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape text for embedding inside a double-quoted HTML attribute. */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/\"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline markdown → HTML for a single line/paragraph. Code spans, links and
 *  images are carved out as placeholders first so their contents are not
 *  re-processed, then emphasis is applied to the (escaped) remaining text. */
function renderInline(text: string): string {
  const codeSpans: string[] = [];
  const links: Array<{ label: string; url: string }> = [];
  const images: Array<{ alt: string; url: string }> = [];

  let s = text
    // Carve out inline code so emphasis markers inside it are ignored.
    .replace(/`([^`]+)`/g, (_m, code: string) => {
      codeSpans.push(code);
      return `\u0000${codeSpans.length - 1}\u0000`;
    })
    // Carve out images first so their `[...](...)` isn't treated as a link.
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, alt: string, url: string) => {
      images.push({ alt, url });
      return `\u0002${images.length - 1}\u0002`;
    })
    // Carve out links.
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, label: string, url: string) => {
      links.push({ label, url });
      return `\u0001${links.length - 1}\u0001`;
    });

  // Escape everything that remains so the LLM's output cannot inject HTML.
  s = escapeHtml(s);

  // Bold / italic / strikethrough.
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/(^|[^a-zA-Z0-9_])_([^_]+)_(?![a-zA-Z0-9_])/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  // Restore images, links, then code (so code placeholders inside link labels
  // are resolved last). img/URL goes through escapeAttr once, from the raw url.
  s = s.replace(/\u0002(\d+)\u0002/g, (_m, i) => {
    const { alt, url } = images[Number(i)];
    return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" />`;
  });
  s = s.replace(/\u0001(\d+)\u0001/g, (_m, i) => {
    const { label, url } = links[Number(i)];
    return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  });
  s = s.replace(
    /\u0000(\d+)\u0000/g,
    (_m, i) => `<code>${escapeHtml(codeSpans[Number(i)])}</code>`,
  );
  return s;
}

/** A parsed block: either a raw HTML string or a code block to be wrapped. */
type Block = { kind: "html"; value: string } | { kind: "code"; value: string; language: string };

/** Split markdown into top-level blocks and render them. */
function renderBlocks(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block.
    if (/^\s*```/.test(line)) {
      const language = line.replace(/^\s*```/, "").trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ kind: "code", value: buf.join("\n"), language });
      continue;
    }

    // Blank line → paragraph break.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "html", value: "<hr />" });
      i++;
      continue;
    }

    // Heading.
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push({ kind: "html", value: `<h${level}>${renderInline(heading[2])}</h${level}>` });
      i++;
      continue;
    }

    // Blockquote (consecutive `>` lines).
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        kind: "html",
        value: `<blockquote>${renderInline(buf.join(" "))}</blockquote>`,
      });
      continue;
    }

    // Unordered list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*[-*+]\s+/, ""))}</li>`);
        i++;
      }
      blocks.push({ kind: "html", value: `<ul>${items.join("")}</ul>` });
      continue;
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      blocks.push({ kind: "html", value: `<ol>${items.join("")}</ol>` });
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-special lines.
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\s*```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    if (buf.length) {
      blocks.push({ kind: "html", value: `<p>${renderInline(buf.join(" "))}</p>` });
    }
  }

  return blocks;
}

/** Render markdown text into an HTML string. */
export function renderMarkdown(md: string): string {
  if (!md) return "";
  return renderBlocks(md)
    .map((b) => (b.kind === "code" ? `<pre><code>${escapeHtml(b.value)}</code></pre>` : b.value))
    .join("");
}
