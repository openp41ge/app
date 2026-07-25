2025-07-22

# Verify Project Switch → UI Render Flow

## Goal

Confirm that picking a project via the project picker correctly loads the
project's workspace state and renders the grid and sidebar with the saved
layout.

## Items

- The main process must load the selected project's workspace state and
  broadcast it to all windows on project switch.
- `FetchInitialStateStep` does a fresh `getState()` IPC call after a project
  switch — verify this picks up the post-switch state correctly.
- The grid and sidebar should render with the project's saved layout.

## Verification

Test manually by launching the app, picking a project, and inspecting the
console / workspace state. Confirm the grid panes, tabs, and sidebar match
what was saved for that project.

## Completion Criteria

- Project picker → workspace loads → grid renders correctly with the
  selected project's saved layout.
