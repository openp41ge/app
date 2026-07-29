/**
 * demo-app.ts — Standalone demo for the syntax highlighting engine.
 *
 * Loads the TextMate WASM engine, creates a TokenRegistry with all built-in
 * grammars, and highlights code samples with theme-aware CSS.
 */

import { initTextMate, TokenRegistry, highlightCode } from "openp41ge-syntax-highlighting/index";

import { getThemeById, generateThemeCSS } from "openp41ge-themes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConsoleLogEntry {
  timestamp: string;
  message: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let registry: TokenRegistry | null = null;
let currentThemeId: string = "openp41ge-dark";
let currentLang: string = "typescript";
const logs: ConsoleLogEntry[] = [];
let logLimit = 200;

// DOM refs
let codeContentEl: HTMLElement | null = null;
let consoleBodyEl: HTMLElement | null = null;
let langLabelEl: HTMLElement | null = null;
let highlightInfoEl: HTMLElement | null = null;
let themeStyleEl: HTMLStyleElement | null = null;

// ---------------------------------------------------------------------------
// Code samples
// ---------------------------------------------------------------------------

const CODE_SAMPLES: Record<string, string> = {
  typescript: `import { Component } from "@angular/core";

interface User {
  id: number;
  name: string;
  email: string;
}

@Component({
  selector: "app-user-list",
  templateUrl: "./user-list.component.html",
})
export class UserListComponent {
  users: User[] = [];
  private apiUrl = "https://api.example.com/users";

  async loadUsers(): Promise<void> {
    try {
      const response = await fetch(this.apiUrl);
      const data: User[] = await response.json();
      this.users = data;
      console.log(\`Loaded \${data.length} users\`);
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  }

  /** Capitalize the first letter of a string */
  capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}`,

  javascript: `const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get("/api/users", async (req, res) => {
  try {
    const users = await db.query("SELECT * FROM users");
    res.json({ success: true, data: users.rows });
  } catch (err) {
    console.error("Database error:", err.message);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`,

  rust: `use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    host: String,
    port: u16,
    debug: bool,
    features: Vec<String>,
}

impl Config {
    fn from_file(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let contents = std::fs::read_to_string(path)?;
        let config: Config = toml::from_str(&contents)?;
        Ok(config)
    }

    fn is_debug(&self) -> bool {
        self.debug
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::from_file("config.toml")?;
    println!("Starting server on {}:{}", config.host, config.port);

    // Initialize the runtime
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        run_server(&config).await;
    });

    Ok(())
}`,

  python: `#!/usr/bin/env python3
"""Data processing pipeline with async support."""

import asyncio
import json
from dataclasses import dataclass, asdict
from typing import Optional

import aiohttp
import pandas as pd


@dataclass
class Record:
    id: int
    name: str
    value: float
    tags: list[str]


class DataProcessor:
    """Processes data from multiple sources."""

    def __init__(self, api_url: str):
        self.api_url = api_url
        self.cache: dict[int, Record] = {}

    async def fetch_record(self, record_id: int) -> Optional[Record]:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.api_url}/{record_id}") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    record = Record(**data)
                    self.cache[record_id] = record
                    return record
                return None

    def analyze(self) -> pd.DataFrame:
        records = list(self.cache.values())
        df = pd.DataFrame([asdict(r) for r in records])
        return df.describe()`,

  go: `package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// Server represents the HTTP server with graceful shutdown.
type Server struct {
	httpServer *http.Server
	config     ServerConfig
}

type ServerConfig struct {
	Host    string
	Port    int
	Timeout time.Duration
}

// NewServer creates a new Server with the given config.
func NewServer(cfg ServerConfig) *Server {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", healthHandler)

	return &Server{
		httpServer: &http.Server{
			Addr:    fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
			Handler: mux,
		},
		config: cfg,
	}
}

func (s *Server) Start(ctx context.Context) error {
	// Graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-stop
		shutdownCtx, cancel := context.WithTimeout(ctx, s.config.Timeout)
		defer cancel()
		s.httpServer.Shutdown(shutdownCtx)
	}()

	log.Printf("Server starting on %s", s.httpServer.Addr)
	return s.httpServer.ListenAndServe()
}`,

  html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My App</title>
  <link rel="stylesheet" href="/styles/main.css" />
</head>
<body>
  <header class="app-header">
    <nav class="navbar">
      <a href="/" class="logo">
        <img src="/assets/logo.svg" alt="Logo" />
        <span>My App</span>
      </a>
      <ul class="nav-links">
        <li><a href="/features">Features</a></li>
        <li><a href="/pricing">Pricing</a></li>
        <li><a href="/about">About</a></li>
      </ul>
    </nav>
  </header>

  <main class="container">
    <section class="hero">
      <h1>Welcome to My App</h1>
      <p class="subtitle">A modern web application built with care.</p>
      <button class="cta-button" onclick="start()">
        Get Started
      </button>
    </section>
  </main>

  <script type="module" src="/js/app.js"></script>
</body>
</html>`,

  css: `/* Main application styles */

:root {
  --primary: #4a9eff;
  --primary-dark: #2b5a9c;
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --text-primary: #d4d4d4;
  --text-secondary: #888;
  --border-color: #2a2a2a;
  --success: #4caf50;
  --warning: #ffa726;
  --error: #f44336;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

@media (max-width: 768px) {
  .container {
    padding: 0 16px;
  }
}

.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}`,

  json: `{
  "name": "openp41ge-syntax-highlighting",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build && tsc --emitDeclarationOnly --outDir dist",
    "dev:demo": "vite --config vite.demo.config.ts",
    "build:demo": "vite build --config vite.demo.config.ts"
  },
  "dependencies": {
    "vscode-oniguruma": "^2.0.1",
    "vscode-textmate": "^9.3.2"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}`,

  markdown: `# Syntax Highlighting Engine

## Overview

The \`openp41ge-syntax-highlighting\` package provides a **TextMate-based** syntax highlighting engine for the Openp41ge editor suite.

### Features

- **23 languages** supported via TextMate grammars
- **5 built-in themes** (Dark+, Light+, Monokai, GitHub Dark, GitHub Light)
- **Standalone** — no dependency on the full file editor

### Usage Example

\`\`\`typescript
import { initTextMate, TokenRegistry, highlightCode } from "openp41ge-syntax-highlighting";

const { registry } = await initTextMate();
const tokenRegistry = new TokenRegistry(registry);
const tokenizer = await tokenRegistry.getTokenizer("typescript");
const result = highlightCode(\`const x: number = 42;\`, tokenizer);
console.log(result.html); // <span class="mtk-kw">const</span> ...
\`\`\`

## Architecture

The engine uses \`vscode-textmate\` for grammar matching and \`vscode-oniguruma\` for regex execution.`,

  sql: `-- Users and orders schema
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active   BOOLEAN DEFAULT true
);

CREATE TABLE orders (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    total       DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
    status      VARCHAR(20) DEFAULT 'pending',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status) WHERE status = 'pending';

-- Query: active users with their recent orders
SELECT
    u.id,
    u.name,
    COUNT(o.id) AS order_count,
    COALESCE(SUM(o.total), 0) AS total_spent
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
    AND o.created_at >= NOW() - INTERVAL '30 days'
WHERE u.is_active = true
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC
LIMIT 10;`,
};

