2026-09-06

# Per-tab sidebar bottom bars + unique settings tabs + Chat→Agents rename

## Status / Progress

**Done.** Full rename `openp41ge-agent-chat` → `openp41ge-agents` and the per-tab settings
architecture are implemented.

Deviations from the approach below:

- New History/Search/Logs settings surfaces use a shared `createSettingsPanel()` helper
  (`services/settings-panel.ts`) + three small controller classes, rather than three separate
  Lit components. Title + description + "not configured yet" note — enough to demonstrate the
  per-tab surface; real controls can replace later.
- Settings button is a shared `createSettingsButton()` helper (`services/settings-button.ts`)
  that dispatches the tab's unique `openEvent` with `{ appType, title }`.
- `services/settings-registry.ts` + `test/unit/services/settings-registry.test.ts` were **deleted**;
  settings are now carried on each `SystemTabRegistration.settings` instead.
- Added `test/integration/system-tab-settings-registration.test.ts` (registers settings grid app
  type), and updated `agents-system-tab.test.ts` to assert the footer settings button.
- `knip` (`nx knip`) reports pre-existing warnings (storybook unlisted deps, editor-engine
  `global.d.ts` unresolved relative imports, `layout/types.ts` duplicate exports, workspace
  config hints) that are **not** introduced by this change. Fixing them is out of scope.
- **Runtime click-through in the running Electron app was NOT performed**; verified via
  typecheck, build, lint, and the integration/unit test suite. Recommend a manual QA pass.

## Goal

Fix the sidebar bottom-bar mistake: bottom bars are **not** global — they are owned by
the **active sidebar tab**. Each system tab renders its own bottom bar (footer) with its
own **settings button**, and each settings button emits its **own unique event** to open
its **own unique settings grid tab**. This is a generic mechanism so future extension-provided
sidebar tabs can supply their own settings.

Simultaneously rename the Chat tab to **Agents** and the underlying library package
`openp41ge-agent-chat` → **`openp41ge-agents`** (full rename: package, dir, internal ids,
custom element, exports, file names, and the demo project).

Settings mapping (per user): **all five** sidebar tabs get their own settings grid tab;
**file editor is part of the explorer** → the Explorer tab's settings surface is the
existing `file-editor-settings` (Editor) tab.

## Context / findings

- `openp41ge-sidebar.ts` renders a single **global** `.sidebar-bottom-bar` after
  `.sidebar-content` with one gear button that opens an inline `openp41ge-contextmenu` of
  `listSettingsTabs()`. This is the "mistake".
- Each system tab controller **already builds its own footer in its content**:
  - `agent-chat-system-tab.ts` → footer with "New Chat" button.
  - `logs-system-tab.ts` → footer with "Debug" checkbox.
  - `openp41ge-worktree-tree.ts` (Explorer) → `sb-bottom-bar` (currently empty).
  - `commit-search-system-tab.ts` (History) → builds its own footer (verify).
  - `search-system-tab.ts` → placeholder, no footer yet.
- Settings are currently a **global** registry (`settings-registry.ts`) opened via a shared
  `openp41ge:open-settings` event handled by `SettingsOpenHandler`. Only
  `file-editor-settings` (Editor) and `agent` (Agent) exist.
- Grid `<openp41ge-bottom-bar>` / `<openp41ge-bottom-bar-btn>` / `<openp41ge-bottom-button>`
  components already exist (used by the file viewer) — reusable for the settings button.

## Approach

### 1. Full rename `agent-chat` → `agents`

**Package (library):**

- `git mv packages/openp41ge-agent-chat packages/openp41ge-agents`.
- `package.json` name → `openp41ge-agents`; `project.json` name → `openp41ge-agents`.
- `src/ui/openp41ge-agent-chat.ts` → `src/ui/openp41ge-agents.ts`; custom element
  `openp41ge-agent-chat` → `openp41ge-agents`; `Openp41geAgentChat` → `Openp41geAgents`;
  `registerOpenp41geAgentChat` → `registerOpenp41geAgents`.
- `src/index.ts` exports updated.
- `test/unit/chat/openp41ge-agent-chat.test.ts` → `openp41ge-agents.test.ts`.

**Demo:**

- `git mv demos/openp41ge-agent-chat-demo demos/openp41ge-agents-demo`.
- `package.json` name → `openp41ge-agents-demo`, dep → `openp41ge-agents`.
- `project.json` name → `openp41ge-agents-demo`.
- `vite.config.ts` alias → `openp41ge-agents`.
- `src/demo-app.ts` import `openp41ge-agent-chat` → `openp41ge-agents`, custom element
  `openp41ge-agent-chat` → `openp41ge-agents`, string refs.

**Platform (`packages/openp41ge/`):**

