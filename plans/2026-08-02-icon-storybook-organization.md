2026-08-02

# Icon Storybook Organization

## Goal

Organise all icons used in the application into three Storybook story groups under an `Icons/` parent: **Inline**, **File Extension**, and **Block**. This gives a single visual reference for every icon in the system with clear categorization.

## Rationale

Icons are scattered across the app in three distinct usage patterns (inline padded, file-type indicators, toolbar/bar icons). Having them all in Storybook under a unified `Icons/` heading makes it easy to discover available icons, preview sizing/coloring, and ensure visual consistency.

## Approach

### 1. Restructure `openp41ge-icon.stories.ts`

- Change title from `Components/Icon` to `Icons/Inline`
- Rename `AllIcons` → `All` under `Icons/`
- Add an `InlineUsage` story showing icons inside padded rounded squares matching the repo row pattern (`padding:2px; border-radius:3px;` with hover background)
- Keep `Sizes` and `CustomColor` stories

### 2. Restructure `file-extension-svg.stories.ts`

- Change title from `Components/FileExtensionSvg` to `Icons/File Extension`
- Keep existing `All` story that maps common extensions
- Add usage story showing them in inline context (e.g., file tree rows)

### 3. Create `Icons/Block` stories

- Block icons are those used in top bars, bottom bars, sidebars — typically 16-24px without padding
- Group them from the existing `iconRegistry` (e.g., `git`, `projects`, `terminal`, `play`, `grid`, `refresh`, `eye`, `eye-off`)

## Files Changed

| File | Change |
|------|--------|
| `packages/openp41ge-uikit/src/components/openp41ge-icon.stories.ts` | Re-title to `Icons/` hierarchy, add `InlineUsage` story with padded squared display |
| `packages/openp41ge-uikit/src/components/file-extension-svg.stories.ts` | Re-title to `Icons/File Extension` |

## UX Considerations

- Inline icon story should show the transparent squared container (`padding:2px; border-radius:3px;`) so consumers can see the bounding box
- Block icon story should show icons at their typical sizes (20-24px) without padding
- File extension story should show a grid of common extensions with their filename labels

## Completion Criteria

- [ ] `openp41ge-icon.stories.ts` stories accessible under `Icons/Inline`, `Icons/Block`
- [ ] `file-extension-svg.stories.ts` stories accessible under `Icons/File Extension`
- [ ] All icon registry entries visible in at least one story
- [ ] `nx build` passes (uikit build)
