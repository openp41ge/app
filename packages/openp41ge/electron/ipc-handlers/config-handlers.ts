/**
 * Config IPC handlers — read/write user config via the main process ConfigService.
 */

import { ipcMain } from "electron";
import type { ConfigService } from "../../src/main/services/config-service.js";

export function registerConfigHandlers(configService: ConfigService): void {
  ipcMain.handle("config:get", (_event, key?: string) => {
    return configService.get(key);
  });

  ipcMain.handle("config:set", (_event, key: string, value: unknown) => {
    configService.set(key, value);
  });

  ipcMain.handle("config:get-all", () => {
    return configService.getAll();
  });
}
