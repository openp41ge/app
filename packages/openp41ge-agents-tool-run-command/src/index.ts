/**
 * openp41ge-agents-tool-run-command — the `run_command` agent tool.
 *
 * Runs a shell command in the chat's working directory and returns its
 * stdout/stderr (truncated). Errors are reported in-band via `error`. Available
 * only when the execution context provides a cwd. Registers itself against an
 * AgentToolRegistry.
 */

import { exec } from "child_process";
import path from "path";
import { promisify } from "util";
import type {
  AgentTool,
  AgentToolRegistry,
  ToolExecutionContext,
} from "openp41ge-agents-tool-types";

const execAsync = promisify(exec);

/** Resolve a possibly-relative path against the tool context cwd. */
function resolvePath(p: string | undefined, ctx: ToolExecutionContext): string | undefined {
  if (!p) return undefined;
  return path.isAbsolute(p) ? p : path.resolve(ctx.cwd ?? process.cwd(), p);
}

const tool: AgentTool = {
  name: "run_command",
  description:
    "Run a shell command in the chat's working directory and return its stdout/stderr " +
    "(truncated to 20k characters).",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to run." },
      cwd: { type: "string", description: "Working directory (defaults to the chat cwd)." },
    },
    required: ["command"],
    additionalProperties: false,
  },
  isAvailable(ctx: ToolExecutionContext): boolean {
    return !!ctx.cwd;
  },
  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext) {
    const command = String(args.command ?? "");
    if (!command) return { content: "run_command: empty command", error: "empty command" };
    const cwd = args.cwd ? resolvePath(args.cwd as string, ctx) : ctx.cwd;
    if (!cwd) return { content: "run_command: no working directory", error: "no cwd" };
    try {
      const { stdout, stderr } = await execAsync(command, { cwd, maxBuffer: 1024 * 1024 });
      const out = [stdout, stderr].filter(Boolean).join("\n").trim();
      return { content: out.slice(0, 20_000) || "(no output)" };
    } catch (err) {
      const e = err as { message?: string; stdout?: string; stderr?: string };
      return {
        content: `${e.stdout ?? ""}${e.stderr ?? ""}`.slice(0, 20_000) || (e.message ?? "failed"),
        error: e.message ?? "command failed",
      };
    }
  },
};

/** Register this tool into a registry. */
export function register(registry: AgentToolRegistry): void {
  registry.register(tool);
}

export default tool;
