2026-07-25

# Pause Inactive File Editors

## Goal

When a file editor tab is no longer the active tab in its cell, pause its Model to free resources (GPU, memory, file watchers). Resume when the tab becomes active again.

## Rationale

The file editor continuously reads and syntax-highlights file content. When a tab is in the background (not the active tab in its cell), this work is wasted. Other tab types (terminals, streaming logs) should NOT be paused — they are always active.

The grid already fires `grid-activate` events with `{ winId, tabId }` on tab activation. The openp41ge app's `openp41ge-tabs-event-handler.ts` already catches these and dispatches `activateTabInCell`. The file editor controller can listen for these signals.

## Approach

- File editor controller watches for activation/deactivation signals for its tab ID
- On deactivation: pause Model polling, release syntax-highlighting worker, throttle file watcher
- On reactivation: resume Model, re-render if dirty
- Terminals / streaming tabs opt out by implementing a no-op lifecycle

## Completion Criteria

- [ ] File editor controller pauses on tab deactivation
- [ ] File editor controller resumes on tab activation
- [ ] Dirty check triggers re-render on resume
- [ ] Streaming/terminal tabs are unaffected
- [ ] Tests pass
