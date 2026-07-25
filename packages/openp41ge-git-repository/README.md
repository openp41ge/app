# openp41ge-git-repository

Git repository browser as a standalone package. Renders an accordion-style panel showing branches, commits, and changed files for a git repository.

## Usage

This package is consumed by the Openp41ge Electron app through the `AppTypeRegistry`. The `gitBrowserRenderer` singleton produces pure DOM elements from git data — no IPC, no state management.

```ts
import { gitBrowserRenderer } from "openp41ge-git-repository";
import type { GitBrowserData, GitBrowserCallbacks } from "openp41ge-git-repository";

const panel = gitBrowserRenderer.renderGitPanel(data, callbacks);
container.appendChild(panel);
```

## Development — Standalone Demo

Run the standalone demo in your browser to visually develop the git panel:

```bash
cd packages/openp41ge-git-repository
pnpm dev:demo
```

The demo loads with mock git data and interactive callbacks. Switch branches, select commits, test loading and error states.

Run E2E tests against the demo:

```bash
pnpm test:e2e
```

### Demo controls

| Control             | Behaviour                                                           |
| ------------------- | ------------------------------------------------------------------- |
| **Branch click**    | Switches selected branch, loads its commits (simulated 600ms delay) |
| **Commit click**    | Selects the commit, shows file changes (one always selected)        |
| **Show more**       | Appends additional mock commits                                     |
| **Refresh (↻)**     | Resets section data with simulated 1.5s loading                     |
| **Loading buttons** | Toggles loading spinner on each section                             |
| **Show error**      | Renders error message with retry button                             |
| **Clear buttons**   | Clears branches/commits/files to show empty states                  |
| **Reset all**       | Restores initial mock data                                          |

## API

### `gitBrowserRenderer`

| Method                                        | Description                              |
| --------------------------------------------- | ---------------------------------------- |
| `renderGitPanel(data, callbacks)`             | Full panel with three accordion sections |
| `replaceSection(panel, key, data, callbacks)` | Replace a single section by key          |
| `renderBranchRow(branch, isSelected)`         | Single branch row element                |
| `renderCommitRow(commit, isSelected)`         | Single commit row element                |
| `renderFileRow(file)`                         | Single file row element                  |
| `renderLoading(container)`                    | Loading spinner overlay                  |
| `renderError(container, message, onRetry)`    | Error state with retry button            |

### Types

See `src/services/types.ts` for `GitBrowserData`, `GitBrowserCallbacks`, `BranchEntry`, `CommitEntry`, `DiffStatEntry`.
