2025-07-22

# Repos Directory on Project Switch

## Goal

Make the repos directory follow project switches initiated via the picker UI.

## Problem

When a project is selected via the picker (not CLI), `NodeGitService` and
`WorkspaceService` still point to `~/.openp41ge/repositories/` instead of the
project's `repositories/` dir. These services don't support hot-swapping
their repos root.

## Options

Either:
a) Pass the project-scoped repos path into the services on switch (e.g., a
`setReposRoot(path)` method)
b) Recreate the services with the new path

## Completion Criteria

- Repos created from picker-selected projects land in the project's
  `repositories/` dir, not the global `~/.openp41ge/repositories/`.
- No regressions for CLI-started projects.
