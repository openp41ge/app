# Openp41ge

A desktop pane manager built with Electron. Organise running processes, file editors, terminals, git repositories, and AI chat panels into a column-based grid layout with tabs, drag-and-drop, and multi-window support.

## Tech Stack

- **Desktop shell**: Electron
- **Build system**: Nx v23 (pnpm monorepo)
- **UI**: Vanilla Web Components + Lit
- **Language**: TypeScript
- **Testing**: Vitest (unit/integration), Playwright (E2E)

## Prerequisites

- Node.js >= 22
- pnpm

## Getting Started

```bash
# Install dependencies
pnpm install

# Start the app in dev mode (Vite dev server + Electron)
nx dev

# Start renderer only (hot-reloads in browser, no Electron)
nx run openp41ge:dev:renderer
```

## Useful Commands

| Command | Description |
|---|---|
| `nx build` | Build all 17 packages |
| `nx dev` | Start Electron app in dev mode |
| `nx test` | Run all unit/integration tests |
| `nx e2e` | Run all Playwright E2E tests |
| `nx lint` | ESLint across all packages |
| `nx typecheck` | TypeScript type-checking |
| `nx knip` | Dead code detection |
| `nx quality` | typecheck + lint + knip |
| `nx format` | Prettier formatting |

## Project Structure

```
packages/
├── openp41ge/             # Electron desktop app (the platform)
├── openp41ge-file-editor/ # File editor web component
├── openp41ge-terminal/    # Terminal emulator (xterm.js)
├── openp41ge-git-repository/  # Git repository browser
├── openp41ge-agent-chat/  # AI chat panel
├── openp41ge-tabs/        # Tab/drag-and-drop components
├── openp41ge-logger/      # Structured logging
├── openp41ge-themes/      # Theme system
├── openp41ge-syntax-highlighting/ # Syntax highlighting
└── ...demo/               # Demo apps for each library
```

## Layout Model

Workspaces contain windows, each with a column-based grid of panes. Tabs group panes within grid cells. Layout is managed through pure tree operations driven by a centralised workspace state.
