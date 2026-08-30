2026-08-30

# Tooltip System (uikit) + Wire into Title Bar & Sidebars

## Goal

Build a reusable **tooltip system** in `openp41ge-uikit` that replaces native `title` tooltips with styled, animated hover tooltips. Two tooltip variants:

1. **Simple single-line** — short label text.
2. **Detail (title + subtext)** — a bold title plus a wrapping explanation line for describing a more complex control.

Then wire the system into the **five** buttons scoped for this pass: the left/right sidebar toggles and the workspaces button in the title bar, and the `＋` "open sidebar tab" button in **each** sidebar's tab bar (left + right). All native `title` attributes on those buttons are removed — the custom tooltip is the replacement. The system is designed so more buttons can adopt it later, but this pass only wires the five listed.

## Rationale / Current State

- Buttons are increasingly icon-only and unclear (`＋`, workspaces glyph, sidebar toggles, window buttons). They rely on native `title`, which renders as the OS-style yellow box: slow, unstyled, no async fade, inconsistent with the app's theme, and invisible to keyboard focus.
- Existing native `title` usage targeted here:
  - `openp41ge-titlebar.ts` — `.tb-btn` left toggle (`title="Close/Open left sidebar"`), right toggle (`title="Close/Open right sidebar"`).
  - `openp41ge-workspace-search.ts` — workspaces button (`title="Workspaces"`).
  - `openp41ge-sidebar.ts` — `<div class="sidebar-tab-add"> ＋` (`title="Open sidebar tab"`), rendered once per sidebar side (2 instances).
