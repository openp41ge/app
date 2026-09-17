/**
 * Built-in agent tool registration.
 *
 * Each built-in tool lives in its own package and exposes a `register(registry)`
 * entry point (plugin-style). This module simply aggregates them so the host
 * can register the built-in tool set with a single call.
 */

import { register as registerReadFile } from "openp41ge-agents-tool-read-file";
import { register as registerSearchFiles } from "openp41ge-agents-tool-search-files";
import type { AgentTool, AgentToolRegistry } from "openp41ge-agents-tool-types";

/**
 * Register the built-in v1 tool set into a registry.
 *
 * `run_command` is intentionally NOT registered here: shell-style command
 * execution is disabled. Re-add `registerRunCommand` to re-enable it.
 */
export function registerBuiltinTools(registry: AgentToolRegistry): void {
  registerReadFile(registry);
  registerSearchFiles(registry);
}

export type { AgentTool, AgentToolRegistry };
