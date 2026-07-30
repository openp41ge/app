2025-07-29

# Grid Carousel Component — Replace SVG animations with a prop-driven grid component

## Goal
Create a `<demo-grid-carousel>` Lit component in the uikit package that renders grid layouts with props, shows blue drop indicators at configurable positions, and replaces the complex hand-crafted SVG slides in the empty state carousel. Then remove the SVG demos and write a follow-up plan to re-add animations as component-based transitions.

## Rationale
The current empty-state carousel uses 5 complex SVG animations with hard-coded coordinates, keyframes, and timings. These are brittle to edit, impossible to reuse, and don't reflect the actual grid components. A prop-driven component that renders real grid visuals (tab bars, columns, content areas) can be shared, tested, and later animated with CSS transitions instead of monolithic SVG keyframes.

## Approach

### Phase 1 — Create `<demo-grid-carousel>` component
- New file: `packages/openp41ge-uikit/src/components/demo/demo-grid-carousel.ts`
- Exports a Lit element with these properties:
  - `cols: number` — number of columns
  - `placements: Array<{ col: number; tabs: Array<{ id: string; title: string }> }>` — tabs per column
  - `activeTab: string` — currently active tab ID (optional, for visual highlight)
  - `ghostCol?: number` — column to show a blue ghost overlay in the content area
  - `ghostBoundaryIndex?: number` — column boundary index to show a blue split line
  - `ghostTabBarCol?: number` — column whose tab bar gets a blue ghost indicator
  - `sidebar?: boolean` — show/hide a sidebar tree panel on the right
  - `windowChrome?: boolean` — show/hide window traffic-light buttons
- Renders a visual grid using:
  - `tab-bar` components for each column's tab strip
  - Content areas (styled divs, no tab-content for simplicity)
  - Blue overlay rects / vertical lines for ghost indicators
  - Optional sidebar tree (SVG like current slides but minimal)
- Register as `<demo-grid-carousel>`

### Phase 2 — Wire into empty state carousel
- In `tab-content.ts`:
  - Import `<demo-grid-carousel>`
  - `customElements.define("demo-grid-carousel", DemoGridCarousel)` (or import the module)
  - Replace each SVG slide with `<demo-grid-carousel>` with appropriate props
  - Each slide becomes a different configuration of the same component

### Phase 3 — Remove SVG content, write follow-up plan
- Delete all `SLIDES` SVG template literals from `tab-content.ts`
- Keep the carousel shell (nav buttons, dots, slide label)
- Write `plans/2025-07-29-carousel-animations.md` describing how to add back animations as component-based transitions

## Files Changed
- `packages/openp41ge-uikit/src/components/demo/demo-grid-carousel.ts` — NEW component
- `packages/openp41ge-uikit/src/components/tabs/tab-content.ts` — replace SVG slides with component
- `packages/openp41ge-uikit/src/index.ts` — export new component
- `plans/2025-07-29-carousel-animations.md` — follow-up plan

## Testing Strategy
- Visual verification: run the storybook or tab-content demo to verify each slide renders correctly
- Verify ghost indicators appear in the right positions
- Verify sidebar toggles on/off
- Verify window chrome toggles on/off

## UX Considerations
- The carousel nav (‹ › buttons, dots, slide label) stays unchanged — only the slide content changes
- Ghost indicators use the same blue (`#4a9eff`) as the existing drag-and-drop system
- Component is self-contained with no external dependencies beyond Lit and the uikit's tab-bar component

## Open Questions
- Should we use the actual `<tab-bar>` from the tabs package or draw tab visuals inline? (Prefer `<tab-bar>` for reuse, but it has complex dependencies — inline may be simpler for a demo component)
- Should we keep `tab-content.ts` in the tabs package or move it to the demo component as well? (Keep in tabs package — it's still used by the real grid)

## Completion Criteria
- [ ] `<demo-grid-carousel>` component exists with all props described above
- [ ] Component renders grid columns, tab bars, content areas, and sidebar
- [ ] Ghost indicators render in blue at configurable positions
- [ ] SVG slides replaced with component instances in tab-content.ts
- [ ] No hard-coded SVG animation keyframes remain in tab-content.ts
- [ ] All type checks pass
- [ ] Follow-up plan written
