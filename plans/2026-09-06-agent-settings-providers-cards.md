# 2026-09-06 — Agent settings: providers cards + slide-in provider editor

## Goal

Redesign the Agent settings grid tab (currently `<openp41ge-agent-settings>`) from a set
of labelled single-input lines into the **standard settings-card pattern** used by the Logs
and Editor settings tabs. The central "Providers" card manages **multiple** providers
(including local ones). Clicking a provider row **slides a drawer in from the right** — using
the same **multi-tiered stacked-drawer mechanics as the Window Manager** (breadcrumb head,
slide-in animation, masked sliver of the level beneath, width tiers) — to enter the provider
detail on the standard cards, with **radio-style preset pickers** at the top so OpenAI /
Anthropic / local endpoints don't need to be typed by hand. Returning shows the updated list
with the new row and a persistent "+ Add another provider" row.

**Scope: settings UI only.** Providers are configured here but not wired to the chat runtime
yet (the chat interface is unfinished). The main-process `ChatProviderRegistry` is unchanged;
storing a non-vLLM provider is valid, but it won't stream until a future chat-native
integration. Presets only pre-fill `baseUrl`/`model`.

## Rationale

- The current Agent settings pane uses single labeled inputs, which diverges from the
  established Logs/Editor settings cards. It also only supports **one** provider (a single
  `<select>` hard-coded to `vllm`), so it cannot express the "multiple providers, including
  local ones" model the user wants.
- Adding a provider should be low-friction: pick a popular preset (OpenAI, Anthropic, local
  vLLM/Ollama/LM Studio, Groq, Mistral) or Custom, and the endpoint is pre-filled.
- A slide-in detail view keeps the list compact and lets the user focus on one provider at a
  time, matching the requested "click a row → view slides in from the right → return" flow.

## Approach

### Provider model & config
The persisted config shape is unchanged: `agent.providers` is a `Record<id, ProviderConfig>`
with `{ baseUrl, model, apiKey?, temperature?, maxTokens? }`, plus `agent.providerId` (the
default/active provider). Add an **optional `name?: string`** to the provider config so
custom/local providers get a friendly display label; the runtime ignores it (UI-only slop).

### New pure module — `src/renderer/models/agent-provider-presets.ts`
Keeps business logic testable and out of the component (SOLID: Single Responsibility,
Open/Closed so new presets are added by editing one array):
- `ProviderPreset` interface: `{ id, label, compatible: "openai" | "anthropic", baseUrl, model, requiresKey, description? }`.
- `PROVIDER_PRESETS: ProviderPreset[]` — OpenAI, Anthropic, vLLM (local), Ollama (local),
  LM Studio (local), Groq, Mistral, Custom.
- `providerPreset(id)` → preset or undefined.
- `nextProviderId(existingIds: string[], base: string)` → unique id (`openai`, `openai-2`, …).
- `applyPreset(preset)` → a `ProviderConfig` seeded from the preset (`{ baseUrl, model, name: label }`).
- `presetFor(config)` → the preset whose `baseUrl` matches the config (normalized), else the Custom preset.
- `providerDisplayName(preset, config)` → `name ?? label ?? host`.

### Rewrite — `src/renderer/components/openp41ge-agent-settings.ts`
Recreate the Window Manager's drawer-stack mechanics inside the settings pane (the component
fills its grid tab; `position: relative; height: 100%; overflow: hidden`):
- **Base content** — the Providers card (`.ags-section-title` "Agents", a `.ags-card` and a
  card-question "Which providers should be available for chats?", a row per configured
  provider, and a trailing "+ Add another provider" row).
- **Drawer layer** — absolute `inset:0` over the base, holding a stack of drawers:
  - `.drawer` `position:absolute; top/right/bottom:0; width` from the width-tier helper
    (deepest 75%, parent 80%, ancestors 85%), `z-index: i+1`, `background: var(--bg-secondary)`,
    a left border, the `dw-slide` slide-in animation (and `dw-slide-out` for closing).
  - `.drawer-head` (44px) — title (or breadcrumb trail for the top drawer), a Close (✕) button.
  - `.drawer-mask` on every non-top drawer (blocks its controls; clicking the exposed sliver
    closes the deeper drawers); `.drawer-shadow` matching the widest drawer.
  - `.drawer-body` (flex:1, scrollable) — provider detail on the standard cards.
  - `.drawer-footer` (44px, right-aligned) — Save / Cancel / Delete (edit mode only).
  - Escape closes the top drawer; a `_closingDrawers` list animates drawers out.
- **Provider detail** (the one drawer tier, opened by a provider row or the add row):
  - **Preset radio options** at the top (OpenAI / Anthropic / vLLM / Ollama / LM Studio /
    Groq / Mistral / Custom). Selecting one pre-fills `baseUrl`/`model`/`name`; in edit mode the
    matching preset is auto-selected, unmatched → Custom.
  - Standard cards with questions:
    - "What is the display name?" (optional text)
    - "What base URL should be used?" (text)
    - "Which model should be used?" (text)
    - "What API key should be used?" (password; optional — help notes local servers usually need none)
    - "What temperature should be used?" (optional number)
    - "What is the max output tokens?" (optional number)
- **Actions**:
  - Add: generate unique id, add to `providers`, set active only if it's the first provider.
  - Edit: update `providers[id]`.
  - Delete: remove; if it was active, switch to the first remaining provider (or none).
  - All persist via `configService.set("agent", config)` (which also dispatches
    `openp41ge:config-changed`).
  - Keep the existing **Test Connection** button (calls
    `window.openp41ge?.chat?.pingProvider?.(id)`, guarded) in the drawer footer.
