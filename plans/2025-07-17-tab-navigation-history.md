2025-07-17

# Goal

Fix the back/forward buttons in the titlebar to navigate through recently activated tabs within the current workset, instead of navigating between worksets. The history should work regardless of grid cell boundaries, persist when switching worksets (per-workset histories), and survive component re-creation.

# Rationale

The current back/forward buttons navigate between worksets (`switchWorkset`), but with only one workset per window at a time, that's meaningless. The user expects browser-style tab history: clicking a tab pushes the previous tab onto a back stack, and the back/forward buttons step through that stack within the current workset.

# Approach

## 1. Track tab activation globally

A module-level **TabActivationHistory** service stores per-workset activation stacks. It lives at module level so it survives DOM teardown when switching worksets or re-rendering.

```
TabActivationHistory (module-level)
  └── backStacks: Map<worksetId, tabId[]>
  └── forwardStacks: Map<worksetId, tabId[]>
  └── currentTabs: Map<worksetId, tabId>  // current active tab per workset
```

**API:**

- `pushActivation(worksetId, tabId)` — called every time a tab is activated. If `tabId !== current`, push current onto backStack and clear forwardStack.
- `goBack(worksetId): tabId | null` — pop backStack, push current onto forwardStack, return tabId.
- `goForward(worksetId): tabId | null` — pop forwardStack, push current onto backStack, return tabId.
- `canGoBack(worksetId): boolean`
- `canGoForward(worksetId): boolean`

## 2. Wire into tab activation flow

Add a single call site in `openp41ge-grid.ts` where `cell-tab:activate` is handled (line 312-315):

```typescript
@cell-tab:activate=${(e: CustomEvent) => {
  const { winId, worksetId, tabId } = e.detail;
  TabActivationHistory.pushActivation(worksetId, tabId);
  appServices.commandBus.dispatch("activateTabInCell", winId, worksetId, tabId);
}}
```

Also add calls in `file-open-handler.ts` and `grid-drop-target.ts` where `activateTabInCell` is dispatched.

## 3. Wire into back/forward buttons in `openp41ge-titlebar.ts`

Replace the current workset-navigation back/forward logic with tab-history navigation:

- `_goBack()`: call `TabActivationHistory.goBack(worksetId)` → dispatch `activateTabInCell` with the returned tabId
- `_goForward()`: call `TabActivationHistory.goForward(worksetId)` → dispatch `activateTabInCell` with the returned tabId
- `_canGoBack()`: delegates to `TabActivationHistory.canGoBack(worksetId)`
- `_canGoForward()`: delegates to `TabActivationHistory.canGoForward(worksetId)`

The titlebar needs to re-render when the history changes. Options:

- After each `pushActivation`, dispatch a DOM CustomEvent (`openp41ge:tab-history-changed`) that the titlebar listens to and triggers `requestUpdate()`.
- Or, since `activateTabInCell` triggers a workspace state update which re-renders the grid, which then re-creates the tab bar, which... it's complex. Simpler: dispatch a DOM event.

## 4. Per-workset persistence

Each workset gets its own back/forward stacks in the module-level Maps. When the user switches worksets via the dropdown, the history for the new workset is immediately available. When switching back, the old workset's history is preserved.

No serialization to disk needed — history is session-only.

# Files Changed

| File                                                      | Change                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/services/tab-activation-history.ts`         | **New** — module-level TabActivationHistory class with back/forward stacks per workset                                                         |
| `src/renderer/components/openp41ge-titlebar.ts`           | Replace `_backStack`/`_forwardStack` (workset navigation) with `TabActivationHistory` calls (tab navigation). Listen to history-change events. |
| `src/renderer/components/openp41ge-grid.ts`               | Call `TabActivationHistory.pushActivation()` before dispatching `activateTabInCell`                                                            |
| `src/renderer/services/file-open-handler.ts`              | Call `TabActivationHistory.pushActivation()` before dispatching `activateTabInCell`                                                            |
| `src/renderer/services/drop-targets/grid-drop-target.ts`  | Call `TabActivationHistory.pushActivation()` before dispatching `activateTabInCell`                                                            |
| `src/renderer/services/tab-drag-handler.ts`               | Call `TabActivationHistory.pushActivation()` where `activateTabInCell` is dispatched                                                           |
| `src/renderer/services/index.ts`                          | Export TabActivationHistory                                                                                                                    |
| `src/renderer/bootstrap/steps/expose-test-models.step.ts` | Expose TabActivationHistory for E2E test injection                                                                                             |

# UX Considerations

- **Back/Forward buttons** visually dim when the stack is empty (already implemented via `opacity:0.3;pointer-events:none`).
- **History clears forward stack** on each new activation (browser-style: a new activation after going back clears the forward path).
- **No visual feedback** other than the tab switching — the tab bar highlights the activated tab via existing `data-tab-id` styles.
- **Cross-workset persistence**: switching worksets and back preserves the history, so the user can go back to a tab they activated before switching away.
- **Does NOT navigate across grid cells** — this tracks tab activation, not cell focus. Moving to a different cell and activating a tab there counts as an activation.

# Testing Strategy

## Unit Tests (`test/unit/services/tab-activation-history.test.ts`)

| Test                                | What it covers                               |
| ----------------------------------- | -------------------------------------------- |
| `pushActivation` records first tab  | Current tab set, back stack empty            |
| `pushActivation` with same tab      | No-op — no history push                      |
| `pushActivation` with different tab | Previous tab pushed onto back stack          |
| `goBack` returns previous tab       | Back stack popped, current pushed to forward |
| `goForward` returns next tab        | Forward stack popped, current pushed to back |
| New activation after going back     | Forward stack cleared                        |
| `canGoBack` / `canGoForward`        | True/false based on stack state              |
| Per-workset isolation               | Two worksets have independent stacks         |
| Empty stacks                        | `goBack`/`goForward` return null             |
| Multiple back steps                 | Full history traversal                       |

## E2E Tests

- Click tab A → click tab B → click back → tab A is active
- Click tab A → click tab B → click back → click forward → tab B is active
- Back button dimmed when no history
- Forward button dimmed when no history
- History preserved after workset switch and switch back

# Open Questions

1. **Should clicking the already-active tab push history?** No — `pushActivation` with the same tabId is a no-op. This prevents no-op activations (resize, re-render) from polluting history.
2. **What about programmatic activation?** File-open-handler dispatching `activateTabInCell` for an existing tab should still push history — the user was looking at something else before opening the file.
3. **Should closing a tab affect history?** If the current tab is closed, should we auto-navigate back? For now, no — the grid already handles focus fallback to the next tab in the cell. The closed tab is just absent from the stacks.
4. **History limits?** Cap at 50 entries per workset to avoid unbounded memory.

# Completion Criteria

- [ ] `TabActivationHistory` module with per-workset back/forward stacks
- [ ] `pushActivation` called from all `activateTabInCell` dispatch sites
- [ ] Back/forward in titlebar navigates tabs instead of worksets
- [ ] Buttons dim when stack is empty
- [ ] Per-workset isolation — history preserved across workset switches
- [ ] Forward stack cleared on new activation after going back
- [ ] All unit tests pass
- [ ] Build passes
