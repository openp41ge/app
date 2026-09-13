/**
 * Tool interfaces — the agent tool contract.
 *
 * The canonical type definitions live in the `openp41ge-agents-tool-types`
 * package so that individual tool packages (read_file, search_files,
 * run_command, …) can share them without depending on the openp41ge host.
 * This module re-exports them for backwards compatibility with existing
 * `../interfaces/tool.js` imports.
 */

export type {
  ToolParameters,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  AgentTool,
  AgentToolRegistry,
} from "openp41ge-agents-tool-types";
