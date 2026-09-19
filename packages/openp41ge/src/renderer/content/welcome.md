# Welcome to openp41ge

This is the **beta** — things are still taking shape, so thank you for trying it out. This page explains the few ideas you need to get started.

## Workspaces, repositories, and worktrees

Your work is organised in three levels.

**Workspace**

The top level. A named, saved collection that holds your repositories and
remembers the layout you had open. You can have as many as you like — open
them from the manager window's **Workspaces** tab.

:::button tab=workspaces
Open Workspaces
:::

> You can reach this window and its Workspaces tab any time from the
> **Openp41ge** menu in the macOS menu bar.

**Repository**

A Git repository you add to a workspace by its URL. It's cloned under the
app's repositories folder the first time you add it.

> For now the repository must be accessible without a password — use a public
> URL or SSH key, since credentials aren't handled yet.

**Worktree**

A separate working copy of one branch of a repository. Because each worktree
has its own folder, you can check out and work on several branches of the same
repo at once.

The hierarchy is **workspace → repositories → worktrees**.

## Creating and opening a workspace

1. Open the **Workspaces** tab and press **New workspace**.
2. Give it a name.
3. **Add repository** — paste the repo's URL.
4. **Add worktree** — type a branch name.
5. **Open** the workspace. A workspace window opens, and that's where you do
   the actual work.

## The workspace window

The workspace window has a **sidebar** holding the app's system tabs, and a
**grid** as your main working surface.

:::workspace-window
:::sidebar-demo
:::

**The sidebar** is the panel holding the app's system tabs — **Explorer**,
**History**, **Agents**, **Logs**. It can sit on the left, or on both sides.
Click a system tab to pin it there, and drag the bar at a sidebar's inner
edge to resize it.
:::

:::workspace-window
:::grid-demo
:::

**The grid** is where you work. Opening a file or running a command creates
a tab; dragging a sidebar element into the grid makes a cell. It's
column-based, so tabs line up side by side and you can drag them around.
:::

## Next steps

- Create your first workspace and add a repository.
- Open a worktree from the Explorer.
- Pin the History and Agents tabs and start a session.

That's the whole model — three levels, and two kinds of tab.
