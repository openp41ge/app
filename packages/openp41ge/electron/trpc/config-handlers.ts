/**
 * Config RPC handlers.
 */

import type { ConfigValue } from "../../src/trpc/types";

export interface ConfigService {
  get(key: string): Promise<ConfigValue>;
  getAll(): Promise<Record<string, ConfigValue>>;
}

class ProductionConfigService implements ConfigService {
  async get(_key: string): Promise<ConfigValue> {
    throw new Error("Not yet implemented");
  }

  async getAll(): Promise<Record<string, ConfigValue>> {
    throw new Error("Not yet implemented");
  }
}

let _service: ConfigService = new ProductionConfigService();

export function setConfigService(service: ConfigService): void {
  _service = service;
}

export function getConfigService(): ConfigService {
  return _service;
}

export const configHandlers = {
  get: (key: string) => _service.get(key),
  getAll: () => _service.getAll(),
};
