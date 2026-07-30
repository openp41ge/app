2025-07-29

# Carousel Animations — Re-add as Component-Based Transitions

## Goal
Replace the static `<demo-grid-carousel>` slides in the empty-state carousel with animated transitions that demonstrate drag-and-drop interactions, using Lit's reactive properties and CSS animations instead of hand-crafted SVG keyframes.

## Rationale
The initial SVG-based animations were hard to maintain and modify. The new `<demo-grid-carousel>` component accepts props that define grid layout, ghost indicators, sidebar, and window chrome. Animations should be added back by mutating these props over time (e.g., using `setTimeout` or `requestAnimationFrame` loops) so each carousel slide becomes a mini state machine that cycles through layout states.

## Approach

Each slide becomes an instance of `<demo-grid-carousel>` with a controller that cycles through animation states:

### Slide 0: "Drag tabs between cells"
- **States**: 3 columns → tab moves from col 3 to col 2 (ghost in col 3 tab bar → ghost in col 2 tab bar) → back
- **Props that change**: `placements`, `activeTab`, `ghostTabBarCol`, `ghostTabBarOffset`

### Slide 1: "Drag from sidebar to cells"
- **States**: 2 columns + sidebar → file icon appears from sidebar, flies to col 2 content (overlay) → tab appears in col 2 → file flies to col 2 tab bar (ghost) → tab appears → reset
- **Props that change**: `ghostCol`, `ghostTabBarCol`, `placements`

### Slide 2: "Drag tabs to new cells"
- **States**: 1 column + sidebar → file flies from sidebar to right boundary → ghost boundary appears → splits into 2 equal columns → reset
- **Props that change**: `cols`, `ghostBoundaryIndex`, `placements`

### Slide 3: "Drag tabs to other windows"
- **States**: 2 columns with window chrome → tab flies out of col 2 → col 2 collapses, col 1 extends → new window appears with tab → reset
- **Props that change**: `placements`, `cols` (or hide col 2)

### Slide 4: "Drag tabs to new windows"
- **States**: Similar to slide 3 but with flying tab indicator and new window appearing

## Implementation Pattern
```typescript
// Each slide is a Lit element that wraps <demo-grid-carousel>
// and cycles through animation states
class AnimatedSlide0 extends LitElement {
  @property() state = 0;

  connectedCallback() {
    super.connectedCallback();
    this._timer = setInterval(() => {
      this.state = (this.state + 1) % 5;
    }, 2500);
  }

  render() {
    const { cols, placements, ghostCol, ghostTabBarCol } = STATES[this.state];
    return html`<demo-grid-carousel ...props />`;
  }
}
```

## Files Changed
- `packages/openp41ge-uikit/src/components/demo/` — NEW animated slide components
- `packages/openp41ge-uikit/src/components/tabs/tab-content.ts` — replace static slides with animated versions

## Completion Criteria
- [ ] Each slide has a smooth animation cycle showing the drag-and-drop concept
- [ ] Ghost indicators and overlays appear at the right times
- [ ] No hard-coded SVG animation keyframes are used
- [ ] Animations use CSS transitions/animations on component props, not SVG `<style>` blocks
