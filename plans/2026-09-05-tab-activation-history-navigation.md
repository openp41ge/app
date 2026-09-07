2026-09-05

# Tab Activation-History Navigation

## Goal

Make Cmd+W close grid tabs in **activation-history order** (most-recently-activated first) instead of right-to-left placement order, and add **Back / Forward arrows** to the title bar that cycle through that same activation history. Also move the workspace name to the **right** side of the title bar as plain text (icon removed, not clickable) and rename its now-degraded component.

## Rationale

Cmd+W currently closes tabs right-to-left (`resolveCmdWTarget` in `services/cmd-w-target.ts`) which feels arbitrary. Tabs should close in the order the user actually used them. The app already has a `TabActivationHistory` service (browser-style back/forward stacks per window) but it is only wired to tab clicks and is not used by Cmd+W or surfaced in the UI. This plan wires it up fully and exposes back/forward navigation in the title bar.

## Approach

### 1. `TabActivationHistory` — closed-tab filtering + close-order helper

File: `packages/openp41ge/src/renderer/services/tab-activation-history.ts`

- Add optional `isOpen?: (tabId) => boolean` param to `goBack`/`goForward`/`canGoBack`/`canGoForward` so closed tabs are skipped. Default (no param) = all open → existing tests keep passing.
- Add `remove(winId, tabId)` to prune a closed tab from `currentTabId`/`backStack`/`forwardStack`.
- Add `getCloseCandidates(winId): string[]` — activation order (current first, then backStack most-recent-first); used by Cmd+W.
- Add `pruneClosed(winId, isOpen)` to drop closed tabs from the stacks (keeps history clean).

### 2. Activation recording (make history reflect real usage)

- Keep the existing `grid-activate` → `pushActivation` (tab click) wiring in `openp41ge-tabs-event-handler.ts`.
- Add a **workspace-state observer** that records activations not captured by clicks:
  - On each state update for the current window, diff open tab ids.
  - **Newly-appeared tab** (open tab not present before) → `pushActivation` (covers opening a new file/commit/chat/terminal tab). Skipped on the very first observation so a restored workspace is not seeded as history.
  - **Active-tab change on an existing tab** → `pushActivation`, **unless a tab was removed in the same update** (so Cmd+W closing a tab does not falsely record the surviving `filtered[0]` as an activation).
  - Hooking point: a new `register-tab-activation-recorder` bootstrap step (or hook in `subscribe-state-updates.step.ts`) that subscribes via `context.workspaceState`.

### 3. Cmd+W uses activation history

File: `packages/openp41ge/src/renderer/services/cmd-w-target.ts`

- `resolveCmdWTarget(ws, windowId)` → use `TabActivationHistory.getCloseCandidates(windowId)` filtered by "tab is open in this window's grid placements", take the first → `{ kind: "close-tab", tabId }`; if none open → `{ kind: "close-window" }`.
- The Cmd+W handler emits `tab-remove-from-cell` and then calls `TabActivationHistory.remove(windowId, tabId)`.

### 4. Title-bar rework

File: `packages/openp41ge/src/renderer/components/openp41ge-titlebar.ts`

- Left slot (after the left-sidebar toggle): add **Back (‹)** and **Forward (›)** arrow buttons.
  - Click Back → `TabActivationHistory.goBack(winId, isOpen)`; if a tab id, `emitEvent("grid-activate", { winId, tabId })` (or `activateTabInCell`) to focus it.
  - Click Forward → `goForward` similarly.
  - `disabled` = `!canGoBack(...)` / `!canGoForward(...)`; recompute in render (title bar re-renders on workspace state updates).
  - `isOpen` derived from `windowData.grid.placements`.
- Move the workspace name to the **right side** (before the right-sidebar toggle), **no icon, not clickable**.

### 5. Rename workspace-search → workspace-label

File: `packages/openp41ge/src/renderer/components/openp41ge-workspace-search.ts`

- Rename element `<openp41ge-workspace-search>` → `<openp41ge-workspace-label>` and class `Openp41geWorkspaceSearch` → `Openp41geWorkspaceLabel`.
- Render just the workspace name text (no SVG icon, no click handler, no background/`cursor:pointer`).
- Update the import/usage in `openp41ge-titlebar.ts`.

## Files Changed

- `packages/openp41ge/src/renderer/services/tab-activation-history.ts` — closed-tab filtering, `remove`, `getCloseCandidates`, `pruneClosed`.
- `packages/openp41ge/src/renderer/services/cmd-w-target.ts` — history-based close order.
- `packages/openp41ge/src/renderer/bootstrap/steps/register-shortcuts.step.ts` — Cmd+W calls history + `remove`.
- `packages/openp41ge/src/renderer/bootstrap/steps/subscribe-state-updates.step.ts` (or new `register-tab-activation-recorder` step) — workspace-state activation recorder. (Likely a new step registered in `bootstrap/steps/index` / `app.ts`.)
- `packages/openp41ge/src/renderer/components/openp41ge-titlebar.ts` — back/forward arrows + workspace label moved right.
- `packages/openp41ge/src/renderer/components/openp41ge-workspace-search.ts` → renamed `openp41ge-workspace-label.ts` (component + class rename).
- Tests: update `test/unit/services/cmd-w-target.test.ts`; extend `test/unit/services/tab-activation-history.test.ts`; add title-bar back/forward component test if feasible.

