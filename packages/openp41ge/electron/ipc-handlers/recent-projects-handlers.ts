/**
 * Recent Projects IPC handlers — renderer <-> main process bridge
 * for reading and updating the recent projects list.
 *
 * IPC channels:
 *   recentProjects:list  — Get the list of recent projects
 *   recentProjects:add   — Record that a project was opened
 */

import { ipcMain } from "electron";
import type { RecentProjectsModel } from "../../src/main/services/recent-projects-model";

export function registerRecentProjectsHandlers(
  recentProjects: RecentProjectsModel,
): void {
  ipcMain.handle("recentProjects:list", () => {
    return recentProjects.list();
  });

  ipcMain.handle("recentProjects:add", (_event, name: string) => {
    recentProjects.add(name);
  });

  ipcMain.handle("recentProjects:remove", (_event, name: string) => {
    recentProjects.remove(name);
  });
}
