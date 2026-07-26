2025-07-26

# Remove Settings Button and Modal

## Goal

Remove the settings gear button from the bottom bar and the inline settings modal it opens, along with all wiring that invokes or references them. The configuration (app theme, editor font size/line height, syntax theme assignments) will continue to work — users can still change these via `~/.openp41ge/user/config.json` directly.

## Rationale

The settings UI duplicates functionality already available through direct config file editing. Maintaining the inline modal adds complexity with minimal benefit: the modal is a large, manually constructed DOM tree (~200 lines) that reads/writes config through `appServices.configService`. Removing it simplifies the windowview component and reduces the app's attack surface.

## Approach

Removal in 4 independent passes, each safe to commit after verification:

### Pass 1 — Bottom bar button & modal rendering

Remove from `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts`:

- The gear `<openp41ge-bottom-button>` in the bottom bar template (lines ~170–188)
- The `_toggleSettingsModal()` method (lines ~384–476)
- The `_renderAppearanceSettingsInto()` method (lines ~489–676)
- The `_makeNumberField()` helper method (lines ~680–722)
- The `_getActiveFileExtension()` method (lines ~724–748) — only used by the settings modal
- The event listener for `"openp41ge:toggle-settings"` (lines ~74–76)
- The `SYNTAX_THEME_OPTIONS` constant (line 19)

### Pass 2 — Global references

- **`packages/openp41ge/src/renderer/app.ts` line 146**: Remove `.settings-modal` from the CSS selector list in the app reset query (the modal class no longer exists).
- **`packages/openp41ge/src/renderer/services/context-menu-builder.ts` lines 30, 80–81**: Remove the "Open settings" context menu item and its handler.
- **`packages/openp41ge/src/renderer/services/modal-state-service.ts`**: Remove the `"settings"` state from `ModalState` type, the `showSettings()` method, and any references to `"settings"` in comments. (The modal state service is used for keyboard capture — without the settings modal this state is dead code.)

### Pass 3 — Icon file

- **`packages/openp41ge/src/renderer/icons/material-icons/settings.svg`**: Delete the SVG file (no longer referenced).

### Pass 4 — Clean up tests

- **`packages/openp41ge/test/`**: Search for any test references to `.settings-modal`, `_toggleSettingsModal`, `_renderAppearanceSettingsInto`, or `showSettings` and remove them.

## SOLID Review

No SOLID violations introduced — this is pure deletion of dead code.

**S (Single Responsibility)**: The settings modal was a second responsibility of `Openp41geWindowView`. Removing it brings the class closer to its single purpose: rendering the window layout.

**O (Open/Closed)**: Config can still be extended via `config.json` schemas without touching the rendering layer.

## UX Considerations

| Aspect | Current | After |
|--------|---------|-------|
| Changing app theme | Via settings modal (radio buttons) | Edit `~/.openp41ge/user/config.json` directly |
| Changing editor font | Via settings modal (number inputs) | Edit `~/.openp41ge/user/config.json` directly |
| Assigning syntax themes | Via settings modal (dropdowns per extension) | Edit `~/.openp41ge/user/config.json` directly |
| Keyboard shortcut | `Cmd+,` not implemented — no removal needed | No change |
| Context menu | "Open settings" item removed | No crash — entry simply won't exist |

The bottom bar will shrink slightly — only the chat prompt button (speech bubble) and the devtools button (dev mode only) remain.

## Files Changed

| File | Change |
|------|--------|
| `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts` | Remove gear button from template, remove `_toggleSettingsModal`, `_renderAppearanceSettingsInto`, `_makeNumberField`, `_getActiveFileExtension`, `SYNTAX_THEME_OPTIONS`, and the `toggle-settings` event listener |
| `packages/openp41ge/src/renderer/app.ts` | Remove `.settings-modal` from cleanup selector |
| `packages/openp41ge/src/renderer/services/context-menu-builder.ts` | Remove "Open settings" entry and handler |
| `packages/openp41ge/src/renderer/services/modal-state-service.ts` | Remove `"settings"` from `ModalState` union, remove `showSettings()` |
| `packages/openp41ge/src/renderer/icons/material-icons/settings.svg` | Delete file |
| `packages/openp41ge/test/**/*.test.ts` | Remove any tests referencing removed methods/classes |
| `packages/openp41ge/src/renderer/interfaces/keyboard-manager.ts` | Remove comments mentioning "settings UI" (lines 13, 15, 42) — pure documentation cleanup |

## Testing Strategy

- **Unit tests**: `nx test` must pass — no settings-specific tests exist currently, but verify we don't break existing tests.
- **Type check**: `nx run openp41ge:typecheck` must pass (catches any dangling references).
- **Manual check**: Open the app, verify:
  - No gear icon in bottom bar
  - Context menu no longer shows "Open settings"
  - App still starts and renders correctly
  - Config file changes still take effect on restart

## Open Questions

None.

## Completion Criteria

- [ ] Gear button removed from bottom bar
- [ ] `_toggleSettingsModal` method removed
- [ ] `_renderAppearanceSettingsInto` method removed
- [ ] `_makeNumberField` helper removed
- [ ] `_getActiveFileExtension` helper removed (only used by settings)
- [ ] `SYNTAX_THEME_OPTIONS` constant removed
- [ ] `toggle-settings` event listener removed
- [ ] `.settings-modal` removed from app.ts cleanup selector
- [ ] "Open settings" removed from context menu
- [ ] `"settings"` state removed from `ModalStateService`
- [ ] `settings.svg` icon file deleted
- [ ] No test breakage
- [ ] `nx run openp41ge:typecheck` passes
- [ ] `nx test` passes