- Inject `configService` as a public, nullable property. Defaults to `null`, in which case the
  component reads/writes through `window.openp41ge.config` (and dispatches
  `openp41ge:config-changed`) — matching the component's original IPC usage. Tests substitute a
  fake ConfigService. (The component intentionally does **not** import `../app`, so it can be
  unit-tested in isolation without pulling the uikit icon graph.)

### Settings tab host
`agent-settings-tab.ts` is unchanged — it already mounts `<openp41ge-agent-settings>`.

## Files Changed
- `packages/openp41ge/src/renderer/models/agent-provider-presets.ts` — **new**: preset list +
  pure provider helpers.
- `packages/openp41ge/src/renderer/components/openp41ge-agent-settings.ts` — rewritten:
  cards, provider list, slide-in detail editor, preset picker.
- `packages/openp41ge/src/renderer/services/config-service.ts` (renderer `UserConfig`) — add
  `agent.providers[*].name?` to the type (mirrors main config, makes accessor typing accurate).
- `packages/openp41ge/src/main/services/config-service.ts` (main `UserConfig`) — add
  optional `name?` to the provider config shape (backward-compatible, runtime ignores it).
- `packages/openp41ge/src/main/interfaces/chat-provider.ts` — add optional `name?` to
  `ChatProviderConfig` (so the field is typed where config is consumed).
- Tests: `packages/openp41ge/test/unit/components/openp41ge-agent-settings.test.ts` (**new**).

## Testing Strategy
- **Unit tests (new)** for `agent-provider-presets.ts`:
  - preset lookup, `applyPreset` seeds baseUrl/model/name, `nextProviderId` de-dupes,
    `presetFor` matches baseUrl and defaults to Custom, `providerDisplayName` precedence.
- **Unit tests (new)** for the component using a `FakeConfig` injectable (mirrors
  `file-editor-settings.test.ts`):
  - renders a Providers card listing the default vLLM row.
  - "+ Add another provider" opens the detail view with the preset radios.
  - selecting a preset pre-fills baseUrl/model; Save persists a new provider row and returns
    to the list.
  - editing an existing provider updates it and persists.
  - Delete removes the provider and re-points the active id.
  - the default-provider radio persists `providerId`.
  - an empty provider list renders the add row and no rows.
- Existing `settings-tabs.test.ts` (mounts the element) should still pass.

## UX Considerations
- **Focus**: opening the detail view focuses the preset list (or the base URL field); the back
  arrow and Cancel/Delete buttons are reachable. Save is the primary (rightmost) action;
  Cancel is secondary (left of it), matching modal conventions.
- **Keyboard**: Escape closes the detail view (discards draft); Enter in the base URL/model
  fields triggers Save.
- **Visual consistency**: reuse the Logs/Editor card tokens (`rgba(255,255,255,0.05)` card
  background, `max-width: 620px`, `8px` radius, uppercase section title), the theme vars, and
  the `openp41ge-toggle`/radio styling conventions — and reuse the Window Manager's drawer
  tokens (`.drawer`, `.drawer-head`, `.drawer-body`, `.drawer-mask`, `.drawer-shadow`,
  `dw-slide`) so the settings drawer looks and behaves like the workspace-manager drawers.
- **Slide-in / tiers**: the drawer is `position:absolute; right:0`, animating in with
  `translateX(24px → 0)` (matching the Window Manager). The base Providers card stays mounted
  beneath; when the drawer is open, the exposed left sliver of the base is masked and a click
  there closes the drawer. Width tiers (75/80/85%) and the breadcrumb trail support more than
  one tier if the provider detail ever needs to drill deeper.
- **Empty states**: no providers shows the add row prominently; the first added provider
  becomes active.

## Open Questions
- (Resolved) Scope is settings UI only; runtime provider wiring is out of scope.
- (Resolved) Preset list includes OpenAI, Anthropic, vLLM, Ollama, LM Studio, Groq, Mistral,
  Custom.

## Completion Criteria
- [x] Providers card lists all configured providers with name/model/endpoint.
- [x] Clicking a provider row slides a right-side drawer in (Window-Manager style) with the
      editing cards; the base remains visible as a masked sliver; clicking the sliver or Escape
      closes it.
- [x] "Add another provider" opens the drawer with radio presets at the top.
- [x] Selecting a preset pre-fills baseUrl/model so no manual endpoint entry is needed.
- [x] Save adds/updates the provider, returns to the list with the new row, persists `agent`.
- [x] Delete removes the provider and repairs the active `providerId`.
- [x] Default-provider radio persists `providerId`.
- [x] Visual style matches the Logs/Editor settings cards (no single labelled inputs).
- [x] `nx run-many -t typecheck lint test` pass; `nx run-many -t build` pass; live-verified via
      Chrome DevTools in the running app (open add → pick preset → save → switch default →
      delete → Escape close).

> Note: `settings-tabs.test.ts` and `file-editor-settings.test.ts` still fail to **load** under
> an ad-hoc `npx vitest run --root packages/openp41ge` due to a pre-existing Vite `?raw` SVG
> denial in `openp41ge-uikit` icons, but pass under the real `nx run openp41ge:test` (97 files,
> 1239 tests). Not caused by this work.
