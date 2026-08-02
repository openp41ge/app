2026-08-01

# Service modal system (replace bottom pane) — DONE

## Completed Changes

### New files
- `packages/openp41ge/src/renderer/services/service-modal-service.ts` — singleton that manages open/close/toggle of one modal at a time
- `packages/openp41ge/src/renderer/components/openp41ge-service-modal.ts` — fixed-position modal with backdrop, Escape/backdrop close, close button, uses EditorSystemTabController for content

### Modified files
- `packages/openp41ge/src/renderer/components/openp41ge-titlebar.ts` — workspace button and settings button now call `serviceModalService.openModal()` instead of emitting `system-tab-open` + `bp-expand`
- `packages/openp41ge/src/renderer/components/openp41ge-windowview.ts` — gutted entirely: removed `_paneHeight` state, all bp-* handlers, `_highlightCorners`, `_getSystemTabInfos`, `_onWorkspaceClick`, corner drag, bottom pane element, drag bar, corner zones, bp-* imports, `openp41ge-bottom-pane` import. Added `<openp41ge-service-modal>` element and `wv-bottom-bar` with workspace indicator
- `packages/openp41ge/src/renderer/bootstrap/steps/register-ipc-listeners.step.ts` — replaced `emitEvent("system-tab-open")` with `serviceModalService.openModal()`
- `packages/openp41ge/src/renderer/app.ts` — added service modal component import
- `packages/openp41ge/src/layout/types.ts` — added `bottomPaneGrid` with default to Window schema

### Deleted files
- `packages/openp41ge/src/layout/bottom-pane-operations.ts`

## Status
- Build passes
- 825 tests pass (0 failures)
- Service modal opens on workspace/settings buttons
- Bottom bar shows workspace indicator
- Modal closes on backdrop click, Escape, or close button
- All resize handles simplified to sidebar-only (left/right)
