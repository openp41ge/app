/**
 * Overdraw-line module — re-exports the public surface.
 */
export { OverdrawLine } from "./overdraw-line";
export type { OverdrawDirection } from "./overdraw-line";
export {
  attachTopCornerOverdraws,
  attachTopOverdraw,
  attachTopHorizontalOverdraws,
} from "./corner-accent";
export { attachTabEdgeOverdraws, detachTabEdgeOverdraws } from "./tab-overdraw";
export type { TabEdge, TabEdgeOverdrawOptions } from "./tab-overdraw";