// ---------------------------------------------------------------------------
// Console Logging
// ---------------------------------------------------------------------------

function timeStr(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function addLog(message: string): void {
  logs.push({ timestamp: timeStr(), message });
  if (logs.length > logLimit) logs.shift();
  renderLogs();
}

function renderLogs(): void {
  if (!consoleBodyEl) return;
  consoleBodyEl.innerHTML = logs
    .map(
      (l) =>
        `<div class="log-entry"><span class="timestamp">[${l.timestamp}]</span>${escapeHtml(l.message)}</div>`,
    )
    .join("");
  consoleBodyEl.scrollTop = consoleBodyEl.scrollHeight;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Theme CSS Injection
// ---------------------------------------------------------------------------

function applyTheme(themeId: string): void {
  currentThemeId = themeId;
  const theme = getThemeById(themeId);

  // Remove old theme style
  if (themeStyleEl && themeStyleEl.parentNode) {
    themeStyleEl.parentNode.removeChild(themeStyleEl);
  }

  // Build CSS — generate scope colors and standard token types
  const scopeCSS = generateThemeCSS(theme);
  const c = theme.colors;
  const isLight = theme.type === "light";

  const css = `
    ${scopeCSS}
    .code-content {
      background: ${c.editorBg};
      color: ${c.default};
    }
    .mtk-kw { color: ${c.kw}; }
    .mtk-op { color: ${c.op}; }
    .mtk-type { color: ${c.type}; }
    .mtk-var { color: ${c.var}; }
    .mtk-fun { color: ${c.fun}; }
    .mtk-str { color: ${c.str}; }
    .mtk-cmt { color: ${c.cmt}; font-style: italic; }
    .mtk-num { color: ${c.num}; }
    .mtk-ent { color: ${c.ent}; }
    .mtk-tag { color: ${c.tag}; }
    .mtk-atr { color: ${c.atr}; }
    .mtk-sup { color: ${c.sup}; }
    .mtk-scl { color: ${c.scl}; }
    .mtk-pun { color: ${c.pun}; }
    .mtk-rgx { color: ${c.rgx}; }
    .mtk-mup { color: ${c.mup}; }
    .mtk-mh { color: ${c.mh}; font-weight: bold; }
    .mtk-mb { font-weight: bold; }
    .mtk-mi { font-style: italic; }
    .mtk-ml { color: ${c.ml}; text-decoration: underline; }
    .mtk-te { color: ${c.te}; }
    .mtk-lbl { color: ${c.lbl}; }
    .mtk-inv { color: ${c.inv}; text-decoration: wavy underline; }
  `;

  const style = document.createElement("style");
  style.setAttribute("data-sh-theme", themeId);
  style.textContent = css;
  document.head.appendChild(style);
  themeStyleEl = style;

  // Update HTML data-theme
  document.documentElement.setAttribute("data-theme", isLight ? "light" : "dark");

  // Update active button state — only theme buttons, not html element
  document.querySelectorAll("button[data-theme]").forEach((btn) => {
    btn.classList.toggle("demo-btn--active", (btn as HTMLElement).dataset.theme === themeId);
  });

  addLog(`Theme switched to: ${theme.label}`);
}

// ---------------------------------------------------------------------------
// Highlight
// ---------------------------------------------------------------------------

async function highlight(lang: string): Promise<void> {
  if (!codeContentEl || !registry) return;

  const code = CODE_SAMPLES[lang];
  if (!code) {
    codeContentEl.textContent = `No sample for language: ${lang}`;
    return;
  }

  // Update active lang button
  document.querySelectorAll("button[data-lang]").forEach((btn) => {
    btn.classList.toggle("demo-btn--active", (btn as HTMLElement).dataset.lang === lang);
  });
  if (langLabelEl) langLabelEl.textContent = lang;

  // Get the tokenizer
  const tokenizer = await registry.getTokenizer(lang);
  if (!tokenizer) {
    codeContentEl.textContent = `No grammar available for: ${lang}\n\n${code}`;
    addLog(`No grammar for "${lang}" — showing plain text`);
    return;
  }

  // Highlight
  try {
    const result = highlightCode(code, tokenizer);
    codeContentEl.innerHTML = result.html;
    if (highlightInfoEl) {
      highlightInfoEl.textContent = `${result.lineCount} lines — ${result.durationMs.toFixed(1)}ms`;
    }
    addLog(`Highlighted ${lang} (${result.lineCount} lines, ${result.durationMs.toFixed(1)}ms)`);
  } catch (err) {
    codeContentEl.textContent = `Error highlighting: ${err}\n\n${code}`;
    addLog(`Error highlighting ${lang}: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  codeContentEl = document.getElementById("code-content");
  consoleBodyEl = document.getElementById("console-body");
  langLabelEl = document.getElementById("lang-label");
  highlightInfoEl = document.getElementById("highlight-info");

  if (!codeContentEl) {
    console.error("Code content element (#code-content) not found");
    return;
  }

  addLog("Initializing TextMate engine...");

  try {
    const { registry: tmRegistry } = await initTextMate();
    registry = new TokenRegistry(tmRegistry);

    addLog(`TextMate engine loaded — ${registry.languages.length} languages available`);
    addLog(`Grammars loaded: ${registry.loadedCount}`);

    // Apply default theme
    applyTheme(currentThemeId);

    // Highlight default language
    await highlight(currentLang);
  } catch (err) {
    codeContentEl.innerHTML = `<div style="color:#f44;padding:12px;">
      <strong>Failed to initialize:</strong> ${err}
    </div>`;
    addLog(`ERROR: ${err}`);
    console.error("Demo init error:", err);
    return;
  }

  // Wire theme buttons — use button[data-theme] to avoid matching <html>
  document.querySelectorAll("button[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const themeId = (btn as HTMLElement).dataset.theme!;
      applyTheme(themeId);
      // No need to re-highlight — theme is CSS-only
    });
  });

  // Wire language buttons — only button elements
  document.querySelectorAll("button[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = (btn as HTMLElement).dataset.lang!;
      currentLang = lang;
      highlight(lang);
    });
  });

  // Wire re-highlight button
  const reBtn = document.getElementById("btn-rehighlight");
  if (reBtn) {
    reBtn.addEventListener("click", () => {
      highlight(currentLang);
    });
  }
}

// Boot
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => init());
} else {
  init();
}

// Export for debugging from DevTools
(window as any).__demoState = {
  highlight,
  applyTheme,
  get registry() {
    return registry;
  },
};