- `src/renderer/apps/agent-chat/` → `src/renderer/apps/agents/`; `agent-chat-controller.ts`
  → `agents-controller.ts`; `AgentChatController` → `AgentsController`; registration id
  `agent-chat` → `agents`, label `Agent Chat` → `Agents`; import package types from
  `openp41ge-agents`; createElement `openp41ge-agent-chat` → `openp41ge-agents`.
- `src/renderer/apps/system-tabs/agent-chat-system-tab.ts` → `agents-system-tab.ts`;
  `AgentChatSystemTabController` → `AgentsSystemTabController`; id `agent-chat` → `agents`,
  label `Chat` → `Agents`.
- `src/renderer/apps/system-tabs/index.ts`: update import + registration.
- `src/renderer/services/chat-open-handler.ts` → `agents-open-handler.ts`;
  `ChatOpenHandler` → `AgentsOpenHandler`; appType `agent-chat` → `agents`, tab title `Chat`
  → `Agents`; wiring in startup-context + register-event-listeners + tests.
- `src/renderer/models/chat-store-model.ts`, `chat-runtime-model.ts`: package type imports.
- `src/main/services/chat-store-service.ts`, `vllm-chat-provider.ts`, `agent-runtime.ts`,
  `src/main/interfaces/chat-provider.ts`: package type imports.
- `electron/ipc-handlers/chat-handlers.ts`: imports.
- `vite.config.ts`, `vitest.config.ts`, `vitest.unit.config.ts`, `vitest.integration.config.ts`:
  alias `openp41ge-agent-chat` → `openp41ge-agents`, path `../openp41ge-agents/src`.
- `test/unit/setup.ts` comment; `test/unit/services/chat-store-service.test.ts`,
  `vllm-chat-provider.test.ts`, `test/integration/agent-chat-system-tab.test.ts` (→
  `agents-system-tab.test.ts`), `agent-chat-controller.test.ts` (→ `agents-controller.test.ts`).
- `src/renderer/global.d.ts`: package type import.

**Other:**

- `packages/openp41ge-constants/src/index.ts` comment.
- `knip.json`, `README.md`, `AGENTS.md` (project structure + package table + this guide's
  stale reference).
- `packages/openp41ge-logger/test/unit/setup.ts`, `packages/openp41ge-terminal/test/unit/setup.ts`
  comments.
- Root `vitest.config.ts`.
- Regenerate `pnpm-lock.yaml` via `pnpm install`.
- `.nx/workspace-data/*` regenerated by nx.

### 2. Per-tab settings architecture

- `controllers/types.ts`:
  - New `SystemTabSettings`:
    ```ts
    export interface SystemTabSettings {
      /** Grid app type id for this tab's settings surface. */
      appType: string;
      /** Settings grid tab label. */
      label: string;
      icon?: string;
      description?: string;
      /** Unique DOM event emitted by this tab's settings button. */
      openEvent: string;
      createController: (tabId: string) => TabController;
    }
    ```
  - `SystemTabRegistration` gains `settings?: SystemTabSettings`.
- `apps/app-registry.ts`: `registerSystemTabType(reg)` also registers the settings grid app
  type when `reg.settings` is present (reuses `registerAppType`).
- `services/settings-registry.ts`: repurpose — replace global `registerSettingsTab` /
  `listSettingsTabs` / `getSettingsTab` with a per-system-tab model. The `SettingsTabRegistration`
  type is superseded by `SystemTabSettings`. Keep a thin `registerSettingsTab`-style helper if
  needed, but the sidebar no longer lists settings globally. Update/replace
  `test/unit/services/settings-registry.test.ts`.
- `services/settings-open-handler.ts`: keep the open-once logic; generalize so a single handler
  opens any settings appType from any event. Wire one document listener **per settings surface**
  (unique event name) in `register-event-listeners.step.ts` by iterating
  `getAllSystemTabRegistrations()` for tabs with `settings`.
- `bootstrap/steps/register-app-types.step.ts`: remove `registerSettingsTab(...)` calls; set
  `settings` on each `SystemTabRegistration` instead (Explorer→file-editor-settings,
  Agents→agent, History/Search/Logs→new minimal settings).
- `bootstrap/steps/register-event-listeners.step.ts`: register a listener per settings `openEvent`.

### 3. Per-tab bottom bars + settings buttons

- `components/openp41ge-sidebar.ts`: **remove** the global `.sidebar-bottom-bar` and
  `_onSettingsClick`/the inline settings menu. Change `.sidebar-tab-host` to
  `overflow:hidden` (each tab's own root is `height:100%; flex column` with its own scroll
  region + pinned footer).
