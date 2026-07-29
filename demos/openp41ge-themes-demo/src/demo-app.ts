/**
 * demo-app.ts — Themes demo.
 *
 * Displays all color values from each theme with swatches, names,
 * and a preview code sample rendered with the theme's colors.
 */

import { getThemeById, BUILTIN_THEMES } from "openp41ge-uikit/theme";
import type { SyntaxTheme, SyntaxScopeColors } from "openp41ge-uikit/theme";

// ---------------------------------------------------------------------------
// Color catalog
// ---------------------------------------------------------------------------

interface ColorEntry {
  key: string;
  label: string;
  value: string;
  group: "syntax" | "editor" | "bracket";
}

function catalogColors(theme: SyntaxTheme): ColorEntry[] {
  const c = theme.colors;
  const entries: ColorEntry[] = [];

  const syntaxKeys: Array<{ key: keyof SyntaxScopeColors; label: string }> = [
    { key: "kw", label: "keyword" },
    { key: "str", label: "string" },
    { key: "cmt", label: "comment" },
    { key: "num", label: "number" },
    { key: "type", label: "type" },
    { key: "var", label: "variable" },
    { key: "fun", label: "function" },
    { key: "op", label: "operator" },
    { key: "ent", label: "entity" },
    { key: "tag", label: "tag" },
    { key: "atr", label: "attribute" },
    { key: "sup", label: "support" },
    { key: "mup", label: "markup" },
    { key: "mh", label: "heading" },
    { key: "mb", label: "bold" },
    { key: "mi", label: "italic" },
    { key: "ml", label: "link" },
    { key: "pun", label: "punctuation" },
    { key: "rgx", label: "regex" },
    { key: "scl", label: "support.class" },
    { key: "te", label: "template expr." },
    { key: "lbl", label: "label" },
    { key: "inv", label: "invalid" },
  ];

  for (const { key, label } of syntaxKeys) {
    entries.push({
      key,
      label,
      value: c[key] as string,
      group: "syntax",
    });
  }

  const editorKeys: Array<{ key: keyof SyntaxScopeColors; label: string }> = [
    { key: "default", label: "default text" },
    { key: "editorBg", label: "editor background" },
    { key: "gutterBg", label: "gutter background" },
    { key: "selectionBg", label: "selection bg" },
    { key: "cursor", label: "cursor" },
    { key: "currentLine", label: "current line" },
  ];

  for (const { key, label } of editorKeys) {
    entries.push({
      key,
      label,
      value: c[key] as string,
      group: "editor",
    });
  }

  // Bracket colors (array)
  for (let i = 0; i < c.bracketColors.length; i++) {
    entries.push({
      key: `bracket${i}`,
      label: `bracket depth ${i}`,
      value: c.bracketColors[i],
      group: "bracket",
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Code sample for preview
// ---------------------------------------------------------------------------

const _CODE_SAMPLE = `import { Component } from "@angular/core";

interface User {
  id: number;
  name: string;
  email: string;
}

@Component({ selector: "app-root" })
export class AppComponent {
  // Greet the user
  title = "Hello, world!";
  count: number = 42;
}`;

function buildPreviewHtml(colors: SyntaxScopeColors): string {
  return `<span style="color:${colors.kw}">import</span> <span style="color:${colors.pun}">{</span> <span style="color:${colors.var}">Component</span> <span style="color:${colors.pun}">}</span> <span style="color:${colors.kw}">from</span> <span style="color:${colors.str}">"@angular/core"</span>;

<span style="color:${colors.kw}">interface</span> <span style="color:${colors.type}">User</span> <span style="color:${colors.pun}">{</span>
  <span style="color:${colors.var}">id</span><span style="color:${colors.pun}>:</span> <span style="color:${colors.type}">number</span>;
  <span style="color:${colors.var}">name</span><span style="color:${colors.pun}>:</span> <span style="color:${colors.str}">string</span>;
  <span style="color:${colors.var}">email</span><span style="color:${colors.pun}>:</span> <span style="color:${colors.str}">string</span>;
<span style="color:${colors.pun}">}</span>

<span style="color:${colors.kw}">export</span> <span style="color:${colors.kw}">class</span> <span style="color:${colors.type}">AppComponent</span> <span style="color:${colors.pun}">{</span>
  <span style="color:${colors.cmt}">// Greet the user</span>
  <span style="color:${colors.var}">title</span> <span style="color:${colors.op}">=</span> <span style="color:${colors.str}">"Hello, world!"</span>;
  <span style="color:${colors.var}">count</span><span style="color:${colors.pun}>:</span> <span style="color:${colors.type}">number</span> <span style="color:${colors.op}">=</span> <span style="color:${colors.num}">42</span>;
<span style="color:${colors.pun}">}</span>`;
}

// ---------------------------------------------------------------------------
// DOM rendering
// ---------------------------------------------------------------------------

let _currentThemeId: string | undefined;
let _chromeStyleEl: HTMLStyleElement | null = null;

function renderTheme(themeId: string): void {
  _currentThemeId = themeId;
  const theme = getThemeById(themeId);
  const colors = theme.colors;
  const entries = catalogColors(theme);

  const previewEl = document.getElementById("theme-preview");
  const colorsEl = document.getElementById("theme-colors");
  if (!previewEl || !colorsEl) return;

  // ── Preview ──
  previewEl.innerHTML = `
    <h2 style="color:${colors.default}">${theme.label}</h2>
    <div class="theme-meta" style="color:${colors.cmt}">
      ${theme.id} &middot; ${theme.type} theme &middot; ${entries.length} colors
    </div>
    <div class="code-sample" style="background:${colors.editorBg};color:${colors.default};border:1px solid ${colors.cursor}22">
      ${buildPreviewHtml(colors)}
    </div>
  `;

  // ── Color grid ──
  const syntaxEntries = entries.filter((e) => e.group === "syntax");
  const editorEntries = entries.filter((e) => e.group === "editor");
  const bracketEntries = entries.filter((e) => e.group === "bracket");

  const gridHtml = `
    <div class="color-grid">
      <h3>Syntax Scope Colors (${syntaxEntries.length})</h3>
      ${syntaxEntries.map(swatchHtml).join("")}

      <h3>Editor Chrome (${editorEntries.length})</h3>
      ${editorEntries.map(swatchHtml).join("")}

      <h3>Bracket Pair Colors (${bracketEntries.length})</h3>
      ${bracketEntries.map(swatchHtml).join("")}
    </div>
  `;

  colorsEl.innerHTML = gridHtml;

  // ── Apply theme to page chrome ──
  const chromeBg = theme.type === "dark" ? "#0d0d0d" : "#f0f0f0";
  const chromeSurface = theme.type === "dark" ? "#1a1a1a" : "#e5e5e5";
  const chromeBorder = theme.type === "dark" ? "#2a2a2a" : "#d0d0d0";
  const chromeText = theme.type === "dark" ? "#ccc" : "#333";
  const chromeTextMuted = theme.type === "dark" ? "#555" : "#999";

  const chromeCSS = `
    html, body { background: ${chromeBg} !important; color: ${chromeText} !important; }
    .demo-sidebar { background: ${chromeSurface} !important; border-left-color: ${chromeBorder} !important; }
    .theme-preview { border-color: ${chromeBorder} !important; }
    .demo-header { background: ${chromeSurface} !important; border-color: ${chromeBorder} !important; color: ${chromeText} !important; }
    .demo-header-sub { color: ${chromeTextMuted} !important; }
    .demo-console { background: ${chromeBg} !important; border-color: ${chromeBorder} !important; }
    .demo-console-header { background: ${chromeSurface} !important; color: ${chromeTextMuted} !important; }
    .demo-console-body { color: ${chromeTextMuted} !important; }
    .color-swatch { background: ${chromeSurface} !important; border-color: ${chromeBorder} !important; }
    .color-swatch .swatch-name { color: ${chromeText} !important; }
    .demo-btn { background: ${chromeSurface} !important; border-color: ${chromeBorder} !important; color: ${chromeText} !important; }
    .demo-sidebar h3 { color: ${chromeTextMuted} !important; }
    .color-grid h3 { color: ${chromeTextMuted} !important; border-color: ${chromeBorder} !important; }
    .theme-section .theme-meta { color: ${chromeTextMuted} !important; }
    hr { border-color: ${chromeBorder} !important; }
  `;

  if (_chromeStyleEl) {
    _chromeStyleEl.textContent = chromeCSS;
  } else {
    const style = document.createElement("style");
    style.setAttribute("data-sh-chrome", themeId);
    style.textContent = chromeCSS;
    document.head.appendChild(style);
    _chromeStyleEl = style;
  }

  // Update active button
  document.querySelectorAll("button[data-theme]").forEach((btn) => {
    btn.classList.toggle("demo-btn--active", (btn as HTMLElement).dataset.theme === themeId);
  });

  addLog(`Switched to ${theme.label} — ${entries.length} colors`);
}

function swatchHtml(entry: ColorEntry): string {
  const isTransparent = entry.value.startsWith("rgba") || entry.value.startsWith("hsla");
  return `
    <div class="color-swatch">
      <div class="swatch-box" style="background:${entry.value}${isTransparent ? "" : ""};${entry.group === "editor" && !isTransparent ? "border-color:" + entry.value : ""}"></div>
      <div class="swatch-info">
        <div class="swatch-name">${entry.label}</div>
        <div class="swatch-value">${entry.key} &middot; ${entry.value}</div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Console
// ---------------------------------------------------------------------------

const logs: string[] = [];
let logLimit = 200;

function addLog(message: string): void {
  const d = new Date();
  const ts = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  logs.push(`[${ts}]${message}`);
  if (logs.length > logLimit) logs.shift();
  renderLogs();
}

function renderLogs(): void {
  const el = document.getElementById("console-body");
  if (!el) return;
  el.innerHTML = logs
    .map(
      (l) =>
        `<div class="log-entry"><span class="timestamp">${l.slice(0, 10)}</span>${escapeHtml(l.slice(10))}</div>`,
    )
    .join("");
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init(): void {
  // Render default theme
  renderTheme("openp41ge-dark");
  addLog("Demo initialized");

  // Wire theme buttons
  document.querySelectorAll("button[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const themeId = (btn as HTMLElement).dataset.theme!;
      renderTheme(themeId);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

(window as any).__demoState = { renderTheme, getThemeById, BUILTIN_THEMES };
