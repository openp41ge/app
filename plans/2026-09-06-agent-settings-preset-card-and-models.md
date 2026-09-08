# Agent Settings — preset selection card, models card, and default-model card

2026-09-06

## Goal

Rework the provider drawer in the agent settings so that:

1. The provider **preset picker** becomes a single **selection card** (like the default-provider card) instead of a grid of 8 radio options. Each preset option shows only its **name** — the descriptive **subtext is removed**.
2. The single **model input** becomes a **Models card** that lists one or more models, with a **"+ Add model"** row; each model row (or the add row) opens a **second-layer model drawer** for that model.
3. A **default-model selection card** picks which model is the default (the provider's `model`, which the runtime already auto-selects). This is a settings-only change — the chat "pick a model instead of default" feature is out of scope.
4. Hosted providers (OpenAI/Anthropic/Groq/Mistral) support **auto-detection** of their models from the provider's `/models` endpoint.

## Rationale

The drawer currently dumps 8 preset radios and a single model text field. The user wants the drawer to mirror the top-level providers architecture: a selection card for the preset, a card-based list for models, and a default-model selection card. Auto-detection removes hand-typing model ids for hosted services.

## Approach

### Config shape (contract)

`packages/openp41ge/src/renderer/models/agent-provider-presets.ts`:

- Add `export interface ModelConfig { id: string }`.
- Add `models?: ModelConfig[]` to `ProviderConfig` (the list of available models).
- **`model: string` stays** as the provider's _default_ model — the runtime reads it (`agent-runtime.ts`, `vllm-chat-provider.ts`), and the default-model selection card writes to it.
- Add pure helpers: `nextModelId(existing: ModelConfig[], base: string)`, and `modelsFromIds(ids: string[]): ModelConfig[]`.

Mirror the `models?` field into main-process `UserConfig.agent.providers` and `ChatProviderConfig` as optional — the runtime ignores it.

### Component (`openp41ge-agent-settings.ts`)

- Refactor `DrawerState` into a **discriminated union**:
  ```ts
  type DrawerState =
    | ProviderDrawerState // kind: "provider" (editId, presetId, draft, title)
    | ModelDrawerState; // kind: "model" (providerId, modelIndex, draft, title)
  ```
  `_renderDrawer`, `_drawerFooter`, `_providerDetail` dispatch on `d.kind`.
- **Preset selection card**: replace the `ags-preset-grid` + `_presetOption` radios with a selection card. Closed state shows the current preset name; clicking opens a list of the 8 presets; selecting one re-seeds the draft. Rows show **name only** (no description). Reuse the default-provider-card closed/open pattern (borderless trigger, rounded hover, `is-last` border removal).
- **Models card**: a card listing `provider.models`, each row shows the model `id`; a persistent `"+ Add model"` row. Clicking a row (or add) pushes a `kind: "model"` drawer.
- **Default-model selection card**: a card (like the default-provider card) that lists the models and sets `provider.model` (the default). Picking a default that's not in `models` is allowed (free value).
- **Model drawer** (`_modelDetail`): field card for the model `id`. Save/Cancel; Delete when editing an existing model.
- **Auto-detect**: a "Detect models" button in the Models card. It calls `window.openp41ge.chat.listModels({ baseUrl, apiKey, compatible })` and replaces/populates `provider.models`. Gracefully handles failure (shows nothing / error message).

### IPC (new contract)

- `preload.cjs`: expose `listModels(opts)` → `ipcRenderer.invoke("chat:listModels", opts)`.
- `global.d.ts`: add `listModels: (opts) => Promise<string[]>`.
- `chat-handlers.ts`: `ipcMain.handle("chat:listModels", ...)` — fetch `${baseUrl}/models` with `Authorization: Bearer <key>` (openai-compatible) or `x-api-key <key>` (anthropic), parse `{ data: [{ id }] }`, return `string[]`.

## Files Changed

- `packages/openp41ge/src/renderer/models/agent-provider-presets.ts` — `ModelConfig`, `models?`, model helpers.
- `packages/openp41ge/src/renderer/components/openp41ge-agent-settings.ts` — preset selection card, models card, default-model card, model drawer, drawer union.
- `packages/openp41ge/src/renderer/global.d.ts` — `listModels` typing.
- `packages/openp41ge/electron/preload.cjs` — expose `listModels`.
- `packages/openp41ge/electron/ipc-handlers/chat-handlers.ts` — `chat:listModels` handler.
- `packages/openp41ge/src/main/services/config-service.ts` + `interfaces/chat-provider.ts` — optional `models?`.
- Tests: `agent-provider-presets.test.ts`, `openp41ge-agent-settings.test.ts`.

## Testing Strategy

- **Unit (presets)**: `ModelConfig` shape; `modelsFromIds`; `nextModelId` uniqueness.
- **Unit (component)**: preset selection card open/close + select; models card renders rows + add; model drawer add/edit/save/delete; default-model selection card persists `model`; auto-detect calls `listModels` and populates `models` (stub `window.openp41ge.chat.listModels`).
- Regression: full `nx run openp41ge:test`, `nx run-many -t typecheck`, `nx lint`, prettier.

## UX Considerations

- Focus management: model drawer opens and focuses its id input (mirror `_focusBaseUrl`).
- Escape closes the top drawer; click-outside closes the drawer stack (existing `_closeAllDrawers`).
- `is-last` border removal on the last model row (mirror default-provider list).
- Rounded hover corners on model rows / trigger (mirror existing patterns).
- Error/empty states: Models card shows a help line ("Add a model above to set a default.") when empty; auto-detect failure shows an inline note.

## Open Questions

- Model entity is `{ id: string }` (just the id) — the model drawer edits only the id for now. No context-window/temperature/maxTokens overrides unless requested.
- Auto-detection is a **manual** "Detect models" button (not automatic on save), to avoid surprising network calls.

## Completion Criteria

- [x] Preset grid replaced by a selection card; each preset row shows only its name (subtext removed).
- [x] Models card lists models; add/edit opens a second-layer model drawer.
- [x] Default-model selection card persists `provider.model`.
- [x] `chat:listModels` wire-up detects hosted provider models (verified live: handler returns `{ ok, models, error }`, graceful failure on non-OK/fetch error — no throw, no app-pausing error overlay). Success path not verified against a live endpoint (no API key available); failure path verified against `https://api.openai.com/v1` (returns 401 → `{ ok: false, error }`).
- [x] All tests pass; typecheck/lint/format clean; live-verified in the running app.

## Follow-up

- `openp41ge-filesystem:test` reports "No test files found" (pre-existing, unrelated to this work) — the sole `nx run-many -t test` failure.

## Post-implementation refinements (2026-09-11)

- **Removed the named local-server presets** (vLLM / Ollama / LM Studio) from `PROVIDER_PRESETS`. Local servers are now configured via the **Custom** preset; a self-hosted endpoint therefore displays as its host (`localhost`). `presetFor` now maps a local endpoint to Custom.
- **Card actions are now rows** underneath the explanation text: a short description on the left, the action button on the right (`.ags-action-row`). The "Add model" data row is exempt. Extracted a reusable `_actionRow(description, control)`.
- **Test Connection moved under a new "ACTIONS" section title** into a no-data card. The card provides action rows — Test Connection, plus a **View response** button (the JSON of the `pingProvider` result) that appears after any test, whether it succeeded or failed, so the exact failure reason is reviewable.