- Add a reusable **settings button** helper (in `openp41ge-uikit` or a small platform util)
  that renders a gear button and dispatches `<openEvent>` with
  `{ appType, title }`. Use it in each tab's footer:
  - Explorer (`openp41ge-worktree-tree.ts` `sb-bottom-bar`) → `openp41ge:open-explorer-settings`.
  - History (`commit-search-system-tab.ts` footer) → `openp41ge:open-git-settings`.
  - Search (`search-system-tab.ts` — add a footer) → `openp41ge:open-search-settings`.
  - Agents (`agents-system-tab.ts` footer, next to New Chat) → `openp41ge:open-agents-settings`.
  - Logs (`logs-system-tab.ts` footer, next to Debug) → `openp41ge:open-logs-settings`.

### 4. Settings grid surfaces for all five tabs

- **Explorer** → `file-editor-settings` (existing `FileEditorSettingsTabController`, label
  `Editor`). No new controller.
- **Agents** → `agent` settings (`AgentSettingsTabController`, app id `agent`, label `Agents`).
  (Keep app id `agent`; config key `agent` must not be renamed.)
- **History** → new `HistorySettingsTabController` (app id `git-settings`, label `History`),
  renders a `createSettingsPanel("History")` placeholder.
- **Search** → new `SearchSettingsTabController` (app id `search-settings`, label `Search`),
  renders a `createSettingsPanel("Search")` placeholder.
- **Logs** → new `LogsSettingsTabController` (app id `logs-settings`, label `Logs`), renders a
  `createSettingsPanel("Logs")` placeholder.
- New controllers under `src/renderer/apps/settings/` share the `createSettingsPanel()` helper.
  Minimal but real (title + description + note) so the architecture is demonstrably per-tab.

## Files Changed (summary)

- **Rename**: package + demo dirs, project/package names, all `openp41ge-agent-chat` import
  sites, `agent-chat` ids, custom element, exports, and `*agent-chat*`/`chat-*` file names in
  platform + tests + demo.
- **`controllers/types.ts`**, **`apps/app-registry.ts`**, **`services/settings-registry.ts`**,
  **`services/settings-open-handler.ts`**, **`services/chat-open-handler.ts`→`agents-open-handler.ts`**,
  **`components/openp41ge-sidebar.ts`**, **bootstrap steps**.
- **Each system-tab controller** gains a settings button in its footer.
- **New settings surfaces**: `git-settings`, `search-settings`, `logs-settings` (components +
  controllers), wired as each tab's `settings`.

## Testing Strategy

- **Unit**: `settings-registry` (reworked) — registering a system tab registers its settings
  app type; new per-tab settings controllers mount their element / snapshot `{}`.
- **Integration**: `SettingsOpenHandler` — opens the right appType; activating an existing
  settings tab is open-once; each tab dispatches its own `openEvent`.
- **Component**: each system-tab controller's footer contains a settings button dispatching its
  unique event.
- **Existing**: update `settings-tabs.test.ts`, `settings-open-handler.test.ts`,
  `agent-chat-*` tests for the rename; run full quality suite.

## UX Considerations

- Settings button = gear icon, consistent sizing with existing footer buttons; open in the
  last-active grid cell (existing `SettingsOpenHandler` behaviour).
- The Explorer's `sb-bottom-bar` (currently empty) becomes the settings bar.
- Hidden/inactive tabs keep their per-tab footer; only the active host is visible.

## Open Questions

None — scope decisions confirmed by user (full rename; all five tabs get settings; file editor
is part of the explorer).

## Completion Criteria

- [x] Global sidebar bottom bar / inline settings menu removed.
- [x] Each of the 5 system tabs renders its own bottom bar with its own settings button.
- [x] Each settings button emits a unique event that opens that tab's unique settings grid tab.
- [x] `openp41ge-agent-chat` → `openp41ge-agents` everywhere (package, ids, element, exports,
      file names, demo).
- [x] Chat tab labelled "Agents" (system tab + grid app label).
- [x] `nx run-many -t typecheck`, `nx lint`, `nx run-many -t test`, `nx run-many -t build`
      pass.

## Follow-up (2026-09-06)

- [x] Removed the `Debug: []` checkbox from the Logs sidebar footer (`logs-system-tab.ts`),
      including its `_debugCheckbox` field and now-unused `setMinLevel`/`getMinLevel`/`LogLevel`
      imports. The footer now keeps only its settings button.
- [x] Re-homed debug capture into a card on the Logs settings grid tab: new
      `<openp41ge-logs-settings>` Lit component (reads `getMinLevel()` on connect; on toggle
      calls `setMinLevel()` + `window.openp41ge.logs.setDebug()`), mounted by
      `LogsSettingsTabController`. The launch-time `isDebugSeed()` path in `app.ts` is unchanged.
