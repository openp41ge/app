/**
 * NodeToolExecutor — the built-in set of agent tools executed in the main
 * process (node:fs / child_process).
 *
 * Tool set (v1): read_file, search_files, run_command. Availability is gated
 * per tool (e.g. run_command only when a cwd is provided). All tools report
 * errors in-band via `error` — nothing throws across the interface.
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { AgentTool, ToolExecutionContext } from "../interfaces/tool.js";

const execAsync = promisify(exec);

/** Resolve a possibly-relative path against the tool context cwd. */
function resolvePath(p: string | undefined, ctx: ToolExecutionContext): string | undefined {
  if (!p) return undefined;
  return path.isAbsolute(p) ? p : path.resolve(ctx.cwd ?? process.cwd(), p);
}

/** Clamp content length so a huge file doesn't flood the model context. */
const MAX_READ_BYTES = 50_000;

const readFileTool: AgentTool = {
  name: "read_file",
  description:
    "Read the contents of a text file. Provide an absolute or cwd-relative path. Optionally " +
    "limit the size read.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to read." },
      offset: { type: "number", description: "Byte offset to start reading from." },
      maxLength: { type: "number", description: "Maximum number of bytes to read." },
    },
    required: ["path"],
    additionalProperties: false,
  },
  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext) {
    const p = resolvePath(args.path as string | undefined, ctx);
    if (!p) return { content: "read_file: missing 'path'", error: "missing 'path'" };
    try {
      const offset = typeof args.offset === "number" ? args.offset : 0;
      const maxLength =
        typeof args.maxLength === "number"
          ? Math.min(args.maxLength, MAX_READ_BYTES)
          : MAX_READ_BYTES;
      const content = await fs.promises.readFile(p, "utf-8");
      const sliced = content.slice(offset, offset + maxLength);
      return { content: sliced || "(empty file)" };
    } catch (err) {
      return { content: "", error: `read_file: ${(err as Error).message}` };
    }
  },
};

const searchFilesTool: AgentTool = {
  name: "search_files",
  description:
    "Search for files whose path/name matches a substring within a root directory. " +
    "Returns up to 200 matching paths.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Substring to match against file paths." },
      roots: {
        type: "array",
        items: { type: "string" },
        description: "Root directories to search. Defaults to the chat cwd.",
      },
      maxResults: { type: "number", description: "Maximum number of results (default 200)." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext) {
    const query = String(args.query ?? "").toLowerCase();
    if (!query) return { content: "search_files: empty query", error: "empty query" };
    const maxResults = typeof args.maxResults === "number" ? args.maxResults : 200;
    const roots = Array.isArray(args.roots)
      ? (args.roots as string[]).map((r) => resolvePath(r, ctx) ?? r)
      : [ctx.cwd ?? process.cwd()];
    const results: string[] = [];
    try {
      for (const root of roots) {
        await walk(root, query, results, maxResults);
        if (results.length >= maxResults) break;
      }
      return {
        content: results.length ? results.slice(0, maxResults).join("\n") : "(no matching files)",
      };
    } catch (err) {
      return { content: "", error: `search_files: ${(err as Error).message}` };
    }
  },
};

async function walk(dir: string, query: string, out: string[], max: number): Promise<void> {
  if (out.length >= max) return;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= max) return;
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(p, query, out, max);
    } else if (p.toLowerCase().includes(query)) {
      out.push(p);
    }
  }
}

const runCommandTool: AgentTool = {
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

/** Register the built-in v1 tool set into a registry. */
export function registerBuiltinTools(registry: { register(tool: AgentTool): void }): void {
  registry.register(readFileTool);
  registry.register(searchFilesTool);
  registry.register(runCommandTool);
}
