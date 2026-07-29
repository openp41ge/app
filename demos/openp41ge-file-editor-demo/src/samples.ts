/**
 * Sample file contents for the file-editor demo.
 * Each entry has a file extension, language ID, display name, and content.
 */

export interface SampleEntry {
  id: string;
  fileName: string;
  languageId: string;
  content: string;
}

const samples: SampleEntry[] = [
  {
    id: "long",
    fileName: "long-line.txt",
    languageId: "plaintext",
    content: `This file demonstrates horizontal scrolling. The following line is intentionally very long so that it extends beyond the viewport width and triggers a horizontal scrollbar. Use it to test that the scrollbar appears and that you can scroll horizontally to see the full content.

ThisLineIsLongEnoughToDefinitelyOverflowTheViewportWidthSoAHorizontalScrollbarShouldAppear.ThisLineIsLongEnoughToDefinitelyOverflowTheViewportWidthSoAHorizontalScrollbarShouldAppear.ThisLineIsLongEnoughToDefinitelyOverflowTheViewportWidthSoAHorizontalScrollbarShouldAppear.ThisLineIsLongEnoughToDefinitelyOverflowTheViewportWidthSoAHorizontalScrollbarShouldAppear.ThisLineIsLongEnoughToDefinitelyOverflowTheViewportWidthSoAHorizontalScrollbarShouldAppear.

Short line after the long one.
`,
  },
  {
    id: "typescript",
    fileName: "sample.ts",
    languageId: "typescript",
    content: `/**
 * In-memory key-value store with TTL support.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache<T = unknown> {
  private _store = new Map<string, CacheEntry<T>>();
  private _defaultTtlMs: number;

  constructor(defaultTtlMs = 60_000) {
    this._defaultTtlMs = defaultTtlMs;
  }

  set(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this._defaultTtlMs;
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  get(key: string): T | undefined {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  delete(key: string): boolean {
    return this._store.delete(key);
  }

  clear(): void {
    this._store.clear();
  }

  get size(): number {
    this._evictExpired();
    return this._store.size;
  }

  private _evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (now > entry.expiresAt) {
        this._store.delete(key);
      }
    }
  }
}

// Usage
async function main(): Promise<void> {
  const cache = new TtlCache<string>(5_000);

  cache.set("greeting", "Hello, world!");
  console.log(cache.get("greeting")); // "Hello, world!"

  await new Promise(r => setTimeout(r, 6_000));
  console.log(cache.get("greeting")); // undefined (expired)
}

main().catch(console.error);
`,
  },
  {
    id: "javascript",
    fileName: "sample.js",
    languageId: "javascript",
    content: `/**
 * Simple event emitter with type-safe listeners.
 */

class EventEmitter {
  #listeners = new Map();

  on(event, callback) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, []);
    }
    this.#listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const list = this.#listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx !== -1) list.splice(idx, 1);
  }

  emit(event, ...args) {
    const list = this.#listeners.get(event);
    if (!list) return;
    for (const cb of list) {
      cb(...args);
    }
  }

  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback(...args);
    };
    return this.on(event, wrapper);
  }
}

// ---- Usage ----
const emitter = new EventEmitter();

const unsub = emitter.on("data", (msg) => {
  console.log("Received:", msg);
});

emitter.emit("data", "Hello!");
// → Received: Hello!

unsub();
emitter.emit("data", "This will not be logged");
`,
  },
  {
    id: "json",
    fileName: "sample.json",
    languageId: "json",
    content: `{
  "name": "openp41ge-file-editor",
  "version": "0.0.1",
  "private": true,
  "description": "Self-contained code editor web component",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "vite build && tsc --emitDeclarationOnly --outDir dist",
    "dev": "vite build --watch",
    "test": "echo \\"Run tests from project root: pnpm test\\""
  },
  "dependencies": {
    "lit": "^3.3.3",
    "vscode-oniguruma": "^2.0.1",
    "vscode-textmate": "^9.3.2"
  },
  "devDependencies": {
    "electron": "^43.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  },
  "keywords": [
    "editor",
    "code",
    "web-component",
    "syntax-highlighting",
    "textmate"
  ]
}
`,
  },
  {
    id: "markdown",
    fileName: "sample.md",
    languageId: "markdown",
    content: `# Openp41ge File Editor

A self-contained code editor **web component** built with Lit.

## Features

- **Syntax highlighting** via TextMate grammars
- **Piece-tree model** for efficient text editing
- **Undo/redo** with edit stack
- **Bracket matching** and pair colorization
- **Word wrap** support
- **Multiple themes** (dark and light)

### Supported Languages

| Language   | Status |
| ---------- | ------ |
| TypeScript | ✅     |
| JavaScript | ✅     |
| Python     | ✅     |
| Rust       | ✅     |
| Go         | ✅     |
| HTML/CSS   | ✅     |
| JSON/YAML  | ✅     |
| Markdown   | ✅     |

## Usage

\`\`\`typescript
import { FileEditorElement } from "openp41ge-file-editor";

const editor = document.createElement("file-editor");
editor.filePath = "/path/to/file.ts";
document.body.appendChild(editor);
\`\`\`

## Architecture

The editor uses a layered architecture:

1. **Content model** — Piece tree for O(log n) text operations
2. **View model** — Coordinates between model and rendering
3. **View layer** — Virtualized line rendering with DOM recycling
4. **Input handling** — Keyboard, mouse, clipboard, composition
5. **Tokenization** — TextMate grammar-based syntax highlighting

> "A good editor is like a sharp knife — you don't notice it until it's dull."
`,
  },
  {
    id: "css",
    fileName: "sample.css",
    languageId: "css",
    content: `/* ─── Design tokens ──────────────────────────────────────────────── */

:root {
  --color-primary: #4a9eff;
  --color-success: #4caf50;
  --color-warning: #ffa726;
  --color-danger: #f44;
  --color-bg: #1e1e1e;
  --color-bg-secondary: #252526;
  --color-text: #cccccc;
  --color-text-muted: #888888;
  --border-radius-sm: 3px;
  --border-radius-md: 6px;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --font-mono: "Cascadia Code", "Fira Code", "JetBrains Mono", monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

/* ─── Button base ─────────────────────────────────────────────────── */

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-bg-secondary);
  border-radius: var(--border-radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.btn:hover {
  background: var(--color-bg);
  border-color: var(--color-primary);
}

.btn:active {
  background: var(--color-primary);
  color: #fff;
}

.btn--primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.btn--danger {
  color: var(--color-danger);
  border-color: transparent;
}

/* ─── Card ────────────────────────────────────────────────────────── */

.card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-bg);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-md);
}

.card__title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
  color: var(--color-text);
}

.card__body {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
}
`,
  },
  {
    id: "html",
    fileName: "sample.html",
    languageId: "html",
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Demo Page</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="site-header">
    <nav class="nav">
      <a href="/" class="logo">
        <img src="/assets/logo.svg" alt="Logo" width="32" height="32" />
        <span>My App</span>
      </a>
      <ul class="nav-links">
        <li><a href="/features">Features</a></li>
        <li><a href="/pricing">Pricing</a></li>
        <li><a href="/docs">Docs</a></li>
        <li><a href="/contact">Contact</a></li>
      </ul>
      <div class="nav-actions">
        <button class="btn btn--secondary" id="login-btn">Log In</button>
        <button class="btn btn--primary" id="signup-btn">Sign Up</button>
      </div>
    </nav>
  </header>

  <main class="content">
    <section class="hero">
      <h1>Build Faster with Openp41ge</h1>
      <p class="hero__subtitle">
        A desktop pane manager that organises your tools into a
        <strong>column-based grid</strong> layout.
      </p>
      <div class="hero__actions">
        <button class="btn btn--primary btn--large">Get Started</button>
        <button class="btn btn--secondary btn--large">View on GitHub</button>
      </div>
    </section>

    <section class="features" id="features">
      <div class="feature-card">
        <div class="feature-card__icon">📂</div>
        <h3>File Editor</h3>
        <p>Full-featured code editor with syntax highlighting.</p>
      </div>
      <div class="feature-card">
        <div class="feature-card__icon">🖥️</div>
        <h3>Terminal</h3>
        <p>Integrated terminal emulator with shell support.</p>
      </div>
      <div class="feature-card">
        <div class="feature-card__icon">🔀</div>
        <h3>Git Integration</h3>
        <p>Branch management, commit history, and diff viewing.</p>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <p>&copy; 2026 Openp41ge. All rights reserved.</p>
  </footer>

  <script type="module" src="/src/main.ts"></script>
</body>
</html>
`,
  },
  {
    id: "python",
    fileName: "sample.py",
    languageId: "python",
    content: `"""Async task queue with worker pool."""

import asyncio
import random
from dataclasses import dataclass
from typing import Callable, Coroutine, Optional


@dataclass
class Task:
    id: str
    priority: int = 0
    coro: Optional[Callable[[], Coroutine]] = None


class TaskQueue:
    """A priority-based async task queue."""

    def __init__(self, max_workers: int = 4):
        self._queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self._workers: list[asyncio.Task] = []
        self._max_workers = max_workers
        self._running = False

    async def enqueue(self, task: Task) -> None:
        """Add a task to the queue."""
        await self._queue.put((task.priority, task))
        print(f"[Queue] Enqueued task {task.id} (priority={task.priority})")

    async def _worker_loop(self, worker_id: int) -> None:
        """Worker coroutine that processes tasks."""
        while self._running:
            try:
                _, task = await asyncio.wait_for(
                    self._queue.get(), timeout=1.0
                )
            except asyncio.TimeoutError:
                continue

            print(f"[Worker {worker_id}] Processing task {task.id}")
            try:
                if task.coro:
                    await task.coro()
                # Simulate processing time
                await asyncio.sleep(random.uniform(0.1, 0.5))
            except Exception as e:
                print(f"[Worker {worker_id}] Task {task.id} failed: {e}")
            finally:
                self._queue.task_done()

    async def start(self) -> None:
        """Start the worker pool."""
        self._running = True
        self._workers = [
            asyncio.create_task(self._worker_loop(i))
            for i in range(self._max_workers)
        ]
        print(f"[Queue] Started {self._max_workers} workers")

    async def stop(self) -> None:
        """Gracefully stop all workers."""
        self._running = False
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
        print("[Queue] All workers stopped")

    async def join(self) -> None:
        """Wait for all queued tasks to complete."""
        await self._queue.join()


# ---- Usage ----
async def main():
    queue = TaskQueue(max_workers=2)
    await queue.start()

    for i in range(5):
        await queue.enqueue(Task(
            id=f"task-{i}",
            priority=random.randint(0, 5),
            coro=lambda: asyncio.sleep(random.uniform(0.1, 0.3)),
        ))

    await queue.join()
    await queue.stop()


if __name__ == "__main__":
    asyncio.run(main())
`,
  },
];

export default samples;
