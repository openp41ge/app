/**
 * Drag system barrel exports.
 *
 * The unified drag system consists of:
 *   - DragOrchestrator — singleton coordinator, manages sessions and targets
 *   - GhostManager — mutation-based ghost overlay management
 *   - CursorManager — cursor style injection/removal
 *   - FlexCache — column flex value caching via MutationObserver (inside ghost-manager)
 */

export { DragOrchestrator, dragOrchestrator } from "./orchestrator";
export { GhostManager, ghostManager } from "./ghost-manager";
export { CursorManager } from "./cursor-manager";