## Testing Strategy

- **Unit** (`test/unit/services/`):
  - `tab-activation-history.test.ts` — extend: `goBack`/`canGoBack` skip closed tabs via `isOpen`; `remove` prunes stacks; `getCloseCandidates` returns current-first then most-recent-first; `pruneClosed`.
  - `cmd-w-target.test.ts` — rewrite to assert closing follows activation order (record activations, then close target), and that tabs not in history/closed are skipped; close-window when none open.
- **Integration** (`test/integration/`): a test for the state observer recording new-tab and switch activations, if separable.
- **Manual E2E (debug skill + CDP)**: open/switch tabs → Cmd+W closes in activation order; Back/Forward cycle history; closed tabs disappear from history; workspace label on the right, no icon, arrows left.

## UX Considerations

- Back/Forward use the same toolbar affordance style as existing `tb-btn` (18px icons, hover bg, no-drag regions so they don't trigger window move).
- Back/Forward only focus the target tab — they do **not** reorder the tab strip.
- Disabled state (opacity) for Back at the oldest entry / Forward when nothing ahead.
- Workspace label on the right is plain text (muted color), no longer clickable — the Workspaces overlay is reached via the system overlay/Window menu instead.
- Cmd+W in a workspace window still closes the window once no grid tabs remain; sidebar (system) tabs are never closed.

## Open Questions

- None blocking. (Cross-window drag of chat tabs, and a tool to reach the Workspaces overlay once the title-bar button is non-clickable, are out of scope here.)

## Implementation Status (2026-09-05)

Implemented and verified:

- **`TabActivationHistory`** (`services/tab-activation-history.ts`): added optional `isOpen` filtering to `goBack`/`goForward`/`canGoBack`/`canGoForward` (closed tabs are skipped & discarded), plus `remove`, `getCloseCandidates` (current-first, then back-stack most-recent-first), `pruneClosed`.
- **`resolveCmdWTarget`** (`services/cmd-w-target.ts`): closes the most-recently-activated OPEN tab (activation order), with a right-to-left fallback when history is empty.
- **Activation recording**: tab clicks already push via `grid-activate`; `CommandBus.dispatch` now records `activateTabInCell` (single canonical switch op, covering open-to-existing + tree); new tabs recorded by a new `RegisterTabActivationRecorderStep` (observes workspace state, records _newly-appeared_ tabs only — never switch diffs) registered in the bootstrap pipeline.
- **Title bar** (`openp41ge-titlebar.ts`): Back/Forward arrows on the left (use `TabActivationHistory.goBack`/`goForward` then dispatch the `grid-activate` DOM event), disabled states; workspace name moved to the right.
- **Renamed** `openp41ge-workspace-search` → `openp41ge-workspace-label` (plain text, no icon, not clickable).

**Race-bug found & fixed during E2E**: a state-diff recorder that recorded _active-tab switches_ corrupted the back/forward stacks (it re-recorded tabs that navigation moved to, leaving Back enabled at the oldest entry). Fixed by recording switches at the `activateTabInCell` dispatch point instead, and keeping the recorder to _additions_ only.

**Verified (CDP/E2E)**: title bar layout + disabled states; Cmd+W closes most-recently-activated (then 2nd, then last) even when a different tab is visually active, and closes the window when none remain; Back/Forward navigate the history (Back disables at oldest, Forward at newest).

**Follow-up bug fix — Window Manager didn't refresh on close**: closing a workspace window (e.g. via Cmd+W) left the Window Manager's "open windows" column stale until the WM regained focus. Fixed by broadcasting a `window-manager:open-windows-changed` push from the main process (`notifyOpenWindowsChanged()` in `electron/window-manager.ts`, called on window open + in the `closed` handler) and having the WM subscribe (`onOpenWindowsChanged` in preload + renderer) to reload immediately. Verified via CDP (open + close a workspace window from the WM, list updates without a focus change).

**Not verified**: no dedicated unit test for the recorder/title-bar wiring or the WM refresh channel (covered by E2E); `nx knip` not run (known pre-existing failures).

## Completion Criteria

- [x] Cmd+W closes grid tabs in activation-history order (most-recent first), skipping closed tabs.
- [x] Back/Forward arrows appear in the title bar (left) and cycle the activation history, never reordering the tab strip.
- [x] Workspace name renders on the right of the title bar as plain text (no icon, not clickable); component renamed to `openp41ge-workspace-label`.
- [x] `nx run-many -t typecheck`, `nx lint` clean; `nx run-many -t test` passes (updated + new suites); verified in the running app via `debug` skill / CDP.