- No tooltip component exists anywhere (`grep tooltip` only matches comments/`pane-header-button`'s unused `title` option and a status-label helper).
- Patterns to reuse:
  - **Singleton host/service**: `openp41ge-toast.ts` mounts a fixed `pointer-events:none` (actually `auto`) host on `document.body` on first use; `SystemOverlayService` is a singleton with subscribe/host wiring. The tooltip host follows the toast "inject once, self-mount" pattern.
  - **Shared UI layer**: `openp41ge-uikit` is the shared Lit package, already imported by the platform (`import "openp41ge-uikit"` in `app.ts`; components consume theme CSS variables). A generic `openp41ge-tooltip` belongs here so any package can use it later.
  - **Lit + light-DOM render root**: the platform title bar / sidebar / workspace-search all use `createRenderRoot() { return this; }` — a Lit **directive** computed on template elements works there unchanged.

## Design Decisions (confirmed with user)

- **Attachment API**: a Lit `tooltipContent(content)` **directive** applied per element in templates (per-button content), backed by a singleton `TooltipController` + `TooltipHost`. No DOM wrapping, so titlebar flex layout and drag geometry are untouched.
- **Trigger**: `mouseenter`/`mouseleave` **and** `focusin`/`focusout` (keyboard parity — improved over native `title`, which only shows on hover).
- **Delay & animation**: very short show delay (`~120ms`), near-instant hide (`~60ms`), fade in/out (`~90ms` each) — matches the app's `duration-100` convention.
- **Placement**: anchored to the target element, **below** by default, flips **above** when near the bottom viewport edge, clamped horizontally inside the viewport. Does **not** follow the cursor.
- **Native-title replacement**: remove `title` from all five buttons; add ARIA tooltip wiring (`role="tooltip"`, `aria-describedby` on the target, and a unique id on the popup) so the feature genuinely replaces `title`, including for assistive tech.
- **Variant → button mapping** (per-button choice; user confirmed):
  - **Simple** — left sidebar toggle, right sidebar toggle, left `＋`, right `＋`.
  - **Detail** — workspaces button (overlay can be explained in one line).
- **Scope**: only the five buttons now; the system is packaged so other controls (bottom bar, pane headers, repo tree, `pane-header-button`) can adopt it later without further platform changes beyond wiring.

## Approach

### Part A — uikit tooltip system (`packages/openp41ge-uikit/src/components/tooltip/`)

New module, exported through the uikit `index.ts`. Everything is framework-free at the edges (Lit for rendering, plain DOM/custom elements for the singleton host).

1. **`content.ts`** — the content model + type guard:

   ```ts
   export type TooltipContent =
     { type: "simple"; text: string } | { type: "detail"; title: string; subtitle: string };
   export function isDetailTooltip(c: TooltipContent): boolean;
   ```

2. **`openp41ge-tooltip.ts`** — `LitElement`, light-DOM host-agnostic. One property `text: string`. Renders a single-line panel (theme `--bg-modal`/`--bg-dropdown` + `--border-color`, `--text-primary`, `12px`, `white-space: nowrap`, ellipsis with a modest `max-width`).

3. **`openp41ge-tooltip-detail.ts`** — `LitElement` with `title: string` and `subtitle: string`. Renders two lines: bold `--text-primary` title + wrapping `--text-secondary`/`--text-muted` subtitle (`max-width ~280px`).

   Both extend a tiny shared `BaseTooltip` (`static styles`, no shadow root) so they present the same host-facing contract — Liskov-safe interchangeable render surface.

4. **`tooltip-host.ts`** — single `openp41ge-tooltip-host` custom element (singleton, appended to `document.body` on first use; same pattern as `openp41ge-toast`).
   - `show(target: HTMLElement, content: TooltipContent): void` — builds/updates the active popup (instantiates the matching component from `content.type`), positions it via `getBoundingClientRect()`, applies fade-in class, sets `role="tooltip"` + a stable id and points the target's `aria-describedby` at it.
   - `hide(): void` — fade-out, clear `aria-describedby`.
   - Owns the show/hide delay timers, the fade transition, and viewport-edge flipping/clamping. Repositions on window `scroll`/`resize` (capture listeners) while visible; hides if the target is disconnected.
   - `position: fixed; pointer-events: none; z-index: 99999;` so it never intercepts clicks or the titlebar drag.

5. **`tooltip-controller.ts`** — singleton `TooltipController`:
   - `WeakMap<Element, TooltipContent>` registry (no leaks when elements are GC'd / re-rendered by Lit).
   - `attach(el, content)` — wires `mouseenter/focusin → show` and `mouseleave/focusout → hide`; updates the registry entry if re-attached when already shown (covers the dynamic "Open/Close" text on the sidebar toggles).
   - Constructed with the host injected via a settable default (`public _host: TooltipHostLike = TooltipHost.instance`) per the project's default-property injection convention → unit-testable with a fake host (**D**).
   - `TooltipHostLike` interface is two methods (`show`, `hide`) — small by design (**I**).

6. **`tooltip-directive.ts`** — Lit `tooltipContent(content)` async directive: on element connect, calls `TooltipController.attach(el, content)`; on update, refreshes the registry content; on disconnect, cleans up listeners.

7. **`index.ts`** — re-export `tooltipContent`, `TooltipController`, `TooltipHost`, `BaseTooltip`, `Openp41geTooltip`, `Openp41geTooltipDetail`, `TooltipContent`, and types. Add to `packages/openp41ge-uikit/src/index.ts`.

**SOLID notes**

- **S** — `TooltipController` (target registration + listeners) and `TooltipHost` (single display surface: timing, positioning, animation) are separate classes with one reason to change each.
- **O** — The host resolves the popup component from `content.type`. Two variants map via a small lookup; adding a third type must not require touching `show()` — keep a `Record<type, factory>` so new tooltip variants register themselves (**strategy**, not a growing `if/else`).
- **L** — `Openp41geTooltip` / `Openp41geTooltipDetail` share the `BaseTooltip` host contract and are interchangeable to `TooltipHost`.
- **I** — `TooltipHostLike` exposes only `show`/`hide`; controller never couples to host internals.
- **D** — Controller depends on the `TooltipHostLike` interface with a settable default, so tests inject a fake host (matches the model-based DI convention used elsewhere in the repo).

### Part B — wire the five buttons (platform package)

1. **`openp41ge-titlebar.ts`**
   - Left `.tb-btn`: `tooltipContent({ type: "simple", text: this.leftSidebarVisible ? "Close left sidebar" : "Open left sidebar" })`; delete `title="…"`.
   - Right `.tb-btn`: same with `rightSidebarVisible`; delete `title="…"`.
   - Dynamic content stays current because the directive refreshes on re-render.
2. **`openp41ge-workspace-search.ts`**
   - Add `tooltipContent({ type: "detail", title: "Workspaces", subtitle: "Open the Workspaces overlay to switch projects and reopen recent workspaces." })`; delete `title="Workspaces"`.
3. **`openp41ge-sidebar.ts`**
   - `＋` (`sidebar-tab-add`): `tooltipContent({ type: "simple", text: "Open sidebar tab" })`; delete `title="Open sidebar tab"`. Rendered for both sides, so both left and right instances get the tooltip.
4. Import `tooltipContent` from `openp41ge-uikit` in each wired file; the uikit import already happens in `app.ts` for element registration.

### Part C — optional isolated demo (`openp41ge-uikit`)

A small `openp41ge-tooltip.stories.ts` (matching the existing `openp41ge-icon.stories.ts` pattern) rendering buttons with both variants so the system can be eyeballed in isolation before/without launching the full Electron app. Optional — not required for completion.

## Files Changed

**New — uikit tooltip module:**

- `packages/openp41ge-uikit/src/components/tooltip/content.ts` — `TooltipContent` model + guard.
- `packages/openp41ge-uikit/src/components/tooltip/base-tooltip.ts` — shared base element.
- `packages/openp41ge-uikit/src/components/tooltip/openp41ge-tooltip.ts` — simple single-line variant.
- `packages/openp41ge-uikit/src/components/tooltip/openp41ge-tooltip-detail.ts` — title+subtext variant.
- `packages/openp41ge-uikit/src/components/tooltip/tooltip-host.ts` — singleton host (timing, fade, positioning, ARIA).
- `packages/openp41ge-uikit/src/components/tooltip/tooltip-controller.ts` — singleton controller + `TooltipHostLike` interface.
- `packages/openp41ge-uikit/src/components/tooltip/tooltip-directive.ts` — `tooltipContent()` directive.
- `packages/openp41ge-uikit/src/components/tooltip/index.ts` — module exports.

**Modified:**

- `packages/openp41ge-uikit/src/index.ts` — export tooltip module + types.
- `packages/openp41ge/src/renderer/components/openp41ge-titlebar.ts` — wire both sidebar toggles, remove native `title`s.
- `packages/openp41ge/src/renderer/components/openp41ge-workspace-search.ts` — wire workspaces button (detail variant), remove `title`.
- `packages/openp41ge/src/renderer/components/openp41ge-sidebar.ts` — wire `＋` button (simple variant), remove `title`.

**Tests:**

- `packages/openp41ge-uikit/test/tooltip/tooltip.test.ts` — controller/host unit tests.
- `packages/openp41ge-uikit/test/tooltip/tooltip-controller.integration.test.ts` — directive-on-element integration test.

**Optional:**

- `packages/openp41ge-uikit/src/components/tooltip/openp41ge-tooltip.stories.ts` — isolated demo.

## Testing Strategy

Unit + integration tests in `openp41ge-uikit` (Vitest, fake timers, injected fake host):

1. **`tooltip-controller.test.ts`**
   - `attach(el, content)` registers content in the registry (inspect via a spy host).
   - Dispatching `mouseenter`/`focusin` calls `host.show(el, content)`; `mouseleave`/`focusout` calls `host.hide()`.
   - Re-attach on an element while shown updates the content and refreshes the visible popup (dynamic Open/Close case).
   - `disconnect` path removes listeners (WeakMap entry not leaked; `gc`-free by design).
   - **D**: fake `TooltipHostLike` injected through `_host`.
2. **`tooltip-host.test.ts`**
   - `show` mounts the correct variant component for each `content.type` (assert rendered text / title+subtitle DOM).
   - Show delay honored (fake timers: no render before ~120ms, rendered after); fast hide on leave (~60ms).
   - Fade classes toggled (`visible` class present/absent).
   - Positioning: stubbed `getBoundingClientRect` → below default; flips above when target near viewport bottom; clamps horizontally; repositions on dispatched `resize`/`scroll` while visible.
   - ARIA: popup gets `role="tooltip"` + stable id; target gets `aria-describedby` pointing at it on show and cleared on hide.
   - Hide when target is disconnected.
3. **Integration (`tooltip-controller.integration.test.ts`)**
   - Render a Lit template spanning both variants (`<div ${tooltipContent({ type: "detail", title, subtitle })}>`), dispatch `mouseenter`, assert the DOM in the mounted host; dispatch `mouseleave`, assert fade-out + `aria-describedby` cleared.
4. **Regression guard for this pass**
   - Assert the five wired controls' rendered HTML contains **no** `title` attribute (grep-level assertion via unit test on each component's render root for titlebar/sidebar is heavy; instead a plain `grep -rn 'title='` check on the three files during QA, plus the wired directive presence check). Keep it pragmatic.

Manual verification (per AGENTS debugging workflow): `nx run openp41ge:dev` → hover each of the five buttons, confirm fade in/out, delay, below placement, detail variant on workspaces button, and that no native yellow tooltip appears anywhere on those controls. Optionally eyeball the uikit story/demo first.

## UX Considerations

- **Timing**: ~120ms show / ~60ms hide delay, ~90ms fades — deliberately close to the app's other `duration-100` transitions so it feels native, short enough to not feel laggy.
- **Placement**: below the button (buttons in the title bar and the sidebar tab bars are near the top, so below is uncluttered); flips above only at the bottom edge. Tooltip never overlaps the cursor (anchored, not following).
- **Non-interactive**: `pointer-events: none` — no clicks can land on a tooltip; won't interfere with titlebar drag (`-webkit-app-region` regions are on the buttons, host is on `body`).
- **Theme**: use existing CSS variables (`--bg-modal`/`--bg-dropdown`-family, `--border-color`, `--text-primary`, `--text-secondary`, `--text-muted`) so both dark and light themes render correctly with no new palette.
- **Accessibility**: `role="tooltip"` + `aria-describedby` on the target; keyboard focus shows the tooltip, blur hides it — a genuine replacement for native `title`, which had no keyboard path and no ARIA.
- **Multi-window**: each Electron window has its own renderer JS context, so the singleton host/controller are naturally per-window (one tooltip per window). No cross-window state to manage.
- **Stale tooltip**: if a target is re-rendered/removed while visible, `mouseleave`/disconnect + a disconnected-target check in the host hide it. The module stays leak-free via `WeakMap`.
- **Error/edge**: long single-line text ellipsizes; long subtitles wrap within ~280px; a hidden/zero-size target (e.g. sidebar collapsed) simply doesn't show (rect check).

## Open Questions

1. **Component names** — `<openp41ge-tooltip>` (simple) / `<openp41ge-tooltip-detail>` (title+subtext) are provisional. Rename if you prefer (`openp41ge-tooltip-info`? `openp41ge-rich-tooltip`?).
2. **Workspaces subtitle copy** — I proposed _"Open the Workspaces overlay to switch projects and reopen recent workspaces."_ Still deciding whether the overlay's scope expands later — easy to change, but confirm the wording.
3. **Exact delay constants** — 120ms/60ms. Flag if you want longer (VS Code-style ~400ms) or truly instant.

## Completion Criteria

- [ ] `openp41ge-uikit` exports the two tooltip variants + `tooltipContent` directive + controller + host from `index.ts`.
- [ ] Simple variant = single line; detail variant = title + subtext; both themed via CSS variables in dark and light.
- [ ] Singleton host: fixed, `pointer-events: none`, high z-index, fade in/out, ~120ms/60ms delays, below placement with bottom-edge flip and horizontal clamp, reposition on scroll/resize, ARIA `role="tooltip"` + `aria-describedby` + stable popup id.
- [ ] All **five** buttons wired: left/right sidebar toggles (simple, dynamic Open/Close text), workspaces button (detail), left `＋` and right `＋` (simple).
- [ ] All native `title` attributes removed from those five buttons (`grep` verifies none remain in the three files).
- [ ] Tooltip shows on hover **and** keyboard focus; hides on leave/blur; never intercepts clicks or titlebar drag.
- [ ] Unit + integration tests in `packages/openp41ge-uikit/test/tooltip/` pass; `nx run-many -t typecheck`, `nx lint`, `nx knip`, `nx run-many -t test` clean.
- [ ] Manually verified in `nx run openp41ge:dev`: hovered all five buttons, no native yellow tooltip appears, animations render correctly in both themes.
- [ ] Plan file deleted on completion.
