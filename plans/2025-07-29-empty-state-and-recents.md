2025-07-29

# Empty State Redesign + Recent Projects + Draft Naming Fix ✅

## Completed

### 1. Draft Naming Fix ✅
Stripped `draft-` prefix from draft project display names in the project picker since the `.draft` extension and "Draft" badge already indicate it's a draft.

**Files**: `packages/openp41ge/src/renderer/components/openp41ge-project-picker.ts`

### 2. Recent Projects Model + IPC ✅
- **Model**: `RecentProjectsModel` at `packages/openp41ge/src/main/services/recent-projects-model.ts` — reads/writes `~/.openp41ge/.config/recent-projects.json`, max 20 entries
- **IPC handlers**: `recent-projects-handlers.ts` with `recentProjects:list` and `recentProjects:add`
- **Preload bridge**: `window.openp41ge.recentProjects.{list, add}`
- **Tracked on**: project switch and draft creation in `openp41ge-application.ts`

### 3. Empty State Component ✅
- **`<openp41ge-empty-state>`** component in uikit with "Open Project" button, recent projects list, and "Clone Repository" button
- Dispatches `empty-state:open-project`, `empty-state:clone-repo`, `empty-state:open-recent` events
- `tab-content.ts` now renders `<openp41ge-empty-state>` instead of plain "No open tabs" text
- `tab-grid.ts` passes `recents` prop through to `tab-content`
- `openp41ge-windowview.ts` fetches recents via IPC and passes them down
- Events wired to show project picker and clone dialog in `register-event-listeners.step.ts`

### UX Consistency
- Dark theme styling using CSS variables (`--bg-primary`, `--text-primary`, etc.)
- Buttons follow existing patterns (accent color on hover, focus-visible outlines)
- Recent projects show relative dates (Today / Yesterday / N days ago)
- Clicking a recent project switches to it directly
