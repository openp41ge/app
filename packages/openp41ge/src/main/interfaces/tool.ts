/**
 * Tool interfaces — the agent tool contract.
 *
 * Tools are registry/strategy based: each tool registers itself with a name,
 * description, and JSON Schema for its arguments, and provides an `execute`
 * that resolves in-band (`{ content, error? }`) rather than throwing across the
 * interface (Liskov substitution — an error is data, not a control-flow exit).
 */

/** JSON Schema for a tool's parameters (subset of JSON Schema that vLLM/OpenAI accept). */
export interface ToolParameters {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

/** The provider-facing definition of a tool (name, description, schema). */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
}

/** Execution context handed to a tool. */
export interface ToolExecutionContext {
  /** Working directory for relative-path resolutions / command execution. */
  cwd?: string;
  /** Scope roots the tool is allowed to operate within (v1: informational only). */
  roots?: string[];
}

/** Result of a tool execution. Errors are reported in-band, never thrown. */
export interface ToolExecutionResult {
  content: string;
  error?: string;
}

/** A fully-registered agent tool. */
export interface AgentTool extends ToolDefinition {
  execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
  /** Optional gate — tool is skipped when unavailable (e.g. command not installed). */
  isAvailable?(ctx: ToolExecutionContext): boolean;
}
